import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyStripeSignature, signStripePayload, parseStripeSignature, planFromStripeEvent } from '../src/stripe.ts'

const SECRET = 'whsec_test'
const NOW = 1_700_000_000_000 // ms

test('parseStripeSignature reads t and v1', () => {
  assert.deepEqual(parseStripeSignature('t=123,v1=abc'), { t: 123, v1: 'abc' })
  assert.equal(parseStripeSignature('nope'), null)
  assert.equal(parseStripeSignature(null), null)
})

test('verifyStripeSignature accepts a valid, in-tolerance signature', async () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' })
  const ts = Math.floor(NOW / 1000)
  const header = await signStripePayload(payload, SECRET, ts)
  assert.equal(await verifyStripeSignature(payload, header, SECRET, NOW), true)
})

test('verifyStripeSignature rejects a wrong secret', async () => {
  const payload = '{}'
  const ts = Math.floor(NOW / 1000)
  const header = await signStripePayload(payload, SECRET, ts)
  assert.equal(await verifyStripeSignature(payload, header, 'whsec_other', NOW), false)
})

test('verifyStripeSignature rejects an out-of-tolerance timestamp', async () => {
  const payload = '{}'
  const ts = Math.floor(NOW / 1000) - 10_000
  const header = await signStripePayload(payload, SECRET, ts)
  assert.equal(await verifyStripeSignature(payload, header, SECRET, NOW), false)
})

test('verifyStripeSignature rejects a tampered payload', async () => {
  const ts = Math.floor(NOW / 1000)
  const header = await signStripePayload('{"a":1}', SECRET, ts)
  assert.equal(await verifyStripeSignature('{"a":2}', header, SECRET, NOW), false)
})

test('planFromStripeEvent maps subscription lifecycle to plans', () => {
  assert.deepEqual(
    planFromStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: 'user-1' } }
    }),
    { userId: 'user-1', plan: 'pro' }
  )
  assert.deepEqual(
    planFromStripeEvent({
      type: 'customer.subscription.updated',
      data: { object: { status: 'active', metadata: { userId: 'user-2' } } }
    }),
    { userId: 'user-2', plan: 'pro' }
  )
  assert.deepEqual(
    planFromStripeEvent({
      type: 'customer.subscription.updated',
      data: { object: { status: 'past_due', metadata: { userId: 'user-2' } } }
    }),
    { userId: 'user-2', plan: 'free' }
  )
  assert.deepEqual(
    planFromStripeEvent({
      type: 'customer.subscription.deleted',
      data: { object: { client_reference_id: 'user-3' } }
    }),
    { userId: 'user-3', plan: 'free' }
  )
  assert.equal(planFromStripeEvent({ type: 'invoice.paid', data: { object: {} } }), null)
})
