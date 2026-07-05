import { useEffect, useMemo, useState } from 'react'
import type { ActionType, AppError, ChatMessage, ContextSource, CurrentContext } from '@shared/types'

const ACTIONS: { type: ActionType; label: string }[] = [
  { type: 'reply', label: 'Find loose ends' },
  { type: 'proposal', label: 'Draft an update' },
  { type: 'summarize', label: 'Catch me up' }
]

type Props = {
  appDisplayName: string
  context: CurrentContext | null
  customInstruction: string
  messages: ChatMessage[]
  lastContextSource: ContextSource | null
  lastSearchQuery: string
  onCustomInstructionChange: (value: string) => void
  onSelectAction: (actionType: ActionType) => void
  onGenerateCustom: () => void
  onRefreshContext: () => void
  loading: boolean
  error: AppError | null
  onOpenSettings: () => void
  onClose: () => void
  onRequestAccessibility: () => void
  onRequestScreenCapture: () => void
  accessibilityGranted: boolean | null
  screenCaptureStatus: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
}

type ContextItem = {
  title: string
  time: string
  tone?: 'alert' | 'normal'
  instruction: string
}

function compact(value: string, max = 76): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized
}

function buildContextItems(context: CurrentContext | null): ContextItem[] {
  if (!context) {
    return [
      {
        title: 'No context captured yet. Refresh after focusing another app.',
        time: 'now',
        tone: 'alert',
        instruction: ''
      }
    ]
  }

  const items: ContextItem[] = []

  if (context.selectedText) {
    items.push({
      title: `Selection: ${compact(context.selectedText)}`,
      time: 'now',
      instruction: context.selectedText
    })
  }

  if (context.activeApp || context.windowTitle) {
    const location = [context.activeApp, context.windowTitle].filter(Boolean).join(' / ')
    items.push({
      title: `Working context: ${compact(location || 'Unknown app')}`,
      time: 'now',
      instruction: `Use the current ${location || 'macOS'} context.`
    })
  }

  if (context.pageTitle || context.pageUrl || context.pageText) {
    const pageLabel = [context.pageTitle, context.pageUrl].filter(Boolean).join(' / ')
    items.push({
      title: `Open page (${context.pageCaptureMethod}): ${compact(pageLabel || context.pageText || 'Captured page')}`,
      time: 'now',
      instruction: [context.pageTitle, context.pageUrl, context.pageText].filter(Boolean).join('\n\n')
    })
  }

  if (context.screenshotPath || context.screenText) {
    items.push({
      title: `Screen (${context.screenCaptureMethod}): ${compact(context.screenText || context.screenshotPath || 'Screenshot captured')}`,
      time: 'now',
      instruction: [context.screenText, context.screenshotPath ? `Screenshot: ${context.screenshotPath}` : null]
        .filter(Boolean)
        .join('\n\n')
    })
  }

  if (!context.selectedText && context.clipboardText) {
    items.push({
      title: `Clipboard fallback: ${compact(context.clipboardText)}`,
      time: 'now',
      instruction: context.clipboardText
    })
  }

  if (items.length === 0) {
    items.push({
      title: 'Context is empty. Select text in another app, then refresh.',
      time: 'now',
      tone: 'alert',
      instruction: ''
    })
  }

  return items
}

export default function AssistantPanel({
  appDisplayName,
  context,
  customInstruction,
  messages,
  lastContextSource,
  lastSearchQuery,
  onCustomInstructionChange,
  onSelectAction,
  onGenerateCustom,
  onRefreshContext,
  loading,
  error,
  onOpenSettings,
  onClose,
  onRequestAccessibility,
  onRequestScreenCapture,
  accessibilityGranted,
  screenCaptureStatus
}: Props) {
  const items = useMemo(() => buildContextItems(context), [context])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [readItems, setReadItems] = useState<number[]>([])
  const [panelMode, setPanelMode] = useState<'inbox' | 'focus'>('inbox')
  const hasCustomInstruction = customInstruction.trim().length > 0
  const unreadCount = Math.max(items.length - readItems.length, 0)

  useEffect(() => {
    setSelectedIndex(0)
  }, [items.length, context?.selectedText, context?.activeApp])

  function handleSelectItem(index: number): void {
    setSelectedIndex(index)
    setReadItems((prev) => (prev.includes(index) ? prev : [...prev, index]))
    onCustomInstructionChange(items[index]?.instruction ?? '')
  }

  function handleMarkRead(): void {
    setReadItems(items.map((_, index) => index))
  }

  function handleResetComposer(): void {
    setSelectedIndex(0)
    onCustomInstructionChange('')
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && hasCustomInstruction && !loading) {
      event.preventDefault()
      onGenerateCustom()
    }
  }

  return (
    <div className="top-sheet relative flex h-full w-full flex-col overflow-hidden text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,154,85,0.14),transparent_18%)]" />
      <div className="absolute inset-0 bg-black/18" />

      <div className="relative flex h-full flex-col px-2.5 pb-2.5 pt-2">
        <header className="drop-in flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPanelMode('focus')}
              className="overlay-icon-button text-transparent"
              aria-label="Focus mode"
              title="Focus mode"
            >
              ○
            </button>
            <button onClick={onOpenSettings} className="overlay-icon-button" aria-label="Settings">
              ⚙
            </button>
            <button
              onClick={onRefreshContext}
              className="overlay-icon-button"
              aria-label="Refresh context"
              title="Refresh context"
            >
              ⤴
            </button>
            <button
              onClick={() => setPanelMode((prev) => (prev === 'inbox' ? 'focus' : 'inbox'))}
              className="overlay-icon-button"
              aria-label="Toggle layout"
              title="Toggle layout"
            >
              ⌁
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPanelMode('inbox')}
              className="overlay-icon-button relative"
              aria-label="Inbox"
              title="Inbox"
            >
              ⌂
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                {unreadCount}
              </span>
            </button>
            <button onClick={handleResetComposer} className="overlay-icon-button" aria-label="New" title="New composer">
              ＋
            </button>
            <button onClick={onClose} className="overlay-icon-button wide" aria-label="Escape" title="Close">
              esc
            </button>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-between">
          <section className="drop-in mt-2.5 overflow-hidden rounded-[18px] border border-white/12 bg-[rgba(36,28,28,0.66)] shadow-[0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2">
              <div className="text-[12px] font-semibold text-white/48">Chat with fused context</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/34">
                {lastContextSource ? `${lastContextSource}` : 'GBrain ready'}
              </div>
            </div>
            <div className="max-h-[136px] overflow-y-auto px-3.5 py-3">
              {messages.length === 0 ? (
                <p className="text-[13px] leading-6 text-white/50">
                  Ask about the current page. KashinAI will combine the open page context with GBrain memory.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {messages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`rounded-[14px] px-3 py-2 text-[13px] leading-5 ${
                        message.role === 'user' ? 'bg-white/[0.08] text-white/82' : 'bg-orange-400/10 text-white/88'
                      }`}
                    >
                      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/34">
                        {message.role === 'user' ? 'You' : 'KashinAI'}
                      </div>
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {lastSearchQuery && (
              <div className="border-t border-white/8 px-3.5 py-2 text-[11px] text-white/36">
                GBrain query: {lastSearchQuery}
              </div>
            )}
          </section>

          <section className="drop-in mt-2.5 overflow-hidden rounded-[18px] border border-white/12 bg-[rgba(36,28,28,0.66)] shadow-[0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-white/8 px-3.5 py-2">
              <div className="text-[12px] font-semibold text-white/48">⌕&nbsp;&nbsp;Live context</div>
              <button onClick={handleMarkRead} className="text-[12px] font-medium text-white/44 transition hover:text-white/70">
                Mark read
              </button>
            </div>

            <div className={`overflow-y-auto py-1 ${panelMode === 'focus' ? 'max-h-[150px]' : 'max-h-[220px]'}`}>
              {items.map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  onClick={() => handleSelectItem(index)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/[0.04] ${
                    index === selectedIndex ? 'bg-white/[0.08]' : ''
                  }`}
                >
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      readItems.includes(index) ? 'bg-white/18' : item.tone === 'alert' ? 'bg-orange-500' : 'bg-white/28'
                    }`}
                  />
                  <span className="flex-1 truncate text-[13px] font-semibold text-white/88">{item.title}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-white/36">{item.time}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="pb-1 pt-3">
            {error && (
              <div className="mb-2.5 rounded-[16px] border border-rose-300/20 bg-rose-300/10 px-3.5 py-2.5 text-[12px] text-rose-50/90">
                {error.message}
              </div>
            )}

            {accessibilityGranted === false && (
              <div className="mb-2.5 rounded-[16px] border border-amber-300/20 bg-amber-300/10 px-3.5 py-2.5 text-[12px] text-amber-50/90">
                <div className="flex items-center justify-between gap-3">
                  <span>Accessibility permission is off, so capture and paste may be partial.</span>
                  <button onClick={onRequestAccessibility} className="shrink-0 font-semibold text-amber-50 underline">
                    Enable
                  </button>
                </div>
              </div>
            )}

            {screenCaptureStatus !== 'granted' && (
              <div className="mb-2.5 rounded-[16px] border border-amber-300/20 bg-amber-300/10 px-3.5 py-2.5 text-[12px] text-amber-50/90">
                <div className="flex items-center justify-between gap-3">
                  <span>Screen Recording is {screenCaptureStatus}; page body capture may be limited.</span>
                  <button onClick={onRequestScreenCapture} className="shrink-0 font-semibold text-amber-50 underline">
                    Enable
                  </button>
                </div>
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {ACTIONS.map((action) => (
                <button
                  key={action.type}
                  disabled={loading}
                  onClick={() => onSelectAction(action.type)}
                  className="action-card disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-[12px] font-medium text-white/82">{action.label}</span>
                </button>
              ))}
            </div>

            <div className="composer-shell rounded-[18px] p-1.5">
              <div className="flex items-center gap-1.5">
                <textarea
                  value={customInstruction}
                  onChange={(e) => onCustomInstructionChange(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={`Message ${appDisplayName}...`}
                  rows={1}
                  className="min-h-9 flex-1 resize-none bg-transparent px-3.5 py-2 text-[13px] leading-5 text-white placeholder:text-white/30 focus:outline-none"
                />
                <button
                  disabled={loading || !hasCustomInstruction}
                  onClick={onGenerateCustom}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-sm text-white transition hover:bg-white/16 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send custom instruction"
                >
                  ↑
                </button>
              </div>
              <div className="flex items-center justify-between px-2.5 pb-0.5 pt-1 text-[10px] text-white/28">
                <span>{context?.activeApp ? `Using live context from ${context.activeApp}` : 'No active app context yet'}</span>
                <span>Send with Cmd/Ctrl + Enter</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
