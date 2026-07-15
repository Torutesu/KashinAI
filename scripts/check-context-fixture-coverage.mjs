import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  buildContextFixtureAppGapSummaries,
  buildContextFixtureAppFollowups,
  buildContextFixtureCoverageReport,
  resolveLinkedAccessibilityFixtureName
} from '../src/shared/context-fixture-coverage.ts'
import { buildBrowserCaptureSummary } from '../src/shared/browser-capture-summary.ts'

async function detectAvailableApps() {
  const appEntries = await readdir('/Applications').catch(() => [])
  const installedAppNames = new Set(appEntries.map((entry) => entry.replace(/\.app$/i, '')))
  return ['Firefox', 'Google Chrome', 'Safari', 'Arc', 'Brave Browser', 'Microsoft Edge'].filter((name) =>
    installedAppNames.has(name)
  )
}

async function main() {
  const fixturesDir = path.join(process.cwd(), 'tests/fixtures/context')
  const accessibilityFixturesDir = path.join(process.cwd(), 'tests/fixtures/accessibility')
  const availableApps = await detectAvailableApps()
  const { isSavedContextFixtureJsonFile } = await import(
    pathToFileURL(path.join(process.cwd(), 'src/shared/context-fixture.ts')).href
  )
  const names = (await readdir(fixturesDir))
    .filter((name) => isSavedContextFixtureJsonFile(name))
    .sort()
  const accessibilityFixtureNames = new Set(
    (await readdir(accessibilityFixturesDir))
      .filter((name) => name.endsWith('.json') && !name.endsWith('.expected.json'))
      .map((name) => name.replace(/\.json$/i, ''))
  )

  const fixtures = []
  for (const name of names) {
    const fixture = JSON.parse(await readFile(path.join(fixturesDir, name), 'utf8'))
    const expectationPath = path.join(fixturesDir, name.replace(/\.json$/, '.expected.json'))
    let expectation = null

    try {
      expectation = JSON.parse(await readFile(expectationPath, 'utf8'))
    } catch {
      expectation = null
    }
    const linkedAccessibilityFixtureName = resolveLinkedAccessibilityFixtureName({
      contextFixtureName: name,
      linkedAccessibilityFixture: expectation?.linkedAccessibilityFixture ?? null,
      accessibilityFixtureNames
    })
    const accessibilityExpectationPath = linkedAccessibilityFixtureName
      ? path.join(accessibilityFixturesDir, `${linkedAccessibilityFixtureName}.expected.json`)
      : null
    let accessibilityExpectation = null

    try {
      accessibilityExpectation = accessibilityExpectationPath
        ? JSON.parse(await readFile(accessibilityExpectationPath, 'utf8'))
        : null
    } catch {
      accessibilityExpectation = null
    }
    const tracePath = path.join(fixturesDir, name.replace(/\.json$/, '.trace.json'))
    let captureTrace = null

    try {
      captureTrace = JSON.parse(await readFile(tracePath, 'utf8'))
    } catch {
      captureTrace = null
    }
    const diagnosticsPath = path.join(fixturesDir, name.replace(/\.json$/, '.diagnostics.json'))
    let accessibilityDiagnostics = null

    try {
      accessibilityDiagnostics = JSON.parse(await readFile(diagnosticsPath, 'utf8'))
    } catch {
      accessibilityDiagnostics = null
    }
    const summaryPath = path.join(fixturesDir, name.replace(/\.json$/, '.summary.json'))
    let browserCaptureSummary = null

    try {
      browserCaptureSummary = JSON.parse(await readFile(summaryPath, 'utf8'))
    } catch {
      browserCaptureSummary = null
    }

    if (!browserCaptureSummary) {
      browserCaptureSummary = buildBrowserCaptureSummary({
        currentContext: fixture,
        captureTrace: captureTrace ?? undefined
      })
    }

    fixtures.push({
      name,
      activeApp: fixture.activeApp ?? null,
      pageCaptureMethod: fixture.pageCaptureMethod,
      screenCaptureMethod: fixture.screenCaptureMethod,
      accessibilityLowSignalReason: accessibilityExpectation?.expectDiagnostics?.lowSignalReason ?? null,
      hasAccessibilityDiagnostics: Boolean(accessibilityDiagnostics),
      userInstruction: expectation?.userInstruction ?? null,
      actionType: expectation?.actionType ?? null,
      captureTrace,
      browserCaptureSummary
    })
  }
  const report = buildContextFixtureCoverageReport(fixtures, { availableApps })
  const appGapSummaries = buildContextFixtureAppGapSummaries(fixtures)
  const appFollowups = buildContextFixtureAppFollowups(fixtures, { availableApps })

  console.log(
    JSON.stringify(
      {
        fixturesDir,
        appGapSummaries,
        appFollowups,
        ...report
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
