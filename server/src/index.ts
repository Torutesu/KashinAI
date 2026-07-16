import { createApp } from './app.ts'
import { createStripeBilling } from './billing.ts'
import type { PlanStore } from './plan-store.ts'
import type { DeviceStore } from './device.ts'
import type { Plan } from './auth.ts'

/**
 * Cloudflare Workers entry point for the BYOK license server. Builds the app per request with the
 * environment's secrets and KV binding. No inference/provider key — users generate with their own
 * API key. Deploy with wrangler; see README.md.
 */

/** The subset of the Workers KV API this service uses (typed locally to avoid a types dependency). */
interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

type Env = {
  JWT_SECRET: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID?: string
  CHECKOUT_SUCCESS_URL?: string
  CHECKOUT_CANCEL_URL?: string
  LICENSE_KV: KVNamespace
}

/** KV-backed plan map + processed-event set. */
class KvPlanStore implements PlanStore {
  constructor(private kv: KVNamespace) {}

  async getPlan(userId: string): Promise<Plan> {
    return (await this.kv.get(`plan:${userId}`)) === 'pro' ? 'pro' : 'free'
  }

  async setPlan(userId: string, plan: Plan): Promise<void> {
    await this.kv.put(`plan:${userId}`, plan)
  }

  async markEventProcessed(eventId: string): Promise<boolean> {
    if (await this.kv.get(`event:${eventId}`)) return false
    await this.kv.put(`event:${eventId}`, '1', { expirationTtl: 60 * 60 * 24 * 30 })
    return true
  }
}

/** KV-backed device secret hashes (`device:<id>` → sha256 hex). */
class KvDeviceStore implements DeviceStore {
  constructor(private kv: KVNamespace) {}

  async getSecretHash(deviceId: string): Promise<string | null> {
    return this.kv.get(`device:${deviceId}`)
  }

  async setSecretHash(deviceId: string, hash: string): Promise<void> {
    await this.kv.put(`device:${deviceId}`, hash)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = createApp({
      jwtSecret: env.JWT_SECRET,
      planStore: new KvPlanStore(env.LICENSE_KV),
      deviceStore: new KvDeviceStore(env.LICENSE_KV),
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
      billing:
        env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID
          ? createStripeBilling({
              secretKey: env.STRIPE_SECRET_KEY,
              priceId: env.STRIPE_PRICE_ID,
              successUrl: env.CHECKOUT_SUCCESS_URL ?? 'https://kashin.ai/upgraded',
              cancelUrl: env.CHECKOUT_CANCEL_URL ?? 'https://kashin.ai/pricing'
            })
          : undefined
      // verifyIdentity: wire an auth provider here only if you later add a web/login path.
    })
    return app.fetch(request)
  }
}
