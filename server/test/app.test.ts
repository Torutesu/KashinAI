import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.ts'
import { signJwt } from '../src/auth.ts'
import { MemoryUsageStore, PLAN_DAILY_LIMIT, dayBucket } from '../src/quota.ts'
import type { Upstream, InferenceRequest } from '../src/upstream.ts'

const SECRET = 'test-secret'
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0)

function mockUpstream(overrides: Partial<Upstream> = {}): Upstream & { calls: InferenceRequest[] } {
  const calls: InferenceRequest[] = []
  return {
    calls,
    async stream(req: InferenceRequest): Promise<Response> {
      calls.push(req)
      return new Response('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' }
      })
    },
    ...overrides
  }
}

function makeApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({
    jwtSecret: SECRET,
    usageStore: new MemoryUsageStore(),
    upstream: mockUpstream(),
    now: () => NOW,
    ...overrides
  })
}

async function token(plan: 'free' | 'pro' = 'free', sub = 'user-1') {
  return signJwt({ sub, plan }, SECRET, { ttlSeconds: 3600, nowSeconds: Math.floor(NOW / 1000) })
}

test('rejects requests without a valid bearer token', async () => {
  const app = makeApp()
  const res = await app.request('/v1/entitlement')
  assert.equal(res.status, 401)
})

test('returns entitlement for an authenticated free user', async () => {
  const app = makeApp()
  const res = await app.request('/v1/entitlement', {
    headers: { authorization: `Bearer ${await token('free')}` }
  })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.plan, 'free')
  assert.equal(body.dailyLimit, PLAN_DAILY_LIMIT.free)
  assert.equal(body.used, 0)
})

test('inference streams the upstream body and meters usage', async () => {
  const store = new MemoryUsageStore()
  const upstream = mockUpstream()
  const app = makeApp({ usageStore: store, upstream })
  const res = await app.request('/v1/inference', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token('free')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ system: 'sys', user: 'hello', temperature: 0.2, model: 'claude-x' })
  })
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/)
  const text = await res.text()
  assert.match(text, /text_delta/)
  assert.equal(upstream.calls.length, 1)
  assert.equal(upstream.calls[0].user, 'hello')
  // Usage was metered.
  assert.equal(await store.get('user-1', dayBucket(NOW)), 1)
})

test('inference returns 429 when the free quota is exhausted', async () => {
  const store = new MemoryUsageStore()
  for (let i = 0; i < PLAN_DAILY_LIMIT.free; i++) await store.increment('user-1', dayBucket(NOW))
  const upstream = mockUpstream()
  const app = makeApp({ usageStore: store, upstream })
  const res = await app.request('/v1/inference', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token('free')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'hello' })
  })
  assert.equal(res.status, 429)
  const body = await res.json()
  assert.equal(body.error, 'quota_exceeded')
  // No upstream call was made once over quota.
  assert.equal(upstream.calls.length, 0)
})

test('pro users are not rate-limited', async () => {
  const store = new MemoryUsageStore()
  for (let i = 0; i < 100; i++) await store.increment('user-1', dayBucket(NOW))
  const app = makeApp({ usageStore: store })
  const res = await app.request('/v1/inference', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token('pro')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'hello' })
  })
  assert.equal(res.status, 200)
})

test('inference rejects a missing user prompt', async () => {
  const app = makeApp()
  const res = await app.request('/v1/inference', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token('free')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ system: 'sys' })
  })
  assert.equal(res.status, 400)
})

test('inference surfaces an upstream failure as 502', async () => {
  const failing: Upstream = {
    async stream(): Promise<Response> {
      return new Response('boom', { status: 500 })
    }
  }
  const app = makeApp({ upstream: failing })
  const res = await app.request('/v1/inference', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token('free')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ user: 'hello' })
  })
  assert.equal(res.status, 502)
})

test('health endpoint needs no auth', async () => {
  const app = makeApp()
  const res = await app.request('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})
