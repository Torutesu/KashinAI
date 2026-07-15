import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isCapturedTargetAppMatch } from './target-app-focus.mjs'

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function pickDumpContextEnv(env = process.env) {
  const forwardedKeys = [
    'TARGET_APP',
    'TARGET_URL',
    'FORCE_BROWSER_CAPTURE',
    'FORCE_SCREEN_CAPTURE',
    'FORCE_NATIVE_SCREEN_CAPTURE',
    'SUPPRESS_SCREEN_OCR',
    'SUPPRESS_ACCESSIBILITY_PAGE_TEXT',
    'SUPPRESS_BROWSER_PAGE_TEXT',
    'SUPPRESS_KEYBOARD_PAGE_TEXT',
    'SUPPRESS_SESSION_PAGE_TEXT'
  ]
  return Object.fromEntries(
    forwardedKeys
      .map((key) => [key, env[key]])
      .filter((entry) => typeof entry[1] === 'string' && entry[1].length > 0)
  )
}

export function resolveFixtureCliOptions(argv = process.argv, env = process.env) {
  const requestedName = argv[2] ?? env.FIXTURE_NAME

  return {
    requestedName,
    targetApp: env.TARGET_APP ?? null,
    userInstruction: env.FIXTURE_USER_INSTRUCTION ?? 'この文脈を確認したい',
    actionType: env.FIXTURE_ACTION_TYPE ?? 'custom',
    expectedPageCaptureMethod: env.EXPECT_PAGE_CAPTURE_METHOD ?? null,
    expectedScreenCaptureMethod: env.EXPECT_SCREEN_CAPTURE_METHOD ?? null,
    expectedAttemptedBrowserSteps: env.EXPECT_BROWSER_ATTEMPTED_STEPS
      ? env.EXPECT_BROWSER_ATTEMPTED_STEPS.split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : null,
    expectedInitialBrowserStep: env.EXPECT_BROWSER_INITIAL_STEP ?? null,
    expectedAfterBrowserStep: env.EXPECT_BROWSER_AFTER_BROWSER_STEP ?? null,
    expectedAfterKeyboardStep: env.EXPECT_BROWSER_AFTER_KEYBOARD_STEP ?? null,
    linkedAccessibilityFixture: env.LINKED_ACCESSIBILITY_FIXTURE ?? null
  }
}

export function isFixtureCliHelpRequest(requestedName) {
  return requestedName === '--help' || requestedName === '-h'
}

export function buildFixtureCliUsageLines() {
  return [
    'Usage: pnpm debug:context:fixture <fixture-name>',
    'Optional env: TARGET_APP="Dia" pnpm debug:context:fixture dia-issue-page',
    'Optional env: FIXTURE_USER_INSTRUCTION="このページを要約して" FIXTURE_ACTION_TYPE=summarize',
    'Optional env: EXPECT_PAGE_CAPTURE_METHOD=browser-automation EXPECT_SCREEN_CAPTURE_METHOD=none',
    'Optional env: EXPECT_BROWSER_ATTEMPTED_STEPS=browser,keyboard EXPECT_BROWSER_INITIAL_STEP=browser',
    'Optional env: LINKED_ACCESSIBILITY_FIXTURE=dia-chrome-only',
    'Writes both the redacted CurrentContext JSON and a starter expectation JSON.'
  ]
}

export function resolveFixtureArtifactPaths(params) {
  const slug = slugify(params.requestedName)
  const dir = path.join(params.cwd, 'tests/fixtures/context')

  return {
    slug,
    dir,
    filename: `${slug}.json`,
    filePath: path.join(dir, `${slug}.json`),
    expectationPath: path.join(dir, `${slug}.expected.json`),
    tracePath: path.join(dir, `${slug}.trace.json`),
    diagnosticsPath: path.join(dir, `${slug}.diagnostics.json`)
  }
}

export function buildSavedFixtureResultSummary(params) {
  return {
    saved: params.filePath,
    expectation: params.expectationPath,
    captureTrace: params.redactedCaptureTrace ? params.tracePath : null,
    accessibilityDiagnostics: params.redactedAccessibilityDiagnostics ? params.diagnosticsPath : null,
    browserCaptureSummary: params.redactedBrowserCaptureSummary,
    targetApp: params.targetApp,
    frontmost: params.frontmost,
    contextKind: params.redacted.contextKind,
    primaryContentSource: params.redacted.primaryContentSource,
    pageCaptureMethod: params.redacted.pageCaptureMethod,
    screenCaptureMethod: params.redacted.screenCaptureMethod,
    screenSourceSelection: params.redactedCaptureTrace?.screen.sourceSelection ?? null,
    browserCaptureDiagnostics: params.redactedBrowserCaptureSummary,
    initialBrowserStep: params.redactedCaptureTrace?.browser.initialNextStep ?? null,
    afterBrowserStep: params.redactedCaptureTrace?.browser.afterBrowserNextStep ?? null,
    afterKeyboardStep: params.redactedCaptureTrace?.browser.afterKeyboardNextStep ?? null,
    attemptedBrowserSteps: params.redactedCaptureTrace?.browser.attemptedSteps ?? [],
    selectedTextSource: params.redacted.selectedTextSource,
    selectedTextPreview: params.redacted.selectedText?.slice(0, 120) ?? null,
    accessibilityLowSignalReason: params.redactedAccessibilityDiagnostics?.lowSignalReason ?? null,
    linkedAccessibilityFixture: params.linkedAccessibilityFixture,
    expectationContext: params.expectation.expectContext,
    suggestedDigestIncludes: params.expectation.digestIncludes,
    digestPreview: params.digest.slice(0, 320)
  }
}

function runDumpContext(env) {
  return new Promise((resolve, reject) => {
    const electronBinary = path.join(process.cwd(), 'node_modules', '.bin', 'electron')
    const child = spawn(electronBinary, [path.join(process.cwd(), 'scripts/dump-context-runner.mjs')], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    const killTimer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('dump-context-runner timed out after 30s'))
    }, 30000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', (error) => {
      clearTimeout(killTimer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(killTimer)
      if (code !== 0) {
        reject(new Error(stderr || `dump-context-runner failed with code ${code}`))
        return
      }
      resolve(stdout)
    })
  })
}

async function main() {
  const options = resolveFixtureCliOptions(process.argv, process.env)

  if (isFixtureCliHelpRequest(options.requestedName)) {
    for (const line of buildFixtureCliUsageLines()) {
      console.log(line)
    }
    return
  }

  if (!options.requestedName) {
    for (const line of buildFixtureCliUsageLines().slice(0, -1)) {
      console.error(line)
    }
    process.exit(1)
  }

  const { buildLiveContextDigest } = await import(
    pathToFileURL(path.join(process.cwd(), 'src/shared/live-context.ts')).href
  )
  const { readdir } = await import('node:fs/promises')
  const { assertExpectedCaptureMethods, assertExpectedCaptureTrace, assertLiveFixtureCaptureIntegrity, describeExpectedCaptureMethodMismatch, redactCurrentContextForFixture, redactCaptureTraceForFixture, redactBrowserCaptureSummaryForFixture, redactAccessibilityDiagnosticsForFixture, buildContextFixtureExpectationTemplate, parseJsonCommandOutput } = await import(
    pathToFileURL(path.join(process.cwd(), 'src/shared/context-fixture.ts')).href
  )
  const { resolveLinkedAccessibilityFixtureName } = await import(
    pathToFileURL(path.join(process.cwd(), 'src/shared/context-fixture-coverage.ts')).href
  )

  const rawOutput = await runDumpContext({
    ...pickDumpContextEnv(),
    TARGET_APP: options.targetApp
  })
  const parsed = parseJsonCommandOutput(rawOutput, 'dump-context-runner')
  const context = parsed.context
  const targetAppConfirmed = options.targetApp
    ? isCapturedTargetAppMatch({
        targetApp: options.targetApp,
        targetBundleId: parsed.targetAppFocus?.requestedMetadata?.bundleId ?? parsed.targetAppMismatch?.requestedBundleId ?? null,
        observedByAppleScript: parsed.targetAppMismatch?.observedByAppleScript ?? parsed.frontmostByAppleScript?.activeApp ?? null,
        observedBundleIdByAppleScript:
          parsed.targetAppMismatch?.observedBundleIdByAppleScript ?? parsed.frontmostByAppleScript?.bundleId ?? null,
        observedByContextReader: parsed.targetAppMismatch?.observedByContextReader ?? parsed.frontmost?.activeApp ?? null,
        observedBundleIdByContextReader: parsed.frontmostBundleIdByContextReader ?? null,
        capturedActiveApp: context?.activeApp ?? null
      })
    : false

  if (options.targetApp && parsed.targetAppFocus?.matchedFrontmost === false && !targetAppConfirmed) {
    console.error(
      `Requested TARGET_APP=${options.targetApp}, but frontmost stayed ${parsed.targetAppFocus.finalObservedFrontmost?.activeApp ?? 'unknown'}.`
    )
    if (parsed.targetAppMismatch) {
      console.error(
        `Observed by AppleScript=${parsed.targetAppMismatch.observedByAppleScript ?? 'unknown'}, context-reader=${parsed.targetAppMismatch.observedByContextReader ?? 'unknown'}, capturedActiveApp=${parsed.targetAppMismatch.capturedActiveApp ?? 'unknown'}.`
      )
    }
    console.error('Bring the intended app to the front manually and retry the fixture command.')
    process.exit(1)
  }

  if (!context) {
    console.error('No context was returned. Check permissions and frontmost app state.')
    process.exit(1)
  }

  try {
    assertExpectedCaptureMethods({
      context,
      expectedPageCaptureMethod: options.expectedPageCaptureMethod,
      expectedScreenCaptureMethod: options.expectedScreenCaptureMethod
    })
  } catch (error) {
    const hints = describeExpectedCaptureMethodMismatch({
      context,
      expectedPageCaptureMethod: options.expectedPageCaptureMethod,
      expectedScreenCaptureMethod: options.expectedScreenCaptureMethod
    })
    if (hints.length > 0) {
      const originalMessage = error instanceof Error ? error.message : String(error)
      throw new Error([originalMessage, ...hints.map((hint) => `Hint: ${hint}`)].join('\n'))
    }
    throw error
  }
  assertExpectedCaptureTrace({
    captureTrace: parsed.captureTrace,
    expectedAttemptedBrowserSteps: options.expectedAttemptedBrowserSteps,
    expectedInitialBrowserStep: options.expectedInitialBrowserStep,
    expectedAfterBrowserStep: options.expectedAfterBrowserStep,
    expectedAfterKeyboardStep: options.expectedAfterKeyboardStep
  })
  assertLiveFixtureCaptureIntegrity({
    context,
    captureTrace: parsed.captureTrace,
    browserCaptureSummary: parsed.browserCaptureSummary,
    accessibilityDiagnostics: parsed.accessibilityDiagnostics
  })

  const artifactPaths = resolveFixtureArtifactPaths({
    cwd: process.cwd(),
    requestedName: options.requestedName
  })
  const dir = artifactPaths.dir
  await mkdir(dir, { recursive: true })
  const filename = artifactPaths.filename
  const filePath = artifactPaths.filePath
  const expectationPath = artifactPaths.expectationPath
  const tracePath = artifactPaths.tracePath
  const diagnosticsPath = artifactPaths.diagnosticsPath
  const accessibilityFixturesDir = path.join(process.cwd(), 'tests/fixtures/accessibility')
  const accessibilityFixtureNames = new Set(
    (await readdir(accessibilityFixturesDir).catch(() => []))
      .filter((name) => name.endsWith('.json') && !name.endsWith('.expected.json'))
      .map((name) => name.replace(/\.json$/i, ''))
  )
  const linkedAccessibilityFixture = resolveLinkedAccessibilityFixtureName({
    contextFixtureName: filename,
    linkedAccessibilityFixture: options.linkedAccessibilityFixture,
    accessibilityFixtureNames
  })
  const redacted = redactCurrentContextForFixture(context)
  const redactedCaptureTrace = redactCaptureTraceForFixture(parsed.captureTrace)
  const redactedBrowserCaptureSummary = redactBrowserCaptureSummaryForFixture(parsed.browserCaptureSummary)
  const redactedAccessibilityDiagnostics = redactAccessibilityDiagnosticsForFixture(parsed.accessibilityDiagnostics)
  const digest = buildLiveContextDigest(redacted)
  await writeFile(filePath, `${JSON.stringify(redacted, null, 2)}\n`, 'utf8')
  if (redactedCaptureTrace) {
    await writeFile(tracePath, `${JSON.stringify(redactedCaptureTrace, null, 2)}\n`, 'utf8')
  }
  if (redactedAccessibilityDiagnostics) {
    await writeFile(diagnosticsPath, `${JSON.stringify(redactedAccessibilityDiagnostics, null, 2)}\n`, 'utf8')
  }
  const expectation = buildContextFixtureExpectationTemplate({
    context: redacted,
    userInstruction: options.userInstruction,
    actionType: options.actionType,
    digest,
    linkedAccessibilityFixture
  })
  await writeFile(expectationPath, `${JSON.stringify(expectation, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      buildSavedFixtureResultSummary({
        filePath,
        expectationPath,
        tracePath,
        diagnosticsPath,
        redacted,
        redactedCaptureTrace,
        redactedBrowserCaptureSummary,
        redactedAccessibilityDiagnostics,
        targetApp: parsed.targetApp,
        frontmost: parsed.frontmost,
        linkedAccessibilityFixture,
        expectation,
        digest
      }),
      null,
      2
    )
  )
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null
const currentFilePath = fileURLToPath(import.meta.url)

if (invokedPath && invokedPath === currentFilePath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
