import { globalShortcut } from 'electron'

let registeredAccelerator: string | null = null
let registeredHandler: (() => void) | null = null

/** Registers the global shortcut, replacing any previously registered one. Returns whether
 * registration succeeded (it can fail if the accelerator is already owned by another app). */
export function registerShortcut(accelerator: string, handler: () => void): boolean {
  globalShortcut.unregisterAll()
  registeredAccelerator = null
  registeredHandler = handler
  try {
    const registered = globalShortcut.register(accelerator, handler)
    if (registered) {
      registeredAccelerator = accelerator
    }
    return registered
  } catch {
    return false
  }
}

/** Re-registers the existing handler with a new accelerator after settings changes. */
export function updateRegisteredShortcut(accelerator: string): boolean {
  if (!registeredHandler) return false
  return registerShortcut(accelerator, registeredHandler)
}

export function getRegisteredShortcut(): string | null {
  return registeredAccelerator
}

export function unregisterShortcut(): void {
  globalShortcut.unregisterAll()
  registeredAccelerator = null
}
