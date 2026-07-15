import { createApp } from './app.ts'
import { createAnthropicUpstream } from './upstream.ts'
import { createStripeBilling } from './billing.ts'
import type { UsageStore } from './quota.ts'
import type { PlanStore } from './plan-store.ts'
import type { DeviceStore } from './device.ts'
import type { Plan } from './auth.ts'

/**
 * Cloudflare Workers entry point. Builds the app per request with the environment's secrets and KV
 * binding. Deploy with wrangler; see README.md for the required vars/secrets.
 */

/** The subset of the Workers KV API this service uses (typed locally to avoid a types dependency). */
interface KVNamespace {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

type Env = {
  JWT_SECRET: string
  ANTHROPIC_API_KEY: string
  DEFAULT_MODEL?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_SECRET_KEY?: string
  STRIPE_PRICE_ID?: string
  CHECKOUT_SUCCESS_URL?: string
  CHECKOUT_CANCEL_URL?: string
  USAGE_KV: KVNamespace
}

/** KV-backed daily usage counters. Entries expire after two days so buckets self-clean. */
class KvUsageStore implements UsageStore {
  constructor(private kv: KVNamespace) {}

  private key(userId: string, day: string): string {
    return `usage:${userId}:${day}`
  }

  async get(userId: string, day: string): Promise<number> {
    const raw = await this.kv.get(this.key(userId, day))
    const n = raw ? Number(raw) : 0
    return Number.isFinite(n) ? n : 0
  }

  async increment(userId: string, day: string): Promise<number> {
    const next = (await this.get(userId, day)) + 1
    await this.kv.put(this.key(userId, day), String(next), { expirationTtl: 60 * 60 * 48 })
    return next
  }
}

/** KV-backed plan map + processed-event set (shares the USAGE_KV namespace via key prefixes). */
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
      usageStore: new KvUsageStore(env.USAGE_KV),
      planStore: new KvPlanStore(env.USAGE_KV),
      deviceStore: new KvDeviceStore(env.USAGE_KV),
      upstream: createAnthropicUpstream({ anthropicApiKey: env.ANTHROPIC_API_KEY }),
      defaultModel: env.DEFAULT_MODEL,
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
      // verifyIdentity: wire the auth provider (Clerk/Supabase) here to enable /auth/token.
    })
    return app.fetch(request)
  }
}
