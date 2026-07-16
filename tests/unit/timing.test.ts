import test from 'node:test'
import assert from 'node:assert/strict'
import { createStopwatch } from '../../src/shared/timing.ts'

function fakeClock(sequence: number[]): () => number {
  let i = 0
  return () => sequence[Math.min(i++, sequence.length - 1)]
}

test('createStopwatch records lap deltas and total from a clock', () => {
  // construction=0, lap a at 5 (delta 5), lap b at 20 (delta 15), total at 30
  const clock = fakeClock([0, 5, 20, 30])
  const sw = createStopwatch(clock)
  assert.equal(sw.lap('a'), 5)
  assert.equal(sw.lap('b'), 15)
  assert.equal(sw.total(), 30)
  assert.deepEqual(sw.marks(), { a: 5, b: 15 })
})

test('createStopwatch clamps negative deltas to zero (non-monotonic clock)', () => {
  const clock = fakeClock([100, 90, 80])
  const sw = createStopwatch(clock)
  assert.equal(sw.lap('x'), 0)
  assert.equal(sw.total(), 0)
})

test('createStopwatch marks() returns a copy, not the live object', () => {
  const sw = createStopwatch(fakeClock([0, 1]))
  sw.lap('a')
  const snapshot = sw.marks()
  snapshot.a = 999
  assert.deepEqual(sw.marks(), { a: 1 })
})
