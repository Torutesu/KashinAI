import { app, clipboard, desktopCapturer } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { CurrentContext } from '../shared/types'
import {
  parseAccessibilityHelperOutput,
  resolveAccessibilityCaptureOutcome,
  type AccessibilityDiagnostics
} from './accessibility-context'
import {
  buildBrowserPageContext,
  type CapturePlanOverrides,
  type ScreenSourceSelection,
  buildScreenCaptureMethod,
  browserMetadata,
  resolveBundledResourcePathCandidates,
  resolveBundledResourceRuntimePath,
  shouldReuseCompiledHelperBinary,
  analyzeDesktopCaptureSourceSelection,
  resolveDesktopCaptureRuntimePlan,
  EMPTY_PAGE_CONTEXT,
  extractSessionUrls,
  extractTextFromHtml,
  mergeBrowserPageContexts,
  normalizeCopiedText,
  normalizeBrowserPageCapture,
  parseBrowserAutomationCapture,
  parseChromiumTabMetadata,
  parseLsAppInfoFrontRecord,
  pickRecentChromiumSessionFiles,
  resolveChromiumSessionPageContextPlan,
  resolveBrowserPageContextResolutionPlan,
  resolveBrowserPageContextFetchExecutionPlan,
  resolveBrowserCaptureStepExecutionPlan,
  advanceBrowserCaptureExecutionLoopState,
  finalizeContextCaptureResult,
  resolveFrontmostAppName,
  resolveContextCapturePreparation,
  resolveContextCaptureRuntimeState,
  resolveChromiumBrowserPageContext,
  resolveChromiumSessionBrowserPageContext,
  buildChromiumTabBodyTextAppleScript,
  buildChromiumTabMetadataAppleScript,
  buildSafariPageCaptureAppleScript,
  escapeAppleScriptString,
  resolveBrowserPageCaptureRuntimeInvocation,
  resolveBrowserCaptureRuntimeInvocation,
  resolveBrowserCaptureLoopIteration,
  resolveKeyboardCopyBrowserPageContext,
  resolveInitialScreenCaptureMode,
  resolveInitialScreenCaptureRuntimeInvocation,
  resolveInitialScreenSourceSelection,
  resolveCapturedScreenshotRuntime,
  resolveScreenCaptureAttemptExecution,
  resolveScreenContextCaptureRequest,
  resolveScreenContextExecutionPlan,
  finalizeScreenContext,
  shouldAcceptPublicPageFetchResponse,
  resolvePublicPageTextFetchExecutionPlan,
  resolvePublicPageFetchRequest,
} from './context-reader-utils'

const execFileAsync = promisify(execFile)

async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script], { timeout: 5000, maxBuffer: 1024 * 1024 * 2 })
  return stdout.trim()
}

async function readFrontmostAppFromLsAppInfo(): Promise<string | null> {
  try {
    const { stdout: asnStdout } = await execFileAsync('lsappinfo', ['front'])
    const parsedFront = parseLsAppInfoFrontRecord(asnStdout)
    const asn = parsedFront.asn?.replace(/:$/, '')
    if (!asn) return parsedFront.displayName

    const { stdout: infoStdout } = await execFileAsync('lsappinfo', ['info', '-only', 'name', asn])
    const parsedInfo = parseLsAppInfoFrontRecord(infoStdout)
    return parsedInfo.displayName || parsedFront.displayName
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function escapeForAppleScript(value: string): string {
  return escapeAppleScriptString(value)
}

export type FrontmostAppInfo = {
  activeApp: string | null
  windowTitle: string | null
}

type AccessibilityContext = {
  appName: string | null
  windowTitle: string | null
  selectedText: string | null
  accessibilityText: string | null
  accessibilityCaptureMethod: CurrentContext['accessibilityCaptureMethod']
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
}

type BrowserPageContext = Pick<CurrentContext, 'pageTitle' | 'pageUrl' | 'pageText' | 'pageCaptureMethod'>

type ScreenContext = Pick<CurrentContext, 'screenshotPath' | 'screenText' | 'screenCaptureMethod'>

type ScreenshotCapture = {
  screenshotPath: string
  sourceKind: 'window' | 'screen'
  sourceSelection?: ScreenSourceSelection | null
}

function resolveBundledResourcePath(devRelativePath: string, packagedFileName: string): string {
  const candidates = resolveBundledResourcePathCandidates({
    isPackaged: app.isPackaged,
    cwd: process.cwd(),
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    devRelativePath,
    packagedFileName
  })

  return resolveBundledResourceRuntimePath({
    candidates,
    existingPaths: candidates.filter((candidate) => existsSync(candidate)),
    fallbackPath: path.join(process.cwd(), devRelativePath)
  })
}

function ocrScriptPath(): string {
  return resolveBundledResourcePath('scripts/ocr.swift', 'ocr.swift')
}

function axScriptPath(): string {
  return resolveBundledResourcePath('scripts/ax-context.swift', 'ax-context.swift')
}

async function compiledHelperPath(scriptPath: string, binaryName: string): Promise<string> {
  const helpersDir = path.join(app.getPath('userData'), 'helpers')
  await mkdir(helpersDir, { recursive: true })
  const binaryPath = path.join(helpersDir, binaryName)

  try {
    const [binaryInfo, scriptInfo] = await Promise.all([stat(binaryPath), stat(scriptPath)])
    if (
      shouldReuseCompiledHelperBinary({
        binaryMtimeMs: binaryInfo.mtimeMs,
        scriptMtimeMs: scriptInfo.mtimeMs
      })
    ) {
      return binaryPath
    }
  } catch {
    // Compile below.
  }

  await execFileAsync('/usr/bin/swiftc', [scriptPath, '-o', binaryPath], { timeout: 20000 })
  return binaryPath
}

async function ocrHelperPath(): Promise<string> {
  return compiledHelperPath(ocrScriptPath(), 'kashin-ocr')
}

async function axHelperPath(): Promise<string> {
  return compiledHelperPath(axScriptPath(), 'kashin-ax-context')
}

export function warmContextHelpers(): void {
  void Promise.allSettled([ocrHelperPath(), axHelperPath()])
}

async function captureAccessibilityOutcome(): Promise<{
  extraction: AccessibilityContext
  diagnostics: AccessibilityDiagnostics
}> {
  try {
    const helperPath = await axHelperPath()
    const { stdout } = await execFileAsync(helperPath, [], {
      timeout: 2500,
      maxBuffer: 1024 * 1024 * 3
    })
    const outcome = resolveAccessibilityCaptureOutcome(parseAccessibilityHelperOutput(stdout))
    return {
      extraction: outcome.extraction,
      diagnostics: outcome.diagnostics
    }
  } catch {
    return resolveAccessibilityCaptureOutcome(null)
  }
}


async function captureScreenshotPng(frontmost: FrontmostAppInfo): Promise<ScreenshotCapture | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 1600, height: 1000 }
    })
    const pickedSource = analyzeDesktopCaptureSourceSelection(
      sources.map((source) => ({
        id: source.id,
        name: source.name,
        hasThumbnail: !source.thumbnail.isEmpty()
      })),
      frontmost
    )
    const runtimePlan = resolveDesktopCaptureRuntimePlan(
      pickedSource,
      sources.filter((source) => !source.thumbnail.isEmpty()).map((source) => source.id)
    )
    if (runtimePlan.captureMode === 'native-screen') {
      const nativeCapture = await captureNativeScreenScreenshot()
      return nativeCapture
        ? {
            ...nativeCapture,
            sourceSelection: runtimePlan.sourceSelection
          }
        : null
    }
    if (runtimePlan.captureMode !== 'desktop-source' || !runtimePlan.sourceId || !runtimePlan.sourceKind) return null
    const source = sources.find((candidate) => candidate.id === runtimePlan.sourceId) ?? null
    if (!source || source.thumbnail.isEmpty()) return null

    const capturesDir = path.join(app.getPath('userData'), 'captures')
    await mkdir(capturesDir, { recursive: true })
    const sourceKind = runtimePlan.sourceKind
    const screenshotPath = path.join(capturesDir, `latest-${sourceKind}.png`)
    await writeFile(screenshotPath, source.thumbnail.toPNG())
    return {
      screenshotPath,
      sourceKind,
      sourceSelection: runtimePlan.sourceSelection
    }
  } catch {
    return captureNativeScreenScreenshot()
  }
}

async function captureNativeScreenScreenshot(): Promise<ScreenshotCapture | null> {
  try {
    const capturesDir = path.join(app.getPath('userData'), 'captures')
    await mkdir(capturesDir, { recursive: true })
    const screenshotPath = path.join(capturesDir, 'latest-native-screen.png')
    await execFileAsync('screencapture', ['-x', screenshotPath], { timeout: 8000 })
    return { screenshotPath, sourceKind: 'screen', sourceSelection: null }
  } catch {
    return null
  }
}

async function recognizeScreenshotText(screenshotPath: string): Promise<string | null> {
  try {
    const helperPath = await ocrHelperPath()
    const { stdout } = await execFileAsync(helperPath, [screenshotPath], {
      timeout: 10000,
      maxBuffer: 1024 * 1024 * 4
    })
    const text = stdout.replace(/\s+\n/g, '\n').trim()
    return text ? text.slice(0, 12000) : null
  } catch {
    return null
  }
}

async function captureScreenContext(
  frontmost: FrontmostAppInfo,
  options: { skipOcr: boolean; suppressScreenOcr?: boolean; forceNativeScreenCapture?: boolean }
): Promise<{
  screenContext: ScreenContext
  sourceSelection: ScreenSourceSelection | null
}> {
  const initialCaptureInvocation = resolveInitialScreenCaptureRuntimeInvocation({
    overrides: { forceNativeScreenCapture: options.forceNativeScreenCapture }
  })
  const initialCaptureMode = initialCaptureInvocation.mode
  let sourceSelection = resolveInitialScreenSourceSelection({ initialCaptureMode })
  let screenshot =
    initialCaptureInvocation.mode === 'native-screen'
      ? await captureNativeScreenScreenshot()
      : await captureScreenshotPng(frontmost)
  const initialRuntime = resolveCapturedScreenshotRuntime({
    skipOcr: options.skipOcr,
    suppressScreenOcr: options.suppressScreenOcr,
    currentSelection: sourceSelection,
    screenshot
  })
  sourceSelection = initialRuntime.sourceSelection
  if (!screenshot) {
    return {
      screenContext: finalizeScreenContext(initialRuntime.runtimeState),
      sourceSelection
    }
  }

  const initialScreenText =
    initialRuntime.ocrInvocation.kind === 'recognize-screenshot-text'
      ? await recognizeScreenshotText(initialRuntime.ocrInvocation.screenshotPath)
      : null
  let attemptExecution = resolveScreenCaptureAttemptExecution({
    skipOcr: options.skipOcr,
    suppressScreenOcr: options.suppressScreenOcr,
    currentSelection: sourceSelection,
    screenshot,
    screenText: initialScreenText
  })
  sourceSelection = attemptExecution.sourceSelection
  let runtimeState = attemptExecution.runtimeState

  if (runtimeState.retryPlan?.shouldRetryWithNativeFallback) {
    const nativeFallback = await captureNativeScreenScreenshot()
    if (nativeFallback) {
      screenshot = nativeFallback
      const retryRuntime = resolveCapturedScreenshotRuntime({
        skipOcr: options.skipOcr,
        suppressScreenOcr: options.suppressScreenOcr,
        currentSelection: sourceSelection,
        screenshot,
        usedNativeRetryFallback: true
      })
      sourceSelection = retryRuntime.sourceSelection
      const retryScreenText =
        retryRuntime.ocrInvocation.kind === 'recognize-screenshot-text'
          ? await recognizeScreenshotText(retryRuntime.ocrInvocation.screenshotPath)
          : null
      attemptExecution = resolveScreenCaptureAttemptExecution({
        skipOcr: options.skipOcr,
        suppressScreenOcr: options.suppressScreenOcr,
        currentSelection: sourceSelection,
        screenshot,
        usedNativeRetryFallback: true,
        screenText: retryScreenText
      })
      sourceSelection = attemptExecution.sourceSelection
      runtimeState = attemptExecution.runtimeState
    }
  }

  return {
    screenContext: finalizeScreenContext(runtimeState),
    sourceSelection
  }
}

/**
 * Reads the frontmost app name and window title. MUST be called before our own window is
 * shown, otherwise it reports our own app instead of the app the user was working in.
 * Each lookup is wrapped in its own try block per the brief — window title can fail for apps
 * that don't expose one (e.g. some Electron windows), and that failure should not block
 * capturing the app name.
 */
export async function getFrontmostAppInfo(): Promise<FrontmostAppInfo> {
  let systemEventsApp: string | null = null
  let windowTitle: string | null = null

  try {
    const name = await runAppleScript(
      'tell application "System Events" to get name of first process whose frontmost is true'
    )
    systemEventsApp = name || null
  } catch {
    systemEventsApp = null
  }

  const lsappinfoApp = await readFrontmostAppFromLsAppInfo()
  const resolvedFrontmost = resolveFrontmostAppName({
    systemEventsAppName: systemEventsApp,
    lsappinfoAppName: lsappinfoApp
  })

  try {
    const title = await runAppleScript(
      'tell application "System Events" to tell (first process whose frontmost is true) to get name of front window'
    )
    windowTitle = title || null
  } catch {
    windowTitle = null
  }

  return { activeApp: resolvedFrontmost.activeApp, windowTitle }
}

/**
 * Simulates Cmd+C to capture the current text selection without needing per-app integration.
 * Saves the clipboard beforehand and restores it afterwards so the user's existing clipboard
 * contents are never clobbered by this capture.
 */
async function captureSelectionViaClipboard(originalClipboard: string): Promise<string | null> {
  clipboard.writeText('')

  try {
    await runAppleScript('tell application "System Events" to keystroke "c" using command down')
  } catch {
    clipboard.writeText(originalClipboard)
    return null
  }

  await sleep(150)

  const selected = clipboard.readText()
  clipboard.writeText(originalClipboard)

  return normalizeCopiedText(selected)
}

async function copyWithShortcut(key: string, delayMs = 150): Promise<string> {
  clipboard.writeText('')
  await runAppleScript(`tell application "System Events" to keystroke "${key}" using command down`)
  await sleep(delayMs)
  return clipboard.readText()
}

async function findLatestChromiumSessionFiles(sessionRoots: string[]): Promise<string[]> {
  const files: { filePath: string; mtimeMs: number }[] = []
  for (const root of sessionRoots) {
    let profiles: string[]
    try {
      profiles = await readdir(root)
    } catch {
      continue
    }

    for (const profile of profiles) {
      const sessionsDir = path.join(root, profile, 'Sessions')
      let entries: string[]
      try {
        entries = await readdir(sessionsDir)
      } catch {
        continue
      }

      for (const entry of entries) {
        const filePath = path.join(sessionsDir, entry)
        try {
          const info = await stat(filePath)
          files.push({ filePath, mtimeMs: info.mtimeMs })
        } catch {
          // Ignore unreadable session files.
        }
      }
    }
  }

  return pickRecentChromiumSessionFiles(files)
}

async function fetchPublicPageText(url: string): Promise<string | null> {
  const executionPlan = resolvePublicPageTextFetchExecutionPlan(resolvePublicPageFetchRequest(url))
  if (!executionPlan.shouldFetch || !executionPlan.url) {
    return null
  }

  try {
    const response = await fetch(executionPlan.url, { signal: AbortSignal.timeout(3000) })
    const contentType = response.headers.get('content-type') ?? ''
    if (
      !shouldAcceptPublicPageFetchResponse({
        ok: response.ok,
        contentType
      })
    ) {
      return null
    }
    const html = await response.text()
    return extractTextFromHtml(html)
  } catch {
    return null
  }
}

async function captureChromiumPageViaSession(frontmost: FrontmostAppInfo): Promise<BrowserPageContext> {
  const metadata = browserMetadata(frontmost.activeApp)
  const sessionFiles = await findLatestChromiumSessionFiles(metadata?.sessionRoots ?? [])
  const urls: string[] = []

  for (const filePath of sessionFiles) {
    let raw: string
    try {
      const { stdout } = await execFileAsync('strings', [filePath], { timeout: 2000 })
      raw = stdout
    } catch {
      try {
        const buffer = await readFile(filePath)
        raw = buffer.toString('utf8')
      } catch {
        continue
      }
    }

    urls.push(...extractSessionUrls(raw))
  }

  const sessionPlan = resolveChromiumSessionPageContextPlan({ urls, frontmost })
  const fetchPlan = resolveBrowserPageContextFetchExecutionPlan({
    capture: {
      pageTitle: sessionPlan.pageTitle,
      pageUrl: sessionPlan.pageUrl,
      pageText: null
    },
    pageCaptureMethod: 'chrome-session'
  })
  const fetchedPageText =
    fetchPlan.fetchRequest.shouldFetch && fetchPlan.fetchRequest.url
      ? await fetchPublicPageText(fetchPlan.fetchRequest.url)
      : null

  return resolveChromiumSessionBrowserPageContext({
    pageTitle: fetchPlan.normalizedCapture.pageTitle,
    pageUrl: fetchPlan.normalizedCapture.pageUrl,
    fetchedPageText
  })
}

async function captureChromiumTabMetadata(appName: string): Promise<Pick<BrowserPageContext, 'pageTitle' | 'pageUrl'>> {
  const raw = await runAppleScript(buildChromiumTabMetadataAppleScript(appName))
  return parseChromiumTabMetadata(raw)
}

async function captureChromiumTabBodyText(appName: string): Promise<string | null> {
  const raw = await runAppleScript(buildChromiumTabBodyTextAppleScript(appName))
  return normalizeCopiedText(raw)
}

async function captureChromiumPage(appName: string): Promise<BrowserPageContext> {
  const [metadata, pageText] = await Promise.all([
    captureChromiumTabMetadata(appName),
    captureChromiumTabBodyText(appName)
  ])
  const fetchPlan = resolveBrowserPageContextFetchExecutionPlan({
    capture: {
      pageTitle: metadata.pageTitle,
      pageUrl: metadata.pageUrl,
      pageText
    },
    pageCaptureMethod: 'browser-automation'
  })
  const fetchedPageText =
    fetchPlan.fetchRequest.shouldFetch && fetchPlan.fetchRequest.url
      ? await fetchPublicPageText(fetchPlan.fetchRequest.url)
      : null

  return resolveChromiumBrowserPageContext({
    metadata: {
      pageTitle: fetchPlan.normalizedCapture.pageTitle,
      pageUrl: fetchPlan.normalizedCapture.pageUrl
    },
    bodyText: fetchPlan.normalizedCapture.pageText,
    fetchedPageText
  })
}

async function captureSafariPage(appName: string): Promise<BrowserPageContext> {
  const raw = await runAppleScript(buildSafariPageCaptureAppleScript(appName))
  return buildBrowserPageContext(parseBrowserAutomationCapture(raw), 'browser-automation')
}

async function captureBrowserPageViaKeyboard(frontmost: FrontmostAppInfo, originalClipboard: string): Promise<BrowserPageContext> {
  let pageUrl: string | null = null
  let pageText: string | null = null

  try {
    await runAppleScript('tell application "System Events" to keystroke "l" using command down')
    await sleep(80)
    pageUrl = normalizeCopiedText(await copyWithShortcut('c'))

    await runAppleScript('tell application "System Events" to key code 53')
    await sleep(80)
    await runAppleScript('tell application "System Events" to keystroke "a" using command down')
    await sleep(80)
    pageText = normalizeCopiedText(await copyWithShortcut('c', 250))
  } catch {
    pageUrl = null
    pageText = null
  } finally {
    clipboard.writeText(originalClipboard)
  }

  const normalizedCapture = normalizeBrowserPageCapture({
    pageTitle: frontmost.windowTitle,
    pageUrl,
    pageText
  })
  const fetchPlan = resolveBrowserPageContextFetchExecutionPlan({
    capture: normalizedCapture,
    pageCaptureMethod: 'keyboard-copy'
  })
  const fetchedPageText =
    fetchPlan.fetchRequest.shouldFetch && fetchPlan.fetchRequest.url
      ? await fetchPublicPageText(fetchPlan.fetchRequest.url)
      : null

  return resolveKeyboardCopyBrowserPageContext({
    ...fetchPlan.normalizedCapture,
    fetchedPageText
  })
}

async function captureBrowserPageContext(activeApp: string | null): Promise<BrowserPageContext> {
  const invocation = resolveBrowserPageCaptureRuntimeInvocation(activeApp)

  try {
    if (invocation.kind === 'capture-safari-page') return await captureSafariPage(invocation.scriptName)
    if (invocation.kind === 'capture-chromium-page') return await captureChromiumPage(invocation.scriptName)
    return EMPTY_PAGE_CONTEXT
  } catch {
    return EMPTY_PAGE_CONTEXT
  }
}

async function executeBrowserCaptureStep(
  executionPlan: ReturnType<typeof resolveBrowserCaptureStepExecutionPlan>,
  originalClipboard: string
): Promise<BrowserPageContext | null> {
  const invocation = resolveBrowserCaptureRuntimeInvocation(executionPlan)

  if (invocation.kind === 'capture-browser-page-context') {
    return captureBrowserPageContext(invocation.activeApp)
  }

  if (invocation.kind === 'capture-browser-page-via-keyboard') {
    return captureBrowserPageViaKeyboard(invocation.frontmost, originalClipboard)
  }

  return captureChromiumPageViaSession(invocation.frontmost)
}

/**
 * Captures the full current context: selected text (via simulated copy), clipboard fallback,
 * and the already-resolved frontmost app info. Must run before the assistant window is shown.
 */
export async function captureCurrentContextDetailed(
  frontmost: FrontmostAppInfo,
  overrides: CapturePlanOverrides = {}
): Promise<{
  context: CurrentContext
  captureTrace: NonNullable<import('../shared/types').BackendDiagnostics['captureTrace']>
  accessibilityDiagnostics: AccessibilityDiagnostics
}> {
  const originalClipboard = clipboard.readText()
  const accessibilityOutcome = await captureAccessibilityOutcome()
  const accessibilityContext = accessibilityOutcome.extraction
  const capturePreparation = resolveContextCapturePreparation({
    frontmost,
    accessibilityContext,
    accessibilityDiagnostics: accessibilityOutcome.diagnostics,
    clipboardSelectedText: null
  })
  const clipboardSelectedText = capturePreparation.shouldAttemptClipboardSelection
    ? await captureSelectionViaClipboard(originalClipboard)
    : null
  const {
    resolvedActiveApp,
    resolvedWindowTitle,
    selectedText,
    selectedTextSource,
    canSkipBrowserCapture,
    canSkipOcr,
    initialPageContext,
    screenCapturePlan,
    browserLoopState: initialBrowserLoopState
  } = resolveContextCaptureRuntimeState({
    capturePlanInput: capturePreparation.capturePlanInput,
    clipboardSelectedText,
    overrides
  })

  let pageContext: BrowserPageContext = initialPageContext
  let browserLoopState = initialBrowserLoopState

  while (true) {
    const iteration = resolveBrowserCaptureLoopIteration(browserLoopState)
    if (!iteration.hasRequest) break

    const stepContext = await executeBrowserCaptureStep(iteration.executionPlan, originalClipboard)

    browserLoopState = advanceBrowserCaptureExecutionLoopState({
      activeApp: resolvedActiveApp,
      resolvedWindowTitle,
      canSkipBrowserCapture,
      pageContext,
      browserContext: browserLoopState.browserContext,
      keyboardContext: browserLoopState.keyboardContext,
      sessionContext: browserLoopState.sessionContext,
      overrides,
      stepResult: {
        step: iteration.request.step,
        context: stepContext
      }
    })
  }
  const finalPageContext = browserLoopState.execution.plan.final.finalPageContext
  const screenCaptureRequest = resolveScreenContextCaptureRequest({
    accessibilityText: accessibilityContext.accessibilityText,
    accessibilityDiagnostics: accessibilityOutcome.diagnostics,
    pageContext: finalPageContext,
    canSkipOcr,
    overrides
  })
  const screenCaptureExecution = resolveScreenContextExecutionPlan(screenCaptureRequest)
  const screenCaptureResult =
    screenCaptureExecution.shouldCapture && screenCaptureExecution.options
      ? await captureScreenContext(frontmost, screenCaptureExecution.options)
      : screenCaptureExecution.skippedResult
  const result = finalizeContextCaptureResult({
    resolvedActiveApp,
    resolvedWindowTitle,
    selectedText,
    selectedTextSource,
    accessibilityContext,
    accessibilityDiagnostics: accessibilityOutcome.diagnostics,
    screenContext: screenCaptureResult.screenContext,
    browserExecutionPlan: browserLoopState.execution.plan.final,
    canSkipBrowserCapture,
    canSkipOcr,
    screenCapturePlan: screenCaptureRequest.plan,
    screenSourceSelection: screenCaptureResult.sourceSelection,
    timestamp: new Date().toISOString()
  })

  return {
    ...result,
    accessibilityDiagnostics: accessibilityOutcome.diagnostics
  }
}

export async function captureCurrentContext(frontmost: FrontmostAppInfo): Promise<CurrentContext> {
  const result = await captureCurrentContextDetailed(frontmost)
  return result.context
}
