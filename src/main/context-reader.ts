import { clipboard } from 'electron'
import { execFile } from 'node:child_process'
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
    pageText: textLines.join('\n').trim() || null
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
    pageText: textLines.join('\n').trim() || null
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
    pageText
  }
}

async function captureBrowserPageContext(activeApp: string | null): Promise<BrowserPageContext> {
  const appName = browserScriptName(activeApp)
  if (!appName) return { pageTitle: null, pageUrl: null, pageText: null }

  try {
    if (appName.toLowerCase().includes('safari')) return await captureSafariPage(appName)
    return await captureChromiumPage(appName)
  } catch {
    return { pageTitle: null, pageUrl: null, pageText: null }
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

  return {
    activeApp: frontmost.activeApp,
    windowTitle: frontmost.windowTitle,
    pageTitle: pageContext.pageTitle,
    pageUrl: pageContext.pageUrl,
    pageText: pageContext.pageText,
    selectedText,
    clipboardText: originalClipboard || null,
    timestamp: new Date().toISOString()
  }
}
