import test from 'node:test'
import assert from 'node:assert/strict'
import { signJwt, verifyJwt, bearerFromHeader } from '../src/auth.ts'

const SECRET = 'test-secret'

test('signJwt/verifyJwt round-trips a valid token', async () => {
  const token = await signJwt({ sub: 'user-1', plan: 'pro' }, SECRET, { ttlSeconds: 3600, nowSeconds: 1000 })
  const payload = await verifyJwt(token, SECRET, { nowSeconds: 1500 })
  assert.ok(payload)
  assert.equal(payload.sub, 'user-1')
  assert.equal(payload.plan, 'pro')
  assert.equal(payload.exp, 4600)
})

test('verifyJwt rejects a token signed with a different secret', async () => {
  const token = await signJwt({ sub: 'u', plan: 'free' }, SECRET, { nowSeconds: 1000 })
  assert.equal(await verifyJwt(token, 'wrong-secret', { nowSeconds: 1000 }), null)
})

test('verifyJwt rejects an expired token', async () => {
  const token = await signJwt({ sub: 'u', plan: 'free' }, SECRET, { ttlSeconds: 10, nowSeconds: 1000 })
  assert.equal(await verifyJwt(token, SECRET, { nowSeconds: 2000 }), null)
})

test('verifyJwt rejects a tampered payload', async () => {
  const token = await signJwt({ sub: 'u', plan: 'free' }, SECRET, { nowSeconds: 1000 })
  const [h, , s] = token.split('.')
  // Swap in a forged "pro" payload while keeping the original signature.
  const forgedBody = Buffer.from(JSON.stringify({ sub: 'u', plan: 'pro', exp: 9_999_999_999 }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  assert.equal(await verifyJwt(`${h}.${forgedBody}.${s}`, SECRET, { nowSeconds: 1000 }), null)
})

test('verifyJwt rejects malformed tokens without throwing', async () => {
  assert.equal(await verifyJwt('not-a-jwt', SECRET), null)
  assert.equal(await verifyJwt('a.b', SECRET), null)
  assert.equal(await verifyJwt('', SECRET), null)
})

test('bearerFromHeader extracts the token', () => {
  assert.equal(bearerFromHeader('Bearer abc.def.ghi'), 'abc.def.ghi')
  assert.equal(bearerFromHeader('bearer xyz'), 'xyz')
  assert.equal(bearerFromHeader('Basic abc'), null)
  assert.equal(bearerFromHeader(null), null)
})
