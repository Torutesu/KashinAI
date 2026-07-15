import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import type { HistoryEntry } from '../shared/types'
import { appendHistoryEntry, normalizeHistoryEntries } from '../shared/history'

// Re-exported so ipc.ts can import all history helpers from one module (keeps the test loader's
// module-mock surface to a single specifier).
export { summarizeHistorySources } from '../shared/history'

type HistoryStore = {
  entries: HistoryEntry[]
}

const store = new Store<HistoryStore>({
  name: 'history',
  defaults: { entries: [] }
})

/** Reads the saved history (newest first), tolerating older/partial on-disk shapes. */
export function listHistory(): HistoryEntry[] {
  return normalizeHistoryEntries(store.get('entries', []))
}

/**
 * Appends a generation to history. Stamps id/timestamp here so callers only pass the payload.
 * Never throws — history is a convenience, not a critical path, so a write failure must not break
 * the generate/chat response.
 */
export function recordHistoryEntry(input: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
  try {
    const entry: HistoryEntry = {
      ...input,
      id: randomUUID(),
      timestamp: new Date().toISOString()
    }
    store.set('entries', appendHistoryEntry(listHistory(), entry))
  } catch {
    // Ignore persistence failures; the generated output has already been returned to the user.
  }
}

export function clearHistory(): void {
  try {
    store.set('entries', [])
  } catch {
    // Ignore.
  }
}
