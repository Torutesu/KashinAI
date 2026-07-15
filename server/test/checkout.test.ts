import test from 'node:test'
import assert from 'node:assert/strict'
import { createStripeBilling } from '../src/billing.ts'
import { createApp } from '../src/app.ts'
import { signJwt } from '../src/auth.ts'
import { MemoryUsageStore } from '../src/quota.ts'
import type { Upstream } from '../src/upstream.ts'

const SECRET = 'test-secret'
const NOW = Date.UTC(2026, 6, 15, 12, 0, 0)

const noopUpstream: Upstream = {
  async stream(): Promise<Response> {
    return new Response('', { status: 200 })
  }
}

async function token() {
  return signJwt({ sub: 'user-1', plan: 'free' }, SECRET, { ttlSeconds: 3600, nowSeconds: Math.floor(NOW / 1000) })
}

test('createStripeBilling posts subscription params and returns the checkout url', async () => {
  let seenBody = ''
  let seenAuth = ''
  const billing = createStripeBilling({
    secretKey: 'sk_test_123',
    priceId: 'price_abc',
    successUrl: 'https://app/success',
    cancelUrl: 'https://app/cancel',
    fetchImpl: async (_url, init) => {
      seenBody = String(init?.body ?? '')
      seenAuth = (init?.headers as Record<string, string>)?.authorization ?? ''
      return new Response(JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/xyz' }), { status: 200 })
    }
  })

  const { url } = await billing.createCheckoutSession('user-1')
  assert.equal(url, 'https://checkout.stripe.com/c/pay/xyz')
  assert.equal(seenAuth, 'Bearer sk_test_123')
  assert.match(seenBody, /mode=subscription/)
  assert.match(seenBody, /line_items%5B0%5D%5Bprice%5D=price_abc/)
  assert.match(seenBody, /client_reference_id=user-1/)
})

test('createStripeBilling throws on a non-ok Stripe response', async () => {
  const billing = createStripeBilling({
    secretKey: 'sk',
    priceId: 'p',
    successUrl: 's',
    cancelUrl: 'c',
    fetchImpl: async () => new Response('bad', { status: 400 })
  })
  await assert.rejects(() => billing.createCheckoutSession('u'), /stripe_checkout_failed:400/)
})

test('/v1/billing/checkout returns the url for an authenticated user', async () => {
  const app = createApp({
    jwtSecret: SECRET,
    usageStore: new MemoryUsageStore(),
    upstream: noopUpstream,
    now: () => NOW,
    billing: { createCheckoutSession: async (userId) => ({ url: `https://checkout/${userId}` }) }
  })
  const res = await app.request('/v1/billing/checkout', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}` }
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { url: 'https://checkout/user-1' })
})

test('/v1/billing/checkout is 501 when billing is not configured', async () => {
  const app = createApp({ jwtSecret: SECRET, usageStore: new MemoryUsageStore(), upstream: noopUpstream, now: () => NOW })
  const res = await app.request('/v1/billing/checkout', {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}` }
  })
  assert.equal(res.status, 501)
})

test('/v1/billing/checkout requires auth', async () => {
  const app = createApp({
    jwtSecret: SECRET,
    usageStore: new MemoryUsageStore(),
    upstream: noopUpstream,
    now: () => NOW,
    billing: { createCheckoutSession: async () => ({ url: 'x' }) }
  })
  const res = await app.request('/v1/billing/checkout', { method: 'POST' })
  assert.equal(res.status, 401)
})
