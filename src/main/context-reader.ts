import { app, clipboard, desktopCapturer } from 'electron'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { CurrentContext } from '../shared/types'

const execFileAsync = promisify(execFile)

async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execFileAsync('osascript', ['-e', script])
  return stdout.trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export type FrontmostAppInfo = {
  activeApp: string | null
  windowTitle: string | null
}

type BrowserPageContext = {
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
  pageCaptureMethod: CurrentContext['pageCaptureMethod']
}

type ScreenContext = {
  screenshotPath: string | null
  screenText: string | null
  screenCaptureMethod: CurrentContext['screenCaptureMethod']
}

function ocrScriptPath(): string {
  if (process.defaultApp || process.env['ELECTRON_RENDERER_URL']) {
    return path.join(app.getAppPath(), 'scripts/ocr.swift')
  }
  return path.join(process.resourcesPath, 'ocr.swift')
}

async function captureScreenshotPng(): Promise<string | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1200 }
    })
    const source = sources[0]
    if (!source || source.thumbnail.isEmpty()) return null

    const capturesDir = path.join(app.getPath('userData'), 'captures')
    await mkdir(capturesDir, { recursive: true })
    const screenshotPath = path.join(capturesDir, 'latest-screen.png')
    await writeFile(screenshotPath, source.thumbnail.toPNG())
    return screenshotPath
  } catch {
    return null
  }
}

async function recognizeScreenshotText(screenshotPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('/usr/bin/swift', [ocrScriptPath(), screenshotPath], {
      timeout: 10000,
      maxBuffer: 1024 * 1024 * 4
    })
    const text = stdout.replace(/\s+\n/g, '\n').trim()
    return text ? text.slice(0, 12000) : null
  } catch {
    return null
  }
}

async function captureScreenContext(): Promise<ScreenContext> {
  const screenshotPath = await captureScreenshotPng()
  if (!screenshotPath) {
    return { screenshotPath: null, screenText: null, screenCaptureMethod: 'none' }
  }

  const screenText = await recognizeScreenshotText(screenshotPath)
  return {
    screenshotPath,
    screenText,
    screenCaptureMethod: screenText ? 'desktop-capturer-ocr' : 'screenshot-only'
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
  let activeApp: string | null = null
  let windowTitle: string | null = null

  try {
    const name = await runAppleScript(
      'tell application "System Events" to get name of first process whose frontmost is true'
    )
    activeApp = name || null
  } catch {
    activeApp = null
  }

  try {
    const title = await runAppleScript(
      'tell application "System Events" to tell (first process whose frontmost is true) to get name of front window'
    )
    windowTitle = title || null
  } catch {
    windowTitle = null
  }

  return { activeApp, windowTitle }
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

  return selected && selected.trim().length > 0 ? selected : null
}

async function copyWithShortcut(key: string, delayMs = 150): Promise<string> {
  clipboard.writeText('')
  await runAppleScript(`tell application "System Events" to keystroke "${key}" using command down`)
  await sleep(delayMs)
  return clipboard.readText()
}

function browserScriptName(activeApp: string | null): string | null {
  if (!activeApp) return null
  const normalized = activeApp.toLowerCase()
  if (normalized.includes('chrome')) return activeApp
  if (normalized.includes('arc')) return activeApp
  if (normalized.includes('brave')) return activeApp
  if (normalized.includes('edge')) return activeApp
  if (normalized.includes('safari')) return activeApp
  return null
}

function cleanSessionUrl(raw: string): string | null {
  try {
    const withoutNulls = raw.replace(/\u0000/g, '').replace(/[)\]}>,.;:'"(`]+$/g, '')
    const parsed = new URL(withoutNulls)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.hostname === 'contacts.google.com') return null
    return parsed.toString()
  } catch {
    return null
  }
}

async function findLatestChromeSessionFiles(): Promise<string[]> {
  const chromeRoot = path.join(os.homedir(), 'Library/Application Support/Google/Chrome')
  let profiles: string[]
  try {
    profiles = await readdir(chromeRoot)
  } catch {
    return []
  }

  const files: { filePath: string; mtimeMs: number }[] = []
  for (const profile of profiles) {
    const sessionsDir = path.join(chromeRoot, profile, 'Sessions')
    let entries: string[]
    try {
      entries = await readdir(sessionsDir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.startsWith('Session_') && !entry.startsWith('Tabs_')) continue
      const filePath = path.join(sessionsDir, entry)
      try {
        const info = await stat(filePath)
        files.push({ filePath, mtimeMs: info.mtimeMs })
      } catch {
        // Ignore unreadable session files.
      }
    }
  }

  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 6).map((file) => file.filePath)
}

async function fetchPublicPageText(url: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  const privateHosts = ['mail.google.com', 'docs.google.com', 'drive.google.com', 'calendar.google.com']
  if (privateHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    return null
  }

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) return null
    const html = await response.text()
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000) || null
  } catch {
    return null
  }
}

async function captureChromePageViaSession(frontmost: FrontmostAppInfo): Promise<BrowserPageContext> {
  const sessionFiles = await findLatestChromeSessionFiles()
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

    const matches = raw.match(/https?:\/\/[^\s"'<>\\\u0000]+/g) ?? []
    for (const match of matches) {
      const url = cleanSessionUrl(match)
      if (url) urls.push(url)
    }
  }

  const pageUrl = [...urls].reverse().find(Boolean) ?? null
  return {
    pageTitle: frontmost.windowTitle,
    pageUrl,
    pageText: pageUrl ? await fetchPublicPageText(pageUrl) : null,
    pageCaptureMethod: pageUrl ? 'chrome-session' : 'none'
  }
}

async function captureChromiumPage(appName: string): Promise<BrowserPageContext> {
  const escapedApp = escapeForAppleScript(appName)
  const script = `
tell application "${escapedApp}"
  if not (exists front window) then return ""
  set tabTitle to get title of active tab of front window
  set tabUrl to get URL of active tab of front window
  set tabText to ""
  try
    set tabText to execute active tab of front window javascript "document.body ? document.body.innerText.slice(0, 12000) : ''"
  end try
  return tabTitle & linefeed & tabUrl & linefeed & tabText
end tell`
  const raw = await runAppleScript(script)
  const [pageTitle, pageUrl, ...textLines] = raw.split('\n')
  return {
    pageTitle: pageTitle || null,
    pageUrl: pageUrl || null,
    pageText: textLines.join('\n').trim() || null,
    pageCaptureMethod: pageUrl || textLines.length > 0 ? 'browser-automation' : 'none'
  }
}

async function captureSafariPage(appName: string): Promise<BrowserPageContext> {
  const escapedApp = escapeForAppleScript(appName)
  const script = `
tell application "${escapedApp}"
  if not (exists front document) then return ""
  set tabTitle to name of front document
  set tabUrl to URL of front document
  set tabText to ""
  try
    set tabText to do JavaScript "document.body ? document.body.innerText.slice(0, 12000) : ''" in front document
  end try
  return tabTitle & linefeed & tabUrl & linefeed & tabText
end tell`
  const raw = await runAppleScript(script)
  const [pageTitle, pageUrl, ...textLines] = raw.split('\n')
  return {
    pageTitle: pageTitle || null,
    pageUrl: pageUrl || null,
    pageText: textLines.join('\n').trim() || null,
    pageCaptureMethod: pageUrl || textLines.length > 0 ? 'browser-automation' : 'none'
  }
}

async function captureBrowserPageViaKeyboard(frontmost: FrontmostAppInfo, originalClipboard: string): Promise<BrowserPageContext> {
  let pageUrl: string | null = null
  let pageText: string | null = null

  try {
    await runAppleScript('tell application "System Events" to keystroke "l" using command down')
    await sleep(80)
    pageUrl = (await copyWithShortcut('c')).trim() || null

    await runAppleScript('tell application "System Events" to key code 53')
    await sleep(80)
    await runAppleScript('tell application "System Events" to keystroke "a" using command down')
    await sleep(80)
    pageText = (await copyWithShortcut('c', 250)).trim().slice(0, 12000) || null
  } catch {
    pageUrl = null
    pageText = null
  } finally {
    clipboard.writeText(originalClipboard)
  }

  return {
    pageTitle: frontmost.windowTitle,
    pageUrl,
    pageText,
    pageCaptureMethod: pageUrl || pageText ? 'keyboard-copy' : 'none'
  }
}

async function captureBrowserPageContext(activeApp: string | null): Promise<BrowserPageContext> {
  const appName = browserScriptName(activeApp)
  if (!appName) return { pageTitle: null, pageUrl: null, pageText: null, pageCaptureMethod: 'none' }

  try {
    if (appName.toLowerCase().includes('safari')) return await captureSafariPage(appName)
    return await captureChromiumPage(appName)
  } catch {
    return { pageTitle: null, pageUrl: null, pageText: null, pageCaptureMethod: 'none' }
  }
}

/**
 * Captures the full current context: selected text (via simulated copy), clipboard fallback,
 * and the already-resolved frontmost app info. Must run before the assistant window is shown.
 */
export async function captureCurrentContext(frontmost: FrontmostAppInfo): Promise<CurrentContext> {
  const originalClipboard = clipboard.readText()
  const selectedText = await captureSelectionViaClipboard(originalClipboard)
  let pageContext = await captureBrowserPageContext(frontmost.activeApp)
  if (browserScriptName(frontmost.activeApp) && !pageContext.pageUrl && !pageContext.pageText) {
    pageContext = await captureBrowserPageViaKeyboard(frontmost, originalClipboard)
  }
  if (
    (!frontmost.activeApp || frontmost.activeApp.toLowerCase().includes('chrome')) &&
    !pageContext.pageUrl &&
    !pageContext.pageText
  ) {
    pageContext = await captureChromePageViaSession(frontmost)
  }
  const screenContext = await captureScreenContext()

  return {
    activeApp: frontmost.activeApp,
    windowTitle: frontmost.windowTitle,
    pageTitle: pageContext.pageTitle,
    pageUrl: pageContext.pageUrl,
    pageText: pageContext.pageText,
    pageCaptureMethod: pageContext.pageCaptureMethod,
    screenshotPath: screenContext.screenshotPath,
    screenText: screenContext.screenText,
    screenCaptureMethod: screenContext.screenCaptureMethod,
    selectedText,
    clipboardText: originalClipboard || null,
    timestamp: new Date().toISOString()
  }
}
