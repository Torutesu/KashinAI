import { Hono } from 'hono'
import { bearerFromHeader, signJwt, verifyJwt, type Plan, type TokenPayload } from './auth.ts'
import { checkQuota, dayBucket, entitlement, type UsageStore } from './quota.ts'
import type { PlanStore } from './plan-store.ts'
import { planFromStripeEvent, verifyStripeSignature } from './stripe.ts'
import type { InferenceRequest, Upstream } from './upstream.ts'

/**
 * Dependencies are injected so the app is deployable (real deps in index.ts) and testable (mocks in
 * the contract tests). The service is intentionally thin: authenticate, meter, proxy the stream.
 * It never stores screen text or generated output.
 */
export type AppDeps = {
  jwtSecret: string
  usageStore: UsageStore
  upstream: Upstream
  defaultModel?: string
  /** Injectable clock (ms) for deterministic quota-bucket tests. */
  now?: () => number
  /** Plan lookup/update (Stripe-driven). Required for /v1/token and the Stripe webhook. */
  planStore?: PlanStore
  /** Stripe webhook signing secret; when unset the webhook route is disabled. */
  stripeWebhookSecret?: string
  /**
   * Verifies the caller's identity for token minting (the auth provider adapter, e.g. Clerk/Supabase).
   * When unset, /v1/token responds 501 (auth provider not wired yet).
   */
  verifyIdentity?: (headers: Headers) => Promise<{ userId: string } | null>
  /** Minted-token lifetime in seconds (default 1h). */
  tokenTtlSeconds?: number
}

type Vars = { user: TokenPayload }

const MAX_FIELD = 200_000

export function createApp(deps: AppDeps): Hono<{ Variables: Vars }> {
  const app = new Hono<{ Variables: Vars }>()
  const now = deps.now ?? (() => Date.now())

  app.get('/health', (c) => c.json({ ok: true }))

  // Mints a signed plan token after the auth provider verifies the caller. Not under the JWT
  // middleware (that would be circular) — identity comes from `verifyIdentity`.
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

  // Auth on everything under /v1.
  app.use('/v1/*', async (c, next) => {
    const token = bearerFromHeader(c.req.header('authorization'))
    const payload = token ? await verifyJwt(token, deps.jwtSecret, { nowSeconds: Math.floor(now() / 1000) }) : null
    if (!payload) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', payload)
    await next()
  })

  app.get('/v1/entitlement', async (c) => {
    const user = c.get('user')
    const used = await deps.usageStore.get(user.sub, dayBucket(now()))
    return c.json(entitlement(user.plan, used))
  })

  app.post('/v1/inference', async (c) => {
    const user = c.get('user')

    const { allowed, entitlement: ent } = await checkQuota(deps.usageStore, user.sub, user.plan, now())
    if (!allowed) {
      return c.json(
        { error: 'quota_exceeded', entitlement: serializeEntitlement(ent) },
        429,
        { 'x-quota-remaining': '0' }
      )
    }

    let body: Partial<InferenceRequest>
    try {
      body = (await c.req.json()) as Partial<InferenceRequest>
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }

    const system = typeof body.system === 'string' ? body.system.slice(0, MAX_FIELD) : ''
    const userText = typeof body.user === 'string' ? body.user.slice(0, MAX_FIELD) : ''
    if (!userText) return c.json({ error: 'missing_user_prompt' }, 400)

    const model = typeof body.model === 'string' && body.model ? body.model : deps.defaultModel ?? 'claude-sonnet-4-5'
    const temperature = typeof body.temperature === 'number' ? body.temperature : 0.3

    // Meter first so a mid-stream disconnect still counts against the quota.
    await deps.usageStore.increment(user.sub, dayBucket(now()))

    let upstreamResponse: Response
    try {
      upstreamResponse = await deps.upstream.stream({ model, system, user: userText, temperature })
    } catch {
      return c.json({ error: 'upstream_unreachable' }, 502)
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      return c.json({ error: 'upstream_error', status: upstreamResponse.status }, 502)
    }

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        'x-plan': user.plan
      }
    })
  })

  return app
}

function serializeEntitlement(ent: { plan: Plan; dailyLimit: number; used: number; remaining: number }) {
  const inf = (n: number) => (n === Number.POSITIVE_INFINITY ? null : n)
  return { plan: ent.plan, dailyLimit: inf(ent.dailyLimit), used: ent.used, remaining: inf(ent.remaining) }
}
