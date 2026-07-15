import { app, systemPreferences } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { activateTargetApp, frontmostAppInfo, openUrlInTargetApp } from './target-app-focus.mjs'

async function main() {
  await app.whenReady()

  const { build } = await import(
    pathToFileURL(
      path.join(process.cwd(), 'node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/lib/main.js')
    ).href
  )

  const stamp = Date.now()
  const contextReaderOutfile = path.join(os.tmpdir(), `kashin-context-reader-${stamp}.cjs`)
  const browserCaptureSummaryOutfile = path.join(os.tmpdir(), `kashin-browser-capture-summary-${stamp}.cjs`)
  const sharedBuildOptions = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
    logLevel: 'silent'
  }

  await build({
    entryPoints: [path.join(process.cwd(), 'src/main/context-reader.ts')],
    outfile: contextReaderOutfile,
    ...sharedBuildOptions
  })
  await build({
    entryPoints: [path.join(process.cwd(), 'src/shared/browser-capture-summary.ts')],
    outfile: browserCaptureSummaryOutfile,
    ...sharedBuildOptions
  })

  const { getFrontmostAppInfo, captureCurrentContextDetailed } = await import(pathToFileURL(contextReaderOutfile).href)
  const { buildBrowserCaptureSummary } = await import(pathToFileURL(browserCaptureSummaryOutfile).href)
  const targetApp = process.env.TARGET_APP
  const targetUrl = process.env.TARGET_URL ?? null
  const forceBrowserCapture = process.env.FORCE_BROWSER_CAPTURE === '1'
  const forceScreenCapture = process.env.FORCE_SCREEN_CAPTURE === '1'
  const forceNativeScreenCapture = process.env.FORCE_NATIVE_SCREEN_CAPTURE === '1'
  const suppressScreenOcr = process.env.SUPPRESS_SCREEN_OCR === '1'
  const suppressAccessibilityPageText = process.env.SUPPRESS_ACCESSIBILITY_PAGE_TEXT === '1'
  const suppressBrowserPageText = process.env.SUPPRESS_BROWSER_PAGE_TEXT === '1'
  const suppressKeyboardPageText = process.env.SUPPRESS_KEYBOARD_PAGE_TEXT === '1'
  const suppressSessionPageText = process.env.SUPPRESS_SESSION_PAGE_TEXT === '1'
  const openedTargetUrl = targetUrl ? await openUrlInTargetApp(targetApp, targetUrl) : false
  const targetAppFocus = await activateTargetApp(targetApp)
  const frontmost = await getFrontmostAppInfo()
  const frontmostByAppleScript = await frontmostAppInfo()
  const { context, captureTrace } = await captureCurrentContextDetailed(frontmost, {
    forceBrowserCapture,
    forceScreenCapture,
    forceNativeScreenCapture,
    suppressScreenOcr,
    suppressAccessibilityPageText,
    suppressBrowserPageText,
    suppressKeyboardPageText,
    suppressSessionPageText
  })
  const browserCaptureSummary = buildBrowserCaptureSummary({
    currentContext: context,
    captureTrace
  })

  console.log(
    JSON.stringify(
      {
        targetApp: targetApp ?? null,
        targetUrl,
        openedTargetUrl,
        forcedCaptureOverrides: {
          forceBrowserCapture,
          forceScreenCapture,
          forceNativeScreenCapture,
          suppressScreenOcr,
          suppressAccessibilityPageText,
          suppressBrowserPageText,
          suppressKeyboardPageText,
          suppressSessionPageText
        },
        targetAppFocus,
        targetAppMismatch:
          targetApp && !targetAppFocus.matchedFrontmost
            ? {
                requestedApp: targetApp,
                requestedBundleId: targetAppFocus.requestedMetadata?.bundleId ?? null,
                observedByAppleScript: frontmostByAppleScript.activeApp,
                observedBundleIdByAppleScript: frontmostByAppleScript.bundleId ?? null,
                observedByContextReader: frontmost.activeApp,
                capturedActiveApp: context.activeApp
              }
            : null,
        frontmostByAppleScript,
        accessibilityGranted:
          process.platform === 'darwin' ? systemPreferences.isTrustedAccessibilityClient(false) : true,
        screenCaptureStatus:
          process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
        frontmost,
        frontmostBundleIdByContextReader: targetAppFocus.finalObservedFrontmost?.bundleId ?? null,
        context,
        captureTrace,
        browserCaptureSummary
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
