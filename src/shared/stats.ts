/**
 * Small, dependency-free statistics for the performance harness. Pure functions so the aggregation
 * logic is unit-tested here and the Electron benchmark script (scripts/benchmark-capture.mjs) only
 * has to collect raw samples and print what these return.
 */

export type Summary = {
  count: number
  min: number
  max: number
  mean: number
  p50: number
  p95: number
}

/**
 * Nearest-rank percentile (p in [0, 100]) over a numeric sample. Returns 0 for an empty sample.
 * Nearest-rank (rather than interpolation) is chosen so a reported value is always an observed
 * measurement — useful when eyeballing latency tails.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (p <= 0) return sorted[0]
  if (p >= 100) return sorted[sorted.length - 1]
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(rank, sorted.length) - 1]
}

/** Rounds to one decimal place; keeps summary tables readable without lying about the value. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Summarizes a numeric sample (non-finite values are dropped first). */
export function summarize(values: number[]): Summary {
  const clean = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (clean.length === 0) return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0 }
  const sum = clean.reduce((a, b) => a + b, 0)
  return {
    count: clean.length,
    min: round1(Math.min(...clean)),
    max: round1(Math.max(...clean)),
    mean: round1(sum / clean.length),
    p50: round1(percentile(clean, 50)),
    p95: round1(percentile(clean, 95))
  }
}

/**
 * Summarizes each named key across a list of sample records, ignoring records where the key is
 * missing/undefined (stages that didn't run in that iteration don't distort the stats).
 */
export function summarizeByKey(
  samples: Array<Record<string, number | undefined>>,
  keys: readonly string[]
): Record<string, Summary> {
  const out: Record<string, Summary> = {}
  for (const key of keys) {
    const values = samples
      .map((s) => s[key])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    out[key] = summarize(values)
  }
  return out
}
