import { globalShortcut } from 'electron'

/** Registers the global shortcut, replacing any previously registered one. Returns whether
 * registration succeeded (it can fail if the accelerator is already owned by another app). */
export function registerShortcut(accelerator: string, handler: () => void): boolean {
  globalShortcut.unregisterAll()
  try {
    return globalShortcut.register(accelerator, handler)
  } catch {
    return false
  }
}

export function unregisterShortcut(): void {
  globalShortcut.unregisterAll()
}
