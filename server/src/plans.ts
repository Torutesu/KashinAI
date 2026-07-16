import type { Plan } from './auth.ts'

/**
 * Plan definitions for the BYOK + license model. The server does NOT run or meter inference — users
 * generate with their own API key. The free daily limit is enforced client-side (the app counts
 * locally) and reported here for reference; Pro unlocks unlimited use and is verified via the
 * Stripe-driven plan store.
 */

export const FREE_DAILY_LIMIT = 20

export type License = {
  plan: Plan
  /** Client-enforced free daily generation cap (Pro = unlimited). */
  freeDailyLimit: number
}

export function licenseFor(plan: Plan): License {
  return { plan, freeDailyLimit: FREE_DAILY_LIMIT }
}
