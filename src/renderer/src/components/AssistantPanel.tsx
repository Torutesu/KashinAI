import type { ActionType, AppError, CurrentContext } from '@shared/types'

const ACTIONS: { type: ActionType; label: string }[] = [
  { type: 'reply', label: 'Reply' },
  { type: 'summarize', label: 'Summarize' },
  { type: 'next_actions', label: 'Next Actions' },
  { type: 'proposal', label: 'Proposal' },
  { type: 'translate', label: 'Translate' }
]

type Props = {
  appDisplayName: string
  context: CurrentContext | null
  customInstruction: string
  onCustomInstructionChange: (value: string) => void
  onSelectAction: (actionType: ActionType) => void
  onGenerateCustom: () => void
  loading: boolean
  error: AppError | null
  onOpenSettings: () => void
  accessibilityGranted: boolean | null
}

export default function AssistantPanel({
  appDisplayName,
  context,
  customInstruction,
  onCustomInstructionChange,
  onSelectAction,
  onGenerateCustom,
  loading,
  error,
  onOpenSettings,
  accessibilityGranted
}: Props) {
  const previewText = context?.selectedText || context?.clipboardText || ''

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-neutral-100">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold tracking-tight text-neutral-100">{appDisplayName}</h1>
          {context?.activeApp && (
            <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs text-neutral-300">
              {context.activeApp}
              {context.windowTitle ? ` · ${context.windowTitle}` : ''}
            </span>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-white/10 hover:text-neutral-100"
        >
          Settings
        </button>
      </header>

      {accessibilityGranted === false && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Accessibility permission is not granted. Selection capture and paste may not work. Grant it in System
          Settings → Privacy &amp; Security → Accessibility.
        </div>
      )}

      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-500">Selected Text</p>
        <div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-sm text-neutral-200">
          {previewText || <span className="text-neutral-500">Nothing captured. Select text and try again.</span>}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-500">What do you want to do?</p>
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((action) => (
            <button
              key={action.type}
              disabled={loading}
              onClick={() => onSelectAction(action.type)}
              className="rounded-md bg-white/10 px-3 py-2 text-sm font-medium text-neutral-100 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <textarea
          value={customInstruction}
          onChange={(e) => onCustomInstructionChange(e.target.value)}
          placeholder="Custom instruction…"
          rows={2}
          className="w-full resize-none rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-white/30 focus:outline-none"
        />
        <button
          disabled={loading || !customInstruction.trim()}
          onClick={onGenerateCustom}
          className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <p>{error.message}</p>
            {error.code === 'llm_missing_api_key' && (
              <button onClick={onOpenSettings} className="mt-1 font-semibold underline">
                Open Settings
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
