import { contextBridge, ipcRenderer } from 'electron'
import type { ContextAssistantApi, CurrentContext } from '../shared/types'

const api: ContextAssistantApi = {
  captureContext: () => ipcRenderer.invoke('context:capture'),

  generate: (request) => ipcRenderer.invoke('assistant:generate', request),

  copyOutput: (text) => ipcRenderer.invoke('output:copy', text),

  insertOutput: (text, activeApp) => ipcRenderer.invoke('output:insert', { text, activeApp }),

  getSettings: () => ipcRenderer.invoke('settings:get'),

  setSettings: (update) => ipcRenderer.invoke('settings:set', update),

  hideWindow: () => ipcRenderer.invoke('window:hide'),

  openSettings: () => ipcRenderer.invoke('window:openSettings'),

  checkAccessibility: () => ipcRenderer.invoke('system:checkAccessibility'),

  onContextPushed: (callback: (context: CurrentContext) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, context: CurrentContext): void => callback(context)
    ipcRenderer.on('context:pushed', listener)
    return () => ipcRenderer.removeListener('context:pushed', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
