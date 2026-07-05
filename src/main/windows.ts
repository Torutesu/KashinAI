import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

let assistantWindow: BrowserWindow | null = null
const ASSISTANT_WIDTH = 560
const ASSISTANT_HEIGHT = 460
const COLLAPSED_WIDTH = 152
const COLLAPSED_HEIGHT = 12
let assistantCollapsed = true

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

function currentWorkArea(): { x: number; y: number; width: number; height: number } {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  return display.workArea
}

export function createAssistantWindow(): BrowserWindow {
  if (assistantWindow && !assistantWindow.isDestroyed()) return assistantWindow

  const { x, y, width } = currentWorkArea()
  const windowX = Math.round(x + (width - ASSISTANT_WIDTH) / 2)
  const windowY = Math.round(y + 12)

  assistantWindow = new BrowserWindow({
    width: ASSISTANT_WIDTH,
    height: ASSISTANT_HEIGHT,
    x: windowX,
    y: windowY,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    resizable: false,
    show: false,
    skipTaskbar: true,
    hasShadow: false,
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

  assistantWindow.on('closed', () => {
    assistantWindow = null
  })

  return assistantWindow
}

export function showAssistantWindow(): void {
  expandAssistantWindow()
}

function expandedBounds(): { x: number; y: number; width: number; height: number } {
  const win = createAssistantWindow()
  const { x, y, width } = currentWorkArea()
  return {
    x: Math.round(x + (width - ASSISTANT_WIDTH) / 2),
    y: Math.round(y + 12),
    width: ASSISTANT_WIDTH,
    height: ASSISTANT_HEIGHT
  }
}

function collapsedBounds(): { x: number; y: number; width: number; height: number } {
  const { x, y, width } = currentWorkArea()
  return {
    x: Math.round(x + (width - COLLAPSED_WIDTH) / 2),
    y,
    width: COLLAPSED_WIDTH,
    height: COLLAPSED_HEIGHT
  }
}

function syncCollapsedState(collapsed: boolean): void {
  assistantCollapsed = collapsed
  assistantWindow?.webContents.send('window:collapsed-changed', collapsed)
}

export function expandAssistantWindow(): void {
  const win = createAssistantWindow()
  win.setBounds(expandedBounds())
  syncCollapsedState(false)
  win.show()
  win.focus()
}

export function hideAssistantWindow(): void {
  collapseAssistantWindow()
}

export function collapseAssistantWindow(): void {
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    assistantWindow.setBounds(collapsedBounds())
    syncCollapsedState(true)
    assistantWindow.showInactive()
  }
}

export function getAssistantWindow(): BrowserWindow | null {
  return assistantWindow
}

export function openAssistantSettings(): void {
  expandAssistantWindow()
  assistantWindow?.webContents.send('view:navigate', 'settings')
}

export function openAssistantHome(): void {
  expandAssistantWindow()
  assistantWindow?.webContents.send('view:navigate', 'assistant')
}

export function isAssistantCollapsed(): boolean {
  return assistantCollapsed
}
