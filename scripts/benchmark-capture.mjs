/**
 * Context-capture performance harness. Runs the real capture pipeline
 * (`captureCurrentContextDetailed`) N times on this Mac and reports per-stage P50/P95 latency, so we
 * have hard numbers before deciding the app is fast enough to ship.
 *
 * This only produces meaningful data on macOS with Accessibility (and, for the screen path, Screen
 * Recording) permissions granted — the stages call native helpers. It is intentionally NOT wired
 * into CI; run it by hand on a real machine:
 *
 *   pnpm build            # once, so native helper scripts are in place
 *   pnpm bench:capture    # 30 iterations against the frontmost app
 *
 * Useful env vars:
 *   BENCH_ITERATIONS=50            how many measured samples (default 30)
 *   BENCH_WARMUP=3                 unmeasured warmup runs to shake out cold starts (default 2)
 *   TARGET_APP="Google Chrome"    focus this app before each capture (optional)
 *   TARGET_URL="https://…"        open this URL in TARGET_APP first (optional)
 *   FORCE_BROWSER_CAPTURE=1        force the browser-automation path
 *   FORCE_SCREEN_CAPTURE=1         force the screenshot/OCR path
 *   BENCH_OUT=/path/result.json    where to write the full JSON result (default: tmp)
 */
import { app, systemPreferences } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { activateTargetApp, openUrlInTargetApp } from './target-app-focus.mjs'

const STAGE_KEYS = ['accessibilityMs', 'clipboardSelectionMs', 'browserMs', 'screenMs', 'totalMs']

function intEnv(name, fallback) {
  const raw = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback
}

/** Pretty one-line table row. */
function row(label, s) {
  const cell = (n) => String(n).padStart(9)
  return `  ${label.padEnd(20)} ${cell(s.count)} ${cell(s.min)} ${cell(s.p50)} ${cell(s.p95)} ${cell(s.max)} ${cell(s.mean)}`
}

async function main() {
  await app.whenReady()

  const iterations = intEnv('BENCH_ITERATIONS', 30)
  const warmup = intEnv('BENCH_WARMUP', 2)
  const targetApp = process.env.TARGET_APP
  const targetUrl = process.env.TARGET_URL ?? null
  const overrides = {
    forceBrowserCapture: process.env.FORCE_BROWSER_CAPTURE === '1',
    forceScreenCapture: process.env.FORCE_SCREEN_CAPTURE === '1',
    forceNativeScreenCapture: process.env.FORCE_NATIVE_SCREEN_CAPTURE === '1'
  }

  // Bundle the TS modules we need (same approach as dump-context-runner.mjs).
  const { build } = await import(
    pathToFileURL(path.join(process.cwd(), 'node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/lib/main.js')).href
  )
  const stamp = Date.now()
  const readerOut = path.join(os.tmpdir(), `kashin-bench-reader-${stamp}.cjs`)
  const statsOut = path.join(os.tmpdir(), `kashin-bench-stats-${stamp}.cjs`)
  const sharedBuildOptions = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
    logLevel: 'silent'
  }
  await build({ entryPoints: [path.join(process.cwd(), 'src/main/context-reader.ts')], outfile: readerOut, ...sharedBuildOptions })
  await build({ entryPoints: [path.join(process.cwd(), 'src/shared/stats.ts')], outfile: statsOut, ...sharedBuildOptions })

  const { getFrontmostAppInfo, captureCurrentContextDetailed } = await import(pathToFileURL(readerOut).href)
  const { summarizeByKey } = await import(pathToFileURL(statsOut).href)

  const accessibilityGranted = process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : true
  const screenCaptureStatus = process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted'

  if (process.platform !== 'darwin') {
    console.warn('⚠  Not macOS — capture stages are stubbed, so these numbers are not representative.')
  }
  if (!accessibilityGranted) {
    console.warn('⚠  Accessibility permission is OFF — the accessibility/selection stages will be degraded.')
  }

  async function captureOnce() {
    if (targetUrl) await openUrlInTargetApp(targetApp, targetUrl)
    if (targetApp) await activateTargetApp(targetApp)
    const frontmost = await getFrontmostAppInfo()
    const { context, captureTrace } = await captureCurrentContextDetailed(frontmost, overrides)
    return { timings: captureTrace?.timings ?? {}, context }
  }

  console.log(`\nWarming up (${warmup})…`)
  for (let i = 0; i < warmup; i++) await captureOnce()

  console.log(`Measuring ${iterations} captures${targetApp ? ` against ${targetApp}` : ' against the frontmost app'}…\n`)
  const samples = []
  const methods = { page: {}, screen: {}, primary: {} }
  for (let i = 0; i < iterations; i++) {
    const { timings, context } = await captureOnce()
    samples.push(timings)
    methods.page[context.pageCaptureMethod] = (methods.page[context.pageCaptureMethod] ?? 0) + 1
    methods.screen[context.screenCaptureMethod] = (methods.screen[context.screenCaptureMethod] ?? 0) + 1
    methods.primary[context.primaryContentSource] = (methods.primary[context.primaryContentSource] ?? 0) + 1
    process.stdout.write(`\r  ${i + 1}/${iterations}`)
  }
  process.stdout.write('\n\n')

  const summary = summarizeByKey(samples, STAGE_KEYS)

  console.log('Per-stage latency (ms):')
  console.log(`  ${'stage'.padEnd(20)} ${'n'.padStart(9)} ${'min'.padStart(9)} ${'p50'.padStart(9)} ${'p95'.padStart(9)} ${'max'.padStart(9)} ${'mean'.padStart(9)}`)
  for (const key of STAGE_KEYS) console.log(row(key, summary[key]))
  console.log('\nCapture paths exercised:')
  console.log(`  page:    ${JSON.stringify(methods.page)}`)
  console.log(`  screen:  ${JSON.stringify(methods.screen)}`)
  console.log(`  primary: ${JSON.stringify(methods.primary)}`)

  const out = process.env.BENCH_OUT || path.join(os.tmpdir(), `kashin-bench-capture-${stamp}.json`)
  writeFileSync(
    out,
    JSON.stringify(
      {
        ranAt: new Date(stamp).toISOString(),
        platform: process.platform,
        iterations,
        warmup,
        targetApp: targetApp ?? null,
        targetUrl,
        overrides,
        permissions: { accessibilityGranted, screenCaptureStatus },
        summary,
        methods,
        rawSamples: samples
      },
      null,
      2
    )
  )
  console.log(`\nFull result written to ${out}\n`)

  app.quit()
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
