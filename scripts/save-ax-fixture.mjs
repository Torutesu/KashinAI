import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function runDumpAxContext(env) {
  return new Promise((resolve, reject) => {
    const electronBinary = path.join(process.cwd(), 'node_modules', '.bin', 'electron')
    const child = spawn(electronBinary, [path.join(process.cwd(), 'scripts/dump-ax-context.mjs')], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `dump-ax-context failed with code ${code}`))
        return
      }
      resolve(stdout)
    })
  })
}

async function buildExpectationTemplate(snapshot) {
  const { diagnoseAccessibilitySnapshot, extractAccessibilityContext } = await import(
    pathToFileURL(path.join(process.cwd(), 'src/main/accessibility-context.ts')).href
  )

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const extraction = extractAccessibilityContext(snapshot)

  return {
    expectDiagnostics: {
      lowSignal: diagnostics.lowSignal,
      lowSignalReason: diagnostics.lowSignalReason,
      pageUrlCandidate: diagnostics.pageUrlCandidate,
      selectedTextSource: diagnostics.selectedTextSource
    },
    expectSelectedText: extraction.selectedText ?? null,
    rankedLineIncludes: diagnostics.rankedLines.slice(0, 3).map((item) => item.line),
    rankedLineExcludes: [],
    extractionIncludes: [extraction.pageText, extraction.accessibilityText].filter(Boolean).slice(0, 2),
    extractionExcludes: []
  }
}

async function main() {
  const requestedName = process.argv[2] ?? process.env.FIXTURE_NAME
  const targetApp = process.env.TARGET_APP

  if (requestedName === '--help' || requestedName === '-h') {
    console.log('Usage: pnpm debug:ax:fixture <fixture-name>')
    console.log('Optional env: TARGET_APP="Slack" pnpm debug:ax:fixture slack-compose')
    return
  }

  if (!requestedName) {
    console.error('Usage: pnpm debug:ax:fixture <fixture-name>')
    console.error('Optional env: TARGET_APP="Slack" pnpm debug:ax:fixture slack-compose')
    process.exit(1)
  }

  const { parseJsonCommandOutput } = await import(
    pathToFileURL(path.join(process.cwd(), 'src/shared/context-fixture.ts')).href
  )

  const rawOutput = await runDumpAxContext({ TARGET_APP: targetApp })
  const parsed = parseJsonCommandOutput(rawOutput, 'dump-ax-context')
  const snapshot = parsed.snapshot

  if (targetApp && parsed.targetAppFocus?.matchedFrontmost === false) {
    console.error(
      `Requested TARGET_APP=${targetApp}, but frontmost stayed ${parsed.targetAppFocus.finalObservedFrontmost?.activeApp ?? 'unknown'}.`
    )
    if (parsed.targetAppMismatch) {
      console.error(
        `Observed by AppleScript=${parsed.targetAppMismatch.observedByAppleScript ?? 'unknown'}, extracted appName=${parsed.targetAppMismatch.capturedAppNameFromExtraction ?? 'unknown'}.`
      )
    }
    console.error('Bring the intended app to the front manually and retry the fixture command.')
    process.exit(1)
  }

  if (!snapshot) {
    console.error('No accessibility snapshot was returned. Check Accessibility permission and frontmost app state.')
    process.exit(1)
  }

  const dir = path.join(process.cwd(), 'tests/fixtures/accessibility')
  await mkdir(dir, { recursive: true })

  const filename = `${slugify(requestedName)}.json`
  const filePath = path.join(dir, filename)
  const expectationPath = path.join(dir, `${slugify(requestedName)}.expected.json`)
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
  const expectation = await buildExpectationTemplate(snapshot)
  await writeFile(expectationPath, `${JSON.stringify(expectation, null, 2)}\n`, 'utf8')

  console.log(
    JSON.stringify(
      {
        saved: filePath,
        expectation: expectationPath,
        targetApp: parsed.targetApp,
        frontmost: parsed.frontmost,
        diagnostics: parsed.diagnostics,
        suggestedRankedLineIncludes: expectation.rankedLineIncludes
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
