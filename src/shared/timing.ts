/** Injectable clock so timing logic can be unit tested with a fake time source. */
export type Clock = () => number

/** Wall-clock milliseconds. Isolated here so callers depend on the seam, not `Date` directly. */
export const nowMs: Clock = () => Date.now()

/**
 * Minimal stopwatch for measuring pipeline stages. `lap` records the elapsed time since the last
 * lap (or start) under a name; `total` is elapsed since construction. Pure aside from the clock.
 */
export function createStopwatch(now: Clock = nowMs) {
  const start = now()
  let last = start
  const marks: Record<string, number> = {}

  return {
    lap(name: string): number {
      const t = now()
      const delta = Math.max(0, t - last)
      marks[name] = delta
      last = t
      return delta
    },
    total(): number {
      return Math.max(0, now() - start)
    },
    marks(): Record<string, number> {
      return { ...marks }
    }
  }
}

/** Timings for a single generate/chat request, in milliseconds. */
export type GenerationTimings = {
  /** GBrain retrieval time, or null when retrieval was skipped. */
  gbrainMs: number | null
  /** LLM (or retrieval-only assembly) time. */
  llmMs: number
  /** End-to-end handler time. */
  totalMs: number
}

/** Per-stage timings for context capture, in milliseconds. All optional/best-effort. */
export type CaptureStageTimings = {
  accessibilityMs?: number
  clipboardSelectionMs?: number
  browserMs?: number
  screenMs?: number
  totalMs?: number
}
