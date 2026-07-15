import { useState } from 'react'
import type { HistoryEntry } from '@shared/types'

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function kindLabel(entry: HistoryEntry): string {
  if (entry.kind === 'generate') return entry.actionType ? `action: ${entry.actionType}` : 'generate'
  return 'chat'
}

/**
 * Generation history: a scrollable list of past outputs the user can copy or re-insert. Backed by
 * the local history store (main process), so it survives restarts up to the store's cap.
 */
export default function HistoryView({
  entries,
  onBack,
  onClose,
  onClear,
  onCopy,
  onInsert
}: {
  entries: HistoryEntry[]
  onBack: () => void
  onClose: () => void
  onClear: () => void
  onCopy: (text: string) => void
  onInsert: (text: string) => void
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  function handleCopy(entry: HistoryEntry): void {
    onCopy(entry.output)
    setCopiedId(entry.id)
    setTimeout(() => setCopiedId((prev) => (prev === entry.id ? null : prev)), 1500)
  }

  return (
    <div className="top-sheet min-h-screen text-white">
      <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-5 py-5">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#ffb37c]">History</div>
            <h1 className="mt-1 text-[20px] font-semibold tracking-tight">Recent generations</h1>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                onClick={onClear}
                className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-1.5 text-[13px] font-semibold text-white"
              >
                Clear
              </button>
            )}
            <button onClick={onBack} className="overlay-icon-button" title="Back">
              ←
            </button>
            <button onClick={onClose} className="overlay-icon-button wide text-[12px]" title="Close">
              esc
            </button>
          </div>
        </header>

        {entries.length === 0 ? (
          <div className="rounded-[18px] border border-white/10 bg-black/14 px-5 py-8 text-center text-[13px] text-white/55">
            No generations yet. Anything you generate or paste will show up here.
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto pb-4">
            {entries.map((entry) => (
              <section
                key={entry.id}
                className="rounded-[18px] border border-white/10 bg-black/14 px-4 py-3 backdrop-blur-md"
              >
                <div className="mb-2 flex items-center justify-between gap-3 text-[11px] text-white/40">
                  <span className="truncate">
                    {[entry.activeApp, kindLabel(entry)].filter(Boolean).join(' · ')}
                  </span>
                  <span className="shrink-0">{formatTime(entry.timestamp)}</span>
                </div>
                <div className="max-h-[150px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-6 text-white/88">
                  {entry.output}
                </div>
                {entry.sources.length > 0 && (
                  <div className="mt-2 text-[11px] text-white/36">
                    Sources: {entry.sources.map((source) => source.source).join(', ')}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => onInsert(entry.output)} className="primary-button">
                    Insert
                  </button>
                  <button
                    onClick={() => handleCopy(entry)}
                    className="rounded-[14px] border border-white/12 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white"
                  >
                    {copiedId === entry.id ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
