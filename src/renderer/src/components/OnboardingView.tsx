import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CurrentContext, LlmProvider } from '@shared/types'

type ScreenCaptureStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'

const PROVIDER_HINTS: Record<LlmProvider, { label: string; placeholder: string }> = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  openai: { label: 'OpenAI', placeholder: 'sk-...' },
  gemini: { label: 'Gemini', placeholder: 'AIza...' }
}

/** A realistic message so the very first draft feels like real work, not a toy prompt. */
const SAMPLE_MESSAGE =
  'Hi — could you send over the updated Q3 pricing when you get a chance? ' +
  "We'd love to lock in the 12-seat plan before the end of the month. Thanks!"

const SAMPLE_INSTRUCTION = 'Write a short, warm reply to this message. Keep it under three sentences.'

/** A synthetic context that mirrors "text selected in an email", so the first draft exercises the
 * real generate path (capture → memory → LLM) without depending on what happens to be on screen. */
function buildSampleContext(): CurrentContext {
  return {
    activeApp: 'Mail',
    windowTitle: 'Q3 pricing',
    contextKind: 'document',
    primaryContentSource: 'selected-text',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: SAMPLE_MESSAGE,
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: SAMPLE_MESSAGE,
    selectedTextSource: 'top-level-selected-text',
    clipboardText: null,
    timestamp: new Date().toISOString()
  }
}

/**
 * First-run setup guide. Walks the user through the two macOS permissions and an LLM API key, then
 * lands them on a guided first draft — a real generation on their own key — so the payoff is felt
 * before they ever leave the window. Reusable as a "Run setup guide" screen later.
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
  const [shortcut, setShortcut] = useState('Option+Space')
  const [demoState, setDemoState] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [demoOutput, setDemoOutput] = useState('')
  const [demoError, setDemoError] = useState('')
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle')

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      setProvider(settings.llm.provider)
      setHasApiKey(settings.llm.hasApiKey)
      setShortcut(settings.shortcut)
    })
  }, [])

  const accessibilityDone = accessibilityGranted === true
  const screenDone = screenCaptureStatus === 'granted'
  const apiKeyDone = hasApiKey
  const demoDone = demoState === 'done'

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

  async function handleRunDemo(): Promise<void> {
    setDemoState('running')
    setDemoError('')
    setDemoOutput('')
    const res = await window.api.chat({
      currentContext: buildSampleContext(),
      messages: [{ role: 'user', content: SAMPLE_INSTRUCTION }],
      // Answer straight from the sample so the very first draft never waits on a memory lookup.
      skipMemory: true
    })
    if (res.ok && res.data.message.content.trim()) {
      setDemoOutput(res.data.message.content.trim())
      setDemoState('done')
      void window.api.captureTelemetry('first_generation')
      void window.api.captureTelemetry('onboarding_step_completed', { step: 'first_draft' })
    } else {
      setDemoError(
        res.ok
          ? 'The draft came back empty. Check your API key and model in Settings, then try again.'
          : res.error.message
      )
      setDemoState('error')
    }
  }

  async function handleCopyDemo(): Promise<void> {
    if (!demoOutput) return
    await window.api.copyOutput(demoOutput)
    setCopyState('copied')
    setTimeout(() => setCopyState('idle'), 1500)
  }

  const hint = PROVIDER_HINTS[provider]
  const prettyShortcut = shortcut.replace(/Option/gi, '⌥').replace(/\+/g, ' ')

  return (
    <div className="top-sheet min-h-screen text-white">
      <div className="mx-auto flex min-h-screen max-w-[560px] flex-col px-6 py-7">
        <header className="mb-6">
          <div className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#ffb37c]">Welcome</div>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight">Set up {appDisplayName}</h1>
          <p className="mt-2 text-[13px] leading-6 text-white/62">
            Two macOS permissions and your own API key let a single shortcut read what's on screen and draft a
            ready-to-paste reply. It runs on your key — we never see your key or your screen. Change any of this later
            in Settings.
          </p>
        </header>

        <div className="flex-1 space-y-4">
          <Step index={1} title="Accessibility permission" done={accessibilityDone}>
            <p className="text-[13px] leading-6 text-white/55">
              Lets KashinAI read the focused text and paste its reply back into the field you're typing in.
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
              Optional but recommended. Lets KashinAI read a page by screenshot when the text isn't otherwise
              available — handy in browsers and apps that hide their content.
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

          <Step index={3} title="Your API key" done={apiKeyDone}>
            <p className="text-[13px] leading-6 text-white/55">
              Every draft runs on your own key. It's stored locally (encrypted via the macOS keychain where
              available) and never leaves your Mac through us.
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

          <Step index={4} title="See it write your first reply" done={demoDone}>
            <p className="text-[13px] leading-6 text-white/55">
              Here's a message that just landed in your inbox. Let KashinAI draft the reply — on your key, right now.
            </p>

            <div className="mt-3 rounded-[14px] border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/34">Incoming message</div>
              <p className="mt-1.5 text-[13px] leading-6 text-white/80">{SAMPLE_MESSAGE}</p>
            </div>

            {!apiKeyDone ? (
              <p className="mt-3 text-[12px] text-white/40">Add your API key above first, then come back to try it.</p>
            ) : demoState !== 'done' ? (
              <div className="mt-3">
                <button
                  onClick={() => void handleRunDemo()}
                  disabled={demoState === 'running'}
                  className="primary-button"
                >
                  {demoState === 'running' ? 'Drafting…' : 'Draft a reply'}
                </button>
                {demoState === 'error' && (
                  <p className="mt-2 text-[12px] leading-5 text-rose-200/90">{demoError}</p>
                )}
              </div>
            ) : null}

            {demoOutput && (
              <div className="mt-3 rounded-[14px] border border-[rgba(255,147,71,0.28)] bg-[rgba(255,147,71,0.10)] px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#ffb37c]">Your draft</div>
                  <button
                    onClick={() => void handleCopyDemo()}
                    className="rounded-[10px] border border-white/12 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    {copyState === 'copied' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-white/90">{demoOutput}</p>
              </div>
            )}

            {demoDone && (
              <p className="mt-3 text-[13px] leading-6 text-white/62">
                That's it — that draft came from your own key. Now do it for real: switch to any app, then press{' '}
                <span className="rounded-[7px] border border-white/15 bg-white/10 px-2 py-0.5 text-[12px] font-semibold text-white">
                  {prettyShortcut}
                </span>{' '}
                to draft from whatever's on your screen.
              </p>
            )}
          </Step>
        </div>

        <footer className="mt-6 flex items-center justify-between gap-3 border-t border-white/10 pt-5">
          <button onClick={onSkip} className="text-[13px] font-medium text-white/50 hover:text-white/80">
            Skip for now
          </button>
          <button onClick={onFinish} className="primary-button min-w-32">
            {demoDone ? 'Start using it →' : accessibilityDone && apiKeyDone ? 'Start using it' : 'Finish setup'}
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
