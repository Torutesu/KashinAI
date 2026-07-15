import { contextBridge, ipcRenderer } from 'electron'
import type { KashinAiApi, ContextPushPayload, CurrentContext } from '../shared/types'

const api: KashinAiApi = {
  captureContext: () => ipcRenderer.invoke('context:capture'),

  generate: (request) => ipcRenderer.invoke('assistant:generate', request),

  chat: (request) => ipcRenderer.invoke('assistant:chat', request),

  copyOutput: (text) => ipcRenderer.invoke('output:copy', text),

  insertOutput: (text, activeApp) => ipcRenderer.invoke('output:insert', { text, activeApp }),

  getSettings: () => ipcRenderer.invoke('settings:get'),

  setSettings: (update) => ipcRenderer.invoke('settings:set', update),

  saveMemory: (request) => ipcRenderer.invoke('memory:save', request),

  getHistory: () => ipcRenderer.invoke('history:list'),

  clearHistory: () => ipcRenderer.invoke('history:clear'),

  getWindowState: () => ipcRenderer.invoke('window:getState'),

  hideWindow: () => ipcRenderer.invoke('window:hide'),
  expandWindow: () => ipcRenderer.invoke('window:expand'),

  openSettings: () => ipcRenderer.invoke('window:openSettings'),

  checkAccessibility: () => ipcRenderer.invoke('system:checkAccessibility'),

  requestAccessibility: () => ipcRenderer.invoke('system:requestAccessibility'),

  openAccessibilitySettings: () => ipcRenderer.invoke('system:openAccessibilitySettings'),

  checkScreenCapture: () => ipcRenderer.invoke('system:checkScreenCapture'),

  requestScreenCapture: () => ipcRenderer.invoke('system:requestScreenCapture'),

  openScreenCaptureSettings: () => ipcRenderer.invoke('system:openScreenCaptureSettings'),

  runDiagnostics: () => ipcRenderer.invoke('system:runDiagnostics'),

  onContextPushed: (callback: (payload: ContextPushPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ContextPushPayload | CurrentContext): void => {
      if ('context' in payload && 'autoInsert' in payload) {
        callback(payload)
      } else {
        callback({ context: payload, autoInsert: true })
      }
    }
    ipcRenderer.on('context:pushed', listener)
    return () => ipcRenderer.removeListener('context:pushed', listener)
  },

  onNavigate: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, view: 'assistant' | 'settings'): void => callback(view)
    ipcRenderer.on('view:navigate', listener)
    return () => ipcRenderer.removeListener('view:navigate', listener)
  },

  onCollapsedChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, collapsed: boolean): void => callback(collapsed)
    ipcRenderer.on('window:collapsed-changed', listener)
    return () => ipcRenderer.removeListener('window:collapsed-changed', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
