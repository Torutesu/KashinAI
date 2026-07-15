import Store from 'electron-store'
import { safeStorage } from 'electron'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AppSettings, PublicAppSettings, SettingsUpdate } from '../shared/types'

type StoredSecret = {
  value: string
  encrypted: boolean
}

type StoredSettings = Omit<AppSettings, 'gbrain' | 'llm'> & {
  gbrain: Omit<AppSettings['gbrain'], 'token'> & { token: StoredSecret }
  llm: Omit<AppSettings['llm'], 'apiKey'> & { apiKey: StoredSecret }
}

function detectDefaultGbrainCliPath(): string {
  const candidates = [
    '/Users/torutano/.bun/bin/gbrain',
    `${process.env.HOME ?? ''}/.bun/bin/gbrain`,
    `${process.env.HOME ?? ''}/gbrain/src/cli.ts`,
    'gbrain'
  ]
  for (const candidate of candidates) {
    if (candidate === 'gbrain') return candidate
    if (candidate && existsSync(candidate)) return candidate
  }
  return 'gbrain'
}

const detectedCliPath = detectDefaultGbrainCliPath()
const NEW_DEFAULT_SHORTCUT = 'Option+Space'
const LEGACY_DEFAULT_SHORTCUT = 'Option+['
const DEFAULT_MEMORY_DIR = path.join(os.homedir(), 'KashinAI', 'memory')
const LEGACY_DISPLAY_NAMES = new Set(['Context Assistant', 'ContextAssistant', 'Kashin AI'])

function normalizeDisplayName(value: string | undefined): string {
  if (!value || LEGACY_DISPLAY_NAMES.has(value)) return 'KashinAI'
  return value
}

const DEFAULT_SETTINGS: StoredSettings = {
  appDisplayName: 'KashinAI',
  shortcut: NEW_DEFAULT_SHORTCUT,
  gbrain: {
    mode: detectedCliPath === 'gbrain' ? 'local' : 'cli',
    endpoint: 'http://localhost:3000',
    token: { value: '', encrypted: false },
    cliPath: detectedCliPath,
    timeoutMs: 10000
  },
  memory: {
    enabled: true,
    dir: DEFAULT_MEMORY_DIR
  },
  llm: {
    provider: 'anthropic',
    apiKey: { value: '', encrypted: false },
    defaultModel: 'claude-sonnet-4-5',
    temperature: 0.3
  },
  account: {
    hostedUrl: ''
  },
  defaults: {
    language: 'auto',
    tone: 'professional',
    length: 'medium'
  },
  privacy: {
    showSources: true,
    redactSensitive: false,
    telemetryEnabled: true
  },
  onboarding: {
    completed: false
  }
}

const store = new Store<StoredSettings>({
  name: 'settings',
  defaults: DEFAULT_SETTINGS
})

/** Encrypts a plaintext secret with Electron's safeStorage when available. Falls back to
 * storing plaintext (flagged as such) so the app still works on systems without OS keychain support. */
function encryptSecret(plain: string): StoredSecret {
  if (!plain) return { value: '', encrypted: false }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(plain)
    return { value: encrypted.toString('base64'), encrypted: true }
  }
  return { value: plain, encrypted: false }
}

function decryptSecret(secret: StoredSecret | undefined): string {
  if (!secret || !secret.value) return ''
  if (secret.encrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(secret.value, 'base64'))
    } catch {
      return ''
    }
  }
  return secret.value
}

/** Full settings with secrets decrypted, for internal main-process use only (gbrain/llm clients). */
export function getSettings(): AppSettings {
  const raw = store.store
  const cliPath =
    raw.gbrain.cliPath === 'gbrain' && detectedCliPath !== 'gbrain' ? detectedCliPath : raw.gbrain.cliPath
  const mode = raw.gbrain.mode === 'local' && detectedCliPath !== 'gbrain' ? 'cli' : raw.gbrain.mode
  const shortcut = raw.shortcut === LEGACY_DEFAULT_SHORTCUT ? NEW_DEFAULT_SHORTCUT : raw.shortcut
  return {
    ...raw,
    appDisplayName: normalizeDisplayName(raw.appDisplayName),
    shortcut,
    gbrain: {
      ...raw.gbrain,
      mode,
      cliPath,
      token: decryptSecret(raw.gbrain.token)
    },
    memory: {
      enabled: raw.memory?.enabled ?? true,
      dir: raw.memory?.dir || DEFAULT_MEMORY_DIR
    },
    llm: {
      ...raw.llm,
      apiKey: decryptSecret(raw.llm.apiKey)
    },
    account: {
      hostedUrl: raw.account?.hostedUrl ?? ''
    },
    privacy: {
      showSources: raw.privacy?.showSources ?? true,
      redactSensitive: raw.privacy?.redactSensitive ?? false,
      telemetryEnabled: raw.privacy?.telemetryEnabled ?? true
    },
    onboarding: {
      completed: raw.onboarding?.completed ?? false
    }
  }
}

/** Settings safe to send to the renderer: secrets are masked to booleans, never sent in plaintext. */
export function getPublicSettings(): PublicAppSettings {
  const raw = store.store
  const cliPath =
    raw.gbrain.cliPath === 'gbrain' && detectedCliPath !== 'gbrain' ? detectedCliPath : raw.gbrain.cliPath
  const mode = raw.gbrain.mode === 'local' && detectedCliPath !== 'gbrain' ? 'cli' : raw.gbrain.mode
  const shortcut = raw.shortcut === LEGACY_DEFAULT_SHORTCUT ? NEW_DEFAULT_SHORTCUT : raw.shortcut
  return {
    ...raw,
    appDisplayName: normalizeDisplayName(raw.appDisplayName),
    shortcut,
    gbrain: {
      mode,
      endpoint: raw.gbrain.endpoint,
      cliPath,
      timeoutMs: raw.gbrain.timeoutMs,
      hasToken: Boolean(raw.gbrain.token?.value)
    },
    memory: {
      enabled: raw.memory?.enabled ?? true,
      dir: raw.memory?.dir || DEFAULT_MEMORY_DIR
    },
    llm: {
      provider: raw.llm.provider,
      defaultModel: raw.llm.defaultModel,
      temperature: raw.llm.temperature,
      hasApiKey: Boolean(raw.llm.apiKey?.value)
    },
    account: {
      hostedUrl: raw.account?.hostedUrl ?? ''
    },
    privacy: {
      showSources: raw.privacy?.showSources ?? true,
      redactSensitive: raw.privacy?.redactSensitive ?? false,
      telemetryEnabled: raw.privacy?.telemetryEnabled ?? true
    },
    onboarding: {
      completed: raw.onboarding?.completed ?? false
    }
  }
}

/** Applies a partial update. Only overwrites the token/apiKey if a non-empty string is provided,
 * so the settings form can be saved without re-entering secrets every time. */
export function updateSettings(update: SettingsUpdate): PublicAppSettings {
  const current = store.store

  const next: StoredSettings = {
    appDisplayName: normalizeDisplayName(update.appDisplayName ?? current.appDisplayName),
    shortcut: update.shortcut ?? current.shortcut,
    gbrain: {
      mode: update.gbrain?.mode ?? current.gbrain.mode,
      endpoint: update.gbrain?.endpoint ?? current.gbrain.endpoint,
      cliPath: update.gbrain?.cliPath ?? current.gbrain.cliPath,
      timeoutMs: update.gbrain?.timeoutMs ?? current.gbrain.timeoutMs,
      token:
        update.gbrain?.token !== undefined && update.gbrain.token !== ''
          ? encryptSecret(update.gbrain.token)
          : current.gbrain.token
    },
    memory: {
      enabled: update.memory?.enabled ?? current.memory?.enabled ?? true,
      dir: update.memory?.dir ?? current.memory?.dir ?? DEFAULT_MEMORY_DIR
    },
    llm: {
      provider: update.llm?.provider ?? current.llm.provider,
      defaultModel: update.llm?.defaultModel ?? current.llm.defaultModel,
      temperature: update.llm?.temperature ?? current.llm.temperature,
      apiKey:
        update.llm?.apiKey !== undefined && update.llm.apiKey !== ''
          ? encryptSecret(update.llm.apiKey)
          : current.llm.apiKey
    },
    account: {
      hostedUrl: update.account?.hostedUrl ?? current.account?.hostedUrl ?? ''
    },
    defaults: { ...current.defaults, ...update.defaults },
    privacy: {
      showSources: update.privacy?.showSources ?? current.privacy?.showSources ?? true,
      redactSensitive: update.privacy?.redactSensitive ?? current.privacy?.redactSensitive ?? false,
      telemetryEnabled: update.privacy?.telemetryEnabled ?? current.privacy?.telemetryEnabled ?? true
    },
    onboarding: {
      completed: update.onboarding?.completed ?? current.onboarding?.completed ?? false
    }
  }

  store.store = next
  return getPublicSettings()
}

export function isSecretEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}
