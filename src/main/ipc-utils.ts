import type {
  BackendDiagnostics,
  ChatRequest,
  ChatResult,
  ContextSource,
  CurrentContext,
  GenerateRequest,
  RetrievedContext
} from '../shared/types.ts'
import {
  buildBrowserCaptureSummary,
  resolveBrowserCaptureSummaryPath,
  resolveBrowserCaptureSummaryStepState,
  type BrowserCaptureSummaryNextStep,
  type BrowserCaptureSummaryPath,
  type BrowserCaptureSummaryStep,
  type BrowserCaptureSummaryStepState
} from '../shared/browser-capture-summary.ts'
import { compactLiveContext } from '../shared/live-context.ts'
import { resolveScreenCaptureDecisionReason as resolveContextScreenCaptureDecisionReason } from './context-reader-utils.ts'

export type GBrainLookupResultLike = {
  contextSource: ContextSource
  results: RetrievedContext[]
  trace?: import('../shared/types').GBrainTrace
}

export type AssistantMemoryPlan = {
  suppressMemory: boolean
  shouldUseInlineFallback: boolean
  reason: 'normal' | 'inline-recommendation'
}

export type GenerateRequestPlan = {
  canProceed: boolean
  memoryPlan: AssistantMemoryPlan
  error?: {
    code: 'no_selection'
    message: string
  }
}

export type ChatRequestPlan = {
  canProceed: boolean
  latestMessage: string
  memoryPlan: AssistantMemoryPlan
  shouldUseInlineFallback: boolean
  error?: {
    code: 'no_selection'
    message: string
  }
}

export type GBrainResolution = {
  results: RetrievedContext[]
  contextSource: ContextSource
  hasUsableContext: boolean
  providerReady: boolean
}

export type AssistantExecutionMode = 'inline-fallback' | 'llm' | 'retrieval-only'

export type GenerateExecutionPlan = {
  shouldSearchGBrain: boolean
  executionMode: Exclude<AssistantExecutionMode, 'inline-fallback'>
}

export type ChatExecutionPlan = {
  shouldSearchGBrain: boolean
  executionMode: AssistantExecutionMode
}

export type ShortcutUpdateResolutionInput = {
  requestedShortcut: string | undefined
  previousShortcut: string
  swapped: boolean
  restored: boolean
  registeredShortcutAfterRestore: string | null
}

export type ShortcutUpdateResolution = {
  shouldAttemptShortcutSwap: boolean
  shouldRollbackSettings: boolean
  shouldReturnEarly: boolean
}

export type ShortcutUpdateAttemptPlan = {
  shouldAttemptShortcutSwap: boolean
  requestedShortcut: string | null
  rollbackShortcut: string | null
}

export type ShortcutUpdateFlowResolutionInput = {
  requestedShortcut: string | undefined
  previousShortcut: string
  swapped: boolean
  restored: boolean
  registeredShortcutAfterRestore: string | null
}

export type ShortcutUpdateFlowResolution = {
  attemptPlan: ShortcutUpdateAttemptPlan
  resolution: ShortcutUpdateResolution
}

export type ScreenCaptureDecisionReason = NonNullable<BackendDiagnostics['screenCaptureDecisionReason']>
export type ScreenCapturePermissionRequestResolution = {
  shouldOpenSystemSettings: boolean
}
export type DiagnosticsSearchPlan = {
  actionType: 'custom'
  userInstruction: string
}
export type DiagnosticsSearchQueryPlan = DiagnosticsSearchPlan & {
  shouldBuildSearchQuery: boolean
}
export type DiagnosticsExecutionPlan = {
  searchPlan: DiagnosticsSearchPlan
  shouldSearchGBrain: boolean
}
export type DiagnosticsRequestPlan = DiagnosticsExecutionPlan & {
  searchQueryPlan: DiagnosticsSearchQueryPlan
}
export type DiagnosticsSearchExecutionPlan = DiagnosticsRequestPlan & {
  normalizedSearchQuery: string
  shouldLookupGBrain: boolean
  reason: 'lookup' | 'no-visible-context' | 'blank-search-query'
}
export type DiagnosticsRuntimeState = {
  gbrainState: GBrainResolution
  fusionState: ReturnType<typeof buildFusionInputs>
  screenCaptureDecisionReason: ScreenCaptureDecisionReason
  browserCaptureSummary: ReturnType<typeof buildBrowserCaptureSummary>
}
export type RetrievalOnlyInlineAnswerPlan = {
  pageLabel: string
  visibleHint: string
  shouldUseSocialFallback: boolean
  shouldUseCodingFallback: boolean
  shouldReferenceTopSource: boolean
  gbrainHint: string | null
}

export function getScreenCaptureStatusForPlatform(params: {
  platform: NodeJS.Platform
  mediaAccessStatus: BackendDiagnostics['screenCaptureStatus']
}): BackendDiagnostics['screenCaptureStatus'] {
  if (params.platform !== 'darwin') return 'granted'
  return params.mediaAccessStatus
}

export function resolveScreenCapturePermissionRequest(
  status: BackendDiagnostics['screenCaptureStatus']
): ScreenCapturePermissionRequestResolution {
  return {
    shouldOpenSystemSettings: status !== 'granted'
  }
}

export function resolveDiagnosticsSearchPlan(): DiagnosticsSearchPlan {
  return {
    actionType: 'custom',
    userInstruction: 'この文脈を確認したい'
  }
}

export function resolveDiagnosticsExecutionPlan(
  currentContext: Pick<CurrentContext, 'selectedText' | 'pageText' | 'pageUrl' | 'accessibilityText' | 'screenText'>
): DiagnosticsExecutionPlan {
  return {
    searchPlan: resolveDiagnosticsSearchPlan(),
    shouldSearchGBrain: hasVisibleCurrentContextSignal(currentContext)
  }
}

export function resolveDiagnosticsRequestPlan(
  currentContext: Pick<CurrentContext, 'selectedText' | 'pageText' | 'pageUrl' | 'accessibilityText' | 'screenText'>
): DiagnosticsRequestPlan {
  const executionPlan = resolveDiagnosticsExecutionPlan(currentContext)

  return {
    ...executionPlan,
    searchQueryPlan: {
      ...executionPlan.searchPlan,
      shouldBuildSearchQuery: executionPlan.shouldSearchGBrain
    }
  }
}

export function resolveDiagnosticsSearchExecutionPlan(params: {
  currentContext: Pick<CurrentContext, 'selectedText' | 'pageText' | 'pageUrl' | 'accessibilityText' | 'screenText'>
  searchQuery: string | null | undefined
}): DiagnosticsSearchExecutionPlan {
  const requestPlan = resolveDiagnosticsRequestPlan(params.currentContext)
  const normalizedSearchQuery = (params.searchQuery ?? '').trim()
  const shouldLookupGBrain = requestPlan.shouldSearchGBrain && normalizedSearchQuery.length > 0

  return {
    ...requestPlan,
    normalizedSearchQuery,
    shouldLookupGBrain,
    reason: !requestPlan.shouldSearchGBrain
      ? 'no-visible-context'
      : normalizedSearchQuery.length > 0
        ? 'lookup'
        : 'blank-search-query'
  }
}

export function resolveRetrievalOnlyInlineAnswerPlan(params: {
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
  accessibilityText: string | null
  screenText: string | null
  contextKind: ChatRequest['currentContext']['contextKind']
  topSourceTitle?: string | null
}): RetrievalOnlyInlineAnswerPlan {
  const pageLabel = params.pageTitle || params.pageUrl || 'いま開いている画面'
  const visibleContext = params.accessibilityText || params.screenText || params.pageText
  const visibleHint = visibleContext
    ? visibleContext.replace(/\s+/g, ' ').trim().slice(0, 90)
    : pageLabel

  return {
    pageLabel,
    visibleHint,
    shouldUseSocialFallback: params.contextKind === 'social',
    shouldUseCodingFallback: params.contextKind === 'coding',
    shouldReferenceTopSource: Boolean(params.topSourceTitle) && params.contextKind !== 'social' && params.contextKind !== 'coding',
    gbrainHint: params.topSourceTitle ? `GBrainの「${params.topSourceTitle}」` : null
  }
}

export function wantsInlineRecommendation(message: string): boolean {
  return /おすすめ文|recommended|ready-to-send|貼り付けて使える/i.test(message)
}

export function shouldSuppressMemoryForInlineRecommendation(
  context: ChatRequest['currentContext'],
  message: string
): boolean {
  return wantsInlineRecommendation(message) && (context.contextKind === 'social' || context.contextKind === 'coding')
}

export function resolveAssistantMemoryPlan(params: {
  mode: 'generate' | 'chat'
  context: ChatRequest['currentContext']
  message: string
}): AssistantMemoryPlan {
  const suppressMemory = shouldSuppressMemoryForInlineRecommendation(params.context, params.message)
  return {
    suppressMemory,
    shouldUseInlineFallback: params.mode === 'chat' && suppressMemory,
    reason: suppressMemory ? 'inline-recommendation' : 'normal'
  }
}

export function hasUsableCurrentContextSignal(
  context: Pick<
    CurrentContext,
    'selectedText' | 'clipboardText' | 'pageText' | 'pageUrl' | 'accessibilityText' | 'screenText'
  >
): boolean {
  return Boolean(
    context.selectedText ||
      context.clipboardText ||
      context.pageText ||
      context.pageUrl ||
      context.accessibilityText ||
      context.screenText
  )
}

export function hasVisibleCurrentContextSignal(
  context: Pick<CurrentContext, 'selectedText' | 'pageText' | 'pageUrl' | 'accessibilityText' | 'screenText'>
): boolean {
  return Boolean(
    context.selectedText || context.pageText || context.pageUrl || context.accessibilityText || context.screenText
  )
}

export function hasGenerateInput(request: Pick<GenerateRequest, 'currentContext' | 'userInstruction'>): boolean {
  return Boolean(request.userInstruction || hasUsableCurrentContextSignal(request.currentContext))
}

export function latestUserMessage(messages: ChatRequest['messages']): string {
  return [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
}

export function hasChatInput(request: Pick<ChatRequest, 'currentContext' | 'messages'>): boolean {
  const latestMessage = latestUserMessage(request.messages)
  return Boolean(latestMessage || hasUsableCurrentContextSignal(request.currentContext))
}

export function resolveGenerateRequestPlan(
  request: Pick<GenerateRequest, 'currentContext' | 'userInstruction'>
): GenerateRequestPlan {
  const memoryPlan = resolveAssistantMemoryPlan({
    mode: 'generate',
    context: request.currentContext,
    message: request.userInstruction
  })

  if (!hasGenerateInput(request)) {
    return {
      canProceed: false,
      memoryPlan,
      error: {
        code: 'no_selection',
        message:
          'No text selected and clipboard is empty. Select some text and try again, or type a custom instruction.'
      }
    }
  }

  return {
    canProceed: true,
    memoryPlan
  }
}

export function resolveGenerateExecutionPlan(params: {
  requestPlan: GenerateRequestPlan
  hasApiKey: boolean
}): GenerateExecutionPlan {
  return {
    shouldSearchGBrain: !params.requestPlan.memoryPlan.suppressMemory,
    executionMode: params.hasApiKey ? 'llm' : 'retrieval-only'
  }
}

export function resolveChatRequestPlan(request: Pick<ChatRequest, 'currentContext' | 'messages'>): ChatRequestPlan {
  const latestMessage = latestUserMessage(request.messages)
  const memoryPlan = resolveAssistantMemoryPlan({
    mode: 'chat',
    context: request.currentContext,
    message: latestMessage
  })

  if (!hasChatInput(request)) {
    return {
      canProceed: false,
      latestMessage,
      memoryPlan,
      shouldUseInlineFallback: false,
      error: {
        code: 'no_selection',
        message: 'No chat message or page context was captured. Open a page, select text, or type a message.'
      }
    }
  }

  return {
    canProceed: true,
    latestMessage,
    memoryPlan,
    shouldUseInlineFallback: memoryPlan.shouldUseInlineFallback
  }
}

export function resolveChatExecutionPlan(params: {
  requestPlan: ChatRequestPlan
  hasApiKey: boolean
}): ChatExecutionPlan {
  if (params.requestPlan.shouldUseInlineFallback) {
    return {
      shouldSearchGBrain: false,
      executionMode: 'inline-fallback'
    }
  }

  return {
    shouldSearchGBrain: true,
    executionMode: params.hasApiKey ? 'llm' : 'retrieval-only'
  }
}

export function resolveShortcutUpdateResolution(
  params: ShortcutUpdateResolutionInput
): ShortcutUpdateResolution {
  const shouldAttemptShortcutSwap = Boolean(
    params.requestedShortcut && params.requestedShortcut !== params.previousShortcut
  )

  if (!shouldAttemptShortcutSwap) {
    return {
      shouldAttemptShortcutSwap: false,
      shouldRollbackSettings: false,
      shouldReturnEarly: false
    }
  }

  if (params.swapped) {
    return {
      shouldAttemptShortcutSwap: true,
      shouldRollbackSettings: false,
      shouldReturnEarly: false
    }
  }

  const shouldReturnEarly = !params.restored && params.registeredShortcutAfterRestore !== params.previousShortcut

  return {
    shouldAttemptShortcutSwap: true,
    shouldRollbackSettings: true,
    shouldReturnEarly
  }
}

export function resolveShortcutUpdateAttemptPlan(params: {
  requestedShortcut: string | undefined
  previousShortcut: string
}): ShortcutUpdateAttemptPlan {
  const shouldAttemptShortcutSwap = Boolean(
    params.requestedShortcut && params.requestedShortcut !== params.previousShortcut
  )

  return {
    shouldAttemptShortcutSwap,
    requestedShortcut: shouldAttemptShortcutSwap ? (params.requestedShortcut ?? null) : null,
    rollbackShortcut: shouldAttemptShortcutSwap ? params.previousShortcut : null
  }
}

export function resolveShortcutUpdateFlowResolution(
  params: ShortcutUpdateFlowResolutionInput
): ShortcutUpdateFlowResolution {
  const attemptPlan = resolveShortcutUpdateAttemptPlan({
    requestedShortcut: params.requestedShortcut,
    previousShortcut: params.previousShortcut
  })

  const resolution = resolveShortcutUpdateResolution({
    requestedShortcut: attemptPlan.requestedShortcut ?? undefined,
    previousShortcut: params.previousShortcut,
    swapped: params.swapped,
    restored: params.restored,
    registeredShortcutAfterRestore: params.registeredShortcutAfterRestore
  })

  return {
    attemptPlan,
    resolution
  }
}

export function contextFromFallbackParams(params: {
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
  accessibilityText: string | null
  screenText: string | null
  contextKind: ChatRequest['currentContext']['contextKind']
  timestamp: string
}): ChatRequest['currentContext'] {
  return {
    activeApp: null,
    windowTitle: params.pageTitle,
    contextKind: params.contextKind,
    primaryContentSource: params.pageText
      ? 'page-text'
      : params.accessibilityText
        ? 'accessibility-text'
        : params.screenText
          ? 'screen-ocr'
          : 'none',
    pageTitle: params.pageTitle,
    pageUrl: params.pageUrl,
    pageText: params.pageText,
    pageCaptureMethod: 'none',
    accessibilityText: params.accessibilityText,
    accessibilityCaptureMethod: params.accessibilityText ? 'ax-tree' : 'none',
    screenshotPath: null,
    screenText: params.screenText,
    screenCaptureMethod: params.screenText ? 'screen-ocr' : 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: params.timestamp
  }
}

export function contentAwareSocialFallback(context: ChatRequest['currentContext']): string {
  const hint = compactLiveContext(context, 120)
  if (!hint) return ''
  return `${hint}、かなり気になります。もう少し詳しく見てみたいです。`
}

export function contentAwareCodingFallback(context: ChatRequest['currentContext']): string {
  const hint = compactLiveContext(context, 140)
  if (!hint) return ''
  if (/error|exception|failed|traceback|cannot|undefined|null|型|エラー/i.test(hint)) {
    return `${hint} の周辺から見ると、まず直近の変更点と再現条件を切り分けて原因を絞るのがよさそうです。`
  }
  return `${hint} の箇所は、意図している挙動と実際の出力を先に揃えて確認すると進めやすそうです。`
}

export function buildInlineFallbackChatResult(params: {
  currentContext: CurrentContext
  latestUserMessage: string
}): ChatResult {
  const output =
    params.currentContext.contextKind === 'social'
      ? contentAwareSocialFallback(params.currentContext)
      : contentAwareCodingFallback(params.currentContext)

  return {
    message: { role: 'assistant', content: output },
    sources: [],
    searchQuery: compactLiveContext(params.currentContext, 160),
    contextSource: 'none',
    currentContext: params.currentContext
  }
}

export function normalizeGBrainLookup(result: GBrainLookupResultLike | null | undefined): {
  results: RetrievedContext[]
  contextSource: ContextSource
} {
  return {
    results: result?.results ?? [],
    contextSource: result?.contextSource ?? 'none'
  }
}

export function hasUsableRetrievedContext(
  result: Pick<GBrainLookupResultLike, 'results' | 'contextSource'> | null | undefined
): boolean {
  return Boolean(result?.results?.length && result.contextSource !== 'none')
}

export function isReadyGBrainContextSource(contextSource: ContextSource): boolean {
  return contextSource === 'gbrain-cli' || contextSource === 'gbrain-http' || contextSource === 'local-fallback'
}

export function canFuseRetrievedContextSource(contextSource: ContextSource): boolean {
  return isReadyGBrainContextSource(contextSource)
}

export function resolveGBrainLookup(result: GBrainLookupResultLike | null | undefined): GBrainResolution {
  const normalized = normalizeGBrainLookup(result)
  return {
    ...normalized,
    hasUsableContext: hasUsableRetrievedContext(normalized),
    providerReady: isReadyGBrainContextSource(normalized.contextSource)
  }
}

export function buildFusionInputs(currentContext: CurrentContext, contextSource: ContextSource, resultCount: number) {
  return {
    canFuseContext: canFuseRetrievedContextSource(contextSource) && hasVisibleCurrentContextSignal(currentContext),
    fusionInputs: {
      hasGBrainContext: resultCount > 0,
      hasPageContext: Boolean(currentContext.pageUrl || currentContext.pageText),
      hasAccessibilityContext: Boolean(currentContext.accessibilityText),
      hasScreenContext: Boolean(currentContext.screenshotPath || currentContext.screenText),
      hasSelectedText: Boolean(currentContext.selectedText),
      hasClipboardFallback: Boolean(currentContext.clipboardText)
    }
  }
}

export function resolveDiagnosticsScreenDecisionReason(params: {
  currentContext: CurrentContext
  captureTrace?: BackendDiagnostics['captureTrace']
}): ScreenCaptureDecisionReason {
  if (params.captureTrace) {
    return params.captureTrace.screen.reason
  }

  return resolveContextScreenCaptureDecisionReason({
    accessibilityText: params.currentContext.accessibilityText,
    pageContext: {
      pageTitle: params.currentContext.pageTitle,
      pageUrl: params.currentContext.pageUrl,
      pageText: params.currentContext.pageText
    }
  })
}

export function resolveDiagnosticsRuntimeState(params: {
  currentContext: CurrentContext
  gbrain: GBrainLookupResultLike | null | undefined
  captureTrace?: BackendDiagnostics['captureTrace']
}): DiagnosticsRuntimeState {
  const gbrainState = resolveGBrainLookup(params.gbrain)
  const fusionState = buildFusionInputs(params.currentContext, gbrainState.contextSource, gbrainState.results.length)

  return {
    gbrainState,
    fusionState,
    screenCaptureDecisionReason: resolveDiagnosticsScreenDecisionReason({
      currentContext: params.currentContext,
      captureTrace: params.captureTrace
    }),
    browserCaptureSummary: buildBrowserCaptureSummary({
      currentContext: params.currentContext,
      captureTrace: params.captureTrace
    })
  }
}

export function buildBackendDiagnostics(params: {
  accessibilityGranted: boolean
  screenCaptureStatus: BackendDiagnostics['screenCaptureStatus']
  currentContext: CurrentContext
  gbrain: GBrainLookupResultLike | null | undefined
  captureTrace?: BackendDiagnostics['captureTrace']
  accessibilityDiagnostics?: BackendDiagnostics['accessibilityDiagnostics']
}): BackendDiagnostics {
  const runtimeState = resolveDiagnosticsRuntimeState({
    currentContext: params.currentContext,
    gbrain: params.gbrain,
    captureTrace: params.captureTrace
  })

  return {
    accessibilityGranted: params.accessibilityGranted,
    screenCaptureStatus: params.screenCaptureStatus,
    accessibilityDiagnostics: params.accessibilityDiagnostics,
    screenCaptureDecisionReason: runtimeState.screenCaptureDecisionReason,
    browserCaptureSummary: runtimeState.browserCaptureSummary,
    canFuseContext: runtimeState.fusionState.canFuseContext,
    gbrain: {
      ok: runtimeState.gbrainState.providerReady,
      contextSource: runtimeState.gbrainState.contextSource,
      resultCount: runtimeState.gbrainState.results.length,
      sampleSources: runtimeState.gbrainState.results.slice(0, 5).map((result) => result.source),
      trace: params.gbrain?.trace
    },
    captureTrace: params.captureTrace,
    fusionInputs: runtimeState.fusionState.fusionInputs,
    currentContext: params.currentContext
  }
}

export function buildRetrievalOnlyAnswer(params: {
  latestUserMessage: string
  pageUrl: string | null
  pageTitle: string | null
  pageText: string | null
  accessibilityText: string | null
  screenText: string | null
  contextKind: ChatRequest['currentContext']['contextKind']
  sources: { source: string; title: string; content: string }[]
  timestamp?: string
}): string {
  const sourceLines = params.sources
    .slice(0, 5)
    .map((source) => `- ${source.source}: ${source.title}`)
    .join('\n')
  const pageSummary = params.pageText
    ? params.pageText.replace(/\s+/g, ' ').trim().slice(0, 600)
    : '(page body not captured)'
  const accessibilitySummary = params.accessibilityText
    ? params.accessibilityText.replace(/\s+/g, ' ').trim().slice(0, 600)
    : '(accessibility text not captured)'
  const screenSummary = params.screenText
    ? params.screenText.replace(/\s+/g, ' ').trim().slice(0, 600)
    : '(screen OCR not captured)'

  if (wantsInlineRecommendation(params.latestUserMessage)) {
    const topSource = params.sources[0]
    const fallbackContext = contextFromFallbackParams({
      ...params,
      timestamp: params.timestamp ?? new Date().toISOString()
    })
    const inlinePlan = resolveRetrievalOnlyInlineAnswerPlan({
      pageTitle: params.pageTitle,
      pageUrl: params.pageUrl,
      pageText: params.pageText,
      accessibilityText: params.accessibilityText,
      screenText: params.screenText,
      contextKind: params.contextKind,
      topSourceTitle: topSource?.title ?? null
    })

    if (inlinePlan.shouldUseSocialFallback) {
      return contentAwareSocialFallback(fallbackContext)
    }

    if (inlinePlan.shouldUseCodingFallback) {
      return contentAwareCodingFallback(fallbackContext)
    }

    if (!inlinePlan.shouldReferenceTopSource || !inlinePlan.gbrainHint) {
      return `${inlinePlan.visibleHint}について確認しました。必要な内容をこちらで整理して、次に進められる形で対応します。`
    }

    return `${inlinePlan.pageLabel}の内容を確認しました。${inlinePlan.gbrainHint}に合わせて、相手に伝えるべき要点と次のアクションをこちらで整理します。`
  }

  return `LLM API key is not configured, so this is a retrieval-only backend check.

User message:
${params.latestUserMessage || '(none)'}

Open page context:
- Title: ${params.pageTitle || '(unknown)'}
- URL: ${params.pageUrl || '(not captured)'}
- Text preview: ${pageSummary}
- Accessibility preview: ${accessibilitySummary}
- Screen OCR preview: ${screenSummary}

GBrain context used:
${sourceLines || '- none'}

The backend successfully fused the current page context with GBrain context. Add an LLM API key in Settings to generate the final natural-language response.`
}

export function buildRetrievalOnlyAnswerParams(params: {
  currentContext: CurrentContext
  latestUserMessage: string
  sources: { source: string; title: string; content: string }[]
  timestamp?: string
}): Parameters<typeof buildRetrievalOnlyAnswer>[0] {
  return {
    latestUserMessage: params.latestUserMessage,
    pageUrl: params.currentContext.pageUrl,
    pageTitle: params.currentContext.pageTitle,
    pageText: params.currentContext.pageText,
    accessibilityText: params.currentContext.accessibilityText,
    screenText: params.currentContext.screenText,
    contextKind: params.currentContext.contextKind,
    sources: params.sources,
    timestamp: params.timestamp
  }
}
