import type { BackendDiagnostics, CurrentContext } from './types.ts'

export type BrowserCaptureSummaryPath = NonNullable<BackendDiagnostics['browserCaptureSummary']>['path']
export type BrowserCaptureSummaryStep = NonNullable<BackendDiagnostics['browserCaptureSummary']>['lastAttemptedStep']
export type BrowserCaptureSummaryNextStep = NonNullable<BackendDiagnostics['browserCaptureSummary']>['nextPlannedStep']
export type BrowserCaptureSummary = NonNullable<BackendDiagnostics['browserCaptureSummary']>

export type BrowserCaptureSummaryStepState = {
  lastAttemptedStep: BrowserCaptureSummaryStep
  nextPlannedStep: BrowserCaptureSummaryNextStep
  stalledAtStep: BrowserCaptureSummaryStep
}

function isBrowserLikeAccessibilityContext(
  currentContext: Pick<CurrentContext, 'activeApp' | 'pageUrl'>
): boolean {
  const appName = currentContext.activeApp?.toLowerCase() ?? ''
  const pageUrl = currentContext.pageUrl?.toLowerCase() ?? ''
  return (
    /(safari|chrome|chromium|arc|brave|edge|firefox|dia)/.test(appName) &&
    (pageUrl.startsWith('http://') || pageUrl.startsWith('https://'))
  )
}

export function deriveSkippedBrowserCapture(params: {
  currentContext: CurrentContext
  captureTrace?: BackendDiagnostics['captureTrace']
}): boolean {
  const attemptedSteps = params.captureTrace?.browser.attemptedSteps ?? []
  if (params.captureTrace) return params.captureTrace.canSkipBrowserCapture
  if (
    params.currentContext.pageCaptureMethod === 'accessibility' &&
    hasRetainedPageContextSignal(params.currentContext) &&
    isBrowserLikeAccessibilityContext(params.currentContext)
  ) {
    return false
  }
  return params.currentContext.pageCaptureMethod === 'accessibility' && attemptedSteps.length === 0
}

export function deriveBrowserCaptureUsageFlags(params: {
  currentContext: CurrentContext
  captureTrace?: BackendDiagnostics['captureTrace']
}): Pick<
  BrowserCaptureSummary,
  'usedBrowserAutomation' | 'usedKeyboardFallback' | 'usedSessionFallback'
> {
  const attemptedSteps = new Set(params.captureTrace?.browser.attemptedSteps ?? [])

  return {
    usedBrowserAutomation:
      attemptedSteps.has('browser') || params.captureTrace?.browser.browserCaptureMethod === 'browser-automation',
    usedKeyboardFallback:
      attemptedSteps.has('keyboard') || params.captureTrace?.browser.keyboardCaptureMethod === 'keyboard-copy',
    usedSessionFallback:
      attemptedSteps.has('session') || params.captureTrace?.browser.sessionCaptureMethod === 'chrome-session'
  }
}

export function hasRetainedPageContextSignal(
  currentContext: Pick<CurrentContext, 'pageTitle' | 'pageUrl' | 'pageText'>
): boolean {
  return Boolean(currentContext.pageText || currentContext.pageUrl)
}

export function resolveBrowserCaptureSummaryPath(params: {
  currentContext: CurrentContext
  skippedBrowserCapture: boolean
}): BrowserCaptureSummaryPath {
  const { currentContext, skippedBrowserCapture } = params
  const hasRetainedPageSignal = hasRetainedPageContextSignal(currentContext)

  if (currentContext.pageCaptureMethod === 'accessibility' && skippedBrowserCapture) {
    return 'accessibility-short-circuit'
  }
  if (currentContext.pageCaptureMethod === 'accessibility' && hasRetainedPageSignal) {
    return 'accessibility-retained'
  }
  if (currentContext.pageCaptureMethod === 'browser-automation') {
    return 'browser-automation'
  }
  if (currentContext.pageCaptureMethod === 'keyboard-copy') {
    return 'keyboard-copy'
  }
  if (currentContext.pageCaptureMethod === 'chrome-session') {
    return 'chrome-session'
  }
  if (currentContext.primaryContentSource === 'screen-ocr') {
    return 'screen-ocr-fallback'
  }
  return 'no-page-context'
}

export function resolveBrowserCaptureSummaryStepState(params: {
  currentContext: CurrentContext
  captureTrace?: BackendDiagnostics['captureTrace']
  skippedBrowserCapture: boolean
}): BrowserCaptureSummaryStepState {
  const attemptedStepList = params.captureTrace?.browser.attemptedSteps ?? []
  const lastAttemptedStep = attemptedStepList.at(-1) ?? null
  const nextPlannedStep = params.captureTrace
    ? attemptedStepList.includes('keyboard')
      ? params.captureTrace.browser.afterKeyboardNextStep
      : attemptedStepList.includes('browser')
        ? params.captureTrace.browser.afterBrowserNextStep
        : params.captureTrace.browser.initialNextStep
    : 'none'
  const stalledAtStep =
    params.skippedBrowserCapture ||
    params.currentContext.pageCaptureMethod === 'browser-automation' ||
    params.currentContext.pageCaptureMethod === 'keyboard-copy' ||
    params.currentContext.pageCaptureMethod === 'chrome-session'
      ? null
      : lastAttemptedStep

  return {
    lastAttemptedStep,
    nextPlannedStep,
    stalledAtStep
  }
}

export function buildBrowserCaptureSummary(params: {
  currentContext: CurrentContext
  captureTrace?: BackendDiagnostics['captureTrace']
}): BrowserCaptureSummary {
  const { currentContext, captureTrace } = params
  const skippedBrowserCapture = deriveSkippedBrowserCapture({
    currentContext,
    captureTrace
  })
  const path = resolveBrowserCaptureSummaryPath({
    currentContext,
    skippedBrowserCapture
  })
  const stepState = resolveBrowserCaptureSummaryStepState({
    currentContext,
    captureTrace,
    skippedBrowserCapture
  })

  return {
    finalPageCaptureMethod: currentContext.pageCaptureMethod,
    finalPrimarySource: currentContext.primaryContentSource,
    path,
    pageTitlePresent: Boolean(currentContext.pageTitle),
    pageUrlPresent: Boolean(currentContext.pageUrl),
    pageTextLength: currentContext.pageText?.length ?? 0,
    accessibilityTextLength: currentContext.accessibilityText?.length ?? 0,
    selectedTextLength: currentContext.selectedText?.length ?? 0,
    ...deriveBrowserCaptureUsageFlags({
      currentContext,
      captureTrace
    }),
    skippedBrowserCapture,
    lastAttemptedStep: stepState.lastAttemptedStep,
    nextPlannedStep: stepState.nextPlannedStep,
    stalledAtStep: stepState.stalledAtStep
  }
}
