import { Hono } from 'hono'
import { bearerFromHeader, verifyJwt, type Plan, type TokenPayload } from './auth.ts'
import { checkQuota, dayBucket, entitlement, type UsageStore } from './quota.ts'
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
}

type Vars = { user: TokenPayload }

const MAX_FIELD = 200_000

export function createApp(deps: AppDeps): Hono<{ Variables: Vars }> {
  const app = new Hono<{ Variables: Vars }>()
  const now = deps.now ?? (() => Date.now())

  app.get('/health', (c) => c.json({ ok: true }))

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
