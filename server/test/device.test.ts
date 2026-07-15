import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryDeviceStore, verifyOrRegisterDevice, sha256Hex } from '../src/device.ts'
import { createApp } from '../src/app.ts'
import { MemoryUsageStore, PLAN_DAILY_LIMIT, dayBucket } from '../src/quota.ts'
import { MemoryPlanStore } from '../src/plan-store.ts'
import type { Upstream } from '../src/upstream.ts'

const SECRET = 'test-secret'
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0)
const DEVICE = 'device-abcdef123456'
const DEVICE_SECRET = 'a-sufficiently-long-device-secret'

const echoUpstream: Upstream = {
  async stream(): Promise<Response> {
    return new Response('data: {}\n\n', { status: 200 })
  }
}

test('verifyOrRegisterDevice registers on first sight (TOFU) then verifies', async () => {
  const store = new MemoryDeviceStore()
  assert.equal(await verifyOrRegisterDevice(store, DEVICE, DEVICE_SECRET), true)
  assert.equal(await store.getSecretHash(DEVICE), await sha256Hex(DEVICE_SECRET))
  // Correct secret verifies; wrong secret is rejected.
  assert.equal(await verifyOrRegisterDevice(store, DEVICE, DEVICE_SECRET), true)
  assert.equal(await verifyOrRegisterDevice(store, DEVICE, 'a-different-long-secret-value'), false)
})

test('verifyOrRegisterDevice rejects missing or weak secrets', async () => {
  const store = new MemoryDeviceStore()
  assert.equal(await verifyOrRegisterDevice(store, DEVICE, undefined), false)
  assert.equal(await verifyOrRegisterDevice(store, undefined, DEVICE_SECRET), false)
  assert.equal(await verifyOrRegisterDevice(store, DEVICE, 'short'), false)
})

function makeApp(overrides = {}) {
  return createApp({
    jwtSecret: SECRET,
    usageStore: new MemoryUsageStore(),
    planStore: new MemoryPlanStore(),
    deviceStore: new MemoryDeviceStore(),
    upstream: echoUpstream,
    now: () => NOW,
    ...overrides
  })
}

function deviceHeaders() {
  return { 'x-device-id': DEVICE, 'x-device-secret': DEVICE_SECRET, 'content-type': 'application/json' }
}

test('device credentials authorize /v1/inference (free plan by default)', async () => {
  const app = makeApp()
  const res = await app.request('/v1/inference', {
    method: 'POST',
    headers: deviceHeaders(),
    body: JSON.stringify({ user: 'hello' })
  })
  assert.equal(res.status, 200)
})

test('device entitlement reflects a Stripe-driven pro plan', async () => {
  const planStore = new MemoryPlanStore()
  await planStore.setPlan(DEVICE, 'pro')
  const app = makeApp({ planStore })
  const res = await app.request('/v1/entitlement', { headers: deviceHeaders() })
  const body = await res.json()
  assert.equal(body.plan, 'pro')
})

test('a wrong device secret is rejected once registered', async () => {
  const deviceStore = new MemoryDeviceStore()
  const app = makeApp({ deviceStore })
  // Register the device.
  await app.request('/v1/entitlement', { headers: deviceHeaders() })
  // Now a different secret for the same id fails.
  const res = await app.request('/v1/entitlement', {
    headers: { 'x-device-id': DEVICE, 'x-device-secret': 'another-long-secret-value-xyz' }
  })
  assert.equal(res.status, 401)
})

test('free device is rate-limited at the daily cap', async () => {
  const usageStore = new MemoryUsageStore()
  for (let i = 0; i < PLAN_DAILY_LIMIT.free; i++) await usageStore.increment(DEVICE, dayBucket(NOW))
  const app = makeApp({ usageStore })
  const res = await app.request('/v1/inference', {
    method: 'POST',
    headers: deviceHeaders(),
    body: JSON.stringify({ user: 'hello' })
  })
  assert.equal(res.status, 429)
})
