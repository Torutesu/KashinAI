import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { LlmProvider } from '@shared/types'

type ScreenCaptureStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

const PROVIDER_HINTS: Record<LlmProvider, { label: string; placeholder: string }> = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  openai: { label: 'OpenAI', placeholder: 'sk-...' },
  gemini: { label: 'Gemini', placeholder: 'AIza...' }
}

/**
 * First-run setup guide. Walks the user through the two macOS permissions and an LLM API key so
 * the Option-tap flow actually works on first use. Reusable as a "Run setup guide" screen later.
 */
export default function OnboardingView({
  appDisplayName,
  accessibilityGranted,
  screenCaptureStatus,
  onRequestAccessibility,
  onRequestScreenCapture,
  onFinish,
  onSkip
}: {
  appDisplayName: string
  accessibilityGranted: boolean | null
  screenCaptureStatus: ScreenCaptureStatus
  onRequestAccessibility: () => void
  onRequestScreenCapture: () => void
  onFinish: () => void
  onSkip: () => void
}) {
  const [provider, setProvider] = useState<LlmProvider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setProvider(settings.llm.provider)
      setHasApiKey(settings.llm.hasApiKey)
    })
  }, [])

  const accessibilityDone = accessibilityGranted === true
  const screenDone = screenCaptureStatus === 'granted'
  const apiKeyDone = hasApiKey

  async function handleSaveApiKey(): Promise<void> {
    if (!apiKey.trim()) return
    setSaveState('saving')
    const updated = await window.api.setSettings({
      llm: { provider, apiKey: apiKey.trim() }
    })
    setHasApiKey(updated.llm.hasApiKey)
    setApiKey('')
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  const hint = PROVIDER_HINTS[provider]

  return (
    <div className="top-sheet min-h-screen text-white">
      <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6 py-7">
        <header className="mb-6">
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#ffb37c]">Welcome</div>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight">Set up {appDisplayName}</h1>
          <p className="mt-2 text-[13px] leading-6 text-white/62">
            Two macOS permissions and an LLM API key let a single Option tap read your current screen and paste a
            ready-to-use suggestion. You can change any of this later in Settings.
          </p>
        </header>

        <div className="flex-1 space-y-4">
          <Step index={1} title="Accessibility permission" done={accessibilityDone}>
            <p className="text-[13px] leading-6 text-white/55">
              Required to read the focused text/app, and to paste generated output back into the active field.
            </p>
            <div className="mt-3 flex items-center gap-2">
              {accessibilityDone ? (
                <StatusPill tone="good">Granted</StatusPill>
              ) : (
                <>
                  <button onClick={onRequestAccessibility} className="primary-button">
                    {accessibilityGranted === null ? 'Checking…' : 'Enable'}
                  </button>
                  <button onClick={() => void window.api.openAccessibilitySettings()} className="rounded-[14px] border border-white/12 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white">
                    Open macOS Settings
                  </button>
                </>
              )}
            </div>
          </Step>

          <Step index={2} title="Screen Recording permission" done={screenDone}>
            <p className="text-[13px] leading-6 text-white/55">
              Used to read visible page/app content by screenshot + OCR when text is not otherwise available. Optional
              but recommended for reliable context.
            </p>
            <div className="mt-3 flex items-center gap-2">
              {screenDone ? (
                <StatusPill tone="good">Granted</StatusPill>
              ) : (
                <>
                  <button onClick={onRequestScreenCapture} className="primary-button">
                    Enable
                  </button>
                  <button onClick={() => void window.api.openScreenCaptureSettings()} className="rounded-[14px] border border-white/12 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white">
                    Open Screen Recording Settings
                  </button>
                </>
              )}
            </div>
          </Step>

          <Step index={3} title="LLM API key" done={apiKeyDone}>
            <p className="text-[13px] leading-6 text-white/55">
              Generation runs through your own API key. It is stored locally (encrypted via the OS keychain where
              available) and never committed to source control.
            </p>
            <div className="mt-3 grid gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-white/46">Provider</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as LlmProvider)}
                  className="input"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] text-white/46">
                  {hint.label} API key {apiKeyDone && <span className="text-green-300">(a key is already saved)</span>}
                </span>
                <input
                  type="password"
                  value={apiKey}
                  placeholder={hint.placeholder}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="input"
                />
              </label>
              <div>
                <button
                  onClick={() => void handleSaveApiKey()}
                  disabled={!apiKey.trim() || saveState === 'saving'}
                  className="primary-button"
                >
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save API key'}
                </button>
              </div>
            </div>
          </Step>
        </div>

        <footer className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          <button onClick={onSkip} className="text-[13px] font-medium text-white/50 hover:text-white/80">
            Skip for now
          </button>
          <button onClick={onFinish} className="primary-button min-w-32">
            {accessibilityDone && apiKeyDone ? 'Start using it' : 'Finish setup'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function Step({
  index,
  title,
  done,
  children
}: {
  index: number
  title: string
  done: boolean
  children: ReactNode
}) {
  return (
    <section className="rounded-[20px] border border-white/10 bg-black/14 px-5 py-4 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
            done ? 'bg-green-500/90 text-white' : 'bg-[rgba(255,147,71,0.18)] text-[#ffb37c]'
          }`}
        >
          {done ? '✓' : index}
        </span>
        <h2 className="text-[15px] font-semibold text-white/90">{title}</h2>
      </div>
      <div className="mt-3 pl-10">{children}</div>
    </section>
  )
}

function StatusPill({ tone, children }: { tone: 'good'; children: ReactNode }) {
  const cls = tone === 'good' ? 'border-green-400/30 bg-green-400/10 text-green-200' : ''
  return (
    <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${cls}`}>{children}</span>
  )
}
