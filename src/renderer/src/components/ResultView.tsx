import { useState } from 'react'
import type { GenerateResult } from '@shared/types'

const SOURCE_BADGE_LABEL: Record<GenerateResult['contextSource'], string> = {
  'gbrain-cli': 'GBrain',
  'gbrain-http': 'GBrain',
  'local-fallback': 'Local brain',
  none: 'No company context'
}

type Props = {
  result: GenerateResult
  loading: boolean
  showSources: boolean
  onBack: () => void
  onCopy: () => void
  onInsert: () => void
  onRegenerate: () => void
  onShorter: () => void
  onMorePolite: () => void
  copyState: 'idle' | 'copied'
}

export default function ResultView({
  result,
  loading,
  showSources,
  onBack,
  onCopy,
  onInsert,
  onRegenerate,
  onShorter,
  onMorePolite,
  copyState
}: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false)

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-neutral-100">
      <header className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-neutral-400 hover:text-neutral-100">
          ← Back
        </button>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-neutral-300">
          {SOURCE_BADGE_LABEL[result.contextSource]}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-100 selection:bg-indigo-500/40">
          {loading ? 'Generating…' : result.output}
        </p>
      </div>

      {showSources && result.sources.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-black/10">
          <button
            onClick={() => setSourcesOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-neutral-400"
          >
            <span>Sources ({result.sources.length})</span>
            <span>{sourcesOpen ? '−' : '+'}</span>
          </button>
          {sourcesOpen && (
            <ul className="space-y-1 px-3 pb-2 text-xs text-neutral-400">
              {result.sources.map((source) => (
                <li key={source.source} className="flex justify-between gap-2">
                  <span className="truncate">{source.source}</span>
                  {typeof source.score === 'number' && (
                    <span className="shrink-0 text-neutral-500">{source.score.toFixed(1)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onCopy}
          disabled={loading}
          className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
        >
          {copyState === 'copied' ? 'Copied ✓' : 'Copy'}
        </button>
        <button
          onClick={onInsert}
          disabled={loading}
          className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
        >
          Insert
        </button>
        <button
          onClick={onRegenerate}
          disabled={loading}
          className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
        >
          Regenerate
        </button>
        <button
          onClick={onShorter}
          disabled={loading}
          className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
        >
          Shorter
        </button>
        <button
          onClick={onMorePolite}
          disabled={loading}
          className="col-span-2 rounded-md bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20 disabled:opacity-50"
        >
          More polite
        </button>
      </div>
    </div>
  )
}
