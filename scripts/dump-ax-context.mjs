import { app, systemPreferences } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { activateTargetApp, frontmostAppInfo } from './target-app-focus.mjs'

const execFile = promisify(execFileCallback)

async function buildAccessibilityModule() {
  const { build } = await import(
    pathToFileURL(
      path.join(process.cwd(), 'node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/lib/main.js')
    ).href
  )

  const outfile = path.join(os.tmpdir(), `kashin-accessibility-context-${Date.now()}.cjs`)
  await build({
    entryPoints: [path.join(process.cwd(), 'src/main/accessibility-context.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    sourcemap: false,
    logLevel: 'silent'
  })

  return import(pathToFileURL(outfile).href)
}

async function runAxHelper() {
  const helperPath = path.join(process.cwd(), 'scripts/ax-context.swift')
  const binaryPath = path.join(os.tmpdir(), `kashin-ax-context-${Date.now()}`)
  await execFile('/usr/bin/swiftc', [helperPath, '-o', binaryPath], { timeout: 20000 })
  const { stdout } = await execFile(binaryPath, [], { timeout: 4000, maxBuffer: 1024 * 1024 * 3 })
  return stdout
}

async function main() {
  await app.whenReady()

  const targetApp = process.env.TARGET_APP
  const targetAppFocus = await activateTargetApp(targetApp)

  const { parseAccessibilityHelperOutput, extractAccessibilityContext, diagnoseAccessibilitySnapshot } =
    await buildAccessibilityModule()
  const frontmost = await frontmostAppInfo()
  const raw = await runAxHelper()
  const snapshot = parseAccessibilityHelperOutput(raw)
  const extraction = extractAccessibilityContext(snapshot)
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)

  console.log(
    JSON.stringify(
      {
        targetApp: targetApp ?? null,
        targetAppFocus,
        targetAppMismatch:
          targetApp && !targetAppFocus.matchedFrontmost
            ? {
                requestedApp: targetApp,
                observedByAppleScript: frontmost.activeApp,
                capturedAppNameFromExtraction: extraction.appName
              }
            : null,
        frontmost,
        accessibilityGranted:
          process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : true,
        raw: raw.trim(),
        snapshot,
        diagnostics: {
          ...diagnostics,
          rankedLines: diagnostics.rankedLines.slice(0, 20)
        },
        extraction
      },
      null,
      2
    )
  )

  app.quit()
}

main().catch((error) => {
  console.error(error)
  app.quit()
  process.exitCode = 1
})
