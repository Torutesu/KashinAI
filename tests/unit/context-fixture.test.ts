import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  assertBrowserCaptureSummaryIntegrity,
  assertAccessibilityDiagnosticsFixtureIntegrity,
  assertContextFixtureTraceIntegrity,
  assertExpectedCaptureTrace,
  assertExpectedCaptureMethods,
  assertLiveFixtureCaptureIntegrity,
  buildContextFixtureExpectationTemplate,
  describeExpectedCaptureMethodMismatch,
  isSavedContextFixtureJsonFile,
  parseJsonCommandOutput,
  redactAccessibilityDiagnosticsForFixture,
  redactBrowserCaptureSummaryForFixture,
  redactCaptureTraceForFixture,
  redactCurrentContextForFixture
} from '../../src/shared/context-fixture.ts'
import { resolvePrimaryContentSelection } from '../../src/main/context-reader-utils.ts'
import { buildLiveContextDigest } from '../../src/shared/live-context.ts'
import type { CurrentContext } from '../../src/shared/types'

const contextFixturesRoot = path.resolve(process.cwd(), 'tests', 'fixtures', 'context')

test('redactCurrentContextForFixture removes unstable runtime-only fields', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Issue 424',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Issue 424',
    pageUrl: 'https://github.com/example/repo/issues/424',
    pageText: 'Current issue body',
    pageCaptureMethod: 'browser-automation',
    accessibilityText: 'Visible issue text',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: '/tmp/kashin/capture.png',
    screenText: 'OCR text',
    screenCaptureMethod: 'window-ocr',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: '2026-07-07T12:34:56.000Z'
  }

  const result = redactCurrentContextForFixture(context)

  assert.equal(result.screenshotPath, null)
  assert.equal(result.timestamp, 'FIXTURE_TIMESTAMP')
  assert.equal(result.pageText, 'Current issue body')
  assert.equal(result.primaryContentSource, 'page-text')
})

test('redactCurrentContextForFixture preserves a none screen-capture state for strong accessibility captures', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing overview',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing overview',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing plans help teams standardize AI workflows across support and sales.',
    pageCaptureMethod: 'accessibility',
    accessibilityText: 'Pricing plans help teams standardize AI workflows across support and sales.',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: '2026-07-07T12:34:56.000Z'
  }

  const result = redactCurrentContextForFixture(context)

  assert.equal(result.screenshotPath, null)
  assert.equal(result.screenCaptureMethod, 'none')
  assert.equal(result.screenText, null)
  assert.equal(result.timestamp, 'FIXTURE_TIMESTAMP')
})

test('redactCaptureTraceForFixture keeps capture provenance in a fixture-safe shape', () => {
  const result = redactCaptureTraceForFixture({
    resolvedActiveApp: 'Dia',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    canSkipOcr: false,
    browser: {
      initialNextStep: 'browser',
      afterBrowserNextStep: 'keyboard',
      afterKeyboardNextStep: 'session',
      attemptedSteps: ['browser', 'keyboard'],
      browserCaptureMethod: 'browser-automation',
      keyboardCaptureMethod: 'keyboard-copy',
      sessionCaptureMethod: null,
      finalPageCaptureMethod: 'keyboard-copy'
    },
    screen: {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal',
      finalScreenCaptureMethod: 'window-ocr',
      sourceSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      }
    }
  })

  assert.deepEqual(result, {
    resolvedActiveApp: 'Dia',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    canSkipOcr: false,
    browser: {
      initialNextStep: 'browser',
      afterBrowserNextStep: 'keyboard',
      afterKeyboardNextStep: 'session',
      attemptedSteps: ['browser', 'keyboard'],
      browserCaptureMethod: 'browser-automation',
      keyboardCaptureMethod: 'keyboard-copy',
      sessionCaptureMethod: null,
      finalPageCaptureMethod: 'keyboard-copy'
    },
    screen: {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal',
      finalScreenCaptureMethod: 'window-ocr',
      sourceSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      }
    }
  })
})

test('redactCaptureTraceForFixture returns null when no capture trace is available', () => {
  assert.equal(redactCaptureTraceForFixture(null), null)
  assert.equal(redactCaptureTraceForFixture(undefined), null)
})

test('redactBrowserCaptureSummaryForFixture keeps browser fallback diagnostics in a fixture-safe shape', () => {
  const result = redactBrowserCaptureSummaryForFixture({
    finalPageCaptureMethod: 'accessibility',
    finalPrimarySource: 'accessibility-text',
    path: 'accessibility-retained',
    pageTitlePresent: true,
    pageUrlPresent: false,
    pageTextLength: 0,
    accessibilityTextLength: 128,
    selectedTextLength: 0,
    usedBrowserAutomation: true,
    usedKeyboardFallback: false,
    usedSessionFallback: false,
    skippedBrowserCapture: false,
    lastAttemptedStep: 'browser',
    nextPlannedStep: 'none',
    stalledAtStep: 'browser'
  })

  assert.deepEqual(result, {
    finalPageCaptureMethod: 'accessibility',
    finalPrimarySource: 'accessibility-text',
    path: 'accessibility-retained',
    pageTitlePresent: true,
    pageUrlPresent: false,
    pageTextLength: 0,
    accessibilityTextLength: 128,
    selectedTextLength: 0,
    usedBrowserAutomation: true,
    usedKeyboardFallback: false,
    usedSessionFallback: false,
    skippedBrowserCapture: false,
    lastAttemptedStep: 'browser',
    nextPlannedStep: 'none',
    stalledAtStep: 'browser'
  })
})

test('redactBrowserCaptureSummaryForFixture returns null when no summary is available', () => {
  assert.equal(redactBrowserCaptureSummaryForFixture(null), null)
  assert.equal(redactBrowserCaptureSummaryForFixture(undefined), null)
})

test('redactAccessibilityDiagnosticsForFixture keeps accessibility diagnostics in a fixture-safe shape', () => {
  const result = redactAccessibilityDiagnosticsForFixture({
    appName: 'Dia',
    rawAppName: 'Dia',
    workspaceAppName: 'Codex',
    topWindowOwnerName: 'Dia',
    windowTitle: 'Issue 424',
    rawWindowTitle: 'Issue 424',
    topWindowTitle: 'Issue 424',
    appResolutionSource: 'top-window-owner',
    windowTitleResolutionSource: 'top-window',
    focusedRole: 'AXWebArea',
    pageUrlCandidate: 'https://example.com/pricing',
    selectedTextPresent: true,
    selectedTextSource: 'top-level-selected-text',
    valueTextPresent: false,
    focusChainNodeCount: 4,
    rankedLines: [
      { line: 'Pricing plans overview', score: 0.91 },
      { line: 'Enterprise tier', score: 0.66 }
    ],
    lowSignal: true,
    lowSignalReason: 'browser-chrome-only'
  })

  assert.deepEqual(result, {
    appName: 'Dia',
    rawAppName: 'Dia',
    workspaceAppName: 'Codex',
    topWindowOwnerName: 'Dia',
    windowTitle: 'Issue 424',
    rawWindowTitle: 'Issue 424',
    topWindowTitle: 'Issue 424',
    appResolutionSource: 'top-window-owner',
    windowTitleResolutionSource: 'top-window',
    focusedRole: 'AXWebArea',
    pageUrlCandidate: 'https://example.com/pricing',
    selectedTextPresent: true,
    selectedTextSource: 'top-level-selected-text',
    valueTextPresent: false,
    focusChainNodeCount: 4,
    rankedLines: [
      { line: 'Pricing plans overview', score: 0.91 },
      { line: 'Enterprise tier', score: 0.66 }
    ],
    lowSignal: true,
    lowSignalReason: 'browser-chrome-only'
  })
})

test('redactAccessibilityDiagnosticsForFixture returns null when no diagnostics are available', () => {
  assert.equal(redactAccessibilityDiagnosticsForFixture(null), null)
  assert.equal(redactAccessibilityDiagnosticsForFixture(undefined), null)
})

test('isSavedContextFixtureJsonFile keeps primary fixture json files but excludes sidecars', () => {
  assert.equal(isSavedContextFixtureJsonFile('dia-browser-automation.json'), true)
  assert.equal(isSavedContextFixtureJsonFile('dia-browser-automation.expected.json'), false)
  assert.equal(isSavedContextFixtureJsonFile('dia-browser-automation.trace.json'), false)
  assert.equal(isSavedContextFixtureJsonFile('dia-browser-automation.summary.json'), false)
  assert.equal(isSavedContextFixtureJsonFile('README.md'), false)
})

test('parseJsonCommandOutput accepts a clean JSON payload directly', () => {
  const parsed = parseJsonCommandOutput<{ ok: boolean; count: number }>('{"ok":true,"count":2}', 'runner')

  assert.deepEqual(parsed, { ok: true, count: 2 })
})

test('parseJsonCommandOutput recovers the trailing JSON object from noisy stdout', () => {
  const parsed = parseJsonCommandOutput<{ context: { activeApp: string } }>(
    [
      '(node:12345) Warning: example warning',
      'Some setup log line',
      '{',
      '  "context": {',
      '    "activeApp": "Codex"',
      '  }',
      '}'
    ].join('\n'),
    'dump-context-runner'
  )

  assert.deepEqual(parsed, {
    context: {
      activeApp: 'Codex'
    }
  })
})

test('parseJsonCommandOutput rejects empty stdout with a clear error', () => {
  assert.throws(
    () => parseJsonCommandOutput('', 'dump-context-runner'),
    /No JSON output was returned from dump-context-runner/
  )
})

test('fixture expectations stay aligned with the pure primary-content selection helper on representative noisy captures', async () => {
  const chromeSessionFixture = JSON.parse(
    await readFile(path.join(contextFixturesRoot, 'chrome-session-fallback.json'), 'utf8')
  ) as CurrentContext
  const chromeSessionExpectation = JSON.parse(
    await readFile(path.join(contextFixturesRoot, 'chrome-session-fallback.expected.json'), 'utf8')
  ) as { expectContext: { primaryContentSource: CurrentContext['primaryContentSource'] } }

  const slackNoiseFixture = JSON.parse(
    await readFile(path.join(contextFixturesRoot, 'slack-selectedtext-noise.json'), 'utf8')
  ) as CurrentContext
  const slackNoiseExpectation = JSON.parse(
    await readFile(path.join(contextFixturesRoot, 'slack-selectedtext-noise.expected.json'), 'utf8')
  ) as { expectContext: { primaryContentSource: CurrentContext['primaryContentSource'] } }

  assert.equal(
    resolvePrimaryContentSelection({
      selectedText: chromeSessionFixture.selectedText,
      pageText: chromeSessionFixture.pageText,
      pageUrl: chromeSessionFixture.pageUrl,
      pageCaptureMethod: chromeSessionFixture.pageCaptureMethod,
      accessibilityText: chromeSessionFixture.accessibilityText,
      screenText: chromeSessionFixture.screenText
    }).source,
    chromeSessionExpectation.expectContext.primaryContentSource
  )

  assert.equal(
    resolvePrimaryContentSelection({
      selectedText: slackNoiseFixture.selectedText,
      pageText: slackNoiseFixture.pageText,
      pageUrl: slackNoiseFixture.pageUrl,
      pageCaptureMethod: slackNoiseFixture.pageCaptureMethod,
      accessibilityText: slackNoiseFixture.accessibilityText,
      screenText: slackNoiseFixture.screenText
    }).source,
    slackNoiseExpectation.expectContext.primaryContentSource
  )
})

test('parseJsonCommandOutput reports a preview when stdout contains no parseable JSON payload', () => {
  assert.throws(
    () => parseJsonCommandOutput('warning only\nstill not json', 'dump-context-runner'),
    /Failed to parse JSON from dump-context-runner\. Output preview: warning only still not json/
  )
})

test('buildContextFixtureExpectationTemplate includes capture provenance in starter expectations', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'KashinAI pricing plans help teams standardize AI workflows across sales and support.',
    pageCaptureMethod: 'chrome-session',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  const result = buildContextFixtureExpectationTemplate({
    context,
    userInstruction: 'このページを要約して',
    actionType: 'summarize',
    digest: buildLiveContextDigest(context),
    linkedAccessibilityFixture: 'dia-browser-tabs'
  })

  assert.deepEqual(result.expectContext, {
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageCaptureMethod: 'chrome-session',
    screenCaptureMethod: 'none',
    selectedTextSource: 'none',
    selectedText: null
  })
  assert.equal(result.linkedAccessibilityFixture ?? null, 'dia-browser-tabs')
  assert.match(result.digestIncludes[0] ?? '', /KashinAI pricing plans help teams/)
})

test('assertExpectedCaptureMethods accepts matching provenance and rejects mismatches', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    pageCaptureMethod: 'browser-automation',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertExpectedCaptureMethods({
      context,
      expectedPageCaptureMethod: 'browser-automation',
      expectedScreenCaptureMethod: 'none'
    })
  })

  assert.throws(() => {
    assertExpectedCaptureMethods({
      context,
      expectedPageCaptureMethod: 'chrome-session'
    })
  }, /Expected pageCaptureMethod=chrome-session/)

  assert.throws(() => {
    assertExpectedCaptureMethods({
      context,
      expectedScreenCaptureMethod: 'window-ocr'
    })
  }, /Expected screenCaptureMethod=window-ocr/)
})

test('assertExpectedCaptureTrace accepts matching browser fallback expectations and rejects mismatches', () => {
  const captureTrace = {
    resolvedActiveApp: 'Dia',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    canSkipOcr: false,
    browser: {
      initialNextStep: 'browser',
      afterBrowserNextStep: 'keyboard',
      afterKeyboardNextStep: 'session',
      attemptedSteps: ['browser', 'keyboard'],
      browserCaptureMethod: 'browser-automation',
      keyboardCaptureMethod: 'keyboard-copy',
      sessionCaptureMethod: null,
      finalPageCaptureMethod: 'keyboard-copy'
    },
    screen: {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal',
      finalScreenCaptureMethod: 'window-ocr'
    }
  } satisfies NonNullable<import('../../src/shared/types').BackendDiagnostics['captureTrace']>

  assert.doesNotThrow(() => {
    assertExpectedCaptureTrace({
      captureTrace,
      expectedAttemptedBrowserSteps: ['browser', 'keyboard'],
      expectedInitialBrowserStep: 'browser',
      expectedAfterBrowserStep: 'keyboard',
      expectedAfterKeyboardStep: 'session'
    })
  })

  assert.throws(() => {
    assertExpectedCaptureTrace({
      captureTrace,
      expectedAttemptedBrowserSteps: ['browser', 'session']
    })
  }, /Expected attempted browser steps=browser -> session/)

  assert.throws(() => {
    assertExpectedCaptureTrace({
      captureTrace,
      expectedAfterKeyboardStep: 'none'
    })
  }, /Expected after-keyboard step=none/)
})

test('assertContextFixtureTraceIntegrity accepts matching trace provenance', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    pageCaptureMethod: 'keyboard-copy',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: 'OCR text',
    screenCaptureMethod: 'window-ocr',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertContextFixtureTraceIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser', 'keyboard'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'keyboard-copy'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-ocr',
          sourceSelection: {
            fallbackReason: 'matched-window',
            preferredCaptureMode: 'desktop-source'
          }
        }
      }
    })
  })
})

test('assertContextFixtureTraceIntegrity rejects title-only accessibility page capture without page signal', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
        context: {
          activeApp: 'ChatGPT',
          windowTitle: 'ChatGPT',
          contextKind: 'social',
          primaryContentSource: 'screen-ocr',
          pageTitle: 'ChatGPT',
          pageUrl: null,
          pageText: null,
          pageCaptureMethod: 'accessibility',
          accessibilityText: null,
          accessibilityCaptureMethod: 'none',
          screenshotPath: null,
          screenText: 'Recovered OCR body',
          screenCaptureMethod: 'window-ocr',
          selectedText: null,
          selectedTextSource: 'none',
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
        },
        captureTrace: null
      }),
    /pageCaptureMethod=accessibility without pageUrl or pageText/i
  )
})

test('describeExpectedCaptureMethodMismatch suggests the right operator overrides for deeper capture proof', () => {
  const context: CurrentContext = {
    activeApp: 'Safari',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Recovered by browser automation',
    pageCaptureMethod: 'browser-automation',
    accessibilityText: 'Pricing',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: 'Some OCR text',
    screenCaptureMethod: 'window-ocr',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  const hints = describeExpectedCaptureMethodMismatch({
    context,
    expectedPageCaptureMethod: 'keyboard-copy',
    expectedScreenCaptureMethod: 'screen-ocr'
  })

  assert.equal(hints.length, 2)
  assert.match(hints[0] ?? '', /FORCE_BROWSER_CAPTURE="1"/)
  assert.match(hints[0] ?? '', /SUPPRESS_BROWSER_PAGE_TEXT="1"/)
  assert.match(hints[1] ?? '', /FORCE_NATIVE_SCREEN_CAPTURE="1"/)
})

test('assertContextFixtureTraceIntegrity rejects screen-ocr primary source without OCR-backed screen provenance', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
        context: {
          activeApp: 'Discord',
          windowTitle: 'general',
          contextKind: 'social',
          primaryContentSource: 'screen-ocr',
          pageTitle: null,
          pageUrl: null,
          pageText: null,
          pageCaptureMethod: 'none',
          accessibilityText: null,
          accessibilityCaptureMethod: 'none',
          screenshotPath: null,
          screenText: null,
          screenCaptureMethod: 'window-screenshot-only',
          selectedText: null,
          selectedTextSource: 'none',
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
        },
        captureTrace: null
      }),
    /primaryContentSource=screen-ocr|screenText is empty/
  )
})

test('assertContextFixtureTraceIntegrity rejects OCR screen methods when screen text is empty', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
        context: {
          activeApp: 'Dia',
          windowTitle: 'Issue 424',
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
          screenCaptureMethod: 'screen-ocr',
          selectedText: null,
          selectedTextSource: 'none',
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
        },
        captureTrace: null
      }),
    /screenCaptureMethod=screen-ocr but screenText is empty/
  )
})

test('assertContextFixtureTraceIntegrity rejects screenshot-only screen methods when OCR text is still present', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
        context: {
          activeApp: 'Dia',
          windowTitle: 'Issue 424',
          contextKind: 'general',
          primaryContentSource: 'none',
          pageTitle: null,
          pageUrl: null,
          pageText: null,
          pageCaptureMethod: 'none',
          accessibilityText: null,
          accessibilityCaptureMethod: 'none',
          screenshotPath: null,
          screenText: 'stale OCR text',
          screenCaptureMethod: 'screen-screenshot-only',
          selectedText: null,
          selectedTextSource: 'none',
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
        },
        captureTrace: null
      }),
    /screenCaptureMethod=screen-screenshot-only but screenText is unexpectedly present/
  )
})

test('assertContextFixtureTraceIntegrity rejects capture traces that claim screen capture ran but final screen method stayed none', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
        context: {
          activeApp: 'Dia',
          windowTitle: 'Issue 424',
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
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
        },
        captureTrace: {
          resolvedActiveApp: 'Dia',
          resolvedWindowTitle: 'Issue 424',
          canSkipBrowserCapture: false,
          canSkipOcr: false,
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
            shouldCaptureScreen: true,
            reason: 'needs-screen-signal',
            finalScreenCaptureMethod: 'none',
            sourceSelection: null
          }
        }
      }),
    /screen capture ran, but context\.screenCaptureMethod=none/
  )
})

test('assertContextFixtureTraceIntegrity rejects capture traces whose screen reason disagrees with whether capture ran', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
        context: {
          activeApp: 'Safari',
          windowTitle: 'Pricing',
          contextKind: 'browser',
          primaryContentSource: 'page-text',
          pageTitle: 'Pricing',
          pageUrl: 'https://example.com/pricing',
          pageText: 'Strong accessibility page context',
          pageCaptureMethod: 'accessibility',
          accessibilityText: 'Strong accessibility page context',
          accessibilityCaptureMethod: 'ax-tree',
          screenshotPath: null,
          screenText: null,
          screenCaptureMethod: 'none',
          selectedText: null,
          selectedTextSource: 'none',
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
        },
        captureTrace: {
          resolvedActiveApp: 'Safari',
          resolvedWindowTitle: 'Pricing',
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
            finalPageCaptureMethod: 'accessibility'
          },
          screen: {
            shouldCaptureScreen: false,
            reason: 'needs-screen-signal',
            finalScreenCaptureMethod: 'none',
            sourceSelection: null
          }
        }
      }),
    /screen capture was skipped, but screen\.reason=needs-screen-signal/
  )
})

test('assertContextFixtureTraceIntegrity rejects capture traces whose screen reason disagrees with the saved final context strength', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
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
          screenText: 'stale screen OCR that should not have been needed',
          screenCaptureMethod: 'window-ocr',
          selectedText: null,
          selectedTextSource: 'none',
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
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
            shouldCaptureScreen: true,
            reason: 'needs-screen-signal',
            finalScreenCaptureMethod: 'window-ocr',
            sourceSelection: {
              fallbackReason: 'matched-window',
              preferredCaptureMode: 'desktop-source'
            }
          }
        }
      }),
    /does not match derived screen reason=strong-accessibility-context/
  )
})

test('assertContextFixtureTraceIntegrity rejects mismatched final capture methods', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    pageCaptureMethod: 'chrome-session',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.throws(() => {
    assertContextFixtureTraceIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'session',
          afterKeyboardNextStep: 'session',
          attemptedSteps: ['browser'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: null,
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'browser-automation'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none',
          sourceSelection: null
        }
      }
    })
  }, /finalPageCaptureMethod=browser-automation/)
})

test('assertAccessibilityDiagnosticsFixtureIntegrity validates selected-text and low-signal consistency', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    pageCaptureMethod: 'accessibility',
    accessibilityText: 'Short browser chrome text',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: 'Current selection',
    selectedTextSource: 'top-level-selected-text',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertAccessibilityDiagnosticsFixtureIntegrity({
      context,
      accessibilityDiagnostics: {
        appName: 'Dia',
        rawAppName: 'Dia',
        workspaceAppName: null,
        topWindowOwnerName: 'Dia',
        windowTitle: 'Pricing',
        rawWindowTitle: 'Pricing',
        topWindowTitle: 'Pricing',
        appResolutionSource: 'raw-app',
        windowTitleResolutionSource: 'raw-window',
        focusedRole: 'AXWebArea',
        pageUrlCandidate: 'https://example.com/pricing',
        selectedTextPresent: true,
        selectedTextSource: 'top-level-selected-text',
        valueTextPresent: false,
        focusChainNodeCount: 3,
        rankedLines: [{ line: 'Pricing page body', score: 0.88 }],
        lowSignal: true,
        lowSignalReason: 'browser-chrome-only'
      }
    })
  })

  assert.throws(
    () =>
      assertAccessibilityDiagnosticsFixtureIntegrity({
        context,
        accessibilityDiagnostics: {
          appName: 'Dia',
          rawAppName: 'Dia',
          workspaceAppName: null,
          topWindowOwnerName: 'Dia',
          windowTitle: 'Pricing',
          rawWindowTitle: 'Pricing',
          topWindowTitle: 'Pricing',
          appResolutionSource: 'raw-app',
          windowTitleResolutionSource: 'raw-window',
          focusedRole: 'AXWebArea',
          pageUrlCandidate: null,
          selectedTextPresent: false,
          selectedTextSource: 'none',
          valueTextPresent: false,
          focusChainNodeCount: 1,
          rankedLines: [],
          lowSignal: false,
          lowSignalReason: null
        }
      }),
    /selectedTextPresent=false/
  )

  assert.throws(
    () =>
      assertAccessibilityDiagnosticsFixtureIntegrity({
        context,
        accessibilityDiagnostics: {
          appName: 'Dia',
          rawAppName: 'Dia',
          workspaceAppName: null,
          topWindowOwnerName: 'Dia',
          windowTitle: 'Pricing',
          rawWindowTitle: 'Pricing',
          topWindowTitle: 'Pricing',
          appResolutionSource: 'raw-app',
          windowTitleResolutionSource: 'raw-window',
          focusedRole: 'AXWebArea',
          pageUrlCandidate: null,
          selectedTextPresent: true,
          selectedTextSource: 'top-level-selected-text',
          valueTextPresent: false,
          focusChainNodeCount: 1,
          rankedLines: [],
          lowSignal: false,
          lowSignalReason: 'browser-chrome-only'
        }
      }),
    /lowSignal=false, but lowSignalReason=browser-chrome-only/
  )
})

test('assertLiveFixtureCaptureIntegrity composes trace summary and accessibility diagnostics checks', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing overview',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing overview',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing plans help teams standardize AI workflows across support and sales.',
    pageCaptureMethod: 'browser-automation',
    accessibilityText: 'short note',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: 'Recovered OCR fallback',
    screenCaptureMethod: 'window-ocr',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertLiveFixtureCaptureIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing overview',
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
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-ocr',
          sourceSelection: {
            fallbackReason: 'matched-window',
            preferredCaptureMode: 'desktop-source'
          }
        }
      },
      browserCaptureSummary: {
        finalPageCaptureMethod: 'browser-automation',
        finalPrimarySource: 'page-text',
        path: 'browser-automation',
        pageTitlePresent: true,
        pageUrlPresent: true,
        pageTextLength: context.pageText?.length ?? 0,
        accessibilityTextLength: context.accessibilityText?.length ?? 0,
        selectedTextLength: 0,
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: false,
        skippedBrowserCapture: false,
        lastAttemptedStep: 'browser',
        nextPlannedStep: 'none',
        stalledAtStep: null
      },
      accessibilityDiagnostics: {
        appName: 'Dia',
        rawAppName: 'Dia',
        workspaceAppName: null,
        topWindowOwnerName: 'Dia',
        windowTitle: 'Pricing overview',
        rawWindowTitle: 'Pricing overview',
        topWindowTitle: 'Pricing overview',
        appResolutionSource: 'raw-app',
        windowTitleResolutionSource: 'raw-window',
        focusedRole: 'AXWebArea',
        pageUrlCandidate: 'https://example.com/pricing',
        selectedTextPresent: false,
        selectedTextSource: 'none',
        valueTextPresent: false,
        focusChainNodeCount: 3,
        rankedLines: [{ line: 'Pricing plans help teams standardize AI workflows across support and sales.', score: 0.82 }],
        lowSignal: false,
        lowSignalReason: null
      }
    })
  })
})

test('assertContextFixtureTraceIntegrity rejects native-screen source selection when the final screen method still claims a window capture', () => {
  assert.throws(
    () =>
      assertContextFixtureTraceIntegrity({
        context: {
          activeApp: 'Codex',
          windowTitle: 'KashinAIで開発を進める',
          contextKind: 'social',
          primaryContentSource: 'screen-ocr',
          pageTitle: null,
          pageUrl: null,
          pageText: null,
          pageCaptureMethod: 'none',
          accessibilityText: null,
          accessibilityCaptureMethod: 'none',
          screenshotPath: null,
          screenText: 'Recovered OCR text',
          screenCaptureMethod: 'window-ocr',
          selectedText: null,
          selectedTextSource: 'none',
          clipboardText: null,
          timestamp: 'FIXTURE_TIMESTAMP'
        },
        captureTrace: {
          resolvedActiveApp: 'Codex',
          resolvedWindowTitle: 'KashinAIで開発を進める',
          canSkipBrowserCapture: false,
          canSkipOcr: false,
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
            shouldCaptureScreen: true,
            reason: 'needs-screen-signal',
            finalScreenCaptureMethod: 'window-ocr',
            sourceSelection: {
              fallbackReason: 'screen-fallback-no-window-match',
              preferredCaptureMode: 'native-screen'
            }
          }
        }
      }),
    /preferredCaptureMode=native-screen is inconsistent with context\.screenCaptureMethod=window-ocr/
  )
})

test('assertContextFixtureTraceIntegrity rejects impossible attempted-step provenance', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4),
    pageCaptureMethod: 'keyboard-copy',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.throws(() => {
    assertContextFixtureTraceIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'keyboard-copy'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none'
        }
      }
    })
  }, /missing "keyboard"/)
})

test('assertBrowserCaptureSummaryIntegrity accepts summaries that match the derived browser diagnostics', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    pageCaptureMethod: 'keyboard-copy',
    accessibilityText: 'Visible fallback text',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertBrowserCaptureSummaryIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser', 'keyboard'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'keyboard-copy'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none'
        }
      },
      browserCaptureSummary: {
        finalPageCaptureMethod: 'keyboard-copy',
        finalPrimarySource: 'page-text',
        path: 'keyboard-copy',
        pageTitlePresent: true,
        pageUrlPresent: true,
        pageTextLength: 'Pricing page body'.length,
        accessibilityTextLength: 'Visible fallback text'.length,
        selectedTextLength: 0,
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: false,
        skippedBrowserCapture: false,
        lastAttemptedStep: 'keyboard',
        nextPlannedStep: 'none',
        stalledAtStep: null
      }
    })
  })
})

test('assertBrowserCaptureSummaryIntegrity rejects saved summaries that drift from the derived diagnostics', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    pageCaptureMethod: 'keyboard-copy',
    accessibilityText: 'Visible fallback text',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.throws(() => {
    assertBrowserCaptureSummaryIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser', 'keyboard'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'keyboard-copy'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none'
        }
      },
      browserCaptureSummary: {
        finalPageCaptureMethod: 'keyboard-copy',
        finalPrimarySource: 'page-text',
        path: 'browser-automation',
        pageTitlePresent: true,
        pageUrlPresent: true,
        pageTextLength: 'Pricing page body'.length,
        accessibilityTextLength: 'Visible fallback text'.length,
        selectedTextLength: 0,
        usedBrowserAutomation: true,
        usedKeyboardFallback: false,
        usedSessionFallback: false,
        skippedBrowserCapture: false,
        lastAttemptedStep: 'browser',
        nextPlannedStep: 'none',
        stalledAtStep: null
      }
    })
  }, /Browser capture summary does not match derived diagnostics/)
})

test('assertBrowserCaptureSummaryIntegrity accepts no-page-context summaries for OCR-led fallback surfaces', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Extension install prompt',
    contextKind: 'browser',
    primaryContentSource: 'screen-ocr',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: 'Open in browser',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: 'Install the extension to continue',
    screenCaptureMethod: 'window-ocr',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertBrowserCaptureSummaryIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Extension install prompt',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser', 'keyboard'],
          browserCaptureMethod: 'none',
          keyboardCaptureMethod: 'none',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'none'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-ocr',
          sourceSelection: {
            fallbackReason: 'matched-window',
            preferredCaptureMode: 'desktop-source'
          }
        }
      },
      browserCaptureSummary: {
        finalPageCaptureMethod: 'none',
        finalPrimarySource: 'screen-ocr',
        path: 'screen-ocr-fallback',
        pageTitlePresent: false,
        pageUrlPresent: false,
        pageTextLength: 0,
        accessibilityTextLength: 'Open in browser'.length,
        selectedTextLength: 0,
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: false,
        skippedBrowserCapture: false,
        lastAttemptedStep: 'keyboard',
        nextPlannedStep: 'none',
        stalledAtStep: 'keyboard'
      }
    })
  })
})

test('assertLiveFixtureCaptureIntegrity accepts screenshot-only screen proof when OCR is intentionally suppressed', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Sparse page shell',
    contextKind: 'browser',
    primaryContentSource: 'none',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'window-screenshot-only',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertLiveFixtureCaptureIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Sparse page shell',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser', 'keyboard'],
          browserCaptureMethod: 'none',
          keyboardCaptureMethod: 'none',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'none'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-screenshot-only',
          sourceSelection: {
            fallbackReason: 'matched-window',
            preferredCaptureMode: 'desktop-source'
          }
        }
      },
      browserCaptureSummary: {
        finalPageCaptureMethod: 'none',
        finalPrimarySource: 'none',
        path: 'no-page-context',
        pageTitlePresent: false,
        pageUrlPresent: false,
        pageTextLength: 0,
        accessibilityTextLength: 0,
        selectedTextLength: 0,
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: false,
        skippedBrowserCapture: false,
        lastAttemptedStep: 'keyboard',
        nextPlannedStep: 'none',
        stalledAtStep: 'keyboard'
      }
    })
  })
})

test('assertLiveFixtureCaptureIntegrity requires captureTrace when live fixture provenance depends on browser or screen capture', () => {
  const browserFallbackContext: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Recovered by keyboard fallback',
    pageCaptureMethod: 'keyboard-copy',
    accessibilityText: 'short fallback',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.throws(() => {
    assertLiveFixtureCaptureIntegrity({
      context: browserFallbackContext,
      captureTrace: null,
      browserCaptureSummary: null
    })
  }, /captureTrace is required/)

  const accessibilityOnlyContext: CurrentContext = {
    ...browserFallbackContext,
    primaryContentSource: 'accessibility-text',
    pageText: 'Accessibility body text',
    pageCaptureMethod: 'accessibility'
  }

  assert.doesNotThrow(() => {
    assertLiveFixtureCaptureIntegrity({
      context: accessibilityOnlyContext,
      captureTrace: null,
      browserCaptureSummary: null
    })
  })

  const screenshotOnlyContext: CurrentContext = {
    ...browserFallbackContext,
    primaryContentSource: 'none',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenCaptureMethod: 'window-screenshot-only'
  }

  assert.throws(() => {
    assertLiveFixtureCaptureIntegrity({
      context: screenshotOnlyContext,
      captureTrace: undefined,
      browserCaptureSummary: null
    })
  }, /captureTrace is required/)
})

test('assertLiveFixtureCaptureIntegrity composes trace and summary checks for live fixture saves', () => {
  const context: CurrentContext = {
    activeApp: 'Dia',
    windowTitle: 'Pricing',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4),
    pageCaptureMethod: 'keyboard-copy',
    accessibilityText: 'Visible fallback text',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: 'FIXTURE_TIMESTAMP'
  }

  assert.doesNotThrow(() => {
    assertLiveFixtureCaptureIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser', 'keyboard'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'keyboard-copy'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none'
        }
      },
      browserCaptureSummary: {
        finalPageCaptureMethod: 'keyboard-copy',
        finalPrimarySource: 'page-text',
        path: 'keyboard-copy',
        pageTitlePresent: true,
        pageUrlPresent: true,
        pageTextLength: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4).length,
        accessibilityTextLength: 'Visible fallback text'.length,
        selectedTextLength: 0,
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: false,
        skippedBrowserCapture: false,
        lastAttemptedStep: 'keyboard',
        nextPlannedStep: 'none',
        stalledAtStep: null
      }
    })
  })

  assert.throws(() => {
    assertLiveFixtureCaptureIntegrity({
      context,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'keyboard-copy'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none'
        }
      },
      browserCaptureSummary: {
        finalPageCaptureMethod: 'keyboard-copy',
        finalPrimarySource: 'page-text',
        path: 'keyboard-copy',
        pageTitlePresent: true,
        pageUrlPresent: true,
        pageTextLength: 'Pricing page body'.length,
        accessibilityTextLength: 'Visible fallback text'.length,
        selectedTextLength: 0,
        usedBrowserAutomation: true,
        usedKeyboardFallback: true,
        usedSessionFallback: false,
        skippedBrowserCapture: false,
        lastAttemptedStep: 'keyboard',
        nextPlannedStep: 'none',
        stalledAtStep: null
      }
    })
  }, /missing "keyboard"/)
})
