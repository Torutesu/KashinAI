import { useState } from 'react'
import type { GenerateResult } from '@shared/types'

const SOURCE_BADGE_LABEL: Record<GenerateResult['contextSource'], string> = {
  'gbrain-cli': 'GBrain CLI',
  'gbrain-http': 'GBrain HTTP',
  'local-fallback': 'Local brain',
  none: 'No context'
}

type Props = {
  result: GenerateResult
  loading: boolean
  showSources: boolean
  onBack: () => void
  onClose: () => void
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
  onClose,
  onCopy,
  onInsert,
  onRegenerate,
  onShorter,
  onMorePolite,
  copyState
}: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false)

  return (
    <div className="top-sheet relative flex h-full w-full flex-col overflow-hidden text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,154,85,0.14),transparent_18%)]" />
      <div className="absolute inset-0 bg-black/18" />

      <div className="relative flex h-full flex-col px-2.5 pb-2.5 pt-2">
        <header className="drop-in flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onBack} className="overlay-icon-button wide text-[12px]">
              back
            </button>
            <button onClick={onCopy} className="overlay-icon-button" title="Copy output">
              ⎘
            </button>
            <button onClick={onInsert} className="overlay-icon-button" title="Insert output">
              ↵
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="overlay-icon-button wide text-[12px]" title="Close">
              esc
            </button>
            <span className="rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-[10px] tracking-[0.16em] text-white/72">
              {SOURCE_BADGE_LABEL[result.contextSource]}
            </span>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-between">
          <section className="drop-in mt-2.5 overflow-hidden rounded-[18px] border border-white/12 bg-[rgba(36,28,28,0.66)] shadow-[0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2">
              <div className="text-[12px] font-semibold text-white/48">Generated response</div>
              <div className="text-[11px] font-medium text-white/36">{copyState === 'copied' ? 'Copied' : 'Ready'}</div>
            </div>

            <div className="max-h-[228px] overflow-y-auto px-3.5 py-3">
              <p className="whitespace-pre-wrap text-[13px] leading-6 text-white/86">
                {loading ? 'Generating…' : result.output}
              </p>
            </div>

            {showSources && result.sources.length > 0 && (
              <div className="border-t border-white/8 px-3.5 py-2">
                <button
                  onClick={() => setSourcesOpen((value) => !value)}
                  className="flex w-full items-center justify-between text-left text-[12px] font-medium text-white/48"
                >
                  <span>Sources ({result.sources.length})</span>
                  <span>{sourcesOpen ? 'Hide' : 'Show'}</span>
                </button>
                {sourcesOpen && (
                  <div className="mt-2.5 space-y-2">
                    {result.sources.map((source) => (
                      <div
                        key={source.source}
                        className="flex items-center justify-between gap-4 rounded-[12px] border border-white/8 bg-white/[0.04] px-3 py-2 text-[12px] text-white/62"
                      >
                        <span className="truncate">{source.source}</span>
                        {typeof source.score === 'number' && <span className="shrink-0">{source.score.toFixed(2)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <div className="pb-1 pt-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <button onClick={onRegenerate} disabled={loading} className="action-card disabled:opacity-50">
                Regenerate
              </button>
              <button onClick={onShorter} disabled={loading} className="action-card disabled:opacity-50">
                Make shorter
              </button>
              <button onClick={onMorePolite} disabled={loading} className="action-card disabled:opacity-50">
                More polite
              </button>
              <button onClick={onCopy} disabled={loading} className="action-card disabled:opacity-50">
                {copyState === 'copied' ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
