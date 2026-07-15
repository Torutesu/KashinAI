import { createApp } from './app.ts'
import { createAnthropicUpstream } from './upstream.ts'
import type { UsageStore } from './quota.ts'

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = createApp({
      jwtSecret: env.JWT_SECRET,
      usageStore: new KvUsageStore(env.USAGE_KV),
      upstream: createAnthropicUpstream({ anthropicApiKey: env.ANTHROPIC_API_KEY }),
      defaultModel: env.DEFAULT_MODEL
    })
    return app.fetch(request)
  }
}
