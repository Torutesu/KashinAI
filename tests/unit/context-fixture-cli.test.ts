import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import test from 'node:test'
import { buildNextContextFixtureRecommendation } from '../../src/shared/context-fixture-recommendations.ts'

function runNodeScript(scriptPath: string): unknown {
  const stdout = execFileSync('node', [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
  return JSON.parse(stdout) as unknown
}

async function importSaveContextFixtureScript() {
  return import(`../../scripts/save-context-fixture.mjs?test=${Date.now()}-${Math.random()}`)
}

test('debug context next script matches the recommendation derived from coverage output', () => {
  const coverage = runNodeScript(path.join(process.cwd(), 'scripts/check-context-fixture-coverage.mjs')) as {
    nextRecommendation?: unknown
  }
  const next = runNodeScript(path.join(process.cwd(), 'scripts/print-next-context-fixture-command.mjs'))

  assert.deepEqual(next, buildNextContextFixtureRecommendation(coverage as never))
})

test('debug context coverage script derives browser summary coverage for OCR-heavy fixtures even without saved summary files', () => {
  const coverage = runNodeScript(path.join(process.cwd(), 'scripts/check-context-fixture-coverage.mjs')) as {
    fixturesWithBrowserCaptureSummary: number
    summarizedFixtures: string[]
    unsummarizedFixtures: string[]
    browserSummaryPathCoverage: Record<string, string[]>
  }

  assert.equal(coverage.fixturesWithBrowserCaptureSummary, coverage.summarizedFixtures.length)
  assert.deepEqual(coverage.unsummarizedFixtures, [])
  assert.ok(coverage.summarizedFixtures.includes('chatgpt-codex-thread-ocr.json'))
  assert.ok(coverage.summarizedFixtures.includes('discord-merged-ocr.json'))
  assert.ok(coverage.browserSummaryPathCoverage['screen-ocr-fallback']?.includes('chatgpt-codex-thread-ocr.json'))
  assert.ok(coverage.browserSummaryPathCoverage['screen-ocr-fallback']?.includes('discord-merged-ocr.json'))
})

test('debug context coverage script threads matching accessibility low-signal reasons into coverage output', () => {
  const coverage = runNodeScript(path.join(process.cwd(), 'scripts/check-context-fixture-coverage.mjs')) as {
    lowSignalReasonCoverage: Record<string, string[]>
  }

  assert.ok(Array.isArray(coverage.lowSignalReasonCoverage['browser-chrome-only']))
  assert.ok(Array.isArray(coverage.lowSignalReasonCoverage['social-chrome-only']))
  assert.ok(Array.isArray(coverage.lowSignalReasonCoverage['title-only']))
  assert.ok(coverage.lowSignalReasonCoverage['browser-chrome-only']?.includes('dia-chrome-fallback.json'))
  assert.ok(coverage.lowSignalReasonCoverage['social-chrome-only']?.includes('slack-merged-social.json'))
  assert.ok(coverage.lowSignalReasonCoverage['weak-content']?.includes('notion-merged-document.json') === false)
})

test('save-context-fixture CLI helpers keep env forwarding, option parsing, and output paths deterministic', async () => {
  const script = await importSaveContextFixtureScript()

  assert.deepEqual(
    script.pickDumpContextEnv({
      TARGET_APP: 'Safari',
      FORCE_BROWSER_CAPTURE: '1',
      SUPPRESS_BROWSER_PAGE_TEXT: '1',
      UNRELATED_FLAG: 'ignored'
    }),
    {
      TARGET_APP: 'Safari',
      FORCE_BROWSER_CAPTURE: '1',
      SUPPRESS_BROWSER_PAGE_TEXT: '1'
    }
  )

  assert.deepEqual(
    script.resolveFixtureCliOptions(
      ['node', 'scripts/save-context-fixture.mjs', 'Safari keyboard copy'],
      {
        TARGET_APP: 'Safari',
        FIXTURE_USER_INSTRUCTION: 'このページを要約して',
        FIXTURE_ACTION_TYPE: 'summarize',
        EXPECT_PAGE_CAPTURE_METHOD: 'keyboard-copy',
        EXPECT_BROWSER_ATTEMPTED_STEPS: 'browser, keyboard',
        EXPECT_BROWSER_INITIAL_STEP: 'browser',
        EXPECT_BROWSER_AFTER_BROWSER_STEP: 'keyboard',
        EXPECT_BROWSER_AFTER_KEYBOARD_STEP: 'none',
        LINKED_ACCESSIBILITY_FIXTURE: 'dia-chrome-only'
      } as NodeJS.ProcessEnv
    ),
    {
      requestedName: 'Safari keyboard copy',
      targetApp: 'Safari',
      userInstruction: 'このページを要約して',
      actionType: 'summarize',
      expectedPageCaptureMethod: 'keyboard-copy',
      expectedScreenCaptureMethod: null,
      expectedAttemptedBrowserSteps: ['browser', 'keyboard'],
      expectedInitialBrowserStep: 'browser',
      expectedAfterBrowserStep: 'keyboard',
      expectedAfterKeyboardStep: 'none',
      linkedAccessibilityFixture: 'dia-chrome-only'
    }
  )

  assert.equal(script.isFixtureCliHelpRequest('--help'), true)
  assert.equal(script.isFixtureCliHelpRequest('-h'), true)
  assert.equal(script.isFixtureCliHelpRequest('fixture-name'), false)

  assert.deepEqual(script.buildFixtureCliUsageLines(), [
    'Usage: pnpm debug:context:fixture <fixture-name>',
    'Optional env: TARGET_APP="Dia" pnpm debug:context:fixture dia-issue-page',
    'Optional env: FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE=summarize',
    'Optional env: EXPECT_PAGE_CAPTURE_METHOD=browser-automation EXPECT_SCREEN_CAPTURE_METHOD=none',
    'Optional env: EXPECT_BROWSER_ATTEMPTED_STEPS=browser,keyboard EXPECT_BROWSER_INITIAL_STEP=browser',
    'Optional env: LINKED_ACCESSIBILITY_FIXTURE=dia-chrome-only',
    'Writes both the redacted CurrentContext JSON and a starter expectation JSON.'
  ])

    assert.deepEqual(
      script.resolveFixtureArtifactPaths({
        cwd: '/tmp/kashin',
        requestedName: 'Safari keyboard copy'
      }),
      {
        slug: 'safari-keyboard-copy',
        dir: '/tmp/kashin/tests/fixtures/context',
        filename: 'safari-keyboard-copy.json',
        filePath: '/tmp/kashin/tests/fixtures/context/safari-keyboard-copy.json',
        expectationPath: '/tmp/kashin/tests/fixtures/context/safari-keyboard-copy.expected.json',
        tracePath: '/tmp/kashin/tests/fixtures/context/safari-keyboard-copy.trace.json',
        diagnosticsPath: '/tmp/kashin/tests/fixtures/context/safari-keyboard-copy.diagnostics.json'
      }
    )
  })

test('save-context-fixture result summary reports diagnostics sidecars and provenance consistently', async () => {
  const script = await importSaveContextFixtureScript()

  const result = script.buildSavedFixtureResultSummary({
    filePath: '/tmp/kashin/tests/fixtures/context/dia-pricing.json',
    expectationPath: '/tmp/kashin/tests/fixtures/context/dia-pricing.expected.json',
    tracePath: '/tmp/kashin/tests/fixtures/context/dia-pricing.trace.json',
    diagnosticsPath: '/tmp/kashin/tests/fixtures/context/dia-pricing.diagnostics.json',
    redacted: {
      contextKind: 'browser',
      primaryContentSource: 'page-text',
      pageCaptureMethod: 'browser-automation',
      screenCaptureMethod: 'window-ocr',
      selectedTextSource: 'none',
      selectedText: null
    },
    redactedCaptureTrace: {
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'session',
        attemptedSteps: ['browser', 'keyboard']
      },
      screen: {
        sourceSelection: {
          fallbackReason: 'matched-window',
          preferredCaptureMode: 'desktop-source'
        }
      }
    },
    redactedBrowserCaptureSummary: {
      path: 'browser-automation'
    },
    redactedAccessibilityDiagnostics: {
      lowSignalReason: 'browser-chrome-only'
    },
    targetApp: { requested: 'Dia' },
    frontmost: { activeApp: 'Dia', windowTitle: 'Pricing' },
    linkedAccessibilityFixture: 'dia-chrome-only',
    expectation: {
      expectContext: {
        contextKind: 'browser',
        primaryContentSource: 'page-text'
      },
      digestIncludes: ['Pricing plans help teams standardize AI workflows.']
    },
    digest: 'Pricing plans help teams standardize AI workflows.\nLine 2'
  })

  assert.deepEqual(result, {
    saved: '/tmp/kashin/tests/fixtures/context/dia-pricing.json',
    expectation: '/tmp/kashin/tests/fixtures/context/dia-pricing.expected.json',
    captureTrace: '/tmp/kashin/tests/fixtures/context/dia-pricing.trace.json',
    accessibilityDiagnostics: '/tmp/kashin/tests/fixtures/context/dia-pricing.diagnostics.json',
    browserCaptureSummary: {
      path: 'browser-automation'
    },
    targetApp: { requested: 'Dia' },
    frontmost: { activeApp: 'Dia', windowTitle: 'Pricing' },
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageCaptureMethod: 'browser-automation',
    screenCaptureMethod: 'window-ocr',
    screenSourceSelection: {
      fallbackReason: 'matched-window',
      preferredCaptureMode: 'desktop-source'
    },
    browserCaptureDiagnostics: {
      path: 'browser-automation'
    },
    initialBrowserStep: 'browser',
    afterBrowserStep: 'keyboard',
    afterKeyboardStep: 'session',
    attemptedBrowserSteps: ['browser', 'keyboard'],
    selectedTextSource: 'none',
    selectedTextPreview: null,
    accessibilityLowSignalReason: 'browser-chrome-only',
    linkedAccessibilityFixture: 'dia-chrome-only',
    expectationContext: {
      contextKind: 'browser',
      primaryContentSource: 'page-text'
    },
    suggestedDigestIncludes: ['Pricing plans help teams standardize AI workflows.'],
    digestPreview: 'Pricing plans help teams standardize AI workflows.\nLine 2'
  })
})
