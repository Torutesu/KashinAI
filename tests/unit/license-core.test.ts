import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FREE_DAILY_LIMIT,
  PLAN_CACHE_TTL_MS,
  dayString,
  isOverFreeLimit,
  readTodayCount,
  recordGeneration,
  resolvePlan,
  type LicenseState,
  type Plan
} from '../../src/main/license-core.ts'

const DAY1 = Date.UTC(2026, 6, 15, 9, 0, 0)
const DAY1_LATER = Date.UTC(2026, 6, 15, 23, 30, 0)
const DAY2 = Date.UTC(2026, 6, 16, 0, 5, 0)

/** In-memory LicenseStore for deterministic tests. */
function memStore(initial: Partial<LicenseState> = {}) {
  const state: LicenseState = {
    usageDay: '',
    usageCount: 0,
    cachedPlan: 'free',
    cachedPlanAt: 0,
    ...initial
  }
  return {
    state,
    get: <K extends keyof LicenseState>(k: K) => state[k],
    set: <K extends keyof LicenseState>(k: K, v: LicenseState[K]) => {
      state[k] = v
    }
  }
}

test('dayString is the UTC calendar day', () => {
  assert.equal(dayString(DAY1), '2026-07-15')
  assert.equal(dayString(DAY2), '2026-07-16')
})

test('readTodayCount starts at zero and initializes the day', () => {
  const s = memStore()
  assert.equal(readTodayCount(s, DAY1), 0)
  assert.equal(s.state.usageDay, '2026-07-15')
})

test('recordGeneration increments within the same day', () => {
  const s = memStore()
  recordGeneration(s, DAY1)
  recordGeneration(s, DAY1_LATER)
  assert.equal(readTodayCount(s, DAY1_LATER), 2)
})

test('counter resets when the local day rolls over', () => {
  const s = memStore()
  for (let i = 0; i < 5; i++) recordGeneration(s, DAY1)
  assert.equal(readTodayCount(s, DAY1), 5)
  // Next day: the stale counter is reset to zero on read.
  assert.equal(readTodayCount(s, DAY2), 0)
  assert.equal(s.state.usageDay, '2026-07-16')
})

test('isOverFreeLimit is false below the cap and true at/above it', () => {
  const s = memStore({ usageDay: '2026-07-15', usageCount: FREE_DAILY_LIMIT - 1 })
  assert.equal(isOverFreeLimit(s, DAY1), false)
  recordGeneration(s, DAY1) // now at the cap
  assert.equal(isOverFreeLimit(s, DAY1), true)
})

test('isOverFreeLimit resets with the day even when yesterday was capped', () => {
  const s = memStore({ usageDay: '2026-07-15', usageCount: FREE_DAILY_LIMIT + 3 })
  assert.equal(isOverFreeLimit(s, DAY1), true)
  assert.equal(isOverFreeLimit(s, DAY2), false)
})

test('resolvePlan returns free without a license URL and never calls the server', async () => {
  const s = memStore()
  let called = false
  const plan = await resolvePlan(s, '   ', async () => {
    called = true
    return 'pro'
  }, DAY1)
  assert.equal(plan, 'free')
  assert.equal(called, false)
})

test('resolvePlan caches a Pro answer and skips the server within the TTL', async () => {
  const s = memStore()
  let calls = 0
  const fetcher = async (): Promise<Plan> => {
    calls++
    return 'pro'
  }
  assert.equal(await resolvePlan(s, 'https://api', fetcher, DAY1), 'pro')
  assert.equal(s.state.cachedPlan, 'pro')
  // Within TTL: served from cache, no second call.
  assert.equal(await resolvePlan(s, 'https://api', fetcher, DAY1 + PLAN_CACHE_TTL_MS - 1), 'pro')
  assert.equal(calls, 1)
})

test('resolvePlan re-checks the server after the TTL expires', async () => {
  const s = memStore()
  let calls = 0
  const fetcher = async (): Promise<Plan> => {
    calls++
    return 'pro'
  }
  await resolvePlan(s, 'https://api', fetcher, DAY1)
  await resolvePlan(s, 'https://api', fetcher, DAY1 + PLAN_CACHE_TTL_MS + 1)
  assert.equal(calls, 2)
})

test('resolvePlan does not cache free (always re-asks so an upgrade is seen promptly)', async () => {
  const s = memStore()
  let calls = 0
  const fetcher = async (): Promise<Plan> => {
    calls++
    return 'free'
  }
  await resolvePlan(s, 'https://api', fetcher, DAY1)
  await resolvePlan(s, 'https://api', fetcher, DAY1 + 1000)
  assert.equal(calls, 2)
})

test('resolvePlan falls back to last known Pro on a server error (offline paying user not capped)', async () => {
  const s = memStore({ cachedPlan: 'pro', cachedPlanAt: DAY1 })
  // TTL has passed, and the server is now unreachable (fetcher returns null).
  const plan = await resolvePlan(s, 'https://api', async () => null, DAY1 + PLAN_CACHE_TTL_MS + 1)
  assert.equal(plan, 'pro')
})

test('resolvePlan returns free on a server error when no Pro was ever known', async () => {
  const s = memStore()
  const plan = await resolvePlan(s, 'https://api', async () => null, DAY1)
  assert.equal(plan, 'free')
})

test('resolvePlan downgrades to free when the server positively reports free', async () => {
  const s = memStore({ cachedPlan: 'pro', cachedPlanAt: DAY1 })
  const plan = await resolvePlan(s, 'https://api', async () => 'free', DAY1 + PLAN_CACHE_TTL_MS + 1)
  assert.equal(plan, 'free')
  assert.equal(s.state.cachedPlan, 'free')
})
