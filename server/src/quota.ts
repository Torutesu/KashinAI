import type { Plan } from './auth.ts'

/** Daily generation limits per plan. Pro is effectively unlimited. */
export const PLAN_DAILY_LIMIT: Record<Plan, number> = {
  free: 20,
  pro: Number.POSITIVE_INFINITY
}

export type Entitlement = {
  plan: Plan
  dailyLimit: number
  used: number
  remaining: number
}

/** Per-user daily counters. A production impl backs this with Workers KV / Durable Objects. */
export interface UsageStore {
  get(userId: string, day: string): Promise<number>
  increment(userId: string, day: string): Promise<number>
}

/** In-memory store — used for local dev and contract tests. */
export class MemoryUsageStore implements UsageStore {
  private counts = new Map<string, number>()

  private key(userId: string, day: string): string {
    return `${userId}:${day}`
  }

  async get(userId: string, day: string): Promise<number> {
    return this.counts.get(this.key(userId, day)) ?? 0
  }

  async increment(userId: string, day: string): Promise<number> {
    const next = (this.counts.get(this.key(userId, day)) ?? 0) + 1
    this.counts.set(this.key(userId, day), next)
    return next
  }
}

/** UTC day bucket (YYYY-MM-DD) for a timestamp; the reset boundary for daily quotas. */
export function dayBucket(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10)
}

export function entitlement(plan: Plan, used: number): Entitlement {
  const dailyLimit = PLAN_DAILY_LIMIT[plan]
  return {
    plan,
    dailyLimit,
    used,
    remaining: dailyLimit === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : Math.max(0, dailyLimit - used)
  }
}

/** Reads current usage and reports whether another generation is allowed (does not mutate). */
export async function checkQuota(
  store: UsageStore,
  userId: string,
  plan: Plan,
  nowMs: number
): Promise<{ allowed: boolean; entitlement: Entitlement }> {
  const used = await store.get(userId, dayBucket(nowMs))
  const ent = entitlement(plan, used)
  return { allowed: ent.remaining > 0, entitlement: ent }
}
