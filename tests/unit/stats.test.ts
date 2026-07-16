import test from 'node:test'
import assert from 'node:assert/strict'
import { percentile, summarize, summarizeByKey } from '../../src/shared/stats.ts'

test('percentile returns 0 for an empty sample', () => {
  assert.equal(percentile([], 50), 0)
})

test('percentile uses nearest-rank and returns observed values', () => {
  const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
  assert.equal(percentile(v, 50), 50) // ceil(0.5*10)=5 → 5th value
  assert.equal(percentile(v, 95), 100) // ceil(0.95*10)=10 → 10th value
  assert.equal(percentile(v, 0), 10)
  assert.equal(percentile(v, 100), 100)
})

test('percentile is order-independent (sorts internally)', () => {
  assert.equal(percentile([30, 10, 20], 50), 20)
})

test('summarize computes count/min/max/mean/p50/p95', () => {
  const s = summarize([100, 200, 300, 400])
  assert.equal(s.count, 4)
  assert.equal(s.min, 100)
  assert.equal(s.max, 400)
  assert.equal(s.mean, 250)
  assert.equal(s.p50, 200) // ceil(0.5*4)=2 → 2nd
  assert.equal(s.p95, 400) // ceil(0.95*4)=4 → 4th
})

test('summarize drops non-finite values', () => {
  const s = summarize([10, NaN, 30, Infinity, 20])
  assert.equal(s.count, 3)
  assert.equal(s.min, 10)
  assert.equal(s.max, 30)
})

test('summarize handles an empty sample without throwing', () => {
  assert.deepEqual(summarize([]), { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0 })
})

test('summarize rounds to one decimal place', () => {
  assert.equal(summarize([1, 2]).mean, 1.5)
  assert.equal(summarize([1, 1, 2]).mean, 1.3)
})

test('summarizeByKey ignores records missing a key', () => {
  const samples = [
    { accessibilityMs: 100, browserMs: 500 },
    { accessibilityMs: 200 }, // browser stage skipped this run
    { accessibilityMs: 300, browserMs: 700 }
  ]
  const out = summarizeByKey(samples, ['accessibilityMs', 'browserMs', 'screenMs'])
  assert.equal(out.accessibilityMs.count, 3)
  assert.equal(out.accessibilityMs.p50, 200)
  assert.equal(out.browserMs.count, 2) // only two runs actually did browser capture
  assert.equal(out.screenMs.count, 0) // stage never ran
})
