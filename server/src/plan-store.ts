import type { Plan } from './auth.ts'

/**
 * Maps a subject (account/user id) to its current plan, updated by Stripe webhooks and read when
 * minting tokens. Also records processed webhook event ids so replays are idempotent.
 */
export interface PlanStore {
  getPlan(userId: string): Promise<Plan>
  setPlan(userId: string, plan: Plan): Promise<void>
  /** Returns true if this event id had not been seen before (and marks it seen). */
  markEventProcessed(eventId: string): Promise<boolean>
}

/** In-memory store for local dev and contract tests. */
export class MemoryPlanStore implements PlanStore {
  private plans = new Map<string, Plan>()
  private events = new Set<string>()

  async getPlan(userId: string): Promise<Plan> {
    return this.plans.get(userId) ?? 'free'
  }

  async setPlan(userId: string, plan: Plan): Promise<void> {
    this.plans.set(userId, plan)
  }

  async markEventProcessed(eventId: string): Promise<boolean> {
    if (this.events.has(eventId)) return false
    this.events.add(eventId)
    return true
  }
}
