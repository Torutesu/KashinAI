import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.ts'
import { signJwt } from '../src/auth.ts'
import { MemoryPlanStore } from '../src/plan-store.ts'
import { MemoryDeviceStore } from '../src/device.ts'
import { FREE_DAILY_LIMIT } from '../src/plans.ts'

const SECRET = 'test-secret'
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0)
const DEVICE = 'device-abc'
const DEVICE_SECRET = 'a-sufficiently-long-device-secret'

function makeApp(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return createApp({
    jwtSecret: SECRET,
    planStore: new MemoryPlanStore(),
    deviceStore: new MemoryDeviceStore(),
    now: () => NOW,
    ...overrides
  })
}

function deviceHeaders() {
  return { 'x-device-id': DEVICE, 'x-device-secret': DEVICE_SECRET }
}

test('health needs no auth', async () => {
  const res = await makeApp().request('/health')
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true })
})

test('/v1/* rejects requests without credentials', async () => {
  const res = await makeApp().request('/v1/license')
  assert.equal(res.status, 401)
})

test('device credentials authorize and default to the free plan', async () => {
  const res = await makeApp().request('/v1/license', { headers: deviceHeaders() })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { plan: 'free', freeDailyLimit: FREE_DAILY_LIMIT })
})

test('/v1/license reflects a Stripe-driven pro plan', async () => {
  const planStore = new MemoryPlanStore()
  await planStore.setPlan(DEVICE, 'pro')
  const res = await makeApp({ planStore }).request('/v1/license', { headers: deviceHeaders() })
  const body = await res.json()
  assert.equal(body.plan, 'pro')
})

test('a wrong device secret is rejected once registered (TOFU)', async () => {
  const deviceStore = new MemoryDeviceStore()
  const app = makeApp({ deviceStore })
  await app.request('/v1/license', { headers: deviceHeaders() }) // register
  const res = await app.request('/v1/license', {
    headers: { 'x-device-id': DEVICE, 'x-device-secret': 'another-long-secret-value-xyz' }
  })
  assert.equal(res.status, 401)
})

test('a JWT bearer also authorizes /v1/*', async () => {
  const token = await signJwt({ sub: 'u1', plan: 'pro' }, SECRET, { ttlSeconds: 3600, nowSeconds: Math.floor(NOW / 1000) })
  const res = await makeApp().request('/v1/license', { headers: { authorization: `Bearer ${token}` } })
  assert.equal((await res.json()).plan, 'pro')
})

test('/v1/billing/checkout returns the url for an authenticated device', async () => {
  const app = makeApp({ billing: { createCheckoutSession: async (id) => ({ url: `https://checkout/${id}` }) } })
  const res = await app.request('/v1/billing/checkout', { method: 'POST', headers: deviceHeaders() })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { url: `https://checkout/${DEVICE}` })
})

test('/v1/billing/checkout is 501 when billing is not configured, 401 without auth', async () => {
  assert.equal((await makeApp().request('/v1/billing/checkout', { method: 'POST', headers: deviceHeaders() })).status, 501)
  const withBilling = makeApp({ billing: { createCheckoutSession: async () => ({ url: 'x' }) } })
  assert.equal((await withBilling.request('/v1/billing/checkout', { method: 'POST' })).status, 401)
})

test('device auth is 501 when no device store is configured', async () => {
  const res = await makeApp({ deviceStore: undefined }).request('/v1/license', { headers: deviceHeaders() })
  assert.equal(res.status, 501)
})
