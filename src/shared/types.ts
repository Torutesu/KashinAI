import type { LanguagePreference } from './language'
import type { CaptureStageTimings, GenerationTimings } from './timing'
import type { TelemetryEventName } from './telemetry'

export type ActionType = 'reply' | 'summarize' | 'next_actions' | 'proposal' | 'translate' | 'custom'

export type CurrentContext = {
  activeApp: string | null
  windowTitle: string | null
  contextKind: 'social' | 'coding' | 'browser' | 'document' | 'general'
  primaryContentSource: 'selected-text' | 'page-text' | 'accessibility-text' | 'screen-ocr' | 'none'
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
  pageCaptureMethod: 'browser-automation' | 'keyboard-copy' | 'chrome-session' | 'accessibility' | 'none'
  accessibilityText: string | null
  accessibilityCaptureMethod: 'ax-tree' | 'none'
  screenshotPath: string | null
  screenText: string | null
  screenCaptureMethod: 'window-ocr' | 'screen-ocr' | 'window-screenshot-only' | 'screen-screenshot-only' | 'none'
  selectedText: string | null
  selectedTextSource:
    | 'clipboard-selection'
    | 'top-level-selected-text'
    | 'top-level-selected-range-text'
    | 'focus-chain-selected-text'
    | 'focus-chain-selected-range-text'
    | 'focus-chain-selected-marker-text'
    | 'none'
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
    language: LanguagePreference
    tone: 'casual' | 'professional' | 'polite'
    length: 'short' | 'medium' | 'long'
  }
}

export type ContextSource = 'gbrain-cli' | 'gbrain-http' | 'local-fallback' | 'none'

export type GBrainTrace = {
  requestedMode: GBrainMode
  attemptedSources: Array<'gbrain-cli' | 'gbrain-http' | 'local-fallback'>
  finalContextSource: ContextSource
  fallbackReason:
    | 'none'
    | 'cli-empty'
    | 'cli-failed'
    | 'http-empty'
    | 'http-failed'
    | 'local-empty'
}

export type GenerateRequest = {
  currentContext: CurrentContext
  actionType: ActionType
  userInstruction: string
  modifier?: 'shorter' | 'more_polite' | null
  /** When set, this query is used for GBrain retrieval instead of the auto-generated one. */
  searchQueryOverride?: string | null
}

export type GenerateResult = {
  output: string
  sources: RetrievedContext[]
  searchQuery: string
  contextSource: ContextSource
  timings?: GenerationTimings
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ChatRequest = {
  currentContext: CurrentContext
  messages: ChatMessage[]
  /** When set, this query is used for GBrain retrieval instead of the auto-generated one. */
  searchQueryOverride?: string | null
}

/** A single saved generation, shown in the History view so past outputs can be reused. */
export type HistoryEntry = {
  id: string
  timestamp: string
  kind: 'generate' | 'chat'
  actionType: ActionType | null
  activeApp: string | null
  contextKind: CurrentContext['contextKind'] | null
  output: string
  searchQuery: string
  contextSource: ContextSource
  sources: { source: string; title: string }[]
}

export type ChatResult = {
  message: ChatMessage
  sources: RetrievedContext[]
  searchQuery: string
  contextSource: ContextSource
  currentContext: CurrentContext
  timings?: GenerationTimings
}

export type ContextPushPayload = {
  context: CurrentContext
  autoInsert: boolean
}

export type BackendDiagnostics = {
  accessibilityGranted: boolean
  screenCaptureStatus: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'
  accessibilityDiagnostics?: {
    appName: string | null
    rawAppName: string | null
    workspaceAppName: string | null
    topWindowOwnerName: string | null
    windowTitle: string | null
    rawWindowTitle: string | null
    topWindowTitle: string | null
    appResolutionSource: 'helper-frontmost' | 'top-window-owner' | 'workspace-app' | 'none'
    windowTitleResolutionSource: 'window-title' | 'top-window-title' | 'snapshot-title' | 'none'
    focusedRole: string | null
    pageUrlCandidate: string | null
    selectedTextPresent: boolean
    selectedTextSource:
      | 'top-level-selected-text'
      | 'top-level-selected-range-text'
      | 'focus-chain-selected-text'
      | 'focus-chain-selected-range-text'
      | 'focus-chain-selected-marker-text'
      | 'none'
    valueTextPresent: boolean
    focusChainNodeCount: number
    rankedLines: Array<{
      line: string
      score: number
    }>
    lowSignal: boolean
    lowSignalReason:
      | 'missing-snapshot'
      | 'notification-center'
      | 'system-shell'
      | 'empty-ranked-lines'
      | 'title-only'
      | 'social-chrome-only'
      | 'browser-chrome-only'
      | 'weak-content'
      | null
  }
  screenCaptureDecisionReason?: 'strong-accessibility-context' | 'needs-screen-signal'
  browserCaptureSummary?: {
    finalPageCaptureMethod: CurrentContext['pageCaptureMethod']
    finalPrimarySource: CurrentContext['primaryContentSource']
    path:
      | 'accessibility-short-circuit'
      | 'accessibility-retained'
      | 'browser-automation'
      | 'keyboard-copy'
      | 'chrome-session'
      | 'screen-ocr-fallback'
      | 'no-page-context'
    pageTitlePresent: boolean
    pageUrlPresent: boolean
    pageTextLength: number
    accessibilityTextLength: number
    selectedTextLength: number
    usedBrowserAutomation: boolean
    usedKeyboardFallback: boolean
    usedSessionFallback: boolean
    skippedBrowserCapture: boolean
    lastAttemptedStep: 'browser' | 'keyboard' | 'session' | null
    nextPlannedStep: 'none' | 'browser' | 'keyboard' | 'session'
    stalledAtStep: 'browser' | 'keyboard' | 'session' | null
  }
  captureTrace?: {
    resolvedActiveApp: string | null
    resolvedWindowTitle: string | null
    canSkipBrowserCapture: boolean
    canSkipOcr: boolean
    browser: {
      initialNextStep: 'none' | 'browser' | 'keyboard' | 'session'
      afterBrowserNextStep: 'none' | 'browser' | 'keyboard' | 'session'
      afterKeyboardNextStep: 'none' | 'browser' | 'keyboard' | 'session'
      attemptedSteps: Array<'browser' | 'keyboard' | 'session'>
      browserCaptureMethod: CurrentContext['pageCaptureMethod'] | null
      keyboardCaptureMethod: CurrentContext['pageCaptureMethod'] | null
      sessionCaptureMethod: CurrentContext['pageCaptureMethod'] | null
      finalPageCaptureMethod: CurrentContext['pageCaptureMethod']
    }
    screen: {
      shouldCaptureScreen: boolean
      reason: 'strong-accessibility-context' | 'needs-screen-signal'
      finalScreenCaptureMethod: CurrentContext['screenCaptureMethod']
      sourceSelection?: {
        fallbackReason:
          | 'matched-window'
          | 'screen-fallback-no-window-match'
          | 'screen-fallback-no-window-candidates'
          | 'screen-fallback-no-viable-window-thumbnails'
          | 'no-viable-sources'
        preferredCaptureMode: 'desktop-source' | 'native-screen'
      } | null
    }
    /** Best-effort per-stage capture timings (ms). Unstable — redacted from saved fixtures. */
    timings?: CaptureStageTimings
  }
  canFuseContext: boolean
  gbrain: {
    ok: boolean
    contextSource: ContextSource
    resultCount: number
    sampleSources: string[]
    trace?: GBrainTrace
  }
  fusionInputs: {
    hasGBrainContext: boolean
    hasPageContext: boolean
    hasAccessibilityContext: boolean
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
    language: LanguagePreference
    tone: 'casual' | 'professional' | 'polite'
    length: 'short' | 'medium' | 'long'
  }
  privacy: {
    showSources: boolean
    /** When true, mask emails/keys/long numbers in captured text before sending to the LLM. */
    redactSensitive: boolean
    /** Anonymous product analytics (never includes screen text/output/keys). Opt-out. */
    telemetryEnabled: boolean
  }
  onboarding: {
    completed: boolean
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
  onboarding?: Partial<AppSettings['onboarding']>
}

export type GenerateIpcResult = { ok: true; data: GenerateResult } | { ok: false; error: AppError }

export type ChatIpcResult = { ok: true; data: ChatResult } | { ok: false; error: AppError }

export type BackendDiagnosticsIpcResult =
  | { ok: true; data: BackendDiagnostics }
  | { ok: false; error: AppError }

/** The typed contract exposed on window.api by the preload script. Declared here (not in
 * src/preload) so both the main-process tsconfig and the renderer tsconfig can reference it
 * without one composite TS project reaching into the other's file set. */
export type KashinAiApi = {
  captureContext: () => Promise<CurrentContext>
  generate: (request: GenerateRequest) => Promise<GenerateIpcResult>
  chat: (request: ChatRequest) => Promise<ChatIpcResult>
  copyOutput: (text: string) => Promise<boolean>
  insertOutput: (text: string, activeApp: string | null) => Promise<boolean>
  getSettings: () => Promise<PublicAppSettings>
  setSettings: (update: SettingsUpdate) => Promise<PublicAppSettings>
  saveMemory: (request: { currentContext: CurrentContext; note?: string }) => Promise<{ ok: true; path: string } | { ok: false; error: AppError }>
  getHistory: () => Promise<HistoryEntry[]>
  clearHistory: () => Promise<boolean>
  captureTelemetry: (event: TelemetryEventName, properties?: Record<string, string | number | boolean>) => Promise<boolean>
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
