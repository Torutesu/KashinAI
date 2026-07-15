import { app } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

let listener: ChildProcess | null = null

function listenerScriptPath(): string {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'option-listener.swift')]
    : [
        path.join(process.cwd(), 'scripts/option-listener.swift'),
        path.join(app.getAppPath(), 'scripts/option-listener.swift'),
        path.join(process.resourcesPath, 'option-listener.swift')
      ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return candidates[0]
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
