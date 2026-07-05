export type ActionType = 'reply' | 'summarize' | 'next_actions' | 'proposal' | 'translate' | 'custom'

export type CurrentContext = {
  activeApp: string | null
  windowTitle: string | null
  contextKind: 'social' | 'coding' | 'browser' | 'document' | 'general'
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
  pageCaptureMethod: 'browser-automation' | 'keyboard-copy' | 'chrome-session' | 'none'
  screenshotPath: string | null
  screenText: string | null
  screenCaptureMethod: 'desktop-capturer-ocr' | 'screenshot-only' | 'none'
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

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequest = {
  currentContext: CurrentContext
  messages: ChatMessage[]
}

export type ChatResult = {
  message: ChatMessage
  sources: RetrievedContext[]
  searchQuery: string
  contextSource: ContextSource
  currentContext: CurrentContext
}

export type ContextPushPayload = {
  context: CurrentContext
  autoInsert: boolean
}

export type BackendDiagnostics = {
  accessibilityGranted: boolean
  screenCaptureStatus: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
  canFuseContext: boolean
  gbrain: {
    ok: boolean
    contextSource: ContextSource
    resultCount: number
    sampleSources: string[]
  }
  fusionInputs: {
    hasGBrainContext: boolean
    hasPageContext: boolean
    hasScreenContext: boolean
    hasSelectedText: boolean
    hasClipboardFallback: boolean
  }
  currentContext: CurrentContext
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
  memory: {
    enabled: boolean
    dir: string
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
  memory?: Partial<AppSettings['memory']>
  llm?: Partial<Omit<AppSettings['llm'], 'apiKey'>> & { apiKey?: string }
  defaults?: Partial<AppSettings['defaults']>
  privacy?: Partial<AppSettings['privacy']>
}

export type GenerateIpcResult = { ok: true; data: GenerateResult } | { ok: false; error: AppError }

export type ChatIpcResult = { ok: true; data: ChatResult } | { ok: false; error: AppError }

export type BackendDiagnosticsIpcResult =
  | { ok: true; data: BackendDiagnostics }
  | { ok: false; error: AppError }

/** The typed contract exposed on window.api by the preload script. Declared here (not in
 * src/preload) so both the main-process tsconfig and the renderer tsconfig can reference it
 * without one composite TS project reaching into the other's file set. */
export type ContextAssistantApi = {
  captureContext: () => Promise<CurrentContext>
  generate: (request: GenerateRequest) => Promise<GenerateIpcResult>
  chat: (request: ChatRequest) => Promise<ChatIpcResult>
  copyOutput: (text: string) => Promise<boolean>
  insertOutput: (text: string, activeApp: string | null) => Promise<boolean>
  getSettings: () => Promise<PublicAppSettings>
  setSettings: (update: SettingsUpdate) => Promise<PublicAppSettings>
  saveMemory: (request: { currentContext: CurrentContext; note?: string }) => Promise<{ ok: true; path: string } | { ok: false; error: AppError }>
  getWindowState: () => Promise<{ collapsed: boolean; registeredShortcut: string | null }>
  hideWindow: () => Promise<void>
  expandWindow: () => Promise<void>
  openSettings: () => Promise<void>
  checkAccessibility: () => Promise<boolean>
  requestAccessibility: () => Promise<boolean>
  openAccessibilitySettings: () => Promise<boolean>
  checkScreenCapture: () => Promise<BackendDiagnostics['screenCaptureStatus']>
  requestScreenCapture: () => Promise<BackendDiagnostics['screenCaptureStatus']>
  openScreenCaptureSettings: () => Promise<boolean>
  runDiagnostics: () => Promise<BackendDiagnosticsIpcResult>
  onContextPushed: (callback: (payload: ContextPushPayload) => void) => () => void
  onNavigate: (callback: (view: 'assistant' | 'settings') => void) => () => void
  onCollapsedChanged: (callback: (collapsed: boolean) => void) => () => void
}
