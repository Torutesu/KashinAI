import type { CurrentContext } from './types'
import {
  buildTraceBackfillCommand,
  buildNextContextFixtureRecommendation,
  type ContextFixtureActionStep,
  type ContextFixtureMethodRecommendation,
  suggestedCommandForBrowserSummaryPath,
  suggestedCommandForPageMethod,
  suggestedCommandForScreenMethod
} from './context-fixture-recommendations.ts'
import type { CaptureTraceFixture } from './context-fixture.ts'

export const PAGE_CAPTURE_METHODS = ['browser-automation', 'keyboard-copy', 'chrome-session', 'accessibility', 'none'] as const
export const SCREEN_CAPTURE_METHODS = [
  'window-ocr',
  'screen-ocr',
  'window-screenshot-only',
  'screen-screenshot-only',
  'none'
] as const
export const BROWSER_CAPTURE_STEPS = ['browser', 'keyboard', 'session'] as const
export const BROWSER_CAPTURE_SUMMARY_PATHS = [
  'accessibility-short-circuit',
  'accessibility-retained',
  'browser-automation',
  'keyboard-copy',
  'chrome-session',
  'screen-ocr-fallback',
  'no-page-context'
] as const
export const ACCESSIBILITY_LOW_SIGNAL_REASONS = [
  'missing-snapshot',
  'notification-center',
  'system-shell',
  'empty-ranked-lines',
  'title-only',
  'social-chrome-only',
  'browser-chrome-only',
  'weak-content'
] as const

export type PageCaptureMethod = (typeof PAGE_CAPTURE_METHODS)[number]
export type ScreenCaptureMethod = (typeof SCREEN_CAPTURE_METHODS)[number]
export type BrowserCaptureStep = (typeof BROWSER_CAPTURE_STEPS)[number]
export type BrowserCaptureSummaryPath = (typeof BROWSER_CAPTURE_SUMMARY_PATHS)[number]
export type AccessibilityLowSignalReason = (typeof ACCESSIBILITY_LOW_SIGNAL_REASONS)[number]

export type ContextFixtureCoverageInput = Array<{
  name: string
  activeApp?: string | null
  pageCaptureMethod: CurrentContext['pageCaptureMethod']
  screenCaptureMethod: CurrentContext['screenCaptureMethod']
  accessibilityLowSignalReason?: AccessibilityLowSignalReason | null
  hasAccessibilityDiagnostics?: boolean
  userInstruction?: string | null
  actionType?: string | null
  captureTrace?: Pick<CaptureTraceFixture, 'browser'> | null
  browserCaptureSummary?: {
    path: BrowserCaptureSummaryPath
    usedBrowserAutomation: boolean
    usedKeyboardFallback: boolean
    usedSessionFallback: boolean
  } | null
}>

export type ContextFixtureCoverageReport = {
  totalFixtures: number
  fixturesWithCaptureTrace: number
  fixturesWithBrowserCaptureSummary: number
  fixturesWithAccessibilityDiagnostics: number
  tracedFixtures: string[]
  untracedFixtures: string[]
  summarizedFixtures: string[]
  unsummarizedFixtures: string[]
  diagnosticsFixtures: string[]
  missingDiagnosticsFixtures: string[]
  pageCaptureCoverage: Record<PageCaptureMethod, string[]>
  screenCaptureCoverage: Record<ScreenCaptureMethod, string[]>
  browserStepCoverage: Record<BrowserCaptureStep, string[]>
  browserSummaryPathCoverage: Record<BrowserCaptureSummaryPath, string[]>
  lowSignalReasonCoverage: Record<AccessibilityLowSignalReason, string[]>
  uncoveredPageMethods: PageCaptureMethod[]
  uncoveredScreenMethods: ScreenCaptureMethod[]
  uncoveredBrowserSteps: BrowserCaptureStep[]
  uncoveredBrowserSummaryPaths: BrowserCaptureSummaryPath[]
  suggestedCommands: {
    pageCaptureMethods: Partial<Record<PageCaptureMethod, string | null>>
    screenCaptureMethods: Partial<Record<ScreenCaptureMethod, string | null>>
    browserSummaryPaths?: Partial<Record<BrowserCaptureSummaryPath, string | null>>
    traceBackfillFixtures?: Partial<Record<string, string | null>>
  }
  traceBackfillTargets?: Partial<Record<string, string | null>>
  nextPriority: string[]
  nextRecommendation: {
    priority: 'page-capture' | 'screen-capture' | 'trace-backfill' | 'complete'
    nextBrowserSummaryPath: BrowserCaptureSummaryPath | null
    nextCommand: string | null
    nextPageRecommendation: ContextFixtureMethodRecommendation | null
    nextScreenRecommendation: ContextFixtureMethodRecommendation | null
    nextBrowserSummaryRecommendation: ContextFixtureMethodRecommendation | null
    nextBrowserSummaryCommand: string | null
    nextTraceRecommendation: ContextFixtureMethodRecommendation | null
    actionSteps: ContextFixtureActionStep[]
  }
}

export type AppFixtureGapSummary = {
  appName: string
  fixtureNames: string[]
  tracedFixtureCount: number
  untracedFixtureNames: string[]
  pageCaptureMethods: Array<CurrentContext['pageCaptureMethod']>
  screenCaptureMethods: Array<CurrentContext['screenCaptureMethod']>
  browserSummaryPaths: BrowserCaptureSummaryPath[]
  missingTrace: boolean
  missingKeyboardCopyCoverage: boolean
  missingNoPageContextSummary: boolean
}

export type AppFixtureFollowup = {
  appName: string
  traceBackfillCommand: string | null
  traceBackfillFixture: string | null
  nextPageMethod: CurrentContext['pageCaptureMethod'] | null
  nextPageCommand: string | null
  nextScreenMethod: CurrentContext['screenCaptureMethod'] | null
  nextScreenCommand: string | null
}

export type ContextFixtureCoverageOptions = {
  availableApps?: string[]
}

const ACCESSIBILITY_FIXTURE_NAME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'dia-chrome-fallback': ['dia-chrome-only'],
  'dia-merged-browser': ['dia-browser-tabs'],
  'slack-merged-social': ['slack-chrome-only'],
  'notion-merged-document': ['notion-dense-page']
}

function isBrowserAppName(appName: string): boolean {
  return /(safari|chrome|chromium|arc|brave|edge|firefox|dia)/i.test(appName)
}

function shouldTrackBrowserPageGap(appFixtures: ContextFixtureCoverageInput): boolean {
  return appFixtures.some((fixture) => {
    const appName = fixture.activeApp?.trim() ?? ''
    return (
      isBrowserAppName(appName) ||
      fixture.pageCaptureMethod === 'browser-automation' ||
      fixture.pageCaptureMethod === 'keyboard-copy' ||
      fixture.pageCaptureMethod === 'chrome-session' ||
      fixture.browserCaptureSummary?.usedBrowserAutomation === true ||
      fixture.browserCaptureSummary?.usedKeyboardFallback === true ||
      fixture.browserCaptureSummary?.usedSessionFallback === true ||
      fixture.browserCaptureSummary?.path === 'browser-automation' ||
      fixture.browserCaptureSummary?.path === 'keyboard-copy' ||
      fixture.browserCaptureSummary?.path === 'chrome-session' ||
      fixture.browserCaptureSummary?.path === 'accessibility-retained' ||
      fixture.browserCaptureSummary?.path === 'no-page-context'
    )
  })
}

export function resolveLinkedAccessibilityFixtureName(params: {
  contextFixtureName: string
  linkedAccessibilityFixture?: string | null
  accessibilityFixtureNames: Iterable<string>
}): string | null {
  const available = new Set(params.accessibilityFixtureNames)
  const explicit = params.linkedAccessibilityFixture?.trim() ?? ''

  if (explicit) {
    return available.has(explicit) ? explicit : null
  }
  const exactBaseName = params.contextFixtureName.replace(/\.json$/i, '')

  if (available.has(exactBaseName)) {
    return exactBaseName
  }

  for (const alias of ACCESSIBILITY_FIXTURE_NAME_ALIASES[exactBaseName] ?? []) {
    if (available.has(alias)) {
      return alias
    }
  }

  return null
}

export function resolveFixtureAttemptedBrowserSteps(fixture: ContextFixtureCoverageInput[number]): BrowserCaptureStep[] {
  if (fixture.captureTrace) {
    return [...fixture.captureTrace.browser.attemptedSteps]
  }

  const summarySteps: BrowserCaptureStep[] = []
  if (fixture.browserCaptureSummary?.usedBrowserAutomation) {
    summarySteps.push('browser')
  }
  if (fixture.browserCaptureSummary?.usedKeyboardFallback) {
    summarySteps.push('keyboard')
  }
  if (fixture.browserCaptureSummary?.usedSessionFallback) {
    summarySteps.push('session')
  }
  return summarySteps
}

export function buildContextFixtureCoverageReport(
  fixtures: ContextFixtureCoverageInput,
  options: ContextFixtureCoverageOptions = {}
): ContextFixtureCoverageReport {
  const pageCaptureCoverage = Object.fromEntries(PAGE_CAPTURE_METHODS.map((method) => [method, [] as string[]])) as Record<
    PageCaptureMethod,
    string[]
  >
  const screenCaptureCoverage = Object.fromEntries(
    SCREEN_CAPTURE_METHODS.map((method) => [method, [] as string[]])
  ) as Record<ScreenCaptureMethod, string[]>
  const browserStepCoverage = Object.fromEntries(
    BROWSER_CAPTURE_STEPS.map((step) => [step, [] as string[]])
  ) as Record<BrowserCaptureStep, string[]>
  const browserSummaryPathCoverage = Object.fromEntries(
    BROWSER_CAPTURE_SUMMARY_PATHS.map((summaryPath) => [summaryPath, [] as string[]])
  ) as Record<BrowserCaptureSummaryPath, string[]>
  const lowSignalReasonCoverage = Object.fromEntries(
    ACCESSIBILITY_LOW_SIGNAL_REASONS.map((reason) => [reason, [] as string[]])
  ) as Record<AccessibilityLowSignalReason, string[]>
  const tracedFixtures: string[] = []
  const untracedFixtures: string[] = []
  const summarizedFixtures: string[] = []
  const unsummarizedFixtures: string[] = []
  const diagnosticsFixtures: string[] = []
  const missingDiagnosticsFixtures: string[] = []

  for (const fixture of fixtures) {
    if (fixture.pageCaptureMethod in pageCaptureCoverage) {
      pageCaptureCoverage[fixture.pageCaptureMethod as PageCaptureMethod].push(fixture.name)
    }
    if (fixture.screenCaptureMethod in screenCaptureCoverage) {
      screenCaptureCoverage[fixture.screenCaptureMethod as ScreenCaptureMethod].push(fixture.name)
    }
    if (fixture.captureTrace) {
      tracedFixtures.push(fixture.name)
    } else {
      untracedFixtures.push(fixture.name)
    }
    if (fixture.browserCaptureSummary) {
      summarizedFixtures.push(fixture.name)
      browserSummaryPathCoverage[fixture.browserCaptureSummary.path].push(fixture.name)
    } else {
      unsummarizedFixtures.push(fixture.name)
    }
    if (fixture.hasAccessibilityDiagnostics) {
      diagnosticsFixtures.push(fixture.name)
    } else {
      missingDiagnosticsFixtures.push(fixture.name)
    }
    if (fixture.accessibilityLowSignalReason) {
      lowSignalReasonCoverage[fixture.accessibilityLowSignalReason].push(fixture.name)
    }

    const attemptedBrowserSteps = resolveFixtureAttemptedBrowserSteps(fixture)

    for (const step of attemptedBrowserSteps) {
      if (step in browserStepCoverage && !browserStepCoverage[step as BrowserCaptureStep].includes(fixture.name)) {
        browserStepCoverage[step as BrowserCaptureStep].push(fixture.name)
      }
    }
  }

  const uncoveredPageMethods = PAGE_CAPTURE_METHODS.filter((method) => pageCaptureCoverage[method].length === 0)
  const uncoveredScreenMethods = SCREEN_CAPTURE_METHODS.filter((method) => screenCaptureCoverage[method].length === 0)
  const uncoveredBrowserSteps = BROWSER_CAPTURE_STEPS.filter((step) => browserStepCoverage[step].length === 0)
  const uncoveredBrowserSummaryPaths = BROWSER_CAPTURE_SUMMARY_PATHS.filter(
    (summaryPath) => browserSummaryPathCoverage[summaryPath].length === 0
  )

  const baseReport = {
    totalFixtures: fixtures.length,
    fixturesWithCaptureTrace: tracedFixtures.length,
    fixturesWithBrowserCaptureSummary: summarizedFixtures.length,
    fixturesWithAccessibilityDiagnostics: diagnosticsFixtures.length,
    tracedFixtures,
    untracedFixtures,
    summarizedFixtures,
    unsummarizedFixtures,
    diagnosticsFixtures,
    missingDiagnosticsFixtures,
    availableApps: options.availableApps,
    pageCaptureCoverage,
    screenCaptureCoverage,
    browserStepCoverage,
    browserSummaryPathCoverage,
    lowSignalReasonCoverage,
    uncoveredPageMethods,
    uncoveredScreenMethods,
    uncoveredBrowserSteps,
    uncoveredBrowserSummaryPaths,
    suggestedCommands: {
      pageCaptureMethods: Object.fromEntries(
        uncoveredPageMethods.map((method) => [method, suggestedCommandForPageMethod(method, options)])
      ) as Partial<Record<PageCaptureMethod, string | null>>,
      screenCaptureMethods: Object.fromEntries(
        uncoveredScreenMethods.map((method) => [method, suggestedCommandForScreenMethod(method)])
      ) as Partial<Record<ScreenCaptureMethod, string | null>>,
      browserSummaryPaths: Object.fromEntries(
        uncoveredBrowserSummaryPaths.map((summaryPath) => [
          summaryPath,
          suggestedCommandForBrowserSummaryPath(summaryPath, options)
        ])
      ) as Partial<Record<BrowserCaptureSummaryPath, string | null>>,
      traceBackfillFixtures: Object.fromEntries(
        untracedFixtures.map((name) => {
          const fixture = fixtures.find((candidate) => candidate.name === name)
          return [
            name,
            fixture
              ? buildTraceBackfillCommand({
                  fixtureName: name,
                  targetApp: fixture.activeApp ?? null,
                  userInstruction: fixture.userInstruction ?? null,
                  actionType: fixture.actionType ?? null,
                  expectedPageCaptureMethod: fixture.pageCaptureMethod,
                  expectedScreenCaptureMethod: fixture.screenCaptureMethod
                })
              : null
          ]
        })
      ) as Partial<Record<string, string | null>>
    },
    traceBackfillTargets: Object.fromEntries(
      untracedFixtures.map((name) => {
        const fixture = fixtures.find((candidate) => candidate.name === name)
        return [name, fixture?.activeApp ?? null]
      })
    ) as Partial<Record<string, string | null>>,
    nextPriority:
      uncoveredPageMethods.length > 0
        ? uncoveredPageMethods.map((method) => `context fixture for ${method}`)
        : uncoveredScreenMethods.length > 0
          ? uncoveredScreenMethods.map((method) => `context fixture for ${method}`)
          : untracedFixtures.length > 0
            ? untracedFixtures.map((name) => `capture trace for ${name}`)
            : uncoveredBrowserSummaryPaths.length > 0
              ? uncoveredBrowserSummaryPaths.map((summaryPath) => `browser summary path for ${summaryPath}`)
              : uncoveredBrowserSteps.map((step) => `trace coverage for browser step ${step}`)
  }

  const nextRecommendation = buildNextContextFixtureRecommendation(baseReport)

  return {
    ...baseReport,
    nextRecommendation: {
      priority: nextRecommendation.priority,
      nextBrowserSummaryPath:
        nextRecommendation.nextBrowserSummaryPath as BrowserCaptureSummaryPath | null,
      nextCommand: nextRecommendation.nextCommand,
      nextPageRecommendation: nextRecommendation.nextPageRecommendation,
      nextScreenRecommendation: nextRecommendation.nextScreenRecommendation,
      nextBrowserSummaryRecommendation: nextRecommendation.nextBrowserSummaryRecommendation,
      nextBrowserSummaryCommand: nextRecommendation.nextBrowserSummaryCommand,
      nextTraceRecommendation: nextRecommendation.nextTraceRecommendation,
      actionSteps: nextRecommendation.actionSteps
    }
  }
}

export function buildContextFixtureAppGapSummaries(
  fixtures: ContextFixtureCoverageInput
): AppFixtureGapSummary[] {
  const grouped = new Map<string, ContextFixtureCoverageInput>()

  for (const fixture of fixtures) {
    const appName = fixture.activeApp?.trim() || 'Unknown'
    const current = grouped.get(appName) ?? []
    current.push(fixture)
    grouped.set(appName, current)
  }

  return [...grouped.entries()]
    .map(([appName, appFixtures]) => {
      const tracedFixtureCount = appFixtures.filter((fixture) => Boolean(fixture.captureTrace)).length
      const untracedFixtureNames = appFixtures
        .filter((fixture) => !fixture.captureTrace)
        .map((fixture) => fixture.name)
        .sort()
      const pageCaptureMethods = [...new Set(appFixtures.map((fixture) => fixture.pageCaptureMethod))].sort()
      const screenCaptureMethods = [...new Set(appFixtures.map((fixture) => fixture.screenCaptureMethod))].sort()
      const browserSummaryPaths = [
        ...new Set(
          appFixtures
            .map((fixture) => fixture.browserCaptureSummary?.path ?? null)
            .filter((value): value is BrowserCaptureSummaryPath => Boolean(value))
        )
      ].sort()

      return {
        appName,
        fixtureNames: appFixtures.map((fixture) => fixture.name).sort(),
        tracedFixtureCount,
        untracedFixtureNames,
        pageCaptureMethods,
        screenCaptureMethods,
        browserSummaryPaths,
        missingTrace: untracedFixtureNames.length > 0,
        missingKeyboardCopyCoverage:
          shouldTrackBrowserPageGap(appFixtures) && !pageCaptureMethods.includes('keyboard-copy'),
        missingNoPageContextSummary:
          shouldTrackBrowserPageGap(appFixtures) && !browserSummaryPaths.includes('no-page-context')
      }
    })
    .sort((left, right) => {
      const leftScore =
        Number(left.missingTrace) * 4 +
        Number(left.missingKeyboardCopyCoverage) * 2 +
        Number(left.missingNoPageContextSummary)
      const rightScore =
        Number(right.missingTrace) * 4 +
        Number(right.missingKeyboardCopyCoverage) * 2 +
        Number(right.missingNoPageContextSummary)

      if (rightScore !== leftScore) return rightScore - leftScore
      return left.appName.localeCompare(right.appName)
    })
}

export function buildContextFixtureAppFollowups(
  fixtures: ContextFixtureCoverageInput,
  options: ContextFixtureCoverageOptions = {}
): AppFixtureFollowup[] {
  const summaries = buildContextFixtureAppGapSummaries(fixtures)

  return summaries.map((summary) => {
    const appFixtures = fixtures.filter((fixture) => (fixture.activeApp?.trim() || 'Unknown') === summary.appName)
    const firstUntracedFixture = appFixtures.find((fixture) => !fixture.captureTrace) ?? null
    const traceBackfillCommand = firstUntracedFixture
      ? buildTraceBackfillCommand({
          fixtureName: firstUntracedFixture.name,
          targetApp: firstUntracedFixture.activeApp ?? null,
          userInstruction: firstUntracedFixture.userInstruction ?? null,
          actionType: firstUntracedFixture.actionType ?? null,
          expectedPageCaptureMethod: firstUntracedFixture.pageCaptureMethod,
          expectedScreenCaptureMethod: firstUntracedFixture.screenCaptureMethod
        })
      : null

    const nextPageMethod: CurrentContext['pageCaptureMethod'] | null = summary.missingKeyboardCopyCoverage
      ? 'keyboard-copy'
      : summary.missingNoPageContextSummary
        ? 'none'
        : null

    return {
      appName: summary.appName,
      traceBackfillFixture: firstUntracedFixture?.name ?? null,
      traceBackfillCommand,
      nextPageMethod,
      nextPageCommand: nextPageMethod ? suggestedCommandForPageMethod(nextPageMethod, options) : null,
      nextScreenMethod: summary.screenCaptureMethods.includes('screen-ocr') ? null : 'screen-ocr',
      nextScreenCommand: summary.screenCaptureMethods.includes('screen-ocr')
        ? null
        : suggestedCommandForScreenMethod('screen-ocr')
    }
  })
}
