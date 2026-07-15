import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildNextContextFixtureRecommendation,
  buildTraceBackfillCommand,
  describeTraceBackfillRecommendation,
  describePageMethodRecommendation,
  describeScreenMethodRecommendation,
  suggestedCommandForPageMethod,
  suggestedCommandForScreenMethod,
  suggestedCommandForTraceBackfill
} from '../../src/shared/context-fixture-recommendations.ts'

test('suggestedCommandForPageMethod maps uncovered page capture methods to the intended app family', () => {
  assert.match(suggestedCommandForPageMethod('browser-automation') ?? '', /TARGET_APP="Google Chrome"/)
  assert.match(suggestedCommandForPageMethod('browser-automation') ?? '', /EXPECT_BROWSER_ATTEMPTED_STEPS="browser"/)
  assert.match(suggestedCommandForPageMethod('keyboard-copy') ?? '', /TARGET_APP="Firefox"/)
  assert.match(suggestedCommandForPageMethod('keyboard-copy') ?? '', /TARGET_URL="https:\/\/example\.com\/"/)
  assert.match(suggestedCommandForPageMethod('keyboard-copy') ?? '', /FORCE_BROWSER_CAPTURE="1"/)
  assert.match(suggestedCommandForPageMethod('keyboard-copy') ?? '', /SUPPRESS_ACCESSIBILITY_PAGE_TEXT="1"/)
  assert.match(suggestedCommandForPageMethod('keyboard-copy') ?? '', /SUPPRESS_BROWSER_PAGE_TEXT="1"/)
  assert.match(
    suggestedCommandForPageMethod('keyboard-copy') ?? '',
    /EXPECT_BROWSER_ATTEMPTED_STEPS="browser,keyboard"/
  )
  assert.match(suggestedCommandForPageMethod('chrome-session') ?? '', /chrome-session-fallback/)
  assert.match(suggestedCommandForPageMethod('chrome-session') ?? '', /SUPPRESS_ACCESSIBILITY_PAGE_TEXT="1"/)
  assert.match(suggestedCommandForPageMethod('chrome-session') ?? '', /SUPPRESS_KEYBOARD_PAGE_TEXT="1"/)
  assert.match(
    suggestedCommandForPageMethod('chrome-session') ?? '',
    /EXPECT_BROWSER_ATTEMPTED_STEPS="browser,keyboard,session"/
  )
  assert.match(suggestedCommandForPageMethod('accessibility') ?? '', /TARGET_APP="Safari"/)
  assert.match(suggestedCommandForPageMethod('none') ?? '', /pnpm debug:context:fixture dia-no-page-context/)
  assert.match(suggestedCommandForPageMethod('none') ?? '', /EXPECT_PAGE_CAPTURE_METHOD="none"/)
  assert.match(suggestedCommandForPageMethod('none') ?? '', /EXPECT_SCREEN_CAPTURE_METHOD="window-ocr"/)
  assert.equal(suggestedCommandForPageMethod('unknown-method'), null)
})

test('suggestedCommandForPageMethod falls back to an available installed browser for keyboard-copy guidance', () => {
  const command = suggestedCommandForPageMethod('keyboard-copy', {
    availableApps: ['Google Chrome', 'Safari']
  })

  assert.match(command ?? '', /TARGET_APP="Safari"/)
  assert.match(command ?? '', /TARGET_URL="https:\/\/example\.com\/"/)
  assert.match(command ?? '', /pnpm debug:context:fixture safari-keyboard-copy/)
})

test('suggestedCommandForScreenMethod maps uncovered screen capture methods to runnable commands', () => {
  assert.match(suggestedCommandForScreenMethod('screen-ocr') ?? '', /EXPECT_SCREEN_CAPTURE_METHOD=screen-ocr/)
  assert.match(suggestedCommandForScreenMethod('screen-ocr') ?? '', /FORCE_NATIVE_SCREEN_CAPTURE="1"/)
  assert.match(
    suggestedCommandForScreenMethod('screen-screenshot-only') ?? '',
    /EXPECT_SCREEN_CAPTURE_METHOD=screen-screenshot-only/
  )
  assert.match(
    suggestedCommandForScreenMethod('screen-screenshot-only') ?? '',
    /SUPPRESS_SCREEN_OCR="1"/
  )
  assert.match(
    suggestedCommandForScreenMethod('screen-screenshot-only') ?? '',
    /FORCE_NATIVE_SCREEN_CAPTURE="1"/
  )
  assert.match(
    suggestedCommandForScreenMethod('window-screenshot-only') ?? '',
    /FORCE_SCREEN_CAPTURE="1"/
  )
  assert.equal(suggestedCommandForScreenMethod('unknown-method'), null)
})

test('describePageMethodRecommendation includes target app and rationale for real capture families', () => {
  const keyboardCopy = describePageMethodRecommendation('keyboard-copy')
  const browserAutomation = describePageMethodRecommendation('browser-automation')
  const chromeSession = describePageMethodRecommendation('chrome-session')
  const noPageContext = describePageMethodRecommendation('none')

  assert.equal(keyboardCopy?.targetApp, 'Firefox')
  assert.match(keyboardCopy?.rationale ?? '', /keyboard-copy fallback/i)
  assert.match(keyboardCopy?.rationale ?? '', /stronger earlier browser\/AX capture/i)
  assert.equal(browserAutomation?.targetApp, 'Google Chrome')
  assert.match(browserAutomation?.rationale ?? '', /Direct browser automation path/i)
  assert.match(chromeSession?.rationale ?? '', /intentionally suppressed/i)
  assert.equal(noPageContext?.targetApp, 'Dia')
  assert.match(noPageContext?.rationale ?? '', /No page context path wins/i)
  assert.match(noPageContext?.command ?? '', /dia-no-page-context/)
})

test('describePageMethodRecommendation uses the available browser fallback for keyboard-copy on this machine', () => {
  const keyboardCopy = describePageMethodRecommendation('keyboard-copy', {
    availableApps: ['Google Chrome', 'Safari']
  })

  assert.equal(keyboardCopy?.targetApp, 'Safari')
  assert.match(keyboardCopy?.command ?? '', /safari-keyboard-copy/)
  assert.match(keyboardCopy?.preflightHints?.join('\n') ?? '', /Bring Safari to the front/)
  assert.match(keyboardCopy?.preflightHints?.join('\n') ?? '', /predictable public page/)
  assert.match(keyboardCopy?.preflightHints?.join('\n') ?? '', /deeper fallback path/)
})

test('describeScreenMethodRecommendation includes target app and rationale for screen capture paths', () => {
  const screenOcr = describeScreenMethodRecommendation('screen-ocr')
  const screenshotOnly = describeScreenMethodRecommendation('screen-screenshot-only')

  assert.equal(screenOcr?.targetApp, 'Dia')
  assert.match(screenOcr?.rationale ?? '', /Whole-screen native capture path/i)
  assert.match(screenOcr?.preflightHints?.join('\n') ?? '', /Whole-screen native capture is forced/)
  assert.match(screenshotOnly?.rationale ?? '', /screenshot-only provenance/i)
  assert.match(screenshotOnly?.preflightHints?.join('\n') ?? '', /OCR is intentionally suppressed/)
})

test('trace backfill recommendations point at rerunning the same fixture name to save trace evidence', () => {
  assert.equal(suggestedCommandForTraceBackfill('slack-merged-social.json'), 'pnpm debug:context:fixture slack-merged-social')
  const traceCommand = buildTraceBackfillCommand({
    fixtureName: 'slack-merged-social.json',
    targetApp: 'Slack',
    userInstruction: '何の話か掴みたい',
    actionType: 'custom',
    expectedPageCaptureMethod: 'none',
    expectedScreenCaptureMethod: 'window-ocr'
  })
  assert.equal(
    traceCommand,
    'TARGET_APP="Slack" FIXTURE_USER_INSTRUCTION="何の話か掴みたい" FIXTURE_ACTION_TYPE="custom" EXPECT_PAGE_CAPTURE_METHOD="none" EXPECT_SCREEN_CAPTURE_METHOD="window-ocr" pnpm debug:context:fixture slack-merged-social'
  )
  const recommendation = describeTraceBackfillRecommendation({
    fixtureName: 'slack-merged-social.json',
    targetApp: 'Slack',
    command: traceCommand
  })
  assert.equal(recommendation?.targetApp, 'Slack')
  assert.match(recommendation?.rationale ?? '', /no trace evidence yet/i)
  assert.match(recommendation?.preflightHints?.join('\n') ?? '', /Bring Slack to the front/)
})

test('buildNextContextFixtureRecommendation prioritizes page capture when both families are uncovered', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: ['browser-automation', 'keyboard-copy'],
    uncoveredScreenMethods: ['screen-ocr'],
    uncoveredBrowserSteps: ['browser', 'keyboard', 'session'],
    untracedFixtures: ['slack-merged-social.json'],
    traceBackfillTargets: {
      'slack-merged-social.json': 'Slack'
    },
    suggestedCommands: {
      pageCaptureMethods: {
        'browser-automation': 'capture-page',
        'keyboard-copy': 'capture-keyboard'
      },
      screenCaptureMethods: {
        'screen-ocr': 'capture-screen'
      }
    }
  })

  assert.deepEqual(recommendation, {
    nextPageMethod: 'browser-automation',
    nextScreenMethod: 'screen-ocr',
    nextBrowserSummaryPath: null,
    nextTraceFixture: 'slack-merged-social.json',
    nextPageCommand: 'capture-page',
    nextScreenCommand: 'capture-screen',
    nextBrowserSummaryCommand: null,
    nextTraceCommand: 'pnpm debug:context:fixture slack-merged-social',
    nextCommand: 'capture-page',
    nextPageRecommendation: {
      method: 'browser-automation',
      targetApp: 'Google Chrome',
      rationale: 'Direct browser automation path for a Chromium browser tab with readable body text.',
      command: suggestedCommandForPageMethod('browser-automation'),
      preflightHints: [
        'Bring Google Chrome to the front before capture and leave the target surface visible.'
      ]
    },
    nextScreenRecommendation: {
      method: 'screen-ocr',
      targetApp: 'Dia',
      rationale: 'Whole-screen native capture path wins and OCR text is required to recover useful context.',
      command: suggestedCommandForScreenMethod('screen-ocr'),
      preflightHints: [
        'Bring Dia to the front before capture and leave the target surface visible.',
        'Whole-screen native capture is forced, so window-thumbnail selection will be bypassed.'
      ]
    },
    nextBrowserSummaryRecommendation: null,
    nextTraceRecommendation: {
      method: 'slack-merged-social.json',
      targetApp: 'Slack',
      rationale:
        'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
      command: 'pnpm debug:context:fixture slack-merged-social',
      preflightHints: []
    },
    actionSteps: [
      {
        order: 1,
        family: 'page-capture',
        recommendation: {
          method: 'browser-automation',
          targetApp: 'Google Chrome',
          rationale: 'Direct browser automation path for a Chromium browser tab with readable body text.',
          command: suggestedCommandForPageMethod('browser-automation'),
          preflightHints: [
            'Bring Google Chrome to the front before capture and leave the target surface visible.'
          ]
        }
      },
      {
        order: 2,
        family: 'screen-capture',
        recommendation: {
          method: 'screen-ocr',
          targetApp: 'Dia',
          rationale: 'Whole-screen native capture path wins and OCR text is required to recover useful context.',
          command: suggestedCommandForScreenMethod('screen-ocr'),
          preflightHints: [
            'Bring Dia to the front before capture and leave the target surface visible.',
            'Whole-screen native capture is forced, so window-thumbnail selection will be bypassed.'
          ]
        }
      }
    ],
    priority: 'page-capture'
  })
})

test('buildNextContextFixtureRecommendation falls back to screen capture when page capture is already covered', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: [],
    uncoveredScreenMethods: ['screen-ocr'],
    uncoveredBrowserSteps: ['browser'],
    untracedFixtures: ['slack-merged-social.json'],
    traceBackfillTargets: {
      'slack-merged-social.json': 'Slack'
    },
    suggestedCommands: {
      pageCaptureMethods: {},
      screenCaptureMethods: {
        'screen-ocr': 'capture-screen'
      }
    }
  })

  assert.deepEqual(recommendation, {
    nextPageMethod: null,
    nextScreenMethod: 'screen-ocr',
    nextBrowserSummaryPath: null,
    nextTraceFixture: 'slack-merged-social.json',
    nextPageCommand: null,
    nextScreenCommand: 'capture-screen',
    nextBrowserSummaryCommand: null,
    nextTraceCommand: 'pnpm debug:context:fixture slack-merged-social',
    nextCommand: 'capture-screen',
    nextPageRecommendation: null,
    nextScreenRecommendation: {
      method: 'screen-ocr',
      targetApp: 'Dia',
      rationale: 'Whole-screen native capture path wins and OCR text is required to recover useful context.',
      command: suggestedCommandForScreenMethod('screen-ocr'),
      preflightHints: [
        'Bring Dia to the front before capture and leave the target surface visible.',
        'Whole-screen native capture is forced, so window-thumbnail selection will be bypassed.'
      ]
    },
    nextBrowserSummaryRecommendation: null,
    nextTraceRecommendation: {
      method: 'slack-merged-social.json',
      targetApp: 'Slack',
      rationale:
        'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
      command: 'pnpm debug:context:fixture slack-merged-social',
      preflightHints: []
    },
    actionSteps: [
      {
        order: 1,
        family: 'screen-capture',
        recommendation: {
          method: 'screen-ocr',
          targetApp: 'Dia',
          rationale: 'Whole-screen native capture path wins and OCR text is required to recover useful context.',
          command: suggestedCommandForScreenMethod('screen-ocr'),
          preflightHints: [
            'Bring Dia to the front before capture and leave the target surface visible.',
            'Whole-screen native capture is forced, so window-thumbnail selection will be bypassed.'
          ]
        }
      },
      {
        order: 2,
        family: 'trace-backfill',
        recommendation: {
          method: 'slack-merged-social.json',
          targetApp: 'Slack',
          rationale:
            'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
          command: 'pnpm debug:context:fixture slack-merged-social',
          preflightHints: []
        }
      }
    ],
    priority: 'screen-capture'
  })
})

test('buildNextContextFixtureRecommendation uses an available browser app for keyboard-copy next steps', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: ['keyboard-copy'],
    uncoveredScreenMethods: ['screen-ocr'],
    uncoveredBrowserSteps: ['keyboard'],
    untracedFixtures: [],
    availableApps: ['Google Chrome', 'Safari'],
    suggestedCommands: {
      pageCaptureMethods: {
        'keyboard-copy':
          'TARGET_APP="Safari" TARGET_URL="https://example.com/" FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE="summarize" EXPECT_PAGE_CAPTURE_METHOD="keyboard-copy" EXPECT_BROWSER_ATTEMPTED_STEPS="browser,keyboard" EXPECT_BROWSER_INITIAL_STEP="browser" EXPECT_BROWSER_AFTER_BROWSER_STEP="keyboard" EXPECT_BROWSER_AFTER_KEYBOARD_STEP="none" pnpm debug:context:fixture safari-keyboard-copy'
      },
      screenCaptureMethods: {
        'screen-ocr': 'capture-screen'
      }
    }
  })

  assert.equal(recommendation.nextPageRecommendation?.targetApp, 'Safari')
  assert.match(recommendation.nextPageRecommendation?.command ?? '', /safari-keyboard-copy/)
  assert.equal(recommendation.nextCommand?.includes('TARGET_APP="Safari"'), true)
})

test('buildNextContextFixtureRecommendation prioritizes trace backfill once method coverage is present but trace evidence is still missing', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: [],
    uncoveredScreenMethods: [],
    uncoveredBrowserSteps: ['browser'],
    untracedFixtures: ['dia-merged-browser.json'],
    suggestedCommands: {
      pageCaptureMethods: {},
      screenCaptureMethods: {}
    }
  })

  assert.deepEqual(recommendation, {
    nextPageMethod: null,
    nextScreenMethod: null,
    nextBrowserSummaryPath: null,
    nextTraceFixture: 'dia-merged-browser.json',
    nextPageCommand: null,
    nextScreenCommand: null,
    nextBrowserSummaryCommand: null,
    nextTraceCommand: 'pnpm debug:context:fixture dia-merged-browser',
    nextCommand: 'pnpm debug:context:fixture dia-merged-browser',
    nextPageRecommendation: null,
    nextScreenRecommendation: null,
    nextBrowserSummaryRecommendation: null,
    nextTraceRecommendation: {
      method: 'dia-merged-browser.json',
      targetApp: null,
      rationale:
        'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
      command: 'pnpm debug:context:fixture dia-merged-browser',
      preflightHints: []
    },
    actionSteps: [
      {
        order: 1,
        family: 'trace-backfill',
        recommendation: {
          method: 'dia-merged-browser.json',
          targetApp: null,
          rationale:
            'This fixture has saved context but no trace evidence yet, so browser fallback steps and screen-capture decisions are still unproven.',
          command: 'pnpm debug:context:fixture dia-merged-browser',
          preflightHints: []
        }
      },
      {
        order: 2,
        family: 'page-capture',
        recommendation: {
          method: 'browser-automation',
          targetApp: 'Google Chrome',
          rationale: 'Direct browser automation path for a Chromium browser tab with readable body text.',
          command:
            'TARGET_APP="Google Chrome" FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE="summarize" EXPECT_PAGE_CAPTURE_METHOD="browser-automation" EXPECT_BROWSER_ATTEMPTED_STEPS="browser" EXPECT_BROWSER_INITIAL_STEP="browser" EXPECT_BROWSER_AFTER_BROWSER_STEP="none" pnpm debug:context:fixture chrome-browser-automation',
          preflightHints: [
            'Bring Google Chrome to the front before capture and leave the target surface visible.'
          ]
        }
      }
    ],
    priority: 'trace-backfill'
  })
})

test('buildNextContextFixtureRecommendation falls back to browser-step guidance when methods and traces are already covered', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: [],
    uncoveredScreenMethods: [],
    uncoveredBrowserSteps: ['keyboard'],
    untracedFixtures: [],
    availableApps: ['Google Chrome', 'Safari'],
    suggestedCommands: {
      pageCaptureMethods: {},
      screenCaptureMethods: {}
    }
  })

  assert.equal(recommendation.priority, 'page-capture')
  assert.equal(recommendation.nextPageMethod, 'keyboard-copy')
  assert.equal(recommendation.nextScreenMethod, null)
  assert.equal(recommendation.nextTraceFixture, null)
  assert.match(recommendation.nextCommand ?? '', /safari-keyboard-copy/)
  assert.equal(recommendation.nextPageRecommendation?.method, 'keyboard-copy')
  assert.equal(recommendation.nextPageRecommendation?.targetApp, 'Safari')
  assert.deepEqual(recommendation.actionSteps, [
    {
      order: 1,
      family: 'page-capture',
      recommendation: recommendation.nextPageRecommendation
    }
  ])
})

test('buildNextContextFixtureRecommendation can target an uncovered browser summary path after methods and traces are covered', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: [],
    uncoveredScreenMethods: [],
    uncoveredBrowserSummaryPaths: ['keyboard-copy'],
    uncoveredBrowserSteps: ['keyboard'],
    untracedFixtures: [],
    availableApps: ['Google Chrome', 'Safari'],
    suggestedCommands: {
      pageCaptureMethods: {},
      screenCaptureMethods: {}
    }
  })

  assert.equal(recommendation.priority, 'page-capture')
  assert.equal(recommendation.nextPageMethod, 'keyboard-copy')
  assert.equal(recommendation.nextBrowserSummaryPath, 'keyboard-copy')
  assert.equal(recommendation.nextBrowserSummaryRecommendation?.method, 'keyboard-copy')
  assert.match(
    recommendation.nextBrowserSummaryRecommendation?.rationale ?? '',
    /still-uncovered browser summary path "keyboard-copy"/
  )
  assert.match(recommendation.nextBrowserSummaryCommand ?? '', /safari-keyboard-copy/)
  assert.deepEqual(recommendation.actionSteps, [
    {
      order: 1,
      family: 'page-capture',
      recommendation: recommendation.nextPageRecommendation
    },
    {
      order: 2,
      family: 'page-capture',
      recommendation: recommendation.nextBrowserSummaryRecommendation
    }
  ])
})

test('buildNextContextFixtureRecommendation keeps browser-summary closure visible even when the same page method is still uncovered', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: ['keyboard-copy'],
    uncoveredScreenMethods: ['window-screenshot-only'],
    uncoveredBrowserSummaryPaths: ['keyboard-copy', 'no-page-context'],
    untracedFixtures: [],
    availableApps: ['Safari'],
    suggestedCommands: {
      pageCaptureMethods: {
        'keyboard-copy':
          'TARGET_APP="Safari" TARGET_URL="https://example.com/" FORCE_BROWSER_CAPTURE="1" SUPPRESS_ACCESSIBILITY_PAGE_TEXT="1" SUPPRESS_BROWSER_PAGE_TEXT="1" FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE="summarize" EXPECT_PAGE_CAPTURE_METHOD="keyboard-copy" EXPECT_BROWSER_ATTEMPTED_STEPS="browser,keyboard" EXPECT_BROWSER_INITIAL_STEP="browser" EXPECT_BROWSER_AFTER_BROWSER_STEP="keyboard" EXPECT_BROWSER_AFTER_KEYBOARD_STEP="none" pnpm debug:context:fixture safari-keyboard-copy'
      },
      screenCaptureMethods: {
        'window-screenshot-only':
          'TARGET_APP="Dia" FORCE_SCREEN_CAPTURE="1" SUPPRESS_SCREEN_OCR="1" EXPECT_SCREEN_CAPTURE_METHOD=window-screenshot-only pnpm debug:context:fixture dia-window-screenshot-only'
      }
    }
  })

  assert.equal(recommendation.priority, 'page-capture')
  assert.equal(recommendation.nextPageMethod, 'keyboard-copy')
  assert.equal(recommendation.nextBrowserSummaryPath, 'keyboard-copy')
  assert.equal(recommendation.nextBrowserSummaryRecommendation?.method, 'keyboard-copy')
  assert.deepEqual(recommendation.actionSteps, [
    {
      order: 1,
      family: 'page-capture',
      recommendation: recommendation.nextPageRecommendation
    },
    {
      order: 2,
      family: 'page-capture',
      recommendation: recommendation.nextBrowserSummaryRecommendation
    },
    {
      order: 3,
      family: 'screen-capture',
      recommendation: recommendation.nextScreenRecommendation
    }
  ])
})

test('buildNextContextFixtureRecommendation can target an uncovered no-page-context summary path with a no-page fixture command', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: [],
    uncoveredScreenMethods: [],
    uncoveredBrowserSummaryPaths: ['no-page-context'],
    uncoveredBrowserSteps: [],
    untracedFixtures: [],
    suggestedCommands: {
      pageCaptureMethods: {},
      screenCaptureMethods: {}
    }
  })

  assert.equal(recommendation.priority, 'page-capture')
  assert.equal(recommendation.nextPageMethod, 'none')
  assert.equal(recommendation.nextBrowserSummaryPath, 'no-page-context')
  assert.equal(recommendation.nextBrowserSummaryRecommendation?.method, 'none')
  assert.match(
    recommendation.nextBrowserSummaryRecommendation?.rationale ?? '',
    /still-uncovered browser summary path "no-page-context"/
  )
  assert.match(recommendation.nextBrowserSummaryCommand ?? '', /dia-no-page-context/)
  assert.match(recommendation.nextCommand ?? '', /dia-no-page-context/)
})

test('buildNextContextFixtureRecommendation reports complete when both families are covered', () => {
  const recommendation = buildNextContextFixtureRecommendation({
    uncoveredPageMethods: [],
    uncoveredScreenMethods: [],
    uncoveredBrowserSummaryPaths: [],
    uncoveredBrowserSteps: [],
    untracedFixtures: [],
    suggestedCommands: {
      pageCaptureMethods: {},
      screenCaptureMethods: {}
    }
  })

  assert.deepEqual(recommendation, {
    nextPageMethod: null,
    nextScreenMethod: null,
    nextBrowserSummaryPath: null,
    nextTraceFixture: null,
    nextPageCommand: null,
    nextScreenCommand: null,
    nextBrowserSummaryCommand: null,
    nextTraceCommand: null,
    nextCommand: null,
    nextPageRecommendation: null,
    nextScreenRecommendation: null,
    nextBrowserSummaryRecommendation: null,
    nextTraceRecommendation: null,
    actionSteps: [],
    priority: 'complete'
  })
})
