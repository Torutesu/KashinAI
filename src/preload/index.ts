import { contextBridge, ipcRenderer } from 'electron'
import type { ContextAssistantApi, CurrentContext } from '../shared/types'

const api: ContextAssistantApi = {
  captureContext: () => ipcRenderer.invoke('context:capture'),

  generate: (request) => ipcRenderer.invoke('assistant:generate', request),

  copyOutput: (text) => ipcRenderer.invoke('output:copy', text),

  insertOutput: (text, activeApp) => ipcRenderer.invoke('output:insert', { text, activeApp }),

  getSettings: () => ipcRenderer.invoke('settings:get'),

  setSettings: (update) => ipcRenderer.invoke('settings:set', update),

  getWindowState: () => ipcRenderer.invoke('window:getState'),

  hideWindow: () => ipcRenderer.invoke('window:hide'),
  expandWindow: () => ipcRenderer.invoke('window:expand'),

  openSettings: () => ipcRenderer.invoke('window:openSettings'),

  checkAccessibility: () => ipcRenderer.invoke('system:checkAccessibility'),

  requestAccessibility: () => ipcRenderer.invoke('system:requestAccessibility'),

  onContextPushed: (callback: (context: CurrentContext) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, context: CurrentContext): void => callback(context)
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
