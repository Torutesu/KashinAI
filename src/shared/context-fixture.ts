import type { ActionType, CurrentContext } from './types'
import { buildBrowserCaptureSummary } from './browser-capture-summary.ts'
import { resolveScreenCaptureDecisionReason } from '../main/context-reader-utils.ts'

export type CaptureTraceFixture = {
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
    sourceSelection: {
      fallbackReason:
        | 'matched-window'
        | 'screen-fallback-no-window-match'
        | 'screen-fallback-no-window-candidates'
        | 'screen-fallback-no-viable-window-thumbnails'
        | 'no-viable-sources'
      preferredCaptureMode: 'desktop-source' | 'native-screen'
    } | null
  }
}

export type ContextFixtureExpectation = {
  userInstruction: string
  actionType: ActionType
  linkedAccessibilityFixture?: string | null
  expectContext: Partial<
    Pick<
      CurrentContext,
      | 'contextKind'
      | 'primaryContentSource'
      | 'pageCaptureMethod'
      | 'screenCaptureMethod'
      | 'selectedTextSource'
      | 'selectedText'
    >
  >
  digestIncludes: string[]
  digestExcludes: string[]
  searchQueryIncludes: string[]
  searchQueryExcludes: string[]
}

export type BrowserCaptureSummaryFixture = NonNullable<
  import('./types').BackendDiagnostics['browserCaptureSummary']
>

export type AccessibilityDiagnosticsFixture = NonNullable<
  import('./types').BackendDiagnostics['accessibilityDiagnostics']
>

export function parseJsonCommandOutput<T = unknown>(rawOutput: string, sourceLabel = 'command output'): T {
  const trimmed = rawOutput.trim()
  if (!trimmed) {
    throw new Error(`No JSON output was returned from ${sourceLabel}`)
  }

  const direct = tryParseJson<T>(trimmed)
  if (direct.ok) {
    return direct.value
  }

  const candidateIndexes: number[] = []
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index]
    if (char === '{' || char === '[') candidateIndexes.push(index)
  }

  for (let index = candidateIndexes.length - 1; index >= 0; index -= 1) {
    const candidate = trimmed.slice(candidateIndexes[index] ?? 0).trim()
    const parsed = tryParseJson<T>(candidate)
    if (parsed.ok) {
      return parsed.value
    }
  }

  const preview = trimmed.slice(0, 240).replace(/\s+/g, ' ')
  throw new Error(`Failed to parse JSON from ${sourceLabel}. Output preview: ${preview}`)
}

function tryParseJson<T>(value: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) as T }
  } catch {
    return { ok: false }
  }
}

export function isSavedContextFixtureJsonFile(name: string): boolean {
  return (
    name.endsWith('.json') &&
    !name.endsWith('.expected.json') &&
    !name.endsWith('.trace.json') &&
    !name.endsWith('.summary.json') &&
    !name.endsWith('.diagnostics.json')
  )
}

export function assertExpectedCaptureMethods(params: {
  context: CurrentContext
  expectedPageCaptureMethod?: CurrentContext['pageCaptureMethod'] | null
  expectedScreenCaptureMethod?: CurrentContext['screenCaptureMethod'] | null
}): void {
  if (params.expectedPageCaptureMethod && params.context.pageCaptureMethod !== params.expectedPageCaptureMethod) {
    throw new Error(
      `Expected pageCaptureMethod=${params.expectedPageCaptureMethod}, got ${params.context.pageCaptureMethod}`
    )
  }

  if (
    params.expectedScreenCaptureMethod &&
    params.context.screenCaptureMethod !== params.expectedScreenCaptureMethod
  ) {
    throw new Error(
      `Expected screenCaptureMethod=${params.expectedScreenCaptureMethod}, got ${params.context.screenCaptureMethod}`
    )
  }
}

export function describeExpectedCaptureMethodMismatch(params: {
  context: CurrentContext
  expectedPageCaptureMethod?: CurrentContext['pageCaptureMethod'] | null
  expectedScreenCaptureMethod?: CurrentContext['screenCaptureMethod'] | null
}): string[] {
  const hints: string[] = []
  const actualPageMethod = params.context.pageCaptureMethod
  const actualScreenMethod = params.context.screenCaptureMethod
  const expectedPageMethod = params.expectedPageCaptureMethod ?? null
  const expectedScreenMethod = params.expectedScreenCaptureMethod ?? null

  if (expectedPageMethod === 'keyboard-copy' && actualPageMethod !== 'keyboard-copy') {
    hints.push(
      'For keyboard-copy proof, force deeper browser fallback with TARGET_URL="https://example.com/" FORCE_BROWSER_CAPTURE="1" SUPPRESS_ACCESSIBILITY_PAGE_TEXT="1" SUPPRESS_BROWSER_PAGE_TEXT="1".'
    )
  }

  if (expectedPageMethod === 'chrome-session' && actualPageMethod !== 'chrome-session') {
    hints.push(
      'For chrome-session proof, also suppress keyboard recovery with SUPPRESS_KEYBOARD_PAGE_TEXT="1" after forcing browser capture.'
    )
  }

  if (
    expectedScreenMethod === 'screen-ocr' &&
    actualScreenMethod !== 'screen-ocr'
  ) {
    hints.push(
      'For screen-ocr proof, use FORCE_NATIVE_SCREEN_CAPTURE="1" so whole-screen capture wins instead of a matching window thumbnail.'
    )
  }

  if (
    expectedScreenMethod === 'screen-screenshot-only' &&
    actualScreenMethod !== 'screen-screenshot-only'
  ) {
    hints.push(
      'For screen-screenshot-only proof, use FORCE_SCREEN_CAPTURE="1" FORCE_NATIVE_SCREEN_CAPTURE="1" SUPPRESS_SCREEN_OCR="1".'
    )
  }

  if (
    expectedScreenMethod === 'window-screenshot-only' &&
    actualScreenMethod !== 'window-screenshot-only'
  ) {
    hints.push(
      'For window-screenshot-only proof, use FORCE_SCREEN_CAPTURE="1" SUPPRESS_SCREEN_OCR="1" and keep native-screen forcing off.'
    )
  }

  return hints
}

export function assertExpectedCaptureTrace(params: {
  captureTrace: import('./types').BackendDiagnostics['captureTrace'] | CaptureTraceFixture | null | undefined
  expectedAttemptedBrowserSteps?: Array<'browser' | 'keyboard' | 'session'> | null
  expectedInitialBrowserStep?: CaptureTraceFixture['browser']['initialNextStep'] | null
  expectedAfterBrowserStep?: CaptureTraceFixture['browser']['afterBrowserNextStep'] | null
  expectedAfterKeyboardStep?: CaptureTraceFixture['browser']['afterKeyboardNextStep'] | null
}): void {
  const trace = params.captureTrace
  if (!trace) {
    if (
      params.expectedAttemptedBrowserSteps?.length ||
      params.expectedInitialBrowserStep ||
      params.expectedAfterBrowserStep ||
      params.expectedAfterKeyboardStep
    ) {
      throw new Error('Expected captureTrace to be present, but it was missing')
    }
    return
  }

  if (params.expectedAttemptedBrowserSteps) {
    const actual = trace.browser.attemptedSteps
    const expected = params.expectedAttemptedBrowserSteps
    if (actual.length !== expected.length || actual.some((step, index) => step !== expected[index])) {
      throw new Error(
        `Expected attempted browser steps=${expected.join(' -> ') || 'none'}, got ${actual.join(' -> ') || 'none'}`
      )
    }
  }

  if (params.expectedInitialBrowserStep && trace.browser.initialNextStep !== params.expectedInitialBrowserStep) {
    throw new Error(
      `Expected initial browser step=${params.expectedInitialBrowserStep}, got ${trace.browser.initialNextStep}`
    )
  }

  if (params.expectedAfterBrowserStep && trace.browser.afterBrowserNextStep !== params.expectedAfterBrowserStep) {
    throw new Error(
      `Expected after-browser step=${params.expectedAfterBrowserStep}, got ${trace.browser.afterBrowserNextStep}`
    )
  }

  if (params.expectedAfterKeyboardStep && trace.browser.afterKeyboardNextStep !== params.expectedAfterKeyboardStep) {
    throw new Error(
      `Expected after-keyboard step=${params.expectedAfterKeyboardStep}, got ${trace.browser.afterKeyboardNextStep}`
    )
  }
}

export function redactCurrentContextForFixture(context: CurrentContext): CurrentContext {
  return {
    ...context,
    screenshotPath: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }
}

export function redactCaptureTraceForFixture(
  captureTrace: import('./types').BackendDiagnostics['captureTrace'] | null | undefined
): CaptureTraceFixture | null {
  if (!captureTrace) return null

  return {
    resolvedActiveApp: captureTrace.resolvedActiveApp,
    resolvedWindowTitle: captureTrace.resolvedWindowTitle,
    canSkipBrowserCapture: captureTrace.canSkipBrowserCapture,
    canSkipOcr: captureTrace.canSkipOcr,
    browser: {
      initialNextStep: captureTrace.browser.initialNextStep,
      afterBrowserNextStep: captureTrace.browser.afterBrowserNextStep,
      afterKeyboardNextStep: captureTrace.browser.afterKeyboardNextStep,
      attemptedSteps: [...captureTrace.browser.attemptedSteps],
      browserCaptureMethod: captureTrace.browser.browserCaptureMethod,
      keyboardCaptureMethod: captureTrace.browser.keyboardCaptureMethod,
      sessionCaptureMethod: captureTrace.browser.sessionCaptureMethod,
      finalPageCaptureMethod: captureTrace.browser.finalPageCaptureMethod
    },
    screen: {
      shouldCaptureScreen: captureTrace.screen.shouldCaptureScreen,
      reason: captureTrace.screen.reason,
      finalScreenCaptureMethod: captureTrace.screen.finalScreenCaptureMethod,
      sourceSelection: captureTrace.screen.sourceSelection ?? null
    }
  }
}

function normalizeCaptureTraceFixture(
  captureTrace: import('./types').BackendDiagnostics['captureTrace'] | CaptureTraceFixture | null | undefined
): CaptureTraceFixture | null | undefined {
  if (captureTrace === undefined) return undefined
  if (captureTrace === null) return null

  return {
    resolvedActiveApp: captureTrace.resolvedActiveApp,
    resolvedWindowTitle: captureTrace.resolvedWindowTitle,
    canSkipBrowserCapture: captureTrace.canSkipBrowserCapture,
    canSkipOcr: captureTrace.canSkipOcr,
    browser: {
      initialNextStep: captureTrace.browser.initialNextStep,
      afterBrowserNextStep: captureTrace.browser.afterBrowserNextStep,
      afterKeyboardNextStep: captureTrace.browser.afterKeyboardNextStep,
      attemptedSteps: [...captureTrace.browser.attemptedSteps],
      browserCaptureMethod: captureTrace.browser.browserCaptureMethod,
      keyboardCaptureMethod: captureTrace.browser.keyboardCaptureMethod,
      sessionCaptureMethod: captureTrace.browser.sessionCaptureMethod,
      finalPageCaptureMethod: captureTrace.browser.finalPageCaptureMethod
    },
    screen: {
      shouldCaptureScreen: captureTrace.screen.shouldCaptureScreen,
      reason: captureTrace.screen.reason,
      finalScreenCaptureMethod: captureTrace.screen.finalScreenCaptureMethod,
      sourceSelection: captureTrace.screen.sourceSelection ?? null
    }
  }
}

export function redactBrowserCaptureSummaryForFixture(
  summary: import('./types').BackendDiagnostics['browserCaptureSummary'] | null | undefined
): BrowserCaptureSummaryFixture | null {
  if (!summary) return null

  return {
    finalPageCaptureMethod: summary.finalPageCaptureMethod,
    finalPrimarySource: summary.finalPrimarySource,
    path: summary.path,
    pageTitlePresent: summary.pageTitlePresent,
    pageUrlPresent: summary.pageUrlPresent,
    pageTextLength: summary.pageTextLength,
    accessibilityTextLength: summary.accessibilityTextLength,
    selectedTextLength: summary.selectedTextLength,
    usedBrowserAutomation: summary.usedBrowserAutomation,
    usedKeyboardFallback: summary.usedKeyboardFallback,
    usedSessionFallback: summary.usedSessionFallback,
    skippedBrowserCapture: summary.skippedBrowserCapture,
    lastAttemptedStep: summary.lastAttemptedStep,
    nextPlannedStep: summary.nextPlannedStep,
    stalledAtStep: summary.stalledAtStep
  }
}

export function redactAccessibilityDiagnosticsForFixture(
  diagnostics: import('./types').BackendDiagnostics['accessibilityDiagnostics'] | null | undefined
): AccessibilityDiagnosticsFixture | null {
  if (!diagnostics) return null

  return {
    appName: diagnostics.appName,
    rawAppName: diagnostics.rawAppName,
    workspaceAppName: diagnostics.workspaceAppName,
    topWindowOwnerName: diagnostics.topWindowOwnerName,
    windowTitle: diagnostics.windowTitle,
    rawWindowTitle: diagnostics.rawWindowTitle,
    topWindowTitle: diagnostics.topWindowTitle,
    appResolutionSource: diagnostics.appResolutionSource,
    windowTitleResolutionSource: diagnostics.windowTitleResolutionSource,
    focusedRole: diagnostics.focusedRole,
    pageUrlCandidate: diagnostics.pageUrlCandidate,
    selectedTextPresent: diagnostics.selectedTextPresent,
    selectedTextSource: diagnostics.selectedTextSource,
    valueTextPresent: diagnostics.valueTextPresent,
    focusChainNodeCount: diagnostics.focusChainNodeCount,
    rankedLines: diagnostics.rankedLines.map((entry) => ({
      line: entry.line,
      score: entry.score
    })),
    lowSignal: diagnostics.lowSignal,
    lowSignalReason: diagnostics.lowSignalReason
  }
}

export function buildContextFixtureExpectationTemplate(params: {
  context: CurrentContext
  userInstruction: string
  actionType: ActionType
  digest: string
  linkedAccessibilityFixture?: string | null
}): ContextFixtureExpectation {
  const digestLines = params.digest
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return {
    userInstruction: params.userInstruction,
    actionType: params.actionType,
    linkedAccessibilityFixture: params.linkedAccessibilityFixture ?? null,
    expectContext: {
      contextKind: params.context.contextKind,
      primaryContentSource: params.context.primaryContentSource,
      pageCaptureMethod: params.context.pageCaptureMethod,
      screenCaptureMethod: params.context.screenCaptureMethod,
      selectedTextSource: params.context.selectedTextSource,
      selectedText: params.context.selectedText
    },
    digestIncludes: digestLines.slice(0, 2),
    digestExcludes: [],
    searchQueryIncludes: [],
    searchQueryExcludes: []
  }
}

export function assertContextFixtureTraceIntegrity(params: {
  context: CurrentContext
  captureTrace: CaptureTraceFixture | null | undefined
  requireTraceForDerivedCapture?: boolean
}): void {
  const { context, captureTrace } = params

  if (context.primaryContentSource === 'screen-ocr') {
    if (context.screenCaptureMethod !== 'window-ocr' && context.screenCaptureMethod !== 'screen-ocr') {
      throw new Error(
        `Context uses primaryContentSource=screen-ocr but screenCaptureMethod=${context.screenCaptureMethod}`
      )
    }
    if (!context.screenText) {
      throw new Error('Context uses primaryContentSource=screen-ocr but screenText is empty')
    }
  }

  if (
    (context.screenCaptureMethod === 'window-ocr' || context.screenCaptureMethod === 'screen-ocr') &&
    !context.screenText
  ) {
    throw new Error(
      `Context uses screenCaptureMethod=${context.screenCaptureMethod} but screenText is empty`
    )
  }

  if (
    (context.screenCaptureMethod === 'window-screenshot-only' ||
      context.screenCaptureMethod === 'screen-screenshot-only' ||
      context.screenCaptureMethod === 'none') &&
    context.screenText
  ) {
    throw new Error(
      `Context uses screenCaptureMethod=${context.screenCaptureMethod} but screenText is unexpectedly present`
    )
  }

  if (
    context.pageCaptureMethod === 'accessibility' &&
    !context.pageUrl &&
    !context.pageText
  ) {
    throw new Error(
      'Context uses pageCaptureMethod=accessibility without pageUrl or pageText, which is inconsistent with accessibility page capture semantics'
    )
  }

  if (!captureTrace) {
    const requiresTrace =
      context.pageCaptureMethod === 'browser-automation' ||
      context.pageCaptureMethod === 'keyboard-copy' ||
      context.pageCaptureMethod === 'chrome-session' ||
      context.screenCaptureMethod === 'window-ocr' ||
      context.screenCaptureMethod === 'screen-ocr' ||
      context.screenCaptureMethod === 'window-screenshot-only' ||
      context.screenCaptureMethod === 'screen-screenshot-only'

    if (params.requireTraceForDerivedCapture && requiresTrace) {
      throw new Error(
        `Live fixture uses pageCaptureMethod=${context.pageCaptureMethod} and screenCaptureMethod=${context.screenCaptureMethod}, so captureTrace is required`
      )
    }

    return
  }

  if (captureTrace.browser.finalPageCaptureMethod !== context.pageCaptureMethod) {
    throw new Error(
      `Capture trace finalPageCaptureMethod=${captureTrace.browser.finalPageCaptureMethod} does not match context.pageCaptureMethod=${context.pageCaptureMethod}`
    )
  }

  if (captureTrace.screen.finalScreenCaptureMethod !== context.screenCaptureMethod) {
    throw new Error(
      `Capture trace finalScreenCaptureMethod=${captureTrace.screen.finalScreenCaptureMethod} does not match context.screenCaptureMethod=${context.screenCaptureMethod}`
    )
  }

  if (captureTrace.screen.shouldCaptureScreen && context.screenCaptureMethod === 'none') {
    throw new Error('Capture trace says screen capture ran, but context.screenCaptureMethod=none')
  }

  if (!captureTrace.screen.shouldCaptureScreen && context.screenCaptureMethod !== 'none') {
    throw new Error(
      `Capture trace says screen capture was skipped, but context.screenCaptureMethod=${context.screenCaptureMethod}`
    )
  }

  if (captureTrace.screen.shouldCaptureScreen && captureTrace.screen.reason !== 'needs-screen-signal') {
    throw new Error(
      `Capture trace says screen capture ran, but screen.reason=${captureTrace.screen.reason}`
    )
  }

  if (!captureTrace.screen.shouldCaptureScreen && captureTrace.screen.reason !== 'strong-accessibility-context') {
    throw new Error(
      `Capture trace says screen capture was skipped, but screen.reason=${captureTrace.screen.reason}`
    )
  }

  const derivedScreenReason = resolveScreenCaptureDecisionReason({
    accessibilityText: context.accessibilityText,
    pageContext: {
      pageTitle: context.pageTitle,
      pageUrl: context.pageUrl,
      pageText: context.pageText
    }
  })

  if (captureTrace.screen.reason !== derivedScreenReason) {
    throw new Error(
      `Capture trace screen.reason=${captureTrace.screen.reason} does not match derived screen reason=${derivedScreenReason}`
    )
  }

  const sourceSelection = captureTrace.screen.sourceSelection
  if (sourceSelection?.preferredCaptureMode === 'native-screen') {
    if (
      context.screenCaptureMethod !== 'screen-ocr' &&
      context.screenCaptureMethod !== 'screen-screenshot-only'
    ) {
      throw new Error(
        `Capture trace screen.sourceSelection.preferredCaptureMode=native-screen is inconsistent with context.screenCaptureMethod=${context.screenCaptureMethod}`
      )
    }
  }

  if (sourceSelection?.fallbackReason === 'matched-window') {
    if (
      context.screenCaptureMethod !== 'window-ocr' &&
      context.screenCaptureMethod !== 'window-screenshot-only'
    ) {
      throw new Error(
        `Capture trace screen.sourceSelection.fallbackReason=matched-window is inconsistent with context.screenCaptureMethod=${context.screenCaptureMethod}`
      )
    }
  }

  const attemptedStepSet = new Set(captureTrace.browser.attemptedSteps)
  if (
    captureTrace.browser.browserCaptureMethod &&
    captureTrace.browser.browserCaptureMethod !== 'none' &&
    !attemptedStepSet.has('browser')
  ) {
    throw new Error('Capture trace has browserCaptureMethod but attemptedSteps is missing "browser"')
  }

  if (
    captureTrace.browser.keyboardCaptureMethod &&
    captureTrace.browser.keyboardCaptureMethod !== 'none' &&
    !attemptedStepSet.has('keyboard')
  ) {
    throw new Error('Capture trace has keyboardCaptureMethod but attemptedSteps is missing "keyboard"')
  }

  if (
    captureTrace.browser.sessionCaptureMethod &&
    captureTrace.browser.sessionCaptureMethod !== 'none' &&
    !attemptedStepSet.has('session')
  ) {
    throw new Error('Capture trace has sessionCaptureMethod but attemptedSteps is missing "session"')
  }
}

export function assertBrowserCaptureSummaryIntegrity(params: {
  context: CurrentContext
  captureTrace?: import('./types').BackendDiagnostics['captureTrace'] | CaptureTraceFixture | null | undefined
  browserCaptureSummary: BrowserCaptureSummaryFixture | null | undefined
}): void {
  const { context, captureTrace, browserCaptureSummary } = params
  if (!browserCaptureSummary) return

  const expected = buildBrowserCaptureSummary({
    currentContext: context,
    captureTrace: captureTrace ?? undefined
  })

  const mismatches: string[] = []
  for (const key of Object.keys(expected) as Array<keyof BrowserCaptureSummaryFixture>) {
    if (browserCaptureSummary[key] !== expected[key]) {
      mismatches.push(
        `${String(key)} expected=${JSON.stringify(expected[key])} actual=${JSON.stringify(browserCaptureSummary[key])}`
      )
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Browser capture summary does not match derived diagnostics: ${mismatches.join('; ')}`)
  }
}

export function assertAccessibilityDiagnosticsFixtureIntegrity(params: {
  context: CurrentContext
  accessibilityDiagnostics?: AccessibilityDiagnosticsFixture | null | undefined
}): void {
  const diagnostics = params.accessibilityDiagnostics
  if (!diagnostics) return

  if (diagnostics.selectedTextPresent !== Boolean(params.context.selectedText)) {
    throw new Error(
      `Accessibility diagnostics selectedTextPresent=${diagnostics.selectedTextPresent} does not match context.selectedText presence=${Boolean(params.context.selectedText)}`
    )
  }

  if (!diagnostics.lowSignal && diagnostics.lowSignalReason !== null) {
    throw new Error(
      `Accessibility diagnostics says lowSignal=false, but lowSignalReason=${diagnostics.lowSignalReason}`
    )
  }

  if (diagnostics.lowSignal && diagnostics.lowSignalReason === null) {
    throw new Error('Accessibility diagnostics says lowSignal=true, but lowSignalReason is missing')
  }
}

export function assertLiveFixtureCaptureIntegrity(params: {
  context: CurrentContext
  captureTrace?: import('./types').BackendDiagnostics['captureTrace'] | CaptureTraceFixture | null | undefined
  browserCaptureSummary?: BrowserCaptureSummaryFixture | null | undefined
  accessibilityDiagnostics?: AccessibilityDiagnosticsFixture | null | undefined
}): void {
  const normalizedCaptureTrace = normalizeCaptureTraceFixture(params.captureTrace)

  assertContextFixtureTraceIntegrity({
    context: params.context,
    captureTrace: normalizedCaptureTrace,
    requireTraceForDerivedCapture: true
  })
  assertBrowserCaptureSummaryIntegrity({
    context: params.context,
    captureTrace: params.captureTrace,
    browserCaptureSummary: params.browserCaptureSummary
  })
  assertAccessibilityDiagnosticsFixtureIntegrity({
    context: params.context,
    accessibilityDiagnostics: params.accessibilityDiagnostics
  })
}
