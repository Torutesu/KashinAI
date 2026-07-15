import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { registerIpcHandlers } from './ipc'
import { registerShortcut } from './shortcut'
import { createAssistantWindow, showAssistantWindow, hideAssistantWindow, openAssistantSettings, getAssistantWindow } from './windows'
import { getFrontmostAppInfo, captureCurrentContext, warmContextHelpers } from './context-reader'
import { getSettings } from './settings'
import { startOptionListener, stopOptionListener } from './option-listener'
import { insertText } from './insert'

let tray: Tray | null = null
let lastTriggerAt = 0
let demoPasteIndex = 0

const DEMO_PASTE_TEXTS = [
  `Hi Toru, I’m Woojin. I’m building KashinAI, a lightweight desktop assistant that brings company context into everyday writing workflows, and I’d love to briefly share it with you.`,
  `Hi Woojin,

Do your team members still have to repeat the same customer, project, or company context every time they use AI to write emails, Slack replies, proposals, or summaries?

KashinAI solves this by bringing your company knowledge into the writing workflow, so teams can create source-backed replies and drafts without rewriting context or switching tools.

Would you be open to a quick 15-minute demo next week?`,
  `Can you update this part so the assistant captures the selected text more reliably and returns the generated response with clear source references?`
]

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showAssistantWindow()
  })

  app.whenReady().then(() => {
    if (process.platform === 'darwin' && !import.meta.env.DEV) {
      app.dock?.hide()
    }

    registerIpcHandlers()
    createAssistantWindow()
    setupTray()
    setupShortcut()
    setupOptionListener()
    warmContextHelpers()

    // Make the app visibly "on" after launch without capturing context or pasting into
    // another app. Context capture/writeback only happens from the shortcut path.
    showAssistantWindow()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAssistantWindow()
    }
  })

  // This is a menu-bar resident app (per brief 8.1): it should keep running via the Tray
  // even when the assistant/settings windows are closed, so no quit-on-window-all-closed here.
  app.on('window-all-closed', () => {})

  app.on('before-quit', () => {
    stopOptionListener()
  })
}

function setupTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle('CA')
  tray.setToolTip(getSettings().appDisplayName)

  const menu = Menu.buildFromTemplate([
    { label: 'Show Assistant', click: () => showAssistantWindow() },
    { label: 'Settings', click: () => openAssistantSettings() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

/**
 * Captures the frontmost app + current selection BEFORE showing our own window (otherwise
 * we'd capture ourselves instead of the app the user was working in), then shows the floating
 * window and pushes the captured context to the renderer.
 */
async function triggerAssistant(options: { autoInsert: boolean; showWindow: boolean }): Promise<void> {
  const now = Date.now()
  if (now - lastTriggerAt < 600) return
  lastTriggerAt = now

  const fallbackContext = {
    activeApp: null,
    windowTitle: null,
    contextKind: 'general' as const,
    primaryContentSource: 'none' as const,
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none' as const,
    accessibilityText: null,
    accessibilityCaptureMethod: 'none' as const,
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none' as const,
    selectedText: null,
    selectedTextSource: 'none' as const,
    clipboardText: null,
    timestamp: new Date().toISOString()
  }

  try {
    if (options.autoInsert) {
      hideAssistantWindow()
      await new Promise((resolve) => setTimeout(resolve, 90))
    }
    const frontmost = await getFrontmostAppInfo()
    const context = await captureCurrentContext(frontmost)
    if (options.showWindow) showAssistantWindow()
    const win = getAssistantWindow()
    win?.webContents.send('context:pushed', { context, autoInsert: options.autoInsert })
  } catch {
    if (options.showWindow) showAssistantWindow()
    const win = getAssistantWindow()
    win?.webContents.send('context:pushed', { context: fallbackContext, autoInsert: options.autoInsert })
  }
}

async function pasteNextDemoText(): Promise<void> {
  const now = Date.now()
  if (now - lastTriggerAt < 600) return
  lastTriggerAt = now

  const frontmost = await getFrontmostAppInfo()
  const text = DEMO_PASTE_TEXTS[demoPasteIndex % DEMO_PASTE_TEXTS.length]
  demoPasteIndex += 1
  await insertText(text, frontmost.activeApp)
}

function setupShortcut(): void {
  const settings = getSettings()
  registerShortcut(settings.shortcut, () => {
    void triggerAssistant({ autoInsert: false, showWindow: true })
  })
}

function setupOptionListener(): void {
  startOptionListener({
    onOptionTap: () => {
      void pasteNextDemoText()
    },
    onOptionSpace: () => {
      void triggerAssistant({ autoInsert: false, showWindow: true })
    }
  })
}
