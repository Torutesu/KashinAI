import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { registerIpcHandlers } from './ipc'
import { registerShortcut } from './shortcut'
import { createAssistantWindow, showAssistantWindow, createSettingsWindow, getAssistantWindow } from './windows'
import { getFrontmostAppInfo, captureCurrentContext } from './context-reader'
import { getSettings } from './settings'

let tray: Tray | null = null

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showAssistantWindow()
  })

  app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.dock?.hide()
    }

    registerIpcHandlers()
    createAssistantWindow()
    setupTray()
    setupShortcut()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createAssistantWindow()
    }
  })

  // This is a menu-bar resident app (per brief 8.1): it should keep running via the Tray
  // even when the assistant/settings windows are closed, so no quit-on-window-all-closed here.
  app.on('window-all-closed', () => {})
}

function setupTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setTitle('CA')
  tray.setToolTip(getSettings().appDisplayName)

  const menu = Menu.buildFromTemplate([
    { label: 'Show Assistant', click: () => showAssistantWindow() },
    { label: 'Settings', click: () => createSettingsWindow() },
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
async function triggerAssistant(): Promise<void> {
  const frontmost = await getFrontmostAppInfo()
  const context = await captureCurrentContext(frontmost)

  showAssistantWindow()

  const win = getAssistantWindow()
  win?.webContents.send('context:pushed', context)
}

function setupShortcut(): void {
  const settings = getSettings()
  registerShortcut(settings.shortcut, () => {
    void triggerAssistant()
  })
}
