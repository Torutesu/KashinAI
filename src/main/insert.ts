import { clipboard } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { hideAssistantWindow } from './windows'

const execFileAsync = promisify(execFile)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runAppleScript(script: string): Promise<void> {
  try {
    await execFileAsync('osascript', ['-e', script])
  } catch {
    // Best effort: reactivating the target app or simulating the paste keystroke may fail if
    // Accessibility permission has not been granted. The clipboard write above still succeeds,
    // so the user can paste manually as a fallback.
  }
}

/**
 * Writes text to the clipboard, hides our window, reactivates the app the user was working in
 * before the shortcut was pressed, simulates Cmd+V, then restores the user's original
 * clipboard contents shortly after so this action doesn't clobber their clipboard long-term.
 */
export async function insertText(text: string, activeAppName: string | null): Promise<void> {
  const originalClipboard = clipboard.readText()
  clipboard.writeText(text)

  hideAssistantWindow()

  if (activeAppName) {
    const escapedName = activeAppName.replace(/"/g, '\\"')
    await runAppleScript(
      `tell application "System Events" to set frontmost of first process whose name is "${escapedName}" to true`
    )
  }

  await sleep(200)

  await runAppleScript('tell application "System Events" to keystroke "v" using command down')

  await sleep(300)
  clipboard.writeText(originalClipboard)
}
