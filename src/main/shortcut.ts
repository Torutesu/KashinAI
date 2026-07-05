import { globalShortcut } from 'electron'

let registeredAccelerator: string | null = null
let registeredHandler: (() => void) | null = null

function acceleratorCandidates(accelerator: string): string[] {
  const candidates = [accelerator]
  if (accelerator.includes('Option+')) candidates.push(accelerator.replaceAll('Option+', 'Alt+'))
  if (accelerator.includes('Alt+')) candidates.push(accelerator.replaceAll('Alt+', 'Option+'))
  return [...new Set(candidates)]
}

/** Registers the global shortcut, replacing any previously registered one. Returns whether
 * registration succeeded (it can fail if the accelerator is already owned by another app). */
export function registerShortcut(accelerator: string, handler: () => void): boolean {
  globalShortcut.unregisterAll()
  registeredAccelerator = null
  registeredHandler = handler

  for (const candidate of acceleratorCandidates(accelerator)) {
    try {
      const registered = globalShortcut.register(candidate, handler)
      if (registered) {
        registeredAccelerator = candidate
        return true
      }
    } catch {
      // Try the next equivalent accelerator spelling.
    }
  }

  return false
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
