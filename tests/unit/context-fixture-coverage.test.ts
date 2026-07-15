import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildContextFixtureAppGapSummaries,
  buildContextFixtureAppFollowups,
  buildContextFixtureCoverageReport,
  resolveLinkedAccessibilityFixtureName,
  resolveFixtureAttemptedBrowserSteps
} from '../../src/shared/context-fixture-coverage.ts'

test('resolveLinkedAccessibilityFixtureName prefers exact basename matches and then conservative alias mappings', () => {
  const accessibilityFixtureNames = [
    'mail-compose',
    'dia-chrome-only',
    'dia-browser-tabs',
    'slack-chrome-only',
    'notion-dense-page'
  ]

  assert.equal(
    resolveLinkedAccessibilityFixtureName({
      contextFixtureName: 'mail-compose.json',
      linkedAccessibilityFixture: null,
      accessibilityFixtureNames
    }),
    'mail-compose'
  )

  assert.equal(
    resolveLinkedAccessibilityFixtureName({
      contextFixtureName: 'dia-chrome-fallback.json',
      linkedAccessibilityFixture: null,
      accessibilityFixtureNames
    }),
    'dia-chrome-only'
  )

  assert.equal(
    resolveLinkedAccessibilityFixtureName({
      contextFixtureName: 'dia-merged-browser.json',
      linkedAccessibilityFixture: null,
      accessibilityFixtureNames
    }),
    'dia-browser-tabs'
  )

  assert.equal(
    resolveLinkedAccessibilityFixtureName({
      contextFixtureName: 'chatgpt-codex-thread-ocr.json',
      linkedAccessibilityFixture: 'dia-browser-tabs',
      accessibilityFixtureNames
    }),
    'dia-browser-tabs'
  )

  assert.equal(
    resolveLinkedAccessibilityFixtureName({
      contextFixtureName: 'discord-merged-ocr.json',
      linkedAccessibilityFixture: null,
      accessibilityFixtureNames
    }),
    null
  )
})

test('resolveFixtureAttemptedBrowserSteps prefers trace evidence over summary flags and preserves step order', () => {
  assert.deepEqual(
    resolveFixtureAttemptedBrowserSteps({
      name: 'chrome-session.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'chrome-session',
      screenCaptureMethod: 'none',
      captureTrace: {
        browser: {
          attemptedSteps: ['browser', 'keyboard']
        }
      },
      browserCaptureSummary: {
        path: 'chrome-session',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: true
      }
    }),
    ['browser', 'keyboard']
  )

  assert.deepEqual(
    resolveFixtureAttemptedBrowserSteps({
      name: 'chrome-session.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'chrome-session',
      screenCaptureMethod: 'none',
      captureTrace: null,
      browserCaptureSummary: {
        path: 'chrome-session',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: true
      }
    }),
    ['browser', 'keyboard', 'session']
  )
})

test('buildContextFixtureCoverageReport groups fixtures by page and screen capture method', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'chrome-browser-automation.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'browser-automation',
      screenCaptureMethod: 'none',
      accessibilityLowSignalReason: 'browser-chrome-only',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: {
        browser: {
          attemptedSteps: ['browser']
        }
      }
    },
    {
      name: 'discord-merged-ocr.json',
      activeApp: 'Discord',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'window-ocr',
      accessibilityLowSignalReason: 'social-chrome-only',
      userInstruction: 'この文脈を確認したい',
      actionType: 'custom',
      captureTrace: {
        browser: {
          attemptedSteps: []
        }
      }
    }
  ])

  assert.equal(report.totalFixtures, 2)
  assert.equal(report.fixturesWithCaptureTrace, 2)
  assert.equal(report.fixturesWithBrowserCaptureSummary, 0)
  assert.equal(report.fixturesWithAccessibilityDiagnostics, 0)
  assert.deepEqual(report.tracedFixtures, ['chrome-browser-automation.json', 'discord-merged-ocr.json'])
  assert.deepEqual(report.untracedFixtures, [])
  assert.deepEqual(report.summarizedFixtures, [])
  assert.deepEqual(report.unsummarizedFixtures, ['chrome-browser-automation.json', 'discord-merged-ocr.json'])
  assert.deepEqual(report.diagnosticsFixtures, [])
  assert.deepEqual(report.missingDiagnosticsFixtures, ['chrome-browser-automation.json', 'discord-merged-ocr.json'])
  assert.deepEqual(report.pageCaptureCoverage['browser-automation'], ['chrome-browser-automation.json'])
  assert.deepEqual(report.pageCaptureCoverage['accessibility'], ['discord-merged-ocr.json'])
  assert.deepEqual(report.screenCaptureCoverage['window-ocr'], ['discord-merged-ocr.json'])
  assert.deepEqual(report.screenCaptureCoverage['none'], ['chrome-browser-automation.json'])
  assert.deepEqual(report.lowSignalReasonCoverage['browser-chrome-only'], ['chrome-browser-automation.json'])
  assert.deepEqual(report.lowSignalReasonCoverage['social-chrome-only'], ['discord-merged-ocr.json'])
  assert.deepEqual(report.browserStepCoverage['browser'], ['chrome-browser-automation.json'])
  assert.deepEqual(report.browserStepCoverage['keyboard'], [])
  assert.deepEqual(report.browserSummaryPathCoverage['browser-automation'], [])
  assert.deepEqual(report.uncoveredBrowserSummaryPaths.slice(0, 3), [
    'accessibility-short-circuit',
    'accessibility-retained',
    'browser-automation'
  ])
  assert.match(report.suggestedCommands.browserSummaryPaths?.['browser-automation'] ?? '', /chrome-browser-automation/)
})

test('buildContextFixtureCoverageReport also groups fixtures by accessibility low-signal reason so fallback evidence stays explainable', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'codex-ocr.json',
      activeApp: 'Codex',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'screen-ocr',
      accessibilityLowSignalReason: 'title-only',
      userInstruction: 'この画面の内容を把握したい',
      actionType: 'custom',
      captureTrace: { browser: { attemptedSteps: [] } }
    },
    {
      name: 'browser-retained.json',
      activeApp: 'Safari',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'none',
      accessibilityLowSignalReason: 'weak-content',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: [] } }
    }
  ])

  assert.deepEqual(report.lowSignalReasonCoverage['title-only'], ['codex-ocr.json'])
  assert.deepEqual(report.lowSignalReasonCoverage['weak-content'], ['browser-retained.json'])
  assert.deepEqual(report.lowSignalReasonCoverage['browser-chrome-only'], [])
})

test('buildContextFixtureCoverageReport tracks which fixtures already have saved accessibility diagnostics sidecars', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'with-diagnostics.json',
      activeApp: 'Dia',
      pageCaptureMethod: 'browser-automation',
      screenCaptureMethod: 'none',
      hasAccessibilityDiagnostics: true,
      captureTrace: { browser: { attemptedSteps: ['browser'] } }
    },
    {
      name: 'without-diagnostics.json',
      activeApp: 'Safari',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'none',
      hasAccessibilityDiagnostics: false,
      captureTrace: { browser: { attemptedSteps: [] } }
    }
  ])

  assert.equal(report.fixturesWithAccessibilityDiagnostics, 1)
  assert.deepEqual(report.diagnosticsFixtures, ['with-diagnostics.json'])
  assert.deepEqual(report.missingDiagnosticsFixtures, ['without-diagnostics.json'])
})

test('buildContextFixtureCoverageReport marks uncovered methods and suggests the matching commands', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'discord-merged-ocr.json',
      activeApp: 'Discord',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'window-ocr',
      userInstruction: 'この文脈を確認したい',
      actionType: 'custom',
      captureTrace: {
        browser: {
          attemptedSteps: []
        }
      }
    }
  ])

  assert.deepEqual(report.uncoveredPageMethods.slice(0, 3), ['browser-automation', 'keyboard-copy', 'chrome-session'])
  assert.deepEqual(report.uncoveredScreenMethods.slice(0, 3), [
    'screen-ocr',
    'window-screenshot-only',
    'screen-screenshot-only'
  ])
  assert.equal(report.fixturesWithCaptureTrace, 1)
  assert.equal(report.fixturesWithBrowserCaptureSummary, 0)
  assert.deepEqual(report.tracedFixtures, ['discord-merged-ocr.json'])
  assert.deepEqual(report.untracedFixtures, [])
  assert.deepEqual(report.uncoveredBrowserSteps, ['browser', 'keyboard', 'session'])
  assert.deepEqual(report.uncoveredBrowserSummaryPaths.slice(0, 3), [
    'accessibility-short-circuit',
    'accessibility-retained',
    'browser-automation'
  ])
  assert.match(report.suggestedCommands.pageCaptureMethods['keyboard-copy'] ?? '', /TARGET_APP="Firefox"/)
  assert.match(report.suggestedCommands.screenCaptureMethods['screen-ocr'] ?? '', /EXPECT_SCREEN_CAPTURE_METHOD=screen-ocr/)
  assert.match(report.suggestedCommands.screenCaptureMethods['screen-ocr'] ?? '', /FORCE_NATIVE_SCREEN_CAPTURE="1"/)
  assert.match(report.suggestedCommands.browserSummaryPaths?.['keyboard-copy'] ?? '', /keyboard-copy/)
  assert.deepEqual(report.nextPriority.slice(0, 3), [
    'context fixture for browser-automation',
    'context fixture for keyboard-copy',
    'context fixture for chrome-session'
  ])
  assert.equal(report.nextRecommendation.priority, 'page-capture')
  assert.match(report.nextRecommendation.nextCommand ?? '', /chrome-browser-automation/)
  assert.equal(report.nextRecommendation.actionSteps[0]?.recommendation.method, 'browser-automation')
  assert.equal(report.nextRecommendation.actionSteps[1]?.recommendation.method, 'browser-automation')
  assert.equal(report.nextRecommendation.actionSteps[2]?.recommendation.method, 'screen-ocr')
})

test('buildContextFixtureCoverageReport switches next priority to screen methods once page methods are all covered', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'a.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'browser-automation',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser'] } }
    },
    {
      name: 'b.json',
      activeApp: 'Firefox',
      pageCaptureMethod: 'keyboard-copy',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser', 'keyboard'] } }
    },
    {
      name: 'c.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'chrome-session',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser', 'keyboard', 'session'] } }
    },
    { name: 'd.json', activeApp: 'Safari', pageCaptureMethod: 'accessibility', screenCaptureMethod: 'none', userInstruction: 'このページを要約して', actionType: 'summarize', captureTrace: null },
    { name: 'e.json', activeApp: 'Dia', pageCaptureMethod: 'none', screenCaptureMethod: 'window-ocr', userInstruction: 'この画面の内容を把握したい', actionType: 'custom', captureTrace: null }
  ])

  assert.deepEqual(report.uncoveredPageMethods, [])
  assert.deepEqual(report.uncoveredBrowserSteps, [])
  assert.notDeepEqual(report.uncoveredBrowserSummaryPaths, [])
  assert.equal(report.fixturesWithCaptureTrace, 3)
  assert.equal(report.fixturesWithBrowserCaptureSummary, 0)
  assert.deepEqual(report.tracedFixtures, ['a.json', 'b.json', 'c.json'])
  assert.deepEqual(report.untracedFixtures, ['d.json', 'e.json'])
  assert.deepEqual(report.nextPriority, [
    'context fixture for screen-ocr',
    'context fixture for window-screenshot-only',
    'context fixture for screen-screenshot-only'
  ])
  assert.equal(report.nextRecommendation.priority, 'screen-capture')
  assert.equal(report.nextRecommendation.nextPageRecommendation, null)
  assert.equal(report.nextRecommendation.nextTraceRecommendation?.method, 'd.json')
  assert.equal(
    report.suggestedCommands.traceBackfillFixtures?.['d.json'],
    'TARGET_APP="Safari" FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE="summarize" EXPECT_PAGE_CAPTURE_METHOD="accessibility" EXPECT_SCREEN_CAPTURE_METHOD="none" pnpm debug:context:fixture d'
  )
  assert.equal(report.nextRecommendation.actionSteps[0]?.recommendation.method, 'screen-ocr')
})

test('buildContextFixtureCoverageReport prioritizes trace backfill once method coverage is present but fixture traces are still missing', () => {
  const report = buildContextFixtureCoverageReport([
    { name: 'a.json', activeApp: 'Google Chrome', pageCaptureMethod: 'browser-automation', screenCaptureMethod: 'window-ocr', userInstruction: 'このページを要約して', actionType: 'summarize', captureTrace: { browser: { attemptedSteps: ['browser'] } } },
    { name: 'b.json', activeApp: 'Firefox', pageCaptureMethod: 'keyboard-copy', screenCaptureMethod: 'screen-ocr', userInstruction: 'このページを要約して', actionType: 'summarize', captureTrace: { browser: { attemptedSteps: ['browser', 'keyboard'] } } },
    { name: 'c.json', activeApp: 'Google Chrome', pageCaptureMethod: 'chrome-session', screenCaptureMethod: 'window-screenshot-only', userInstruction: 'このページを要約して', actionType: 'summarize', captureTrace: { browser: { attemptedSteps: ['browser', 'keyboard', 'session'] } } },
    { name: 'd.json', activeApp: 'Safari', pageCaptureMethod: 'accessibility', screenCaptureMethod: 'screen-screenshot-only', userInstruction: 'このページを要約して', actionType: 'summarize', captureTrace: null },
    { name: 'e.json', activeApp: 'Dia', pageCaptureMethod: 'none', screenCaptureMethod: 'none', userInstruction: 'この画面の内容を把握したい', actionType: 'custom', captureTrace: null }
  ])

  assert.deepEqual(report.uncoveredPageMethods, [])
  assert.deepEqual(report.uncoveredScreenMethods, [])
  assert.deepEqual(report.uncoveredBrowserSteps, [])
  assert.notDeepEqual(report.uncoveredBrowserSummaryPaths, [])
  assert.deepEqual(report.nextPriority, ['capture trace for d.json', 'capture trace for e.json'])
  assert.equal(report.nextRecommendation.priority, 'trace-backfill')
  assert.equal(report.nextRecommendation.nextTraceRecommendation?.method, 'd.json')
  assert.equal(report.nextRecommendation.nextTraceRecommendation?.targetApp, 'Safari')
  assert.equal(
    report.nextRecommendation.nextCommand,
    'TARGET_APP="Safari" FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE="summarize" EXPECT_PAGE_CAPTURE_METHOD="accessibility" EXPECT_SCREEN_CAPTURE_METHOD="screen-screenshot-only" pnpm debug:context:fixture d'
  )
  assert.deepEqual(report.nextRecommendation.actionSteps, [
    {
      order: 1,
      family: 'trace-backfill',
      recommendation: {
        method: 'd.json',
        targetApp: 'Safari',
        rationale:
          'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
        command: 'TARGET_APP="Safari" FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE="summarize" EXPECT_PAGE_CAPTURE_METHOD="accessibility" EXPECT_SCREEN_CAPTURE_METHOD="screen-screenshot-only" pnpm debug:context:fixture d',
        preflightHints: [
          'Bring Safari to the front before capture and leave the target surface visible.'
        ]
      }
    }
  ])
})

test('buildContextFixtureCoverageReport keeps browser-step gaps actionable after method and trace coverage are complete', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'browser.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'browser-automation',
      screenCaptureMethod: 'window-ocr',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser'] } },
      browserCaptureSummary: {
        path: 'browser-automation',
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'accessibility.json',
      activeApp: 'Safari',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'screen-ocr',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'accessibility-retained',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'session.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'chrome-session',
      screenCaptureMethod: 'window-screenshot-only',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser', 'session'] } },
      browserCaptureSummary: {
        path: 'chrome-session',
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: true
      }
    },
    {
      name: 'none.json',
      activeApp: 'Dia',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'screen-screenshot-only',
      userInstruction: 'この画面の内容を把握したい',
      actionType: 'custom',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'no-page-context',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'keyboard-missing.json',
      activeApp: 'Safari',
      pageCaptureMethod: 'keyboard-copy',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser'] } }
    },
    {
      name: 'short-circuit.json',
      activeApp: 'Safari',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'accessibility-short-circuit',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'screen-fallback.json',
      activeApp: 'Dia',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'window-ocr',
      userInstruction: 'この画面の内容を把握したい',
      actionType: 'custom',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    }
  ], {
    availableApps: ['Google Chrome', 'Safari']
  })

  assert.deepEqual(report.uncoveredPageMethods, [])
  assert.deepEqual(report.uncoveredScreenMethods, [])
  assert.equal(report.uncoveredBrowserSummaryPaths.includes('keyboard-copy'), true)
  assert.deepEqual(report.uncoveredBrowserSteps, ['keyboard'])
  assert.deepEqual(report.untracedFixtures, [])
  assert.equal(report.nextRecommendation.priority, 'page-capture')
  assert.equal(report.nextRecommendation.nextPageRecommendation?.method, 'keyboard-copy')
  assert.equal(report.nextRecommendation.nextBrowserSummaryPath, 'keyboard-copy')
  assert.equal(report.nextRecommendation.nextBrowserSummaryRecommendation?.method, 'keyboard-copy')
  assert.match(
    report.nextRecommendation.nextBrowserSummaryRecommendation?.rationale ?? '',
    /still-uncovered browser summary path "keyboard-copy"/
  )
  assert.match(report.nextRecommendation.nextBrowserSummaryCommand ?? '', /safari-keyboard-copy/)
  assert.match(report.nextRecommendation.nextCommand ?? '', /safari-keyboard-copy/)
})

test('buildContextFixtureCoverageReport keeps no-page-context summary gaps actionable after method and trace coverage are complete', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'browser.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'browser-automation',
      screenCaptureMethod: 'window-ocr',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser'] } },
      browserCaptureSummary: {
        path: 'browser-automation',
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'keyboard.json',
      activeApp: 'Safari',
      pageCaptureMethod: 'keyboard-copy',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser', 'keyboard'] } },
      browserCaptureSummary: {
        path: 'keyboard-copy',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: false
      }
    },
    {
      name: 'session.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'chrome-session',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser', 'keyboard', 'session'] } },
      browserCaptureSummary: {
        path: 'chrome-session',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: true
      }
    },
    {
      name: 'ax.json',
      activeApp: 'Mail',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'none',
      userInstruction: '返信方針を整理したい',
      actionType: 'reply',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'accessibility-short-circuit',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'retained.json',
      activeApp: 'Safari',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser'] } },
      browserCaptureSummary: {
        path: 'accessibility-retained',
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'screen.json',
      activeApp: 'ChatGPT',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'window-ocr',
      userInstruction: 'この文脈を確認したい',
      actionType: 'custom',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'screen-native.json',
      activeApp: 'Dia',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'screen-ocr',
      userInstruction: 'この画面を確認したい',
      actionType: 'custom',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'screen-window-shot.json',
      activeApp: 'Dia',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'window-screenshot-only',
      userInstruction: 'この画面を確認したい',
      actionType: 'custom',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'screen-full-shot.json',
      activeApp: 'Dia',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'screen-screenshot-only',
      userInstruction: 'この画面を確認したい',
      actionType: 'custom',
      captureTrace: { browser: { attemptedSteps: [] } },
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    }
  ])

  assert.equal(report.uncoveredBrowserSummaryPaths.includes('no-page-context'), true)
  assert.equal(report.nextRecommendation.priority, 'page-capture')
  assert.equal(report.nextRecommendation.nextPageRecommendation?.method, 'none')
  assert.equal(report.nextRecommendation.nextBrowserSummaryPath, 'no-page-context')
  assert.equal(report.nextRecommendation.nextBrowserSummaryRecommendation?.method, 'none')
  assert.match(report.nextRecommendation.nextBrowserSummaryCommand ?? '', /dia-no-page-context/)
  assert.match(report.suggestedCommands.browserSummaryPaths?.['no-page-context'] ?? '', /dia-no-page-context/)
})

test('buildContextFixtureCoverageReport backfills browser-step evidence from browser capture summaries when traces are missing', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'a.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: null,
      browserCaptureSummary: {
        path: 'accessibility-retained',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: false
      }
    },
    {
      name: 'b.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'chrome-session',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: null,
      browserCaptureSummary: {
        path: 'chrome-session',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: true
      }
    }
  ])

  assert.equal(report.fixturesWithCaptureTrace, 0)
  assert.equal(report.fixturesWithBrowserCaptureSummary, 2)
  assert.deepEqual(report.summarizedFixtures, ['a.json', 'b.json'])
  assert.deepEqual(report.unsummarizedFixtures, [])
  assert.deepEqual(report.browserStepCoverage['browser'], ['a.json', 'b.json'])
  assert.deepEqual(report.browserStepCoverage['keyboard'], ['a.json', 'b.json'])
  assert.deepEqual(report.browserStepCoverage['session'], ['b.json'])
  assert.deepEqual(report.browserSummaryPathCoverage['accessibility-retained'], ['a.json'])
  assert.deepEqual(report.browserSummaryPathCoverage['chrome-session'], ['b.json'])
})

test('buildContextFixtureCoverageReport trusts trace attempted steps over summary flags when both are present', () => {
  const report = buildContextFixtureCoverageReport([
    {
      name: 'a.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'keyboard-copy',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: {
        browser: {
          attemptedSteps: ['browser', 'keyboard']
        }
      },
      browserCaptureSummary: {
        path: 'chrome-session',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: true
      }
    }
  ])

  assert.deepEqual(report.browserStepCoverage['browser'], ['a.json'])
  assert.deepEqual(report.browserStepCoverage['keyboard'], ['a.json'])
  assert.deepEqual(report.browserStepCoverage['session'], [])
  assert.deepEqual(report.uncoveredBrowserSteps, ['session'])
})

test('buildContextFixtureAppGapSummaries groups fixture gaps by app surface and sorts the weakest proof first', () => {
  const summaries = buildContextFixtureAppGapSummaries([
    {
      name: 'chatgpt-codex-thread-ocr.json',
      activeApp: 'ChatGPT',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'window-ocr',
      userInstruction: 'この文脈を確認したい',
      actionType: 'custom',
      captureTrace: null,
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'chatgpt-codex-selectedtext-noise.json',
      activeApp: 'ChatGPT',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'window-ocr',
      userInstruction: 'この文脈を確認したい',
      actionType: 'custom',
      captureTrace: null,
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'chrome-session-fallback.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'chrome-session',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser', 'keyboard', 'session'] } },
      browserCaptureSummary: {
        path: 'chrome-session',
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: true
      }
    },
    {
      name: 'chrome-browser-automation.json',
      activeApp: 'Google Chrome',
      pageCaptureMethod: 'browser-automation',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: { browser: { attemptedSteps: ['browser'] } },
      browserCaptureSummary: {
        path: 'browser-automation',
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    }
  ])

  assert.equal(summaries[0]?.appName, 'ChatGPT')
  assert.deepEqual(summaries[0]?.fixtureNames, [
    'chatgpt-codex-selectedtext-noise.json',
    'chatgpt-codex-thread-ocr.json'
  ])
  assert.equal(summaries[0]?.tracedFixtureCount, 0)
  assert.equal(summaries[0]?.missingTrace, true)
  assert.equal(summaries[0]?.missingKeyboardCopyCoverage, false)
  assert.equal(summaries[0]?.missingNoPageContextSummary, false)

  assert.equal(summaries[1]?.appName, 'Google Chrome')
  assert.equal(summaries[1]?.tracedFixtureCount, 2)
  assert.equal(summaries[1]?.missingTrace, false)
  assert.equal(summaries[1]?.missingKeyboardCopyCoverage, true)
  assert.equal(summaries[1]?.missingNoPageContextSummary, true)
  assert.deepEqual(summaries[1]?.browserSummaryPaths, ['browser-automation', 'chrome-session'])
})

test('buildContextFixtureAppFollowups maps weak app surfaces to concrete next commands', () => {
  const followups = buildContextFixtureAppFollowups(
    [
      {
        name: 'chatgpt-codex-thread-ocr.json',
        activeApp: 'ChatGPT',
        pageCaptureMethod: 'none',
        screenCaptureMethod: 'window-ocr',
        userInstruction: 'この文脈を確認したい',
        actionType: 'custom',
        captureTrace: null,
        browserCaptureSummary: {
          path: 'screen-ocr-fallback',
          usedBrowserAutomation: false,
          usedKeyboardFallback: false,
          usedSessionFallback: false
        }
      },
      {
        name: 'chrome-browser-automation.json',
        activeApp: 'Google Chrome',
        pageCaptureMethod: 'browser-automation',
        screenCaptureMethod: 'none',
        userInstruction: 'このページを要約して',
        actionType: 'summarize',
        captureTrace: { browser: { attemptedSteps: ['browser'] } },
        browserCaptureSummary: {
          path: 'browser-automation',
          usedBrowserAutomation: true,
          usedKeyboardFallback: false,
          usedSessionFallback: false
        }
      }
    ],
    { availableApps: ['Google Chrome', 'Safari'] }
  )

  assert.equal(followups[0]?.appName, 'ChatGPT')
  assert.equal(followups[0]?.traceBackfillFixture, 'chatgpt-codex-thread-ocr.json')
  assert.match(followups[0]?.traceBackfillCommand ?? '', /TARGET_APP="ChatGPT"/)
  assert.equal(followups[0]?.nextPageMethod, null)
  assert.equal(followups[0]?.nextPageCommand, null)
  assert.equal(followups[0]?.nextScreenMethod, 'screen-ocr')
  assert.match(followups[0]?.nextScreenCommand ?? '', /FORCE_NATIVE_SCREEN_CAPTURE="1"/)

  assert.equal(followups[1]?.appName, 'Google Chrome')
  assert.equal(followups[1]?.traceBackfillCommand, null)
  assert.equal(followups[1]?.nextPageMethod, 'keyboard-copy')
  assert.match(followups[1]?.nextPageCommand ?? '', /safari-keyboard-copy/)
})

test('buildContextFixtureAppGapSummaries only flags browser-specific page gaps for browser-like app surfaces', () => {
  const summaries = buildContextFixtureAppGapSummaries([
    {
      name: 'slack-merged-social.json',
      activeApp: 'Slack',
      pageCaptureMethod: 'none',
      screenCaptureMethod: 'window-ocr',
      userInstruction: '何の話か掴みたい',
      actionType: 'custom',
      captureTrace: null,
      browserCaptureSummary: {
        path: 'screen-ocr-fallback',
        usedBrowserAutomation: false,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    },
    {
      name: 'dia-merged-browser.json',
      activeApp: 'Dia',
      pageCaptureMethod: 'accessibility',
      screenCaptureMethod: 'none',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      captureTrace: null,
      browserCaptureSummary: {
        path: 'accessibility-retained',
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: false
      }
    }
  ])

  const slackSummary = summaries.find((summary) => summary.appName === 'Slack')
  const diaSummary = summaries.find((summary) => summary.appName === 'Dia')

  assert.equal(slackSummary?.missingKeyboardCopyCoverage, false)
  assert.equal(slackSummary?.missingNoPageContextSummary, false)
  assert.equal(diaSummary?.missingKeyboardCopyCoverage, true)
  assert.equal(diaSummary?.missingNoPageContextSummary, true)
})
