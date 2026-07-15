import type { HistoryEntry, RetrievedContext } from './types'

/** Maximum number of generations kept in local history. Oldest entries are dropped past this. */
export const HISTORY_LIMIT = 50

/**
 * Returns a new history list with `entry` prepended (newest first) and capped at `limit`.
 * Pure so it can be unit tested without the electron-store backing.
 */
export function appendHistoryEntry(
  entries: HistoryEntry[],
  entry: HistoryEntry,
  limit: number = HISTORY_LIMIT
): HistoryEntry[] {
  return [entry, ...entries].slice(0, Math.max(0, limit))
}

/** Condenses retrieved GBrain context down to the fields the History view needs to show sources. */
export function summarizeHistorySources(sources: RetrievedContext[]): HistoryEntry['sources'] {
  return sources.map((source) => ({ source: source.source, title: source.title }))
}

/** Defensive normalization for whatever was persisted on disk (older shapes, partial writes). */
export function normalizeHistoryEntries(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (item): item is HistoryEntry =>
      Boolean(item) &&
      typeof item === 'object' &&
      typeof (item as HistoryEntry).id === 'string' &&
      typeof (item as HistoryEntry).output === 'string'
  )
}
