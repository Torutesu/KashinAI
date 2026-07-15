/**
 * Mock of the 'electron' module for unit testing src/main/index.ts.
 * All state is controllable from tests via the `electronMockState` export.
 */

// --- Mock state (mutable, for test control) ---
export const electronMockState = {
  gotLock: true,
  whenReadyPromise: null as Promise<void> | null,
  whenReadyResolve: null as (() => void) | null,
  quitCalled: false,
  eventHandlers: {} as Record<string, (...args: unknown[]) => void>,
  dockHideCalled: false,
  trayCreated: false,
  trayTitle: '' as string,
  trayToolTip: '' as string,
  trayContextMenu: null as unknown,
  shortcutRegistered: false,
  shortcutAccelerator: '' as string,
  shortcutHandler: null as (() => void) | null,
  allWindows: [] as unknown[],
  ipcHandlers: {} as Record<string, (...args: unknown[]) => unknown>,
  clipboardText: '',
  shellOpenExternalCalls: [] as string[],
  accessibilityTrusted: false,
  accessibilityPromptResult: false,
  screenCaptureStatus: 'unknown' as 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown',
  desktopSourcesCalls: 0
}

export function resetState(): void {
  electronMockState.gotLock = true
  electronMockState.whenReadyPromise = null
  electronMockState.whenReadyResolve = null
  electronMockState.quitCalled = false
  electronMockState.eventHandlers = {}
  electronMockState.dockHideCalled = false
  electronMockState.trayCreated = false
  electronMockState.trayTitle = ''
  electronMockState.trayToolTip = ''
  electronMockState.trayContextMenu = null
  electronMockState.shortcutRegistered = false
  electronMockState.shortcutAccelerator = ''
  electronMockState.shortcutHandler = null
  electronMockState.allWindows = []
  electronMockState.ipcHandlers = {}
  electronMockState.clipboardText = ''
  electronMockState.shellOpenExternalCalls = []
  electronMockState.accessibilityTrusted = false
  electronMockState.accessibilityPromptResult = false
  electronMockState.screenCaptureStatus = 'unknown'
  electronMockState.desktopSourcesCalls = 0
}

export const app = {
  requestSingleInstanceLock: () => {
    return electronMockState.gotLock
  },
  quit: () => {
    electronMockState.quitCalled = true
  },
  whenReady: () => {
    if (!electronMockState.whenReadyPromise) {
      electronMockState.whenReadyPromise = new Promise<void>((resolve) => {
        electronMockState.whenReadyResolve = resolve
      })
    }
    return electronMockState.whenReadyPromise
  },
  on: (event: string, handler: (...args: unknown[]) => void) => {
    electronMockState.eventHandlers[event] = handler
  },
  dock: {
    hide: () => {
      electronMockState.dockHideCalled = true
    }
  },
  getAppPath: () => '/test/app'
}

export class BrowserWindow {
  static getAllWindows = () => electronMockState.allWindows as BrowserWindow[]
  webContents = {
    send: (_channel: string, ..._args: unknown[]) => {}
  }
  isDestroyed = () => false
  setBounds = (_bounds: unknown) => {}
  show = () => {}
  focus = () => {}
  hide = () => {}
  loadURL = (_url: string) => Promise.resolve()
  loadFile = (_file: string) => Promise.resolve()
  on = (_event: string, _handler: (...args: unknown[]) => void) => {}
}

export const ipcMain = {
  handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
    electronMockState.ipcHandlers[channel] = handler
  }
}

export const Menu = {
  buildFromTemplate: (template: unknown) => {
    return template
  }
}

export class Tray {
  constructor() {
    electronMockState.trayCreated = true
  }
  setTitle = (s: string) => {
    electronMockState.trayTitle = s
  }
  setToolTip = (s: string) => {
    electronMockState.trayToolTip = s
  }
  setContextMenu = (menu: unknown) => {
    electronMockState.trayContextMenu = menu
  }
}

export const nativeImage = {
  createEmpty: () => ({ width: 0, height: 0 })
}

export const clipboard = {
  writeText: (text: string) => {
    electronMockState.clipboardText = text
  },
  readText: () => electronMockState.clipboardText
}

export const shell = {
  openExternal: async (url: string) => {
    electronMockState.shellOpenExternalCalls.push(url)
    return ''
  }
}

export const systemPreferences = {
  isTrustedAccessibilityClient: (prompt: boolean) => {
    return prompt ? electronMockState.accessibilityPromptResult : electronMockState.accessibilityTrusted
  },
  getMediaAccessStatus: () => electronMockState.screenCaptureStatus
}

export const desktopCapturer = {
  getSources: async () => {
    electronMockState.desktopSourcesCalls += 1
    return []
  }
}

export const globalShortcut = {
  unregisterAll: () => {},
  register: (accel: string, handler: () => void) => {
    electronMockState.shortcutRegistered = true
    electronMockState.shortcutAccelerator = accel
    electronMockState.shortcutHandler = handler
    return true
  }
}

resetState()
