import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { registerIpcHandlers } from './ipc'
import { registerShortcut } from './shortcut'
import { createAssistantWindow, showAssistantWindow, openAssistantSettings, getAssistantWindow } from './windows'
import { getFrontmostAppInfo, captureCurrentContext } from './context-reader'
import { getSettings } from './settings'
import { startOptionListener, stopOptionListener } from './option-listener'

let tray: Tray | null = null
let lastTriggerAt = 0

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
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none' as const,
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none' as const,
    selectedText: null,
    clipboardText: null,
    timestamp: new Date().toISOString()
  }

  try {
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

function setupShortcut(): void {
  const settings = getSettings()
  registerShortcut(settings.shortcut, () => {
    void triggerAssistant({ autoInsert: false, showWindow: true })
  })
}

function setupOptionListener(): void {
  startOptionListener({
    onOptionTap: () => {
      void triggerAssistant({ autoInsert: true, showWindow: false })
    },
    onOptionSpace: () => {
      void triggerAssistant({ autoInsert: false, showWindow: true })
    }
  })
}
