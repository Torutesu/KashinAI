/**
 * Pure client-side licensing logic — no electron, no fetch, no clock of its own. Everything the
 * quota/plan decision needs (persistence, current time, and how to ask the license server) is
 * injected, so this module is fully unit-testable and `license.ts` is a thin wiring layer over it.
 *
 * The model: generation is always BYOK. Pro devices are unlimited; free devices get
 * FREE_DAILY_LIMIT generations per local day, counted on the device.
 */

/** Free plan's daily generation cap. Mirrors the server's FREE_DAILY_LIMIT. Pro = unlimited. */
export const FREE_DAILY_LIMIT = 20

/** How long a fetched Pro plan is trusted before we re-check the license server (ms). */
export const PLAN_CACHE_TTL_MS = 5 * 60 * 1000

export type Plan = 'free' | 'pro'

export type LicenseState = {
  /** Local day (YYYY-MM-DD) the counter below applies to; resets when the day rolls over. */
  usageDay: string
  usageCount: number
  /** Last plan fetched from the license server, cached to avoid a request per generation. */
  cachedPlan: Plan
  cachedPlanAt: number
}

/** Minimal typed key-value persistence (electron-store satisfies this at the call site). */
export interface LicenseStore {
  get<K extends keyof LicenseState>(key: K): LicenseState[K]
  set<K extends keyof LicenseState>(key: K, value: LicenseState[K]): void
}

/** Resolves the device's plan against the license server. Returns null on a network/server error. */
export type PlanFetcher = () => Promise<Plan | null>

/** UTC calendar day for a timestamp (ms). Day rollover is the reset boundary for the free counter. */
export function dayString(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** Today's local generation count, resetting the stored counter when the day has rolled over. */
export function readTodayCount(store: LicenseStore, now: number): number {
  const day = dayString(now)
  if (store.get('usageDay') !== day) {
    store.set('usageDay', day)
    store.set('usageCount', 0)
    return 0
  }
  return store.get('usageCount')
}

/** Records one successful generation against today's local counter. */
export function recordGeneration(store: LicenseStore, now: number): void {
  store.set('usageCount', readTodayCount(store, now) + 1)
}

/** True when a free device has reached (or passed) the daily cap. */
export function isOverFreeLimit(store: LicenseStore, now: number): boolean {
  return readTodayCount(store, now) >= FREE_DAILY_LIMIT
}

/**
 * Resolves the plan with caching + safe fallback:
 *   - no license URL → always free (BYOK still works; the free cap applies).
 *   - a cached Pro plan within the TTL → trusted without a network call.
 *   - otherwise ask the server; a positive answer is cached; a null (error) answer falls back to the
 *     last known plan, so a paying user who is briefly offline is never wrongly downgraded, and a
 *     device is never upgraded to Pro without a positive answer.
 */
export async function resolvePlan(
  store: LicenseStore,
  licenseUrl: string,
  fetcher: PlanFetcher,
  now: number,
  ttlMs: number = PLAN_CACHE_TTL_MS
): Promise<Plan> {
  if (!licenseUrl.trim()) return 'free'

  const cached = store.get('cachedPlan')
  if (cached === 'pro' && now - store.get('cachedPlanAt') < ttlMs) return 'pro'

  const fetched = await fetcher()
  if (fetched === null) return cached === 'pro' ? 'pro' : 'free'

  store.set('cachedPlan', fetched)
  store.set('cachedPlanAt', now)
  return fetched
}
