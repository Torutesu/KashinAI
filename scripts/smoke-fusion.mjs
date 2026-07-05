#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function findGbrain() {
  const home = os.homedir()
  const candidates = [
    path.join(home, '.bun/bin/gbrain'),
    path.join(home, 'gbrain/src/cli.ts'),
    'gbrain'
  ]
  for (const candidate of candidates) {
    if (candidate === 'gbrain' || existsSync(candidate)) return candidate
  }
  return null
}

async function gbrainSearch(cliPath, query) {
  const { stdout } = await execFileAsync(cliPath, ['search', query], { timeout: 15000 })
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\[(\d+(?:\.\d+)?)\]\s+(.+?)\s+--\s+([\s\S]+)$/)
      if (!match) return null
      return { score: Number(match[1]), source: match[2], content: match[3] }
    })
    .filter(Boolean)
}

async function latestChromeSessionFiles() {
  const chromeRoot = path.join(os.homedir(), 'Library/Application Support/Google/Chrome')
  let profiles = []
  try {
    profiles = await readdir(chromeRoot)
  } catch {
    return []
  }

  const files = []
  for (const profile of profiles) {
    const sessionsDir = path.join(chromeRoot, profile, 'Sessions')
    let entries = []
    try {
      entries = await readdir(sessionsDir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.startsWith('Session_') && !entry.startsWith('Tabs_')) continue
      const filePath = path.join(sessionsDir, entry)
      try {
        const info = await stat(filePath)
        files.push({ filePath, mtimeMs: info.mtimeMs })
      } catch {
        // Ignore unreadable files.
      }
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 6).map((file) => file.filePath)
}

function cleanUrl(raw) {
  try {
    const parsed = new URL(raw.replace(/\u0000/g, '').replace(/[)\]}>,.;:'"(`]+$/g, ''))
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (parsed.hostname === 'contacts.google.com') return null
    return parsed.toString()
  } catch {
    return null
  }
}

async function chromeSessionUrls() {
  const files = await latestChromeSessionFiles()
  const urls = []
  for (const file of files) {
    let stdout = ''
    try {
      ;({ stdout } = await execFileAsync('strings', [file], { timeout: 3000 }))
    } catch {
      continue
    }
    const matches = stdout.match(/https?:\/\/[^\s"'<>\\\u0000]+/g) ?? []
    for (const match of matches) {
      const url = cleanUrl(match)
      if (url) urls.push(url)
    }
  }
  return [...new Set(urls)]
}

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2))
  process.exit(1)
}

const gbrain = findGbrain()
if (!gbrain) fail('GBrain CLI not found')

let gbrainResults = []
try {
  gbrainResults = await gbrainSearch(gbrain, '価格')
} catch (error) {
  fail('GBrain CLI search failed', { gbrain, error: String(error) })
}
if (gbrainResults.length === 0) fail('GBrain returned no context', { gbrain })

const urls = await chromeSessionUrls()
if (urls.length === 0) fail('No Chrome open-page URLs found')

const pageUrl = urls.at(-1)
console.log(
  JSON.stringify(
    {
      ok: true,
      gbrain,
      gbrainResultCount: gbrainResults.length,
      sampleSources: gbrainResults.slice(0, 5).map((result) => result.source),
      pageUrl,
      canFuseContext: Boolean(pageUrl && gbrainResults.length > 0)
    },
    null,
    2
  )
)
