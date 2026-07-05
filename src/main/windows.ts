import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

let assistantWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

const ASSISTANT_WIDTH = 420
const ASSISTANT_HEIGHT = 520

function getRendererUrlOrFile(hash?: string): { url?: string; file?: string } {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    return { url: hash ? `${devServerUrl}/#${hash}` : devServerUrl }
  }
  return { file: path.join(__dirname, '../renderer/index.html') }
}

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

function centerTopPosition(): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width } = display.workArea
  return {
    x: Math.round(x + (width - ASSISTANT_WIDTH) / 2),
    y: Math.round(y + 80)
  }
}

export function createAssistantWindow(): BrowserWindow {
  if (assistantWindow && !assistantWindow.isDestroyed()) return assistantWindow

  const { x, y } = centerTopPosition()

  assistantWindow = new BrowserWindow({
    width: ASSISTANT_WIDTH,
    height: ASSISTANT_HEIGHT,
    x,
    y,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const target = getRendererUrlOrFile()
  if (target.url) {
    void assistantWindow.loadURL(target.url)
  } else if (target.file) {
    void assistantWindow.loadFile(target.file)
  }

  assistantWindow.on('blur', () => {
    hideAssistantWindow()
  })

  assistantWindow.on('closed', () => {
    assistantWindow = null
  })

  return assistantWindow
}

export function showAssistantWindow(): void {
  const win = createAssistantWindow()
  const { x, y } = centerTopPosition()
  win.setPosition(x, y)
  win.show()
  win.focus()
}

export function hideAssistantWindow(): void {
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    assistantWindow.hide()
  }
}

export function getAssistantWindow(): BrowserWindow | null {
  return assistantWindow
}

export function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 640,
    title: 'Settings',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const target = getRendererUrlOrFile('settings')
  if (target.url) {
    void settingsWindow.loadURL(target.url)
  } else if (target.file) {
    void settingsWindow.loadFile(target.file, { hash: 'settings' })
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}
