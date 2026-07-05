import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { AppSettings, PublicAppSettings, SettingsUpdate } from '../shared/types'

type StoredSecret = {
  value: string
  encrypted: boolean
}

type StoredSettings = Omit<AppSettings, 'gbrain' | 'llm'> & {
  gbrain: Omit<AppSettings['gbrain'], 'token'> & { token: StoredSecret }
  llm: Omit<AppSettings['llm'], 'apiKey'> & { apiKey: StoredSecret }
}

const DEFAULT_SETTINGS: StoredSettings = {
  appDisplayName: 'Context Assistant',
  shortcut: 'Option+Space',
  gbrain: {
    mode: 'local',
    endpoint: 'http://localhost:3000',
    token: { value: '', encrypted: false },
    cliPath: 'gbrain',
    timeoutMs: 10000
  },
  llm: {
    provider: 'anthropic',
    apiKey: { value: '', encrypted: false },
    defaultModel: 'claude-sonnet-4-5',
    temperature: 0.3
  },
  defaults: {
    language: 'ja',
    tone: 'professional',
    length: 'medium'
  },
  privacy: {
    showSources: true
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
  return {
    ...raw,
    gbrain: {
      ...raw.gbrain,
      token: decryptSecret(raw.gbrain.token)
    },
    llm: {
      ...raw.llm,
      apiKey: decryptSecret(raw.llm.apiKey)
    }
  }
}

/** Settings safe to send to the renderer: secrets are masked to booleans, never sent in plaintext. */
export function getPublicSettings(): PublicAppSettings {
  const raw = store.store
  return {
    ...raw,
    gbrain: {
      mode: raw.gbrain.mode,
      endpoint: raw.gbrain.endpoint,
      cliPath: raw.gbrain.cliPath,
      timeoutMs: raw.gbrain.timeoutMs,
      hasToken: Boolean(raw.gbrain.token?.value)
    },
    llm: {
      provider: raw.llm.provider,
      defaultModel: raw.llm.defaultModel,
      temperature: raw.llm.temperature,
      hasApiKey: Boolean(raw.llm.apiKey?.value)
    }
  }
}

/** Applies a partial update. Only overwrites the token/apiKey if a non-empty string is provided,
 * so the settings form can be saved without re-entering secrets every time. */
export function updateSettings(update: SettingsUpdate): PublicAppSettings {
  const current = store.store

  const next: StoredSettings = {
    appDisplayName: update.appDisplayName ?? current.appDisplayName,
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
    llm: {
      provider: update.llm?.provider ?? current.llm.provider,
      defaultModel: update.llm?.defaultModel ?? current.llm.defaultModel,
      temperature: update.llm?.temperature ?? current.llm.temperature,
      apiKey:
        update.llm?.apiKey !== undefined && update.llm.apiKey !== ''
          ? encryptSecret(update.llm.apiKey)
          : current.llm.apiKey
    },
    defaults: { ...current.defaults, ...update.defaults },
    privacy: { ...current.privacy, ...update.privacy }
  }

  store.store = next
  return getPublicSettings()
}

export function isSecretEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}
