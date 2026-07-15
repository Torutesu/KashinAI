import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.ts'
import { verifyJwt } from '../src/auth.ts'
import { MemoryUsageStore } from '../src/quota.ts'
import { MemoryPlanStore } from '../src/plan-store.ts'
import { signStripePayload } from '../src/stripe.ts'
import type { Upstream } from '../src/upstream.ts'

const SECRET = 'test-secret'
const STRIPE_SECRET = 'whsec_test'
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0)

const noopUpstream: Upstream = {
  async stream(): Promise<Response> {
    return new Response('data: {}\n\n', { status: 200 })
  }
}

function makeApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({
    jwtSecret: SECRET,
    usageStore: new MemoryUsageStore(),
    planStore: new MemoryPlanStore(),
    upstream: noopUpstream,
    stripeWebhookSecret: STRIPE_SECRET,
    now: () => NOW,
    ...overrides
  })
}

async function stripeRequest(app: ReturnType<typeof createApp>, event: object) {
  const payload = JSON.stringify(event)
  const header = await signStripePayload(payload, STRIPE_SECRET, Math.floor(NOW / 1000))
  return app.request('/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': header, 'content-type': 'application/json' },
    body: payload
  })
}

test('stripe webhook rejects an invalid signature', async () => {
  const app = makeApp()
  const res = await app.request('/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=bad', 'content-type': 'application/json' },
    body: '{}'
  })
  assert.equal(res.status, 400)
})

test('stripe webhook upgrades a user to pro and is idempotent', async () => {
  const planStore = new MemoryPlanStore()
  const app = makeApp({ planStore })
  const event = {
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'user-1' } }
  }

  const first = await stripeRequest(app, event)
  assert.equal(first.status, 200)
  assert.equal(await planStore.getPlan('user-1'), 'pro')

  // Replaying the same event id is a no-op.
  const replay = await stripeRequest(app, event)
  assert.deepEqual(await replay.json(), { ok: true, deduped: true })
})

test('stripe webhook downgrades on subscription deletion', async () => {
  const planStore = new MemoryPlanStore()
  await planStore.setPlan('user-2', 'pro')
  const app = makeApp({ planStore })
  await stripeRequest(app, {
    id: 'evt_2',
    type: 'customer.subscription.deleted',
    data: { object: { client_reference_id: 'user-2' } }
  })
  assert.equal(await planStore.getPlan('user-2'), 'free')
})

test('/auth/token mints a token carrying the stored plan', async () => {
  const planStore = new MemoryPlanStore()
  await planStore.setPlan('user-1', 'pro')
  const app = makeApp({
    planStore,
    verifyIdentity: async () => ({ userId: 'user-1' })
  })

  const res = await app.request('/auth/token', { method: 'POST' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.plan, 'pro')
  const payload = await verifyJwt(body.token, SECRET, { nowSeconds: Math.floor(NOW / 1000) })
  assert.ok(payload)
  assert.equal(payload.sub, 'user-1')
  assert.equal(payload.plan, 'pro')
})

test('/auth/token returns 401 when identity is not verified', async () => {
  const app = makeApp({ verifyIdentity: async () => null })
  const res = await app.request('/auth/token', { method: 'POST' })
  assert.equal(res.status, 401)
})

test('/auth/token returns 501 when no auth provider is wired', async () => {
  const app = makeApp({ verifyIdentity: undefined })
  const res = await app.request('/auth/token', { method: 'POST' })
  assert.equal(res.status, 501)
})
