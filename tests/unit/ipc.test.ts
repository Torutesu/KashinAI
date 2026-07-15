import test from 'node:test'
import assert from 'node:assert/strict'
import { electronMockState, resetState } from './__mocks__/electron.ts'
import {
  buildSearchQueryCalls,
  buildChatPromptCalls,
  captureCurrentContextCalls,
  generateCalls,
  getFrontmostAppInfoCalls,
  mockRegisteredShortcut,
  resetAllMocks,
  saveMarkdownMemoryCalls,
  setMockBuildSearchQueryResult,
  setMockCaptureCurrentContextDetailedResult,
  searchGBrainCalls,
  setMockCaptureCurrentContextDetailedError,
  setMockCaptureCurrentContextError,
  setMockCaptureCurrentContextResult,
  setMockFrontmostAppInfo,
  setMockGetFrontmostAppInfoError,
  setMockSaveMarkdownMemoryError,
  insertTextCalls,
  sentEvents,
  updateRegisteredShortcutCalls,
  updateRegisteredShortcutResults,
  updateSettingsCalls
} from './__mocks__/mock-modules.ts'

function socialContext() {
  return {
    activeApp: 'Google Chrome',
    windowTitle: 'Home / X',
    contextKind: 'social' as const,
    primaryContentSource: 'accessibility-text' as const,
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none' as const,
    accessibilityText: 'AIツールの良し悪しは画面文脈で決まる',
    accessibilityCaptureMethod: 'ax-tree' as const,
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none' as const,
    selectedText: null,
    selectedTextSource: 'none' as const,
    clipboardText: null,
    timestamp: '2026-07-06T00:00:00.000Z'
  }
}

function browserContext() {
  return {
    ...socialContext(),
    contextKind: 'browser' as const,
    primaryContentSource: 'page-text' as const,
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Current pricing page',
    accessibilityText: 'Visible pricing text'
  }
}

async function importIpc() {
  return import(`../../src/main/ipc.ts?test=${Date.now()}-${Math.random()}`)
}

test.beforeEach(() => {
  resetState()
  resetAllMocks()
})

test('registerIpcHandlers wires expected IPC channels', async () => {
  const { registerIpcHandlers } = await importIpc()

  registerIpcHandlers()

  assert.ok(electronMockState.ipcHandlers['context:capture'])
  assert.ok(electronMockState.ipcHandlers['assistant:chat'])
  assert.ok(electronMockState.ipcHandlers['assistant:generate'])
  assert.ok(electronMockState.ipcHandlers['memory:save'])
  assert.ok(electronMockState.ipcHandlers['system:runDiagnostics'])
})

test('context:capture resolves frontmost app first and returns the captured current context payload', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['context:capture']
  assert.ok(handler, 'context:capture handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(getFrontmostAppInfoCalls.length, 1)
  assert.equal(captureCurrentContextCalls.length, 1)
  assert.deepEqual(captureCurrentContextCalls[0], { activeApp: 'Safari', windowTitle: 'Test Page' })
  assert.equal(result.activeApp, 'Safari')
  assert.equal(result.windowTitle, 'Test Page')
  assert.equal(result.selectedText, 'selected text')
})

test('context:capture passes through the actual resolved frontmost app to captureCurrentContext', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockFrontmostAppInfo({ activeApp: 'Google Chrome', windowTitle: 'Pricing' })

  const handler = electronMockState.ipcHandlers['context:capture']
  assert.ok(handler, 'context:capture handler should be registered')

  const result = await handler({}, undefined)

  assert.deepEqual(captureCurrentContextCalls.slice(-1)[0], {
    activeApp: 'Google Chrome',
    windowTitle: 'Pricing'
  })
  assert.equal(result.activeApp, 'Google Chrome')
  assert.equal(result.windowTitle, 'Pricing')
})

test('context:capture surfaces captureCurrentContext failures to the caller', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockCaptureCurrentContextError(new Error('capture failed'))

  const handler = electronMockState.ipcHandlers['context:capture']
  assert.ok(handler, 'context:capture handler should be registered')

  await assert.rejects(() => handler({}, undefined), /capture failed/)
})

test('assistant:chat skips GBrain and LLM for inline social recommendations', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['assistant:chat']
  assert.ok(handler, 'assistant:chat handler should be registered')

  const result = await handler(
    {},
    {
      currentContext: socialContext(),
      messages: [{ role: 'user', content: '今すぐ貼り付けて使えるおすすめ文をください' }]
    }
  )

  assert.equal(searchGBrainCalls.length, 0)
  assert.equal(generateCalls.length, 0)
  assert.equal(buildChatPromptCalls.length, 0)
  assert.equal(result.ok, true)
  assert.equal(result.data.contextSource, 'none')
  assert.match(result.data.message.content, /気になります|詳しく見てみたい/)
})

test('assistant:chat uses GBrain retrieval path for normal browser chat', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['assistant:chat']
  assert.ok(handler, 'assistant:chat handler should be registered')

  const result = await handler(
    {},
    {
      currentContext: browserContext(),
      messages: [{ role: 'user', content: 'このページを要約して' }]
    }
  )

  assert.equal(searchGBrainCalls.length, 1)
  assert.equal(buildChatPromptCalls.length, 1)
  assert.equal(generateCalls.length, 0)
  assert.equal(result.ok, true)
  assert.equal(result.data.contextSource, 'gbrain-cli')
  assert.match(result.data.message.content, /retrieval-only backend check|The backend successfully fused/)
})

test('output:insert forwards the generated text and active app to the native insert bridge', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['output:insert']
  assert.ok(handler, 'output:insert handler should be registered')

  const result = await handler({}, { text: '貼り付ける本文', activeApp: 'Safari' })

  assert.equal(result, true)
  assert.deepEqual(insertTextCalls, [{ text: '貼り付ける本文', activeApp: 'Safari' }])
})

test('memory:save persists the current context and optional note through the markdown memory bridge', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['memory:save']
  assert.ok(handler, 'memory:save handler should be registered')

  const currentContext = browserContext()
  const result = await handler({}, { currentContext, note: 'pricing page looked promising' })

  assert.deepEqual(saveMarkdownMemoryCalls, [
    {
      settings: {
        appDisplayName: 'TestApp',
        shortcut: 'Option+Space',
        gbrain: { mode: 'cli', endpoint: 'http://localhost:3000', token: '', cliPath: 'gbrain', timeoutMs: 10000 },
        memory: { enabled: true, dir: '/tmp/memory' },
        llm: { provider: 'anthropic', apiKey: '', defaultModel: 'claude-sonnet-4-5', temperature: 0.3 },
        defaults: { language: 'ja', tone: 'professional', length: 'medium' },
        privacy: { showSources: true }
      },
      currentContext,
      note: 'pricing page looked promising'
    }
  ])
  assert.deepEqual(result, {
    ok: true,
    path: '/tmp/memory/mock.md'
  })
})

test('memory:save returns a structured error when the markdown memory bridge fails', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockSaveMarkdownMemoryError(new Error('disk full'))

  const handler = electronMockState.ipcHandlers['memory:save']
  assert.ok(handler, 'memory:save handler should be registered')

  const result = await handler({}, { currentContext: browserContext() })

  assert.deepEqual(result, {
    ok: false,
    error: { code: 'unknown', message: 'disk full' }
  })
})

test('system:runDiagnostics reports fused context inputs from current capture and GBrain state', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['system:runDiagnostics']
  assert.ok(handler, 'system:runDiagnostics handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(getFrontmostAppInfoCalls.length, 1)
  assert.equal(buildSearchQueryCalls.length, 1)
  assert.equal(buildSearchQueryCalls[0]?.actionType, 'custom')
  assert.equal(buildSearchQueryCalls[0]?.userInstruction, 'この文脈を確認したい')
  assert.equal(searchGBrainCalls.length, 1)
  assert.deepEqual(searchGBrainCalls[0], { searchQuery: 'mock search query' })
  assert.equal(result.ok, true)
  assert.equal(result.data.gbrain.ok, true)
  assert.equal(result.data.gbrain.contextSource, 'gbrain-cli')
  assert.equal(result.data.gbrain.resultCount, 1)
  assert.deepEqual(result.data.gbrain.trace?.attemptedSources, ['gbrain-cli'])
  assert.equal(result.data.gbrain.trace?.fallbackReason, 'none')
  assert.equal(result.data.canFuseContext, true)
  assert.equal(result.data.accessibilityDiagnostics?.appResolutionSource, 'helper-frontmost')
  assert.equal(result.data.accessibilityDiagnostics?.lowSignal, false)
  assert.equal(result.data.fusionInputs.hasGBrainContext, true)
  assert.equal(result.data.fusionInputs.hasSelectedText, true)
  assert.equal(result.data.fusionInputs.hasAccessibilityContext, false)
  assert.equal(result.data.fusionInputs.hasPageContext, false)
  assert.equal(result.data.fusionInputs.hasScreenContext, false)
  assert.deepEqual(result.data.captureTrace?.browser.attemptedSteps, [])
  assert.equal(result.data.captureTrace?.browser.initialNextStep, 'none')
  assert.equal(result.data.captureTrace?.screen.reason, 'strong-accessibility-context')
})

test('system:runDiagnostics skips GBrain lookup when no visible context was captured', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockCaptureCurrentContextResult({
    activeApp: 'Safari',
    windowTitle: 'Empty Page',
    contextKind: 'general',
    primaryContentSource: 'none',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: 'copied fallback only',
    timestamp: '2025-01-01T00:00:00.000Z'
  })

  const handler = electronMockState.ipcHandlers['system:runDiagnostics']
  assert.ok(handler, 'system:runDiagnostics handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(getFrontmostAppInfoCalls.length, 1)
  assert.equal(buildSearchQueryCalls.length, 0)
  assert.equal(searchGBrainCalls.length, 0)
  assert.equal(result.ok, true)
  assert.equal(result.data.gbrain.ok, false)
  assert.equal(result.data.gbrain.contextSource, 'none')
  assert.equal(result.data.gbrain.resultCount, 0)
  assert.equal(result.data.canFuseContext, false)
  assert.equal(result.data.fusionInputs.hasGBrainContext, false)
  assert.equal(result.data.fusionInputs.hasClipboardFallback, true)
  assert.equal(result.data.fusionInputs.hasAccessibilityContext, false)
  assert.equal(result.data.fusionInputs.hasPageContext, false)
  assert.equal(result.data.fusionInputs.hasScreenContext, false)
  assert.equal(result.data.fusionInputs.hasSelectedText, false)
})

test('system:runDiagnostics does not call GBrain when the derived diagnostics query is blank after trimming', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockBuildSearchQueryResult({
    searchQuery: '   ',
    detectedEntities: {}
  })
  setMockCaptureCurrentContextDetailedResult({
    context: {
      activeApp: 'Dia',
      windowTitle: 'Pricing',
      contextKind: 'browser',
      primaryContentSource: 'page-text',
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Visible pricing context',
      pageCaptureMethod: 'browser-automation',
      accessibilityText: null,
      accessibilityCaptureMethod: 'none',
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none',
      selectedText: null,
      selectedTextSource: 'none',
      clipboardText: null,
      timestamp: '2026-07-14T00:00:00.000Z'
    },
    captureTrace: {
      resolvedActiveApp: 'Dia',
      resolvedWindowTitle: 'Pricing',
      canSkipBrowserCapture: false,
      canSkipOcr: true,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'browser-automation'
      },
      screen: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context',
        finalScreenCaptureMethod: 'none'
      }
    },
    accessibilityDiagnostics: undefined
  })

  const handler = electronMockState.ipcHandlers['system:runDiagnostics']
  assert.ok(handler, 'system:runDiagnostics handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(result.ok, true)
  assert.equal(buildSearchQueryCalls.length, 1)
  assert.equal(searchGBrainCalls.length, 0)
  assert.equal(result.data.gbrain.contextSource, 'none')
  assert.equal(result.data.gbrain.resultCount, 0)
})

test('system:runDiagnostics keeps screen capture suppressed when browser fallback already recovered strong page text', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockCaptureCurrentContextDetailedResult({
    context: {
      activeApp: 'Dia',
      windowTitle: 'Pricing overview',
      contextKind: 'browser',
      primaryContentSource: 'page-text',
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4),
      pageCaptureMethod: 'browser-automation',
      accessibilityText: 'short note',
      accessibilityCaptureMethod: 'ax-tree',
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none',
      selectedText: null,
      selectedTextSource: 'none',
      clipboardText: null,
      timestamp: '2026-07-14T00:00:00.000Z'
    },
    captureTrace: {
      resolvedActiveApp: 'Dia',
      resolvedWindowTitle: 'Pricing overview',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'browser-automation'
      },
      screen: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context',
        finalScreenCaptureMethod: 'none'
      }
    },
    accessibilityDiagnostics: {
      appName: 'Dia',
      rawAppName: 'Dia',
      workspaceAppName: 'Dia',
      topWindowOwnerName: 'Dia',
      windowTitle: 'Pricing overview',
      rawWindowTitle: 'Pricing overview',
      topWindowTitle: 'Pricing overview',
      appResolutionSource: 'helper-frontmost',
      windowTitleResolutionSource: 'window-title',
      focusedRole: 'AXWebArea',
      pageUrlCandidate: 'https://example.com/pricing',
      selectedTextPresent: false,
      selectedTextSource: 'none',
      valueTextPresent: false,
      focusChainNodeCount: 3,
      rankedLines: [{ line: 'Pricing plans help teams standardize AI workflows across support and sales.', score: 42 }],
      lowSignal: false,
      lowSignalReason: null
    }
  })

  const handler = electronMockState.ipcHandlers['system:runDiagnostics']
  assert.ok(handler, 'system:runDiagnostics handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(result.ok, true)
  assert.equal(result.data.currentContext.pageCaptureMethod, 'browser-automation')
  assert.equal(result.data.currentContext.screenCaptureMethod, 'none')
  assert.equal(result.data.captureTrace?.browser.finalPageCaptureMethod, 'browser-automation')
  assert.equal(result.data.captureTrace?.screen.shouldCaptureScreen, false)
  assert.equal(result.data.accessibilityDiagnostics?.pageUrlCandidate, 'https://example.com/pricing')
  assert.equal(result.data.accessibilityDiagnostics?.lowSignal, false)
  assert.equal(result.data.screenCaptureDecisionReason, 'strong-accessibility-context')
  assert.equal(result.data.fusionInputs.hasAccessibilityContext, true)
  assert.equal(result.data.fusionInputs.hasPageContext, true)
  assert.equal(result.data.fusionInputs.hasScreenContext, false)
})

test('system:runDiagnostics surfaces low-signal accessibility diagnostics when AX only captured browser chrome', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockCaptureCurrentContextDetailedResult({
    context: {
      activeApp: 'Dia',
      windowTitle: 'Pricing | KashinAI',
      contextKind: 'browser',
      primaryContentSource: 'none',
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'none',
      accessibilityText: null,
      accessibilityCaptureMethod: 'none',
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none',
      selectedText: null,
      selectedTextSource: 'none',
      clipboardText: null,
      timestamp: '2026-07-14T00:00:00.000Z'
    },
    captureTrace: {
      resolvedActiveApp: 'Dia',
      resolvedWindowTitle: 'Pricing | KashinAI',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'session',
        attemptedSteps: [],
        browserCaptureMethod: null,
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'none'
      },
      screen: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal',
        finalScreenCaptureMethod: 'none'
      }
    },
    accessibilityDiagnostics: {
      appName: 'Dia',
      rawAppName: 'Dia',
      workspaceAppName: 'Dia',
      topWindowOwnerName: 'Dia',
      windowTitle: 'Pricing | KashinAI',
      rawWindowTitle: 'Pricing | KashinAI',
      topWindowTitle: 'Pricing | KashinAI',
      appResolutionSource: 'helper-frontmost',
      windowTitleResolutionSource: 'window-title',
      focusedRole: 'AXWebArea',
      pageUrlCandidate: 'https://example.com/pricing',
      selectedTextPresent: false,
      selectedTextSource: 'none',
      valueTextPresent: false,
      focusChainNodeCount: 1,
      rankedLines: [
        { line: 'Pricing', score: 10 },
        { line: 'Back', score: 1 },
        { line: 'Forward', score: 1 }
      ],
      lowSignal: true,
      lowSignalReason: 'browser-chrome-only'
    }
  })

  const handler = electronMockState.ipcHandlers['system:runDiagnostics']
  assert.ok(handler, 'system:runDiagnostics handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(result.ok, true)
  assert.equal(result.data.accessibilityDiagnostics?.lowSignal, true)
  assert.equal(result.data.accessibilityDiagnostics?.lowSignalReason, 'browser-chrome-only')
  assert.equal(result.data.accessibilityDiagnostics?.pageUrlCandidate, 'https://example.com/pricing')
  assert.equal(result.data.fusionInputs.hasAccessibilityContext, false)
  assert.equal(result.data.screenCaptureDecisionReason, 'needs-screen-signal')
})

test('system:runDiagnostics returns a structured error when detailed capture fails', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockCaptureCurrentContextDetailedError(new Error('diagnostics capture failed'))

  const handler = electronMockState.ipcHandlers['system:runDiagnostics']
  assert.ok(handler, 'system:runDiagnostics handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(getFrontmostAppInfoCalls.length, 1)
  assert.equal(searchGBrainCalls.length, 0)
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'unknown', message: 'diagnostics capture failed' }
  })
})

test('system:runDiagnostics returns a structured error when resolving the frontmost app fails', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  setMockGetFrontmostAppInfoError(new Error('frontmost failed'))

  const handler = electronMockState.ipcHandlers['system:runDiagnostics']
  assert.ok(handler, 'system:runDiagnostics handler should be registered')

  const result = await handler({}, undefined)

  assert.equal(getFrontmostAppInfoCalls.length, 1)
  assert.equal(searchGBrainCalls.length, 0)
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'unknown', message: 'frontmost failed' }
  })
})

// Screen-capture permission is a macOS-only concept: getScreenCaptureStatusForPlatform short-circuits
// to 'granted' on any non-darwin host. These tests exercise the macOS code path, so they pin
// process.platform to 'darwin' to stay deterministic when run on Linux/Windows CI.
async function withDarwinPlatform(run: () => Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  try {
    await run()
  } finally {
    if (original) Object.defineProperty(process, 'platform', original)
  }
}

test('system:requestScreenCapture opens System Settings until permission is granted', async () => {
  await withDarwinPlatform(async () => {
    const { registerIpcHandlers } = await importIpc()
    registerIpcHandlers()

    electronMockState.screenCaptureStatus = 'denied'
    const handler = electronMockState.ipcHandlers['system:requestScreenCapture']
    assert.ok(handler, 'system:requestScreenCapture handler should be registered')

    const result = await handler({}, undefined)

    assert.equal(electronMockState.desktopSourcesCalls, 1)
    assert.equal(result, 'denied')
    assert.deepEqual(electronMockState.shellOpenExternalCalls, [
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    ])
  })
})

test('system:requestScreenCapture avoids reopening System Settings once permission is already granted', async () => {
  await withDarwinPlatform(async () => {
    const { registerIpcHandlers } = await importIpc()
    registerIpcHandlers()

    electronMockState.screenCaptureStatus = 'granted'
    const handler = electronMockState.ipcHandlers['system:requestScreenCapture']
    assert.ok(handler, 'system:requestScreenCapture handler should be registered')

    const result = await handler({}, undefined)

    assert.equal(electronMockState.desktopSourcesCalls, 1)
    assert.equal(result, 'granted')
    assert.deepEqual(electronMockState.shellOpenExternalCalls, [])
  })
})

test('window:getState reports the current collapsed state and registered shortcut', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['window:getState']
  assert.ok(handler, 'window:getState handler should be registered')

  const result = await handler({}, undefined)

  assert.deepEqual(result, { collapsed: false, registeredShortcut: mockRegisteredShortcut })
})

test('settings:set updates the shortcut when registration succeeds', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  const handler = electronMockState.ipcHandlers['settings:set']
  assert.ok(handler, 'settings:set handler should be registered')

  const result = await handler({}, { shortcut: 'Option+[' })

  assert.equal(updateSettingsCalls.length, 1)
  assert.deepEqual(updateSettingsCalls[0], { shortcut: 'Option+[' })
  assert.deepEqual(updateRegisteredShortcutCalls, ['Option+['])
  assert.equal(result.shortcut, 'Option+Space')
})

test('settings:set rolls back persisted settings when shortcut registration fails', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  updateRegisteredShortcutResults.push(false, true)

  const handler = electronMockState.ipcHandlers['settings:set']
  assert.ok(handler, 'settings:set handler should be registered')

  await handler({}, { shortcut: 'Option+[' })

  assert.deepEqual(updateRegisteredShortcutCalls, ['Option+[', 'Option+Space'])
  assert.deepEqual(updateSettingsCalls.slice(-1)[0], { shortcut: 'Option+Space' })
})

test('settings:set returns public settings after rollback even when restoring the OS shortcut registration also fails', async () => {
  const { registerIpcHandlers } = await importIpc()
  registerIpcHandlers()

  updateRegisteredShortcutResults.push(false, false)
  const handler = electronMockState.ipcHandlers['settings:set']
  assert.ok(handler, 'settings:set handler should be registered')

  const result = await handler({}, { shortcut: 'Option+[' })

  assert.deepEqual(updateRegisteredShortcutCalls, ['Option+[', 'Option+Space'])
  assert.equal(mockRegisteredShortcut, 'Option+Space')
  assert.equal(result.shortcut, 'Option+Space')
})
