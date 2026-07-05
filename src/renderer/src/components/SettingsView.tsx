import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { GBrainMode, LlmProvider, PublicAppSettings } from '@shared/types'

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

export default function SettingsView() {
  const [form, setForm] = useState<FormState | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    window.api.getSettings().then((settings) => setForm(toFormState(settings)))
  }, [])

  if (!form) {
    return <div className="p-6 text-sm text-neutral-400">Loading…</div>
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]): void {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleSave(): Promise<void> {
    if (!form) return
    setSaveState('saving')
    const updated = await window.api.setSettings({
      appDisplayName: form.appDisplayName,
      shortcut: form.shortcut,
      gbrain: {
        mode: form.gbrainMode,
        endpoint: form.gbrainEndpoint,
        cliPath: form.gbrainCliPath,
        timeoutMs: form.gbrainTimeoutMs,
        ...(form.gbrainToken ? { token: form.gbrainToken } : {})
      },
      llm: {
        provider: form.llmProvider,
        defaultModel: form.llmDefaultModel,
        temperature: form.llmTemperature,
        ...(form.llmApiKey ? { apiKey: form.llmApiKey } : {})
      },
      defaults: { language: form.language, tone: form.tone, length: form.length },
      privacy: { showSources: form.showSources }
    })
    setForm(toFormState(updated))
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1500)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 p-6 text-neutral-100">
      <h1 className="text-lg font-semibold">Settings</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">General</h2>
        <Field label="App Display Name">
          <input
            value={form.appDisplayName}
            onChange={(e) => update('appDisplayName', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Shortcut">
          <input value={form.shortcut} onChange={(e) => update('shortcut', e.target.value)} className="input" />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">GBrain</h2>
        <Field label="Mode">
          <select
            value={form.gbrainMode}
            onChange={(e) => update('gbrainMode', e.target.value as GBrainMode)}
            className="input"
          >
            <option value="local">local (built-in markdown search)</option>
            <option value="cli">cli</option>
            <option value="http">http</option>
          </select>
        </Field>
        <Field label="CLI Path">
          <input
            value={form.gbrainCliPath}
            onChange={(e) => update('gbrainCliPath', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Endpoint">
          <input
            value={form.gbrainEndpoint}
            onChange={(e) => update('gbrainEndpoint', e.target.value)}
            className="input"
          />
        </Field>
        <Field label={`Token ${form.gbrainHasToken ? '(saved — leave blank to keep)' : ''}`}>
          <input
            type="password"
            value={form.gbrainToken}
            onChange={(e) => update('gbrainToken', e.target.value)}
            placeholder={form.gbrainHasToken ? '••••••••' : ''}
            className="input"
          />
        </Field>
        <Field label="Timeout (ms)">
          <input
            type="number"
            value={form.gbrainTimeoutMs}
            onChange={(e) => update('gbrainTimeoutMs', Number(e.target.value))}
            className="input"
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">LLM</h2>
        <Field label="Provider">
          <select
            value={form.llmProvider}
            onChange={(e) => update('llmProvider', e.target.value as LlmProvider)}
            className="input"
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Gemini</option>
          </select>
        </Field>
        <Field label={`API Key ${form.llmHasApiKey ? '(saved — leave blank to keep)' : ''}`}>
          <input
            type="password"
            value={form.llmApiKey}
            onChange={(e) => update('llmApiKey', e.target.value)}
            placeholder={form.llmHasApiKey ? '••••••••' : ''}
            className="input"
          />
        </Field>
        <Field label="Default Model">
          <input
            value={form.llmDefaultModel}
            onChange={(e) => update('llmDefaultModel', e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Temperature">
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={form.llmTemperature}
            onChange={(e) => update('llmTemperature', Number(e.target.value))}
            className="input"
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Defaults</h2>
        <Field label="Language">
          <select
            value={form.language}
            onChange={(e) => update('language', e.target.value as FormState['language'])}
            className="input"
          >
            <option value="ja">Japanese</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label="Tone">
          <select
            value={form.tone}
            onChange={(e) => update('tone', e.target.value as FormState['tone'])}
            className="input"
          >
            <option value="casual">Casual</option>
            <option value="professional">Professional</option>
            <option value="polite">Polite</option>
          </select>
        </Field>
        <Field label="Length">
          <select
            value={form.length}
            onChange={(e) => update('length', e.target.value as FormState['length'])}
            className="input"
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={form.showSources}
            onChange={(e) => update('showSources', e.target.checked)}
          />
          Show sources in results
        </label>
      </section>

      <button
        onClick={handleSave}
        disabled={saveState === 'saving'}
        className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
      >
        {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : 'Save'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-neutral-400">{label}</span>
      {children}
    </label>
  )
}
