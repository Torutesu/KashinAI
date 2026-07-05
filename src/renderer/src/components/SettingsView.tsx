import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { BackendDiagnostics, GBrainMode, LlmProvider, PublicAppSettings } from '@shared/types'

type FormState = {
  appDisplayName: string
  shortcut: string
  gbrainMode: GBrainMode
  gbrainEndpoint: string
  gbrainCliPath: string
  gbrainTimeoutMs: number
  gbrainToken: string
  gbrainHasToken: boolean
  llmProvider: LlmProvider
  llmDefaultModel: string
  llmTemperature: number
  llmApiKey: string
  llmHasApiKey: boolean
  language: 'ja' | 'en'
  tone: 'casual' | 'professional' | 'polite'
  length: 'short' | 'medium' | 'long'
  showSources: boolean
}

type NavKey = 'account' | 'privacy' | 'appearance' | 'identity' | 'memory' | 'shortcuts'

const NAV_ITEMS: { key: NavKey; label: string; icon: string }[] = [
  { key: 'account', label: 'Account', icon: '◌' },
  { key: 'privacy', label: 'Privacy', icon: '⌔' },
  { key: 'appearance', label: 'Appearance', icon: '⚙' },
  { key: 'identity', label: 'Identity', icon: '▣' },
  { key: 'memory', label: 'Memory', icon: '⎘' },
  { key: 'shortcuts', label: 'Shortcuts', icon: '⌘' }
]

function toFormState(settings: PublicAppSettings): FormState {
  return {
    appDisplayName: settings.appDisplayName,
    shortcut: settings.shortcut,
    gbrainMode: settings.gbrain.mode,
    gbrainEndpoint: settings.gbrain.endpoint,
    gbrainCliPath: settings.gbrain.cliPath,
    gbrainTimeoutMs: settings.gbrain.timeoutMs,
    gbrainToken: '',
    gbrainHasToken: settings.gbrain.hasToken,
    llmProvider: settings.llm.provider,
    llmDefaultModel: settings.llm.defaultModel,
    llmTemperature: settings.llm.temperature,
    llmApiKey: '',
    llmHasApiKey: settings.llm.hasApiKey,
    language: settings.defaults.language,
    tone: settings.defaults.tone,
    length: settings.defaults.length,
    showSources: settings.privacy.showSources
  }
}

export default function SettingsView({
  accessibilityGranted,
  screenCaptureStatus,
  onRequestAccessibility,
  onRequestScreenCapture,
  onBack,
  onClose
}: {
  accessibilityGranted: boolean | null
  screenCaptureStatus: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
  onRequestAccessibility: () => void
  onRequestScreenCapture: () => void
  onBack: () => void
  onClose: () => void
}) {
  const [form, setForm] = useState<FormState | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [diagnostics, setDiagnostics] = useState<BackendDiagnostics | null>(null)
  const [diagnosticsState, setDiagnosticsState] = useState<'idle' | 'running' | 'failed'>('idle')
  const [activeNav] = useState<NavKey>('privacy')

  useEffect(() => {
    window.api.getSettings().then((settings) => setForm(toFormState(settings)))
  }, [])

  if (!form) {
    return <div className="min-h-screen bg-transparent p-8 text-sm text-white/70">Loading settings…</div>
  }

  const current = form

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave(): Promise<void> {
    setSaveState('saving')
    const updated = await window.api.setSettings({
      appDisplayName: current.appDisplayName,
      shortcut: current.shortcut,
      gbrain: {
        mode: current.gbrainMode,
        endpoint: current.gbrainEndpoint,
        cliPath: current.gbrainCliPath,
        timeoutMs: current.gbrainTimeoutMs,
        ...(current.gbrainToken ? { token: current.gbrainToken } : {})
      },
      llm: {
        provider: current.llmProvider,
        defaultModel: current.llmDefaultModel,
        temperature: current.llmTemperature,
        ...(current.llmApiKey ? { apiKey: current.llmApiKey } : {})
      },
      defaults: { language: current.language, tone: current.tone, length: current.length },
      privacy: { showSources: current.showSources }
    })
    setForm(toFormState(updated))
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  async function handleRunDiagnostics(): Promise<void> {
    setDiagnosticsState('running')
    const result = await window.api.runDiagnostics()
    if (result.ok) {
      setDiagnostics(result.data)
      setDiagnosticsState('idle')
    } else {
      setDiagnostics(null)
      setDiagnosticsState('failed')
    }
  }

  return (
    <div className="top-sheet min-h-screen text-white">
      <div className="mx-auto flex min-h-screen max-w-[560px]">
        <aside className="w-[210px] border-r border-white/10 px-5 py-5">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-[20px] font-semibold tracking-tight">Settings</h1>
            <div className="flex items-center gap-2">
              <button onClick={onBack} className="overlay-icon-button" title="Back">
                ←
              </button>
              <button onClick={onClose} className="overlay-icon-button wide text-[12px]" title="Close">
                esc
              </button>
            </div>
          </div>

          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.key}
                className={`flex items-center gap-3 rounded-[14px] px-4 py-3 text-[14px] font-medium transition ${
                  item.key === activeNav
                    ? 'bg-[rgba(255,147,71,0.18)] text-[#ffb37c]'
                    : 'text-white/62'
                }`}
              >
                <span className="w-5 text-center text-[15px]">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex-1 px-5 py-5">
          <div className="space-y-4">
            <SettingsCard
              title="PERMISSIONS"
              subtitle="KashinAI needs macOS Accessibility access to capture selected text and paste generated output."
            >
              <PermissionRow
                name="Accessibility"
                description="Required for global selection capture, app/window detection, and automatic insert."
                status={
                  accessibilityGranted === null ? 'Checking' : accessibilityGranted ? 'Granted' : 'Required'
                }
                tone={accessibilityGranted ? 'good' : 'warning'}
                action={
                  accessibilityGranted
                    ? undefined
                    : {
                        label: 'Enable',
                        onClick: onRequestAccessibility
                      }
                }
              />
              <PermissionRow
                name="Screen Recording"
                description="Needed to reliably read visible page/app content when browser automation cannot expose text."
                status={screenCaptureStatus === 'granted' ? 'Granted' : screenCaptureStatus}
                tone={screenCaptureStatus === 'granted' ? 'good' : 'warning'}
                action={
                  screenCaptureStatus === 'granted'
                    ? undefined
                    : {
                        label: 'Enable',
                        onClick: onRequestScreenCapture
                      }
                }
              />
              {!accessibilityGranted && (
                <button
                  onClick={() => void window.api.openAccessibilitySettings()}
                  className="rounded-[14px] border border-white/12 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white"
                >
                  Open macOS Settings
                </button>
              )}
              {screenCaptureStatus !== 'granted' && (
                <button
                  onClick={() => void window.api.openScreenCaptureSettings()}
                  className="rounded-[14px] border border-white/12 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white"
                >
                  Open Screen Recording Settings
                </button>
              )}
            </SettingsCard>

            <SettingsCard title="Backend diagnostics" subtitle="Checks live capture and GBrain retrieval on this Mac.">
              <button onClick={handleRunDiagnostics} className="primary-button">
                {diagnosticsState === 'running' ? 'Running...' : 'Run diagnostics'}
              </button>
              {diagnosticsState === 'failed' && (
                <div className="rounded-[14px] border border-red-400/20 bg-red-400/10 px-4 py-3 text-[12px] text-red-100">
                  Diagnostics failed.
                </div>
              )}
              {diagnostics && (
                <div className="space-y-2 rounded-[14px] border border-white/10 bg-white/[0.04] px-4 py-3 text-[12px] leading-5 text-white/68">
                  <div>Accessibility: {diagnostics.accessibilityGranted ? 'granted' : 'missing'}</div>
                  <div>Screen Recording: {diagnostics.screenCaptureStatus}</div>
                  <div>Fusion ready: {diagnostics.canFuseContext ? 'yes' : 'no'}</div>
                  <div>
                    GBrain: {diagnostics.gbrain.ok ? 'ok' : 'not ready'} / {diagnostics.gbrain.contextSource} /{' '}
                    {diagnostics.gbrain.resultCount} results
                  </div>
                  <div>
                    Inputs: GBrain {diagnostics.fusionInputs.hasGBrainContext ? 'yes' : 'no'}, page{' '}
                    {diagnostics.fusionInputs.hasPageContext ? 'yes' : 'no'}, selection{' '}
                    {diagnostics.fusionInputs.hasSelectedText ? 'yes' : 'no'}, screen{' '}
                    {diagnostics.fusionInputs.hasScreenContext ? 'yes' : 'no'}, clipboard{' '}
                    {diagnostics.fusionInputs.hasClipboardFallback ? 'yes' : 'no'}
                  </div>
                  <div>Sources: {diagnostics.gbrain.sampleSources.join(', ') || 'none'}</div>
                  <div>
                    Captured app: {diagnostics.currentContext.activeApp ?? 'unknown'} /{' '}
                    {diagnostics.currentContext.windowTitle ?? 'no window title'}
                  </div>
                  <div>Page URL: {diagnostics.currentContext.pageUrl ?? 'not captured'}</div>
                  <div>Page capture: {diagnostics.currentContext.pageCaptureMethod}</div>
                  <div>
                    Page text: {diagnostics.currentContext.pageText ? `${diagnostics.currentContext.pageText.length} chars` : 'not captured'}
                  </div>
                  <div>Screen capture: {diagnostics.currentContext.screenCaptureMethod}</div>
                  <div>Screenshot: {diagnostics.currentContext.screenshotPath ?? 'not captured'}</div>
                  <div>
                    Screen OCR:{' '}
                    {diagnostics.currentContext.screenText ? `${diagnostics.currentContext.screenText.length} chars` : 'not captured'}
                  </div>
                </div>
              )}
            </SettingsCard>

            <SettingsCard title="Assistant setup" subtitle="Core behavior for retrieval and generation.">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Display name">
                  <input value={form.appDisplayName} onChange={(e) => update('appDisplayName', e.target.value)} className="input" />
                </Field>
                <Field label="Shortcut">
                  <input value={form.shortcut} onChange={(e) => update('shortcut', e.target.value)} className="input" />
                </Field>
                <Field label="GBrain mode">
                  <select value={form.gbrainMode} onChange={(e) => update('gbrainMode', e.target.value as GBrainMode)} className="input">
                    <option value="local">Local</option>
                    <option value="cli">CLI</option>
                    <option value="http">HTTP</option>
                  </select>
                </Field>
                <Field label="CLI path">
                  <input value={form.gbrainCliPath} onChange={(e) => update('gbrainCliPath', e.target.value)} className="input" />
                </Field>
                <Field label="LLM provider">
                  <select value={form.llmProvider} onChange={(e) => update('llmProvider', e.target.value as LlmProvider)} className="input">
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                  </select>
                </Field>
                <Field label="Default model">
                  <input value={form.llmDefaultModel} onChange={(e) => update('llmDefaultModel', e.target.value)} className="input" />
                </Field>
              </div>
            </SettingsCard>

            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-white/44">Settings are stored locally and applied immediately.</div>
              <button onClick={handleSave} disabled={saveState === 'saving'} className="primary-button min-w-32">
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save changes'}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function SettingsCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-[20px] border border-white/10 bg-black/14 px-5 py-5 shadow-[0_12px_36px_rgba(0,0,0,0.12)] backdrop-blur-md">
      <h2 className={`text-[12px] font-bold uppercase tracking-[0.14em] ${title === 'Danger zone' ? 'text-red-300' : 'text-[#ffb37c]'}`}>
        {title}
      </h2>
      <p className="mt-3 max-w-3xl text-[13px] leading-6 text-white/62">{subtitle}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

function PermissionRow({
  name,
  description,
  status,
  tone,
  action
}: {
  name: string
  description: string
  status: string
  tone: 'good' | 'warning' | 'muted'
  action?: { label: string; onClick: () => void }
}) {
  const statusClass =
    tone === 'good' ? 'text-white/86' : tone === 'warning' ? 'text-amber-200' : 'text-white/38'
  const dotClass = tone === 'good' ? 'bg-green-500' : tone === 'warning' ? 'bg-amber-400' : 'bg-white/20'

  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 last:border-b-0">
      <div>
        <div className="text-[15px] font-semibold text-white/88">{name}</div>
        <div className="mt-1 max-w-2xl text-[13px] leading-6 text-white/50">{description}</div>
      </div>
      <div className={`flex shrink-0 items-center gap-3 text-[13px] font-semibold ${statusClass}`}>
        <span>
          <span className={`mr-2 inline-block h-3 w-3 rounded-full ${dotClass}`} />
          {status}
        </span>
        {action && (
          <button onClick={action.onClick} className="rounded-[12px] border border-white/12 bg-white/10 px-3 py-1.5 text-white">
            {action.label}
          </button>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm text-white/46">{label}</span>
      {children}
    </label>
  )
}
