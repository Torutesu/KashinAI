import { Hono } from 'hono'
import { bearerFromHeader, signJwt, verifyJwt, type TokenPayload } from './auth.ts'
import { licenseFor } from './plans.ts'
import type { PlanStore } from './plan-store.ts'
import { planFromStripeEvent, verifyStripeSignature } from './stripe.ts'
import type { Billing } from './billing.ts'
import { verifyOrRegisterDevice, type DeviceStore } from './device.ts'

/**
 * License server for the BYOK + subscription model. It never sees or runs inference — users generate
 * with their own API key on their machine. This service only:
 *   - authenticates a device (or JWT),
 *   - reports the device's plan (free/pro),
 *   - runs Stripe Checkout + webhooks to move a device to Pro.
 * No provider key lives here, so the operator's inference key can never be used by anyone.
 */
export type AppDeps = {
  jwtSecret: string
  /** Injectable clock (ms) for deterministic tests. */
  now?: () => number
  /** Plan lookup/update (Stripe-driven). Required for licensing and the Stripe webhook. */
  planStore?: PlanStore
  /** Stripe webhook signing secret; when unset the webhook route is disabled. */
  stripeWebhookSecret?: string
  /**
   * Verifies the caller's identity for token minting (an optional auth provider, e.g. Clerk/Supabase).
   * When unset, /auth/token responds 501. Not needed for the device model.
   */
  verifyIdentity?: (headers: Headers) => Promise<{ userId: string } | null>
  /** Minted-token lifetime in seconds (default 1h). */
  tokenTtlSeconds?: number
  /** Stripe Checkout session creation; when unset /v1/billing/checkout responds 501. */
  billing?: Billing
  /** Device-credential store — the default (no-auth-provider) account model. */
  deviceStore?: DeviceStore
}

type Vars = { user: TokenPayload }

export function createApp(deps: AppDeps): Hono<{ Variables: Vars }> {
  const app = new Hono<{ Variables: Vars }>()
  const now = deps.now ?? (() => Date.now())

  app.get('/health', (c) => c.json({ ok: true }))

  // Optional web/login path: mint a signed plan token once an auth provider verifies the caller.
  app.post('/auth/token', async (c) => {
    if (!deps.verifyIdentity || !deps.planStore) return c.json({ error: 'auth_not_configured' }, 501)
    const identity = await deps.verifyIdentity(c.req.raw.headers)
    if (!identity) return c.json({ error: 'unauthorized' }, 401)
    const plan = await deps.planStore.getPlan(identity.userId)
    const token = await signJwt({ sub: identity.userId, plan }, deps.jwtSecret, {
      ttlSeconds: deps.tokenTtlSeconds ?? 3600,
      nowSeconds: Math.floor(now() / 1000)
    })
    return c.json({ token, plan })
  })

  // Stripe subscription webhooks drive the plan store. Idempotent by event id.
  app.post('/webhooks/stripe', async (c) => {
    if (!deps.stripeWebhookSecret || !deps.planStore) return c.json({ error: 'stripe_not_configured' }, 501)
    const payload = await c.req.text()
    const ok = await verifyStripeSignature(payload, c.req.header('stripe-signature'), deps.stripeWebhookSecret, now())
    if (!ok) return c.json({ error: 'invalid_signature' }, 400)

    let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } }
    try {
      event = JSON.parse(payload)
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }

    if (event.id) {
      const fresh = await deps.planStore.markEventProcessed(event.id)
      if (!fresh) return c.json({ ok: true, deduped: true })
    }

    const change = planFromStripeEvent(event)
    if (change) await deps.planStore.setPlan(change.userId, change.plan)
    return c.json({ ok: true })
  })

  // Auth on everything under /v1. Prefers device credentials (the default cheap model); falls back
  // to a signed JWT bearer for a future web/login path.
  app.use('/v1/*', async (c, next) => {
    const deviceId = c.req.header('x-device-id')
    const deviceSecret = c.req.header('x-device-secret')
    if (deviceId && deviceSecret) {
      if (!deps.deviceStore) return c.json({ error: 'device_auth_not_configured' }, 501)
      const ok = await verifyOrRegisterDevice(deps.deviceStore, deviceId, deviceSecret)
      if (!ok) return c.json({ error: 'unauthorized' }, 401)
      const plan = deps.planStore ? await deps.planStore.getPlan(deviceId) : 'free'
      c.set('user', { sub: deviceId, plan, exp: Math.floor(now() / 1000) + 3600 })
      return next()
    }

    const token = bearerFromHeader(c.req.header('authorization'))
    const payload = token ? await verifyJwt(token, deps.jwtSecret, { nowSeconds: Math.floor(now() / 1000) }) : null
    if (!payload) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', payload)
    await next()
  })

  // The app polls this to know whether the device is Pro (unlimited) or Free (client-limited).
  app.get('/v1/license', (c) => {
    return c.json(licenseFor(c.get('user').plan))
  })

  // Creates a Stripe Checkout session for the authenticated device; the app opens the returned URL.
  app.post('/v1/billing/checkout', async (c) => {
    if (!deps.billing) return c.json({ error: 'billing_not_configured' }, 501)
    try {
      const { url } = await deps.billing.createCheckoutSession(c.get('user').sub)
      return c.json({ url })
    } catch {
      return c.json({ error: 'checkout_failed' }, 502)
    }
  })

  return app
}
