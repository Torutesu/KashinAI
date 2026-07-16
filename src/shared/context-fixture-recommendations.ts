export type ContextFixtureCoverageSummary = {
  uncoveredPageMethods?: string[]
  uncoveredScreenMethods?: string[]
  uncoveredBrowserSteps?: string[]
  uncoveredBrowserSummaryPaths?: string[]
  untracedFixtures?: string[]
  availableApps?: string[]
  traceBackfillTargets?: Record<string, string | null | undefined>
  suggestedCommands?: {
    pageCaptureMethods?: Record<string, string | null | undefined>
    screenCaptureMethods?: Record<string, string | null | undefined>
    browserSummaryPaths?: Record<string, string | null | undefined>
    traceBackfillFixtures?: Record<string, string | null | undefined>
  }
}

export type ContextFixtureMethodRecommendation = {
  method: string
  targetApp: string | null
  rationale: string
  command: string | null
  preflightHints?: string[]
}

export type ContextFixtureActionStep = {
  order: number
  family: 'page-capture' | 'screen-capture' | 'trace-backfill'
  recommendation: ContextFixtureMethodRecommendation
}

export type NextContextFixtureRecommendation = {
  nextPageMethod: string | null
  nextScreenMethod: string | null
  nextBrowserSummaryPath: string | null
  nextTraceFixture: string | null
  nextPageCommand: string | null
  nextScreenCommand: string | null
  nextBrowserSummaryCommand: string | null
  nextTraceCommand: string | null
  nextCommand: string | null
  nextPageRecommendation: ContextFixtureMethodRecommendation | null
  nextScreenRecommendation: ContextFixtureMethodRecommendation | null
  nextBrowserSummaryRecommendation: ContextFixtureMethodRecommendation | null
  nextTraceRecommendation: ContextFixtureMethodRecommendation | null
  actionSteps: ContextFixtureActionStep[]
  priority: 'page-capture' | 'screen-capture' | 'trace-backfill' | 'complete'
}

function buildPreflightHints(command: string | null | undefined): string[] {
  if (!command) return []

  const hints: string[] = []

  if (/TARGET_APP="([^"]+)"/.test(command)) {
    const targetApp = command.match(/TARGET_APP="([^"]+)"/)?.[1] ?? null
    if (targetApp) hints.push(`Bring ${targetApp} to the front before capture and leave the target surface visible.`)
  }
  if (/TARGET_URL="([^"]+)"/.test(command)) {
    const targetUrl = command.match(/TARGET_URL="([^"]+)"/)?.[1] ?? null
    if (targetUrl) hints.push(`The command will try to open ${targetUrl} first so the capture runs against a predictable public page.`)
  }
  if (/FORCE_BROWSER_CAPTURE="1"/.test(command)) {
    hints.push('Browser capture is being forced, so stronger accessibility text will be intentionally bypassed for this proof run.')
  }
  if (/SUPPRESS_BROWSER_PAGE_TEXT="1"/.test(command)) {
    hints.push('Direct browser body text is intentionally suppressed so the deeper fallback path can win.')
  }
  if (/SUPPRESS_KEYBOARD_PAGE_TEXT="1"/.test(command)) {
    hints.push('Keyboard-copy body text is intentionally suppressed so session fallback can be proven.')
  }
  if (/FORCE_NATIVE_SCREEN_CAPTURE="1"/.test(command)) {
    hints.push('Whole-screen native capture is forced, so window-thumbnail selection will be bypassed.')
  }
  if (/SUPPRESS_SCREEN_OCR="1"/.test(command)) {
    hints.push('OCR is intentionally suppressed, so screenshot-only screen provenance should be expected.')
  }

  return hints
}

function withEnv(command: string, env: Record<string, string | null | undefined>): string {
  const prefix = Object.entries(env)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ')

  return prefix ? `${prefix} ${command}` : command
}

const KEYBOARD_COPY_TARGET_URL = 'https://example.com/'

type FixtureRecommendationOptions = {
  availableApps?: string[]
}

function pageMethodForBrowserStep(step: string | null | undefined): string | null {
  switch (step) {
    case 'browser':
      return 'browser-automation'
    case 'keyboard':
      return 'keyboard-copy'
    case 'session':
      return 'chrome-session'
    default:
      return null
  }
}

function pageMethodForBrowserSummaryPath(summaryPath: string | null | undefined): string | null {
  switch (summaryPath) {
    case 'browser-automation':
      return 'browser-automation'
    case 'keyboard-copy':
      return 'keyboard-copy'
    case 'chrome-session':
      return 'chrome-session'
    case 'no-page-context':
      return 'none'
    default:
      return null
  }
}

function normalizeAppName(value: string): string {
  return value.trim().toLowerCase()
}

function resolveAvailableApp(options: FixtureRecommendationOptions | undefined, preferredApps: string[]): string | null {
  const availableApps = options?.availableApps?.map(normalizeAppName) ?? []
  for (const preferredApp of preferredApps) {
    if (availableApps.includes(normalizeAppName(preferredApp))) {
      return preferredApp
    }
  }

  return preferredApps[0] ?? null
}

function slugifyFixtureToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function suggestedCommandForPageMethod(method: string, options?: FixtureRecommendationOptions): string | null {
  const browserSummaryBase = {
    FIXTURE_USER_INSTRUCTION: 'このページを要約して',
    FIXTURE_ACTION_TYPE: 'summarize'
  }
  switch (method) {
    case 'browser-automation':
      return withEnv('pnpm debug:context:fixture chrome-browser-automation', {
        TARGET_APP: 'Google Chrome',
        ...browserSummaryBase,
        EXPECT_PAGE_CAPTURE_METHOD: 'browser-automation',
        EXPECT_BROWSER_ATTEMPTED_STEPS: 'browser',
        EXPECT_BROWSER_INITIAL_STEP: 'browser',
        EXPECT_BROWSER_AFTER_BROWSER_STEP: 'none'
      })
    case 'keyboard-copy': {
      const keyboardTargetApp = resolveAvailableApp(options, ['Firefox', 'Safari', 'Google Chrome', 'Arc', 'Brave Browser', 'Microsoft Edge'])
      return withEnv(`pnpm debug:context:fixture ${slugifyFixtureToken(keyboardTargetApp ?? 'browser')}-keyboard-copy`, {
        TARGET_APP: keyboardTargetApp,
        TARGET_URL: KEYBOARD_COPY_TARGET_URL,
        FORCE_BROWSER_CAPTURE: '1',
        SUPPRESS_ACCESSIBILITY_PAGE_TEXT: '1',
        SUPPRESS_BROWSER_PAGE_TEXT: '1',
        ...browserSummaryBase,
        EXPECT_PAGE_CAPTURE_METHOD: 'keyboard-copy',
        EXPECT_BROWSER_ATTEMPTED_STEPS: 'browser,keyboard',
        EXPECT_BROWSER_INITIAL_STEP: 'browser',
        EXPECT_BROWSER_AFTER_BROWSER_STEP: 'keyboard',
        EXPECT_BROWSER_AFTER_KEYBOARD_STEP: 'none'
      })
    }
    case 'chrome-session':
      return withEnv('pnpm debug:context:fixture chrome-session-fallback', {
        TARGET_APP: 'Google Chrome',
        FORCE_BROWSER_CAPTURE: '1',
        SUPPRESS_ACCESSIBILITY_PAGE_TEXT: '1',
        SUPPRESS_BROWSER_PAGE_TEXT: '1',
        SUPPRESS_KEYBOARD_PAGE_TEXT: '1',
        ...browserSummaryBase,
        EXPECT_PAGE_CAPTURE_METHOD: 'chrome-session',
        EXPECT_BROWSER_ATTEMPTED_STEPS: 'browser,keyboard,session',
        EXPECT_BROWSER_INITIAL_STEP: 'browser',
        EXPECT_BROWSER_AFTER_BROWSER_STEP: 'keyboard',
        EXPECT_BROWSER_AFTER_KEYBOARD_STEP: 'session'
      })
    case 'accessibility':
      return withEnv('pnpm debug:context:fixture safari-accessibility', {
        TARGET_APP: 'Safari',
        ...browserSummaryBase,
        EXPECT_PAGE_CAPTURE_METHOD: 'accessibility'
      })
    case 'none':
      return withEnv('pnpm debug:context:fixture dia-no-page-context', {
        TARGET_APP: 'Dia',
        FIXTURE_USER_INSTRUCTION: 'この画面の内容を把握したい',
        FIXTURE_ACTION_TYPE: 'custom',
        EXPECT_PAGE_CAPTURE_METHOD: 'none',
        EXPECT_SCREEN_CAPTURE_METHOD: 'window-ocr'
      })
    default:
      return null
  }
}

export function suggestedCommandForBrowserSummaryPath(
  summaryPath: string,
  options?: FixtureRecommendationOptions
): string | null {
  const pageMethod = pageMethodForBrowserSummaryPath(summaryPath)
  return pageMethod ? suggestedCommandForPageMethod(pageMethod, options) : null
}

export function describePageMethodRecommendation(
  method: string,
  options?: FixtureRecommendationOptions
): ContextFixtureMethodRecommendation | null {
  switch (method) {
    case 'browser-automation':
      return {
        method,
        targetApp: 'Google Chrome',
        rationale: 'Direct browser automation path for a Chromium browser tab with readable body text.',
        command: suggestedCommandForPageMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForPageMethod(method))
      }
    case 'keyboard-copy': {
      const keyboardTargetApp = resolveAvailableApp(options, ['Firefox', 'Safari', 'Google Chrome', 'Arc', 'Brave Browser', 'Microsoft Edge'])
      return {
        method,
        targetApp: keyboardTargetApp,
        rationale:
          'Browser surface that should recover page context through keyboard-copy fallback instead of stopping at a stronger earlier browser/AX capture.',
        command: suggestedCommandForPageMethod(method, options),
        preflightHints: buildPreflightHints(suggestedCommandForPageMethod(method, options))
      }
    }
    case 'chrome-session':
      return {
        method,
        targetApp: 'Google Chrome',
        rationale:
          'Chromium-family session fallback when direct browser automation and keyboard-copy are both intentionally suppressed after capture so the session path can be proven live.',
        command: suggestedCommandForPageMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForPageMethod(method))
      }
    case 'accessibility':
      return {
        method,
        targetApp: 'Safari',
        rationale: 'Accessibility-derived page context that should win without browser or OCR fallback.',
        command: suggestedCommandForPageMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForPageMethod(method))
      }
    case 'none':
      return {
        method,
        targetApp: 'Dia',
        rationale: 'No page context path wins, so the surface should fall through to screen/OCR-driven capture.',
        command: suggestedCommandForPageMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForPageMethod(method))
      }
    default:
      return null
  }
}

export function suggestedCommandForScreenMethod(method: string): string | null {
  const base = 'TARGET_APP="Dia"'
  switch (method) {
    case 'window-ocr':
      return `${base} EXPECT_SCREEN_CAPTURE_METHOD=window-ocr pnpm debug:context:fixture dia-window-ocr`
    case 'screen-ocr':
      return `${base} FORCE_NATIVE_SCREEN_CAPTURE="1" EXPECT_SCREEN_CAPTURE_METHOD=screen-ocr pnpm debug:context:fixture dia-screen-ocr`
    case 'window-screenshot-only':
      return `${base} FORCE_SCREEN_CAPTURE="1" SUPPRESS_SCREEN_OCR="1" EXPECT_SCREEN_CAPTURE_METHOD=window-screenshot-only pnpm debug:context:fixture dia-window-screenshot-only`
    case 'screen-screenshot-only':
      return `${base} FORCE_SCREEN_CAPTURE="1" FORCE_NATIVE_SCREEN_CAPTURE="1" SUPPRESS_SCREEN_OCR="1" EXPECT_SCREEN_CAPTURE_METHOD=screen-screenshot-only pnpm debug:context:fixture dia-screen-screenshot-only`
    case 'none':
      return `${base} EXPECT_SCREEN_CAPTURE_METHOD=none pnpm debug:context:fixture dia-no-screen-capture`
    default:
      return null
  }
}

export function describeScreenMethodRecommendation(method: string): ContextFixtureMethodRecommendation | null {
  switch (method) {
    case 'window-ocr':
      return {
        method,
        targetApp: 'Dia',
        rationale: 'Window thumbnail capture succeeds and OCR text becomes the winning screen signal.',
        command: suggestedCommandForScreenMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForScreenMethod(method))
      }
    case 'screen-ocr':
      return {
        method,
        targetApp: 'Dia',
        rationale: 'Whole-screen native capture path wins and OCR text is required to recover useful context.',
        command: suggestedCommandForScreenMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForScreenMethod(method))
      }
    case 'window-screenshot-only':
      return {
        method,
        targetApp: 'Dia',
        rationale: 'Window capture succeeds but OCR remains empty, so screenshot-only provenance should be preserved.',
        command: suggestedCommandForScreenMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForScreenMethod(method))
      }
    case 'screen-screenshot-only':
      return {
        method,
        targetApp: 'Dia',
        rationale: 'Whole-screen capture succeeds but OCR remains empty, so screen-screenshot-only provenance should be preserved.',
        command: suggestedCommandForScreenMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForScreenMethod(method))
      }
    case 'none':
      return {
        method,
        targetApp: 'Dia',
        rationale: 'Strong accessibility or page context makes screen capture unnecessary.',
        command: suggestedCommandForScreenMethod(method),
        preflightHints: buildPreflightHints(suggestedCommandForScreenMethod(method))
      }
    default:
      return null
  }
}

export function suggestedCommandForTraceBackfill(fixtureName: string): string | null {
  const baseName = fixtureName.replace(/\.json$/i, '')
  return baseName ? `pnpm debug:context:fixture ${baseName}` : null
}

export function buildTraceBackfillCommand(params: {
  fixtureName: string
  targetApp?: string | null
  userInstruction?: string | null
  actionType?: string | null
  expectedPageCaptureMethod?: string | null
  expectedScreenCaptureMethod?: string | null
}): string | null {
  const baseName = params.fixtureName.replace(/\.json$/i, '')
  if (!baseName) return null

  return withEnv(`pnpm debug:context:fixture ${baseName}`, {
    TARGET_APP: params.targetApp ?? null,
    FIXTURE_USER_INSTRUCTION: params.userInstruction ?? null,
    FIXTURE_ACTION_TYPE: params.actionType ?? null,
    EXPECT_PAGE_CAPTURE_METHOD: params.expectedPageCaptureMethod ?? null,
    EXPECT_SCREEN_CAPTURE_METHOD: params.expectedScreenCaptureMethod ?? null
  })
}

export function describeTraceBackfillRecommendation(params: {
  fixtureName: string
  targetApp?: string | null
  command?: string | null
}): ContextFixtureMethodRecommendation | null {
  const fixtureName = params.fixtureName
  if (!fixtureName) return null
  return {
    method: fixtureName,
    targetApp: params.targetApp ?? null,
    rationale:
      'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
    command: params.command ?? suggestedCommandForTraceBackfill(fixtureName),
    preflightHints: buildPreflightHints(params.command ?? suggestedCommandForTraceBackfill(fixtureName))
  }
}

export function buildNextContextFixtureRecommendation(
  coverage: ContextFixtureCoverageSummary
): NextContextFixtureRecommendation {
  const nextBrowserStep = coverage.uncoveredBrowserSteps?.[0] ?? null
  const nextBrowserSummaryPath = coverage.uncoveredBrowserSummaryPaths?.[0] ?? null
  const browserStepFallbackMethod =
    !coverage.uncoveredPageMethods?.length &&
    !coverage.uncoveredScreenMethods?.length &&
    !coverage.untracedFixtures?.length &&
    !coverage.uncoveredBrowserSummaryPaths?.length
      ? pageMethodForBrowserStep(nextBrowserStep)
      : null
  const browserSummaryFallbackMethod =
    !coverage.uncoveredPageMethods?.length &&
    !coverage.uncoveredScreenMethods?.length &&
    !coverage.untracedFixtures?.length &&
    nextBrowserSummaryPath
      ? pageMethodForBrowserSummaryPath(nextBrowserSummaryPath)
      : null
  const nextPageMethod =
    coverage.uncoveredPageMethods?.[0] ??
    browserSummaryFallbackMethod ??
    browserStepFallbackMethod
  const nextScreenMethod = coverage.uncoveredScreenMethods?.[0] ?? null
  const nextTraceFixture = coverage.untracedFixtures?.[0] ?? null
  const nextPageCommand = nextPageMethod
    ? coverage.suggestedCommands?.pageCaptureMethods?.[nextPageMethod] ?? suggestedCommandForPageMethod(nextPageMethod, coverage)
    : null
  const nextScreenCommand = nextScreenMethod
    ? coverage.suggestedCommands?.screenCaptureMethods?.[nextScreenMethod] ?? null
    : null
  const nextBrowserSummaryCommand =
    nextPageMethod && nextBrowserSummaryPath
      ? coverage.suggestedCommands?.browserSummaryPaths?.[nextBrowserSummaryPath] ??
        coverage.suggestedCommands?.pageCaptureMethods?.[nextPageMethod] ??
        suggestedCommandForBrowserSummaryPath(nextBrowserSummaryPath, coverage) ??
        suggestedCommandForPageMethod(nextPageMethod, coverage)
      : null
  const nextTraceCommand = nextTraceFixture
    ? coverage.suggestedCommands?.traceBackfillFixtures?.[nextTraceFixture] ??
      suggestedCommandForTraceBackfill(nextTraceFixture)
    : null
  const nextPageRecommendation = nextPageMethod ? describePageMethodRecommendation(nextPageMethod, coverage) : null
  const nextScreenRecommendation = nextScreenMethod ? describeScreenMethodRecommendation(nextScreenMethod) : null
  const nextBrowserSummaryRecommendation =
    nextBrowserSummaryPath && nextBrowserSummaryCommand && nextPageRecommendation
      ? {
          ...nextPageRecommendation,
          rationale: `${nextPageRecommendation.rationale} This also closes the still-uncovered browser summary path "${nextBrowserSummaryPath}".`,
          command: nextBrowserSummaryCommand
        }
      : null
  const nextTraceTargetApp = nextTraceFixture
    ? coverage.traceBackfillTargets?.[nextTraceFixture] ?? null
    : null
  const nextTraceRecommendation = nextTraceFixture
    ? describeTraceBackfillRecommendation({
        fixtureName: nextTraceFixture,
        targetApp: nextTraceTargetApp,
        command: nextTraceCommand
      }) ?? {
        method: nextTraceFixture,
        targetApp: nextTraceTargetApp,
        rationale:
          'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
        command: nextTraceCommand
      }
    : null
  const nextCommand = nextPageCommand || nextScreenCommand || nextBrowserSummaryCommand || nextTraceCommand || null
  const priority = nextPageCommand
    ? 'page-capture'
    : nextScreenCommand
      ? 'screen-capture'
      : nextBrowserSummaryCommand
        ? 'page-capture'
        : nextTraceCommand
        ? 'trace-backfill'
        : 'complete'
  const actionSteps: ContextFixtureActionStep[] = []

  if (priority === 'page-capture' && nextPageRecommendation) {
    actionSteps.push({ order: 1, family: 'page-capture', recommendation: nextPageRecommendation })
    if (nextBrowserSummaryRecommendation) {
      actionSteps.push({ order: actionSteps.length + 1, family: 'page-capture', recommendation: nextBrowserSummaryRecommendation })
    }
    if (nextScreenRecommendation) {
      actionSteps.push({ order: actionSteps.length + 1, family: 'screen-capture', recommendation: nextScreenRecommendation })
    }
  } else if (priority === 'screen-capture' && nextScreenRecommendation) {
    actionSteps.push({ order: 1, family: 'screen-capture', recommendation: nextScreenRecommendation })
    if (nextTraceRecommendation) {
      actionSteps.push({ order: actionSteps.length + 1, family: 'trace-backfill', recommendation: nextTraceRecommendation })
    }
  } else if (priority === 'trace-backfill' && nextTraceRecommendation) {
    actionSteps.push({ order: 1, family: 'trace-backfill', recommendation: nextTraceRecommendation })
    if (coverage.uncoveredBrowserSteps?.length) {
      const firstBrowserGap = coverage.uncoveredBrowserSteps[0] ?? null
      const browserGapMethod = pageMethodForBrowserStep(firstBrowserGap)
      const browserGapRecommendation = browserGapMethod ? describePageMethodRecommendation(browserGapMethod, coverage) : null
      if (browserGapRecommendation) {
        actionSteps.push({ order: actionSteps.length + 1, family: 'page-capture', recommendation: browserGapRecommendation })
      }
    }
  }

  return {
    nextPageMethod,
    nextScreenMethod,
    nextBrowserSummaryPath,
    nextTraceFixture,
    nextPageCommand,
    nextScreenCommand,
    nextBrowserSummaryCommand,
    nextTraceCommand,
    nextCommand,
    nextPageRecommendation,
    nextScreenRecommendation,
    nextBrowserSummaryRecommendation,
    nextTraceRecommendation,
    actionSteps,
    priority
  }
}
