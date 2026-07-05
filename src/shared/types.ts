export type ActionType = 'reply' | 'summarize' | 'next_actions' | 'proposal' | 'translate' | 'custom'

export type CurrentContext = {
  activeApp: string | null
  windowTitle: string | null
  selectedText: string | null
  clipboardText: string | null
  timestamp: string
}

export type DetectedEntities = {
  customer?: string | null
  project?: string | null
  person?: string | null
  topic?: string | null
}

export type RetrievedContext = {
  title: string
  content: string
  source: string
  score?: number
  type?: 'company' | 'product' | 'customer' | 'project' | 'person' | 'template' | 'unknown'
}

export type ContextPack = {
  currentContext: CurrentContext
  userInstruction: string
  actionType: ActionType
  detectedEntities: DetectedEntities
  searchQuery: string
  retrievedContext: RetrievedContext[]
  outputPreferences: {
    language: 'ja' | 'en'
    tone: 'casual' | 'professional' | 'polite'
    length: 'short' | 'medium' | 'long'
  }
}

export type ContextSource = 'gbrain-cli' | 'gbrain-http' | 'local-fallback' | 'none'

export type GenerateRequest = {
  currentContext: CurrentContext
  actionType: ActionType
  userInstruction: string
  modifier?: 'shorter' | 'more_polite' | null
}

export type GenerateResult = {
  output: string
  sources: RetrievedContext[]
  searchQuery: string
  contextSource: ContextSource
}

export type ErrorCode =
  | 'no_selection'
  | 'gbrain_failed'
  | 'llm_missing_api_key'
  | 'llm_request_failed'
  | 'llm_unknown_provider'
  | 'unknown'

export type AppError = {
  code: ErrorCode
  message: string
}

export type GBrainMode = 'cli' | 'http' | 'local'

export type LlmProvider = 'anthropic' | 'openai' | 'gemini'

export type AppSettings = {
  appDisplayName: string
  shortcut: string
  gbrain: {
    mode: GBrainMode
    endpoint: string
    token: string
    cliPath: string
    timeoutMs: number
  }
  llm: {
    provider: LlmProvider
    apiKey: string
    defaultModel: string
    temperature: number
  }
  defaults: {
    language: 'ja' | 'en'
    tone: 'casual' | 'professional' | 'polite'
    length: 'short' | 'medium' | 'long'
  }
  privacy: {
    showSources: boolean
  }
}

/** Settings shape as returned to the renderer: secrets are masked, never sent in plaintext. */
export type PublicAppSettings = Omit<AppSettings, 'gbrain' | 'llm'> & {
  gbrain: Omit<AppSettings['gbrain'], 'token'> & { hasToken: boolean }
  llm: Omit<AppSettings['llm'], 'apiKey'> & { hasApiKey: boolean }
}

/** Partial settings update payload sent from the renderer's Settings form. Secrets (token /
 * apiKey) are only overwritten when a non-empty string is provided. */
export type SettingsUpdate = {
  appDisplayName?: string
  shortcut?: string
  gbrain?: Partial<Omit<AppSettings['gbrain'], 'token'>> & { token?: string }
  llm?: Partial<Omit<AppSettings['llm'], 'apiKey'>> & { apiKey?: string }
  defaults?: Partial<AppSettings['defaults']>
  privacy?: Partial<AppSettings['privacy']>
}

export type GenerateIpcResult = { ok: true; data: GenerateResult } | { ok: false; error: AppError }

/** The typed contract exposed on window.api by the preload script. Declared here (not in
 * src/preload) so both the main-process tsconfig and the renderer tsconfig can reference it
 * without one composite TS project reaching into the other's file set. */
export type ContextAssistantApi = {
  captureContext: () => Promise<CurrentContext>
  generate: (request: GenerateRequest) => Promise<GenerateIpcResult>
  copyOutput: (text: string) => Promise<boolean>
  insertOutput: (text: string, activeApp: string | null) => Promise<boolean>
  getSettings: () => Promise<PublicAppSettings>
  setSettings: (update: SettingsUpdate) => Promise<PublicAppSettings>
  getWindowState: () => Promise<{ collapsed: boolean }>
  hideWindow: () => Promise<void>
  expandWindow: () => Promise<void>
  openSettings: () => Promise<void>
  checkAccessibility: () => Promise<boolean>
  requestAccessibility: () => Promise<boolean>
  onContextPushed: (callback: (context: CurrentContext) => void) => () => void
  onNavigate: (callback: (view: 'assistant' | 'settings') => void) => () => void
  onCollapsedChanged: (callback: (collapsed: boolean) => void) => () => void
}
