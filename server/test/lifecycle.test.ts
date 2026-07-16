import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/app.ts'
import { MemoryPlanStore } from '../src/plan-store.ts'
import { MemoryDeviceStore } from '../src/device.ts'
import { signStripePayload } from '../src/stripe.ts'
import { FREE_DAILY_LIMIT } from '../src/plans.ts'

/**
 * End-to-end license lifecycle through one real app instance: a fresh device registers as free,
 * starts checkout, Stripe's webhook upgrades it to Pro (keyed by the device id carried as
 * client_reference_id), the device then reads Pro, and a subscription deletion downgrades it —
 * while a mismatched device secret is always rejected.
 */

const SECRET = 'test-secret'
const STRIPE_SECRET = 'whsec_test'
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0)
const DEVICE = 'device-lifecycle-1'
const DEVICE_SECRET = 'a-sufficiently-long-device-secret-value'

function headers() {
  return { 'x-device-id': DEVICE, 'x-device-secret': DEVICE_SECRET }
}

async function stripeEvent(app: ReturnType<typeof createApp>, event: object) {
  const payload = JSON.stringify(event)
  const sig = await signStripePayload(payload, STRIPE_SECRET, Math.floor(NOW / 1000))
  return app.request('/webhooks/stripe', {
    method: 'POST',
    headers: { 'stripe-signature': sig, 'content-type': 'application/json' },
    body: payload
  })
}

test('device → checkout → webhook → pro → downgrade lifecycle', async () => {
  const planStore = new MemoryPlanStore()
  const deviceStore = new MemoryDeviceStore()
  const app = createApp({
    jwtSecret: SECRET,
    planStore,
    deviceStore,
    stripeWebhookSecret: STRIPE_SECRET,
    now: () => NOW,
    billing: { createCheckoutSession: async (id) => ({ url: `https://checkout.stripe.com/${id}` }) }
  })

  // 1. Fresh device authenticates (trust-on-first-use) and starts on the free plan.
  const first = await app.request('/v1/license', { headers: headers() })
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { plan: 'free', freeDailyLimit: FREE_DAILY_LIMIT })

  // 2. Checkout uses the device id as the Stripe client_reference_id.
  const checkout = await app.request('/v1/billing/checkout', { method: 'POST', headers: headers() })
  assert.equal(checkout.status, 200)
  assert.deepEqual(await checkout.json(), { url: `https://checkout.stripe.com/${DEVICE}` })

  // 3. Stripe confirms payment for that device id → the plan store upgrades it.
  const upgrade = await stripeEvent(app, {
    id: 'evt_life_1',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: DEVICE } }
  })
  assert.equal(upgrade.status, 200)
  assert.equal(await planStore.getPlan(DEVICE), 'pro')

  // 4. The same device now reads Pro from /v1/license.
  const afterUpgrade = await app.request('/v1/license', { headers: headers() })
  assert.equal((await afterUpgrade.json()).plan, 'pro')

  // 5. A mismatched secret for the (now registered) device is rejected — Pro can't be borrowed.
  const impostor = await app.request('/v1/license', {
    headers: { 'x-device-id': DEVICE, 'x-device-secret': 'totally-different-secret-value-xyz' }
  })
  assert.equal(impostor.status, 401)

  // 6. Subscription deletion downgrades the device back to free.
  await stripeEvent(app, {
    id: 'evt_life_2',
    type: 'customer.subscription.deleted',
    data: { object: { client_reference_id: DEVICE } }
  })
  const afterCancel = await app.request('/v1/license', { headers: headers() })
  assert.equal((await afterCancel.json()).plan, 'free')
})
