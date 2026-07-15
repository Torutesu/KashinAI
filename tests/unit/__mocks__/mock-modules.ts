/**
 * Mock implementations of the sibling modules imported by src/main/index.ts.
 * Each export is a spy that records calls so tests can assert on them.
 */

// --- ipc.ts mock ---
export const registerIpcHandlersCalls: number[] = []
export function registerIpcHandlers(): void {
  registerIpcHandlersCalls.push(1)
}

// --- shortcut.ts mock ---
export const registerShortcutCalls: { accelerator: string; handler: () => void }[] = []
export function registerShortcut(accelerator: string, handler: () => void): boolean {
  registerShortcutCalls.push({ accelerator, handler })
  return true
}

// --- windows.ts mock ---
export const createAssistantWindowCalls: number[] = []
export const showAssistantWindowCalls: number[] = []
export const hideAssistantWindowCalls: number[] = []
export const openAssistantSettingsCalls: number[] = []
export const sentEvents: { channel: string; data: unknown }[] = []

// The mock window that createAssistantWindow / getAssistantWindow returns
function createMockWindow() {
  return {
    webContents: {
      send: (channel: string, ...args: unknown[]) => {
        sentEvents.push({ channel, data: args[0] })
      }
    }
  }
}

export function createAssistantWindow(): { webContents: { send: (ch: string, ...args: unknown[]) => void } } {
  createAssistantWindowCalls.push(1)
  return createMockWindow()
}

export function showAssistantWindow(): void {
  showAssistantWindowCalls.push(1)
}

export function hideAssistantWindow(): void {
  hideAssistantWindowCalls.push(1)
}

export function openAssistantSettings(): void {
  openAssistantSettingsCalls.push(1)
}

export function getAssistantWindow(): { webContents: { send: (ch: string, ...args: unknown[]) => void } } | null {
  if (createAssistantWindowCalls.length === 0) return null
  return createMockWindow()
}

// --- context-reader.ts mock ---
export const getFrontmostAppInfoCalls: number[] = []
export const captureCurrentContextCalls: { activeApp: string | null; windowTitle: string | null }[] = []
export const warmContextHelpersCalls: number[] = []
export let mockFrontmostAppInfo: { activeApp: string | null; windowTitle: string | null } = {
  activeApp: 'Safari',
  windowTitle: 'Test Page'
}
export let mockGetFrontmostAppInfoError: Error | null = null
export let mockCaptureCurrentContextError: Error | null = null
export let mockCaptureCurrentContextDetailedError: Error | null = null
export let mockCaptureCurrentContextResult: {
  activeApp: string | null
  windowTitle: string | null
  primaryContentSource: 'none'
  selectedText: string | null
  selectedTextSource: 'clipboard-selection'
  clipboardText: string | null
  timestamp: string
} | null = null
export let mockCaptureCurrentContextDetailedResult: {
  context: Awaited<ReturnType<typeof captureCurrentContext>>
  captureTrace: {
    resolvedActiveApp: string | null
    resolvedWindowTitle: string | null
    canSkipBrowserCapture: boolean
    canSkipOcr: boolean
    browser: {
      initialNextStep: 'none' | 'browser' | 'keyboard' | 'session'
      afterBrowserNextStep: 'none' | 'browser' | 'keyboard' | 'session'
      afterKeyboardNextStep: 'none' | 'browser' | 'keyboard' | 'session'
      attemptedSteps: Array<'browser' | 'keyboard' | 'session'>
      browserCaptureMethod: 'none' | 'accessibility' | 'browser-automation' | 'keyboard-copy' | 'chrome-session' | null
      keyboardCaptureMethod: 'none' | 'accessibility' | 'browser-automation' | 'keyboard-copy' | 'chrome-session' | null
      sessionCaptureMethod: 'none' | 'accessibility' | 'browser-automation' | 'keyboard-copy' | 'chrome-session' | null
      finalPageCaptureMethod: 'none' | 'accessibility' | 'browser-automation' | 'keyboard-copy' | 'chrome-session'
    }
    screen: {
      shouldCaptureScreen: boolean
      reason: 'strong-accessibility-context' | 'needs-screen-signal'
      finalScreenCaptureMethod: 'none' | 'screen-ocr' | 'screen-screenshot-only'
    }
  }
} | null = null

export function setMockFrontmostAppInfo(next: { activeApp: string | null; windowTitle: string | null }): void {
  mockFrontmostAppInfo = next
}

export function setMockGetFrontmostAppInfoError(next: Error | null): void {
  mockGetFrontmostAppInfoError = next
}

export function setMockCaptureCurrentContextError(next: Error | null): void {
  mockCaptureCurrentContextError = next
}

export function setMockCaptureCurrentContextDetailedError(next: Error | null): void {
  mockCaptureCurrentContextDetailedError = next
}

export function setMockCaptureCurrentContextResult(next: typeof mockCaptureCurrentContextResult): void {
  mockCaptureCurrentContextResult = next
}

export function setMockCaptureCurrentContextDetailedResult(next: typeof mockCaptureCurrentContextDetailedResult): void {
  mockCaptureCurrentContextDetailedResult = next
}

export async function getFrontmostAppInfo(): Promise<{ activeApp: string | null; windowTitle: string | null }> {
  getFrontmostAppInfoCalls.push(1)
  if (mockGetFrontmostAppInfoError) throw mockGetFrontmostAppInfoError
  return mockFrontmostAppInfo
}

export async function captureCurrentContext(frontmost: { activeApp: string | null; windowTitle: string | null }): Promise<{
  activeApp: string | null
  windowTitle: string | null
  primaryContentSource: 'none'
  selectedText: string | null
  selectedTextSource: 'clipboard-selection'
  clipboardText: string | null
  timestamp: string
}> {
  captureCurrentContextCalls.push(frontmost)
  if (mockCaptureCurrentContextError) throw mockCaptureCurrentContextError
  if (mockCaptureCurrentContextResult) return mockCaptureCurrentContextResult
  return {
    activeApp: frontmost.activeApp,
    windowTitle: frontmost.windowTitle,
    primaryContentSource: 'none',
    selectedText: 'selected text',
    selectedTextSource: 'clipboard-selection',
    clipboardText: null,
    timestamp: '2025-01-01T00:00:00.000Z'
  }
}

export async function captureCurrentContextDetailed(frontmost: {
  activeApp: string | null
  windowTitle: string | null
}): Promise<{
  context: Awaited<ReturnType<typeof captureCurrentContext>>
  captureTrace: {
    resolvedActiveApp: string | null
    resolvedWindowTitle: string | null
    canSkipBrowserCapture: boolean
    canSkipOcr: boolean
    browser: {
      initialNextStep: 'none'
      afterBrowserNextStep: 'none'
      afterKeyboardNextStep: 'none'
      attemptedSteps: []
      browserCaptureMethod: null
      keyboardCaptureMethod: null
      sessionCaptureMethod: null
      finalPageCaptureMethod: 'none'
    }
    screen: {
      shouldCaptureScreen: false
      reason: 'strong-accessibility-context'
      finalScreenCaptureMethod: 'none'
    }
  }
  accessibilityDiagnostics: {
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
    selectedTextSource: 'top-level-selected-text' | 'top-level-selected-range-text' | 'focus-chain-selected-text' | 'focus-chain-selected-range-text' | 'focus-chain-selected-marker-text' | 'none'
    valueTextPresent: boolean
    focusChainNodeCount: number
    rankedLines: Array<{ line: string; score: number }>
    lowSignal: boolean
    lowSignalReason: 'missing-snapshot' | 'notification-center' | 'system-shell' | 'empty-ranked-lines' | 'title-only' | 'social-chrome-only' | 'browser-chrome-only' | 'weak-content' | null
  }
}> {
  if (mockCaptureCurrentContextDetailedError) throw mockCaptureCurrentContextDetailedError
  if (mockCaptureCurrentContextDetailedResult) return mockCaptureCurrentContextDetailedResult
  const context = await captureCurrentContext(frontmost)
  return {
    context,
    captureTrace: {
      resolvedActiveApp: frontmost.activeApp,
      resolvedWindowTitle: frontmost.windowTitle,
      canSkipBrowserCapture: true,
      canSkipOcr: true,
      browser: {
        initialNextStep: 'none',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: [],
        browserCaptureMethod: null,
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'none'
      },
      screen: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context',
        finalScreenCaptureMethod: 'none'
      }
    },
    accessibilityDiagnostics: {
      appName: frontmost.activeApp,
      rawAppName: frontmost.activeApp,
      workspaceAppName: frontmost.activeApp,
      topWindowOwnerName: frontmost.activeApp,
      windowTitle: frontmost.windowTitle,
      rawWindowTitle: frontmost.windowTitle,
      topWindowTitle: frontmost.windowTitle,
      appResolutionSource: frontmost.activeApp ? 'helper-frontmost' : 'none',
      windowTitleResolutionSource: frontmost.windowTitle ? 'window-title' : 'none',
      focusedRole: null,
      pageUrlCandidate: null,
      selectedTextPresent: Boolean(context.selectedText),
      selectedTextSource: 'none',
      valueTextPresent: false,
      focusChainNodeCount: 0,
      rankedLines: [],
      lowSignal: false,
      lowSignalReason: null
    }
  }
}

export function warmContextHelpers(): void {
  warmContextHelpersCalls.push(1)
}

// --- option-listener.ts mock ---
export const startOptionListenerCalls: {
  onOptionTap: () => void
  onOptionSpace: () => void
}[] = []
export const stopOptionListenerCalls: number[] = []

export function startOptionListener(handlers: { onOptionTap: () => void; onOptionSpace: () => void }): void {
  startOptionListenerCalls.push(handlers)
}

export function stopOptionListener(): void {
  stopOptionListenerCalls.push(1)
}

// --- insert.ts mock ---
export const insertTextCalls: { text: string; activeApp: string | null }[] = []

export async function insertText(text: string, activeApp: string | null): Promise<void> {
  insertTextCalls.push({ text, activeApp })
}

// --- prompts.ts / live-context.ts mocks ---
export const buildPromptCalls: unknown[] = []
export const buildChatPromptCalls: unknown[] = []
export const compactLiveContextCalls: unknown[] = []

export function buildPrompt(payload: unknown): { system: string; user: string } {
  buildPromptCalls.push(payload)
  return { system: 'system-prompt', user: 'user-prompt' }
}

export function buildChatPrompt(payload: unknown): { system: string; user: string } {
  buildChatPromptCalls.push(payload)
  return { system: 'chat-system', user: 'chat-user' }
}

export function compactLiveContext(context: { contextKind?: string }, max?: number): string {
  compactLiveContextCalls.push({ context, max })
  if (context.contextKind === 'social') return 'SNS post context'
  if (context.contextKind === 'coding') return 'TypeError in current file'
  return 'Current visible context'
}

// --- search-query.ts / gbrain.ts / llm.ts mocks ---
export const buildSearchQueryCalls: unknown[] = []
export const searchGBrainCalls: unknown[] = []
export const generateCalls: unknown[] = []
export let mockBuildSearchQueryResult = { searchQuery: 'mock search query', detectedEntities: {} }

export function setMockBuildSearchQueryResult(next: { searchQuery: string; detectedEntities: Record<string, unknown> }) {
  mockBuildSearchQueryResult = next
}

export function buildSearchQuery(currentContext: unknown, actionType: unknown, userInstruction: unknown) {
  buildSearchQueryCalls.push({ currentContext, actionType, userInstruction })
  return mockBuildSearchQueryResult
}

export async function searchGBrain(searchQuery: string) {
  searchGBrainCalls.push({ searchQuery })
  return {
    results: [{ source: 'company/faq', title: 'FAQ', content: 'answer' }],
    contextSource: 'gbrain-cli',
    trace: {
      requestedMode: 'cli',
      attemptedSources: ['gbrain-cli'],
      finalContextSource: 'gbrain-cli',
      fallbackReason: 'none'
    }
  }
}

export class LlmError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export async function generate(payload: unknown): Promise<string> {
  generateCalls.push(payload)
  return 'generated response'
}

// --- settings.ts mock extensions ---
export const updateSettingsCalls: unknown[] = []
export let mockRegisteredShortcut: string | null = 'Option+Space'
export const updateRegisteredShortcutCalls: string[] = []
export const updateRegisteredShortcutResults: boolean[] = []
export function getPublicSettings() {
  return {
    appDisplayName: 'TestApp',
    shortcut: 'Option+Space',
    gbrain: { mode: 'cli', endpoint: 'http://localhost:3000', cliPath: 'gbrain', timeoutMs: 10000, hasToken: false },
    memory: { enabled: true, dir: '/tmp/memory' },
    llm: { provider: 'anthropic', defaultModel: 'claude-sonnet-4-5', temperature: 0.3, hasApiKey: false },
    defaults: { language: 'ja', tone: 'professional', length: 'medium' },
    privacy: { showSources: true }
  }
}

export function updateSettings(update: unknown) {
  updateSettingsCalls.push(update)
  if (typeof update === 'object' && update !== null && 'shortcut' in update) {
    mockRegisteredShortcut = (update as { shortcut?: string }).shortcut ?? mockRegisteredShortcut
  }
  return getPublicSettings()
}

export let mockRedactSensitive = false
export function setMockRedactSensitive(next: boolean): void {
  mockRedactSensitive = next
}

export function getSettings() {
  return {
    appDisplayName: 'TestApp',
    shortcut: 'Option+Space',
    gbrain: { mode: 'cli', endpoint: 'http://localhost:3000', token: '', cliPath: 'gbrain', timeoutMs: 10000 },
    memory: { enabled: true, dir: '/tmp/memory' },
    llm: { provider: 'anthropic', apiKey: '', defaultModel: 'claude-sonnet-4-5', temperature: 0.3 },
    defaults: { language: 'ja', tone: 'professional', length: 'medium' },
    privacy: { showSources: true, redactSensitive: mockRedactSensitive }
  }
}

// --- windows.ts mock extensions ---
export function isAssistantCollapsed(): boolean {
  return false
}

export function expandAssistantWindow(): void {
  showAssistantWindowCalls.push(1)
}

// --- shortcut.ts mock extensions ---
export function getRegisteredShortcut(): string | null {
  return mockRegisteredShortcut
}

export function updateRegisteredShortcut(accelerator: string): boolean {
  updateRegisteredShortcutCalls.push(accelerator)
  registerShortcutCalls.push({ accelerator, handler: () => {} })
  const result = updateRegisteredShortcutResults.length > 0 ? (updateRegisteredShortcutResults.shift() ?? true) : true
  if (result) {
    mockRegisteredShortcut = accelerator
  }
  return result
}

// --- memory.ts mock ---
export const saveMarkdownMemoryCalls: unknown[] = []
export let mockSaveMarkdownMemoryError: Error | null = null
export function setMockSaveMarkdownMemoryError(next: Error | null): void {
  mockSaveMarkdownMemoryError = next
}
export async function saveMarkdownMemory(payload: unknown): Promise<string> {
  saveMarkdownMemoryCalls.push(payload)
  if (mockSaveMarkdownMemoryError) throw mockSaveMarkdownMemoryError
  return '/tmp/memory/mock.md'
}

// --- history.ts mock ---
export const recordHistoryEntryCalls: unknown[] = []
export let mockHistoryEntries: unknown[] = []
export const clearHistoryCalls: number[] = []

export function recordHistoryEntry(input: unknown): void {
  recordHistoryEntryCalls.push(input)
}

export function setMockHistoryEntries(next: unknown[]): void {
  mockHistoryEntries = next
}

export function listHistory(): unknown[] {
  return mockHistoryEntries
}

export function clearHistory(): void {
  clearHistoryCalls.push(1)
  mockHistoryEntries = []
}

export function summarizeHistorySources(
  sources: Array<{ source: string; title: string }>
): Array<{ source: string; title: string }> {
  return sources.map((source) => ({ source: source.source, title: source.title }))
}

// --- Reset helper ---
export function resetAllMocks(): void {
  recordHistoryEntryCalls.length = 0
  mockHistoryEntries = []
  clearHistoryCalls.length = 0
  mockRedactSensitive = false
  registerIpcHandlersCalls.length = 0
  registerShortcutCalls.length = 0
  createAssistantWindowCalls.length = 0
  showAssistantWindowCalls.length = 0
  hideAssistantWindowCalls.length = 0
  openAssistantSettingsCalls.length = 0
  sentEvents.length = 0
  getFrontmostAppInfoCalls.length = 0
  captureCurrentContextCalls.length = 0
  warmContextHelpersCalls.length = 0
  mockFrontmostAppInfo = { activeApp: 'Safari', windowTitle: 'Test Page' }
  mockGetFrontmostAppInfoError = null
  mockCaptureCurrentContextError = null
  mockCaptureCurrentContextDetailedError = null
  mockCaptureCurrentContextDetailedResult = null
  mockCaptureCurrentContextResult = null
  startOptionListenerCalls.length = 0
  stopOptionListenerCalls.length = 0
  insertTextCalls.length = 0
  buildPromptCalls.length = 0
  buildChatPromptCalls.length = 0
  compactLiveContextCalls.length = 0
  buildSearchQueryCalls.length = 0
  mockBuildSearchQueryResult = { searchQuery: 'mock search query', detectedEntities: {} }
  searchGBrainCalls.length = 0
  generateCalls.length = 0
  updateSettingsCalls.length = 0
  updateRegisteredShortcutCalls.length = 0
  updateRegisteredShortcutResults.length = 0
  mockRegisteredShortcut = 'Option+Space'
  saveMarkdownMemoryCalls.length = 0
  mockSaveMarkdownMemoryError = null
}
