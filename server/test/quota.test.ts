import test from 'node:test'
import assert from 'node:assert/strict'
import { MemoryUsageStore, checkQuota, entitlement, dayBucket, PLAN_DAILY_LIMIT } from '../src/quota.ts'

const DAY = Date.UTC(2026, 6, 15, 12, 0, 0) // 2026-07-15

test('dayBucket returns the UTC date', () => {
  assert.equal(dayBucket(DAY), '2026-07-15')
})

test('MemoryUsageStore increments per user/day', async () => {
  const store = new MemoryUsageStore()
  assert.equal(await store.get('u1', '2026-07-15'), 0)
  assert.equal(await store.increment('u1', '2026-07-15'), 1)
  assert.equal(await store.increment('u1', '2026-07-15'), 2)
  // Different day is a separate bucket.
  assert.equal(await store.get('u1', '2026-07-16'), 0)
  // Different user is separate.
  assert.equal(await store.get('u2', '2026-07-15'), 0)
})

test('entitlement computes remaining for free, unlimited for pro', () => {
  assert.deepEqual(entitlement('free', 5), {
    plan: 'free',
    dailyLimit: PLAN_DAILY_LIMIT.free,
    used: 5,
    remaining: PLAN_DAILY_LIMIT.free - 5
  })
  const pro = entitlement('pro', 1000)
  assert.equal(pro.remaining, Number.POSITIVE_INFINITY)
})

test('checkQuota blocks a free user at the daily limit', async () => {
  const store = new MemoryUsageStore()
  for (let i = 0; i < PLAN_DAILY_LIMIT.free; i++) await store.increment('u1', dayBucket(DAY))
  const { allowed, entitlement: ent } = await checkQuota(store, 'u1', 'free', DAY)
  assert.equal(allowed, false)
  assert.equal(ent.remaining, 0)
})

test('checkQuota always allows a pro user', async () => {
  const store = new MemoryUsageStore()
  for (let i = 0; i < 100; i++) await store.increment('u1', dayBucket(DAY))
  const { allowed } = await checkQuota(store, 'u1', 'pro', DAY)
  assert.equal(allowed, true)
})
