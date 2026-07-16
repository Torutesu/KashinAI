import Store from 'electron-store'
import { getDeviceCredentials } from './device-identity'
import { LlmError } from './llm'
import {
  FREE_DAILY_LIMIT,
  isOverFreeLimit,
  readTodayCount,
  recordGeneration as recordGenerationCore,
  resolvePlan,
  type LicenseState,
  type Plan
} from './license-core'

/**
 * Client-side licensing for the BYOK model — the electron/fetch wiring around the pure logic in
 * license-core.ts. Generation always runs with the user's own API key (see llm.ts); this module
 * only decides whether a generation is *allowed* under the free plan and verifies Pro against the
 * license server. The operator's inference key is never involved.
 */

export { FREE_DAILY_LIMIT }
export type { Plan }

const store = new Store<LicenseState>({
  name: 'license',
  defaults: { usageDay: '', usageCount: 0, cachedPlan: 'free', cachedPlanAt: 0 }
})

/** Hard cap on how long we'll wait for the license server before treating it as unreachable (ms). */
const LICENSE_FETCH_TIMEOUT_MS = 4000

/** Asks the license server for this device's plan. Returns null on any network/server error or timeout. */
async function fetchPlan(licenseUrl: string): Promise<Plan | null> {
  const base = licenseUrl.trim().replace(/\/+$/, '')
  try {
    const { deviceId, deviceSecret } = getDeviceCredentials()
    const res = await fetch(`${base}/v1/license`, {
      headers: { 'x-device-id': deviceId, 'x-device-secret': deviceSecret },
      // Never let a slow/hung license server block generation — it must not gate BYOK inference.
      signal: AbortSignal.timeout(LICENSE_FETCH_TIMEOUT_MS)
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => null)) as { plan?: string } | null
    return body?.plan === 'pro' ? 'pro' : 'free'
  } catch {
    return null
  }
}

/** Resolves the device's plan (Pro verified against the license server, cached briefly). */
export async function getPlan(licenseUrl: string, now: number = Date.now()): Promise<Plan> {
  return resolvePlan(store, licenseUrl, () => fetchPlan(licenseUrl), now)
}

/**
 * Enforces the client-side free daily cap before a BYOK generation. Under the cap the generation is
 * allowed regardless of plan, so we don't touch the license server on the hot path — the plan only
 * matters once the cap is hit, where we confirm Pro (unlimited) before blocking. A free device at
 * the cap gets an LlmError('quota_exceeded'), which the renderer turns into the upgrade prompt.
 */
export async function assertWithinFreeQuota(licenseUrl: string, now: number = Date.now()): Promise<void> {
  // No license server configured → monetization isn't wired and there'd be no way to upgrade, so
  // don't cap. The paywall only appears in builds that ship a license server URL.
  if (!licenseUrl.trim()) return
  if (!isOverFreeLimit(store, now)) return
  // At the cap: the only thing that lifts it is a verified Pro plan.
  if ((await getPlan(licenseUrl, now)) === 'pro') return
  throw new LlmError(
    'quota_exceeded',
    `無料プランの上限（1日${FREE_DAILY_LIMIT}回）に達しました。Proにアップグレードすると無制限に使えます。`
  )
}

/** Records one successful generation against today's local counter. */
export function recordGeneration(now: number = Date.now()): void {
  recordGenerationCore(store, now)
}

/** Snapshot for the UI: plan + today's usage against the free cap. */
export async function getUsageSnapshot(
  licenseUrl: string,
  now: number = Date.now()
): Promise<{ plan: Plan; used: number; limit: number; remaining: number }> {
  const plan = await getPlan(licenseUrl, now)
  const used = readTodayCount(store, now)
  return { plan, used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) }
}
