import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

let listener: ChildProcess | null = null

function listenerScriptPath(): string {
  if (process.defaultApp || process.env['ELECTRON_RENDERER_URL']) {
    return path.join(app.getAppPath(), 'scripts/option-listener.swift')
  }
  return path.join(process.resourcesPath, 'option-listener.swift')
}

export function startOptionListener(handlers: {
  onOptionTap: () => void
  onOptionSpace: () => void
}): void {
  if (process.platform !== 'darwin' || listener) return

  const child = spawn('/usr/bin/swift', [listenerScriptPath()], { stdio: ['ignore', 'pipe', 'pipe'] })
  listener = child
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      const eventName = line.trim()
      if (eventName === 'optionTap') handlers.onOptionTap()
      if (eventName === 'optionSpace') handlers.onOptionSpace()
    }
  })

  child.on('exit', () => {
    listener = null
  })
}

export function stopOptionListener(): void {
  listener?.kill()
  listener = null
}
