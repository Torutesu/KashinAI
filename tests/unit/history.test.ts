import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HISTORY_LIMIT,
  appendHistoryEntry,
  normalizeHistoryEntries,
  summarizeHistorySources
} from '../../src/shared/history.ts'
import type { HistoryEntry } from '../../src/shared/types.ts'

function entry(id: string): HistoryEntry {
  return {
    id,
    timestamp: '2026-07-15T00:00:00.000Z',
    kind: 'generate',
    actionType: 'reply',
    activeApp: 'Slack',
    contextKind: 'social',
    output: `output ${id}`,
    searchQuery: 'q',
    contextSource: 'gbrain-cli',
    sources: []
  }
}

test('appendHistoryEntry prepends the newest entry', () => {
  const result = appendHistoryEntry([entry('a')], entry('b'))
  assert.deepEqual(
    result.map((e) => e.id),
    ['b', 'a']
  )
})

test('appendHistoryEntry caps the list at the limit, dropping the oldest', () => {
  let list: HistoryEntry[] = []
  for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
    list = appendHistoryEntry(list, entry(`e${i}`))
  }
  assert.equal(list.length, HISTORY_LIMIT)
  // Newest first: the most recent id is at the head, and the oldest ids have been dropped.
  assert.equal(list[0]?.id, `e${HISTORY_LIMIT + 9}`)
  assert.ok(!list.some((e) => e.id === 'e0'))
})

test('appendHistoryEntry honors a custom limit', () => {
  const result = appendHistoryEntry([entry('a'), entry('b')], entry('c'), 2)
  assert.deepEqual(
    result.map((e) => e.id),
    ['c', 'a']
  )
})

test('summarizeHistorySources keeps only source and title', () => {
  const result = summarizeHistorySources([
    { source: 'company/faq', title: 'FAQ', content: 'body', score: 0.9, type: 'company' }
  ])
  assert.deepEqual(result, [{ source: 'company/faq', title: 'FAQ' }])
})

test('normalizeHistoryEntries drops non-array and malformed input', () => {
  assert.deepEqual(normalizeHistoryEntries(null), [])
  assert.deepEqual(normalizeHistoryEntries('nope'), [])
  const mixed = normalizeHistoryEntries([entry('a'), { id: 5 }, { output: 'x' }, null])
  assert.deepEqual(
    mixed.map((e) => e.id),
    ['a']
  )
})
