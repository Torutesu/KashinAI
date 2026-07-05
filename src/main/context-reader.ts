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

export type FrontmostAppInfo = {
  activeApp: string | null
  windowTitle: string | null
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

/**
 * Captures the full current context: selected text (via simulated copy), clipboard fallback,
 * and the already-resolved frontmost app info. Must run before the assistant window is shown.
 */
export async function captureCurrentContext(frontmost: FrontmostAppInfo): Promise<CurrentContext> {
  const originalClipboard = clipboard.readText()
  const selectedText = await captureSelectionViaClipboard(originalClipboard)

  return {
    activeApp: frontmost.activeApp,
    windowTitle: frontmost.windowTitle,
    selectedText,
    clipboardText: originalClipboard || null,
    timestamp: new Date().toISOString()
  }
}
