import Store from 'electron-store'
import { getDeviceCredentials } from './device-identity'
import { LlmError } from './llm'

/**
 * Client-side licensing for the BYOK model. Generation always runs with the user's own API key
 * (see llm.ts) — this module only decides whether a generation is *allowed* under the free plan:
 *
 *   - Pro devices are unlimited. Pro is verified against the license server (GET /v1/license with
 *     the anonymous device credential) and cached briefly so we don't call it on every request.
 *   - Free devices get FREE_DAILY_LIMIT generations per local day, counted here on the device.
 *
 * The operator's inference key is never involved: the license server holds no provider key and runs
 * no inference, so it can only ever answer "is this device Pro?".
 */

/** Free plan's daily generation cap. Mirrors the server's FREE_DAILY_LIMIT. Pro = unlimited. */
export const FREE_DAILY_LIMIT = 20

/** How long a fetched plan is trusted before we re-check the license server (ms). */
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000

export type Plan = 'free' | 'pro'

type LicenseStore = {
  /** Local day (YYYY-MM-DD) the counter below applies to; resets when the day rolls over. */
  usageDay: string
  usageCount: number
  /** Last plan fetched from the license server, cached to avoid a request per generation. */
  cachedPlan: Plan
  cachedPlanAt: number
}

const store = new Store<LicenseStore>({
  name: 'license',
  defaults: { usageDay: '', usageCount: 0, cachedPlan: 'free', cachedPlanAt: 0 }
})

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Today's local generation count, resetting the stored counter when the day has rolled over. */
function readTodayCount(): number {
  if (store.get('usageDay') !== today()) {
    store.set('usageDay', today())
    store.set('usageCount', 0)
    return 0
  }
  return store.get('usageCount')
}

/**
 * Resolves the device's plan. Pro is verified against the license server and cached for a few
 * minutes. Returns 'free' when no server is configured. On a network/server error we trust the last
 * known plan so a paying user who is briefly offline isn't wrongly capped — and never upgrade a
 * device to Pro without a positive answer from the server.
 */
export async function getPlan(licenseUrl: string, now: number = Date.now()): Promise<Plan> {
  const base = licenseUrl.trim().replace(/\/+$/, '')
  if (!base) return 'free'

  const cached = store.get('cachedPlan')
  if (cached === 'pro' && now - store.get('cachedPlanAt') < PLAN_CACHE_TTL_MS) return 'pro'

  try {
    const { deviceId, deviceSecret } = getDeviceCredentials()
    const res = await fetch(`${base}/v1/license`, {
      headers: { 'x-device-id': deviceId, 'x-device-secret': deviceSecret }
    })
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { plan?: string } | null
      const plan: Plan = body?.plan === 'pro' ? 'pro' : 'free'
      store.set('cachedPlan', plan)
      store.set('cachedPlanAt', now)
      return plan
    }
  } catch {
    // Unreachable license server: fall through to the last known plan below.
  }
  return cached === 'pro' ? 'pro' : 'free'
}

/**
 * Enforces the client-side free daily cap before a BYOK generation. Pro devices pass through; a free
 * device that has hit FREE_DAILY_LIMIT gets an LlmError('quota_exceeded'), which the renderer turns
 * into the upgrade prompt. Never blocks on the license server being reachable.
 */
export async function assertWithinFreeQuota(licenseUrl: string): Promise<void> {
  const plan = await getPlan(licenseUrl)
  if (plan === 'pro') return
  if (readTodayCount() >= FREE_DAILY_LIMIT) {
    throw new LlmError(
      'quota_exceeded',
      `無料プランの上限（1日${FREE_DAILY_LIMIT}回）に達しました。Proにアップグレードすると無制限に使えます。`
    )
  }
}

/** Records one successful generation against today's local counter. */
export function recordGeneration(): void {
  store.set('usageCount', readTodayCount() + 1)
}

/** Snapshot for the UI: plan + today's usage against the free cap. */
export async function getUsageSnapshot(
  licenseUrl: string
): Promise<{ plan: Plan; used: number; limit: number; remaining: number }> {
  const plan = await getPlan(licenseUrl)
  const used = readTodayCount()
  return { plan, used, limit: FREE_DAILY_LIMIT, remaining: Math.max(0, FREE_DAILY_LIMIT - used) }
}
