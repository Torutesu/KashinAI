import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppSettings, ContextSource, RetrievedContext } from '../shared/types'

const execFileAsync = promisify(execFile)

export type GBrainSearchResult = {
  results: RetrievedContext[]
  contextSource: ContextSource
}

function normalizeTypeFromSource(source: string): RetrievedContext['type'] {
  const root = source.split(/[\\/]/)[0]?.toLowerCase() ?? ''
  switch (root) {
    case 'company':
    case 'products':
    case 'customers':
    case 'projects':
    case 'people':
    case 'templates':
      return root === 'products' ? 'product' : (root.slice(0, -1) as RetrievedContext['type'])
    default:
      return 'unknown'
  }
}

function normalizeResults(raw: unknown): RetrievedContext[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { results?: unknown[] })?.results)
      ? (raw as { results: unknown[] }).results
      : []

  return list
    .map((item): RetrievedContext | null => {
      if (!item || typeof item !== 'object') return null
      const obj = item as Record<string, unknown>
      const content = typeof obj.content === 'string' ? obj.content : null
      const source = typeof obj.source === 'string' ? obj.source : null
      if (!content || !source) return null
      return {
        title: typeof obj.title === 'string' ? obj.title : source,
        content,
        source,
        score: typeof obj.score === 'number' ? obj.score : undefined,
        type: typeof obj.type === 'string' ? (obj.type as RetrievedContext['type']) : 'unknown'
      }
    })
    .filter((v): v is RetrievedContext => v !== null)
}

function parseCliPlaintext(stdout: string): RetrievedContext[] {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): RetrievedContext | null => {
      const match = line.match(/^\[(\d+(?:\.\d+)?)\]\s+(.+?)\s+--\s+([\s\S]+)$/)
      if (!match) return null
      const [, scoreText, source, content] = match
      return {
        title: source,
        source: source.trim(),
        content: content.trim(),
        score: Number(scoreText),
        type: normalizeTypeFromSource(source.trim())
      }
    })
    .filter((value): value is RetrievedContext => value !== null)
}

/** Queries GBrain via its CLI. Defensive: any non-JSON or malformed output is treated as a
 * failure so the caller can fall through to the local fallback rather than crashing. */
async function searchViaCli(
  query: string,
  cliPath: string,
  timeoutMs: number
): Promise<RetrievedContext[] | null> {
  try {
    const { stdout } = await execFileAsync(cliPath, ['query', query, '--json'], { timeout: timeoutMs })
    try {
      const parsed: unknown = JSON.parse(stdout)
      return normalizeResults(parsed)
    } catch {
      const parsed = parseCliPlaintext(stdout)
      return parsed.length > 0 ? parsed : null
    }
  } catch {
    return null
  }
}

/** Queries GBrain via HTTP. Defensive in the same way as searchViaCli. */
async function searchViaHttp(
  query: string,
  endpoint: string,
  token: string,
  timeoutMs: number
): Promise<RetrievedContext[] | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = `${endpoint.replace(/\/+$/, '')}/query`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ query }),
      signal: controller.signal
    })

    if (!response.ok) return null

    const parsed: unknown = await response.json()
    return normalizeResults(parsed)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function listMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = []

  async function walk(current: string): Promise<void> {
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath)
      }
    }
  }

  await walk(dir)
  return results
}

type Section = { heading: string; body: string }

function splitIntoSections(content: string): Section[] {
  const lines = content.split('\n')
  const sections: Section[] = []
  let currentHeading = '(intro)'
  let currentBody: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/)
    if (headingMatch) {
      if (currentBody.length > 0) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() })
      }
      currentHeading = headingMatch[1].trim()
      currentBody = []
    } else {
      currentBody.push(line)
    }
  }
  if (currentBody.length > 0) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() })
  }

  return sections.filter((s) => s.body.length > 0)
}

function scoreText(text: string, terms: string[]): number {
  const lower = text.toLowerCase()
  return terms.reduce((sum, term) => {
    if (!term) return sum
    const occurrences = lower.split(term.toLowerCase()).length - 1
    return sum + occurrences
  }, 0)
}

/**
 * Built-in keyword search over brain/**\/*.md, used both as the "local" mode and as the
 * automatic fallback when cli/http modes fail. Guarantees the demo always produces something.
 */
async function searchLocalBrain(query: string, brainDir: string): Promise<RetrievedContext[]> {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)

  if (terms.length === 0) return []

  const files = await listMarkdownFiles(brainDir)
  const scored: RetrievedContext[] = []

  for (const filePath of files) {
    let content: string
    try {
      content = await readFile(filePath, 'utf-8')
    } catch {
      continue
    }

    const relSource = path.relative(brainDir, filePath)
    const filenameBoost = scoreText(relSource, terms) * 3

    const sections = splitIntoSections(content)
    let bestSection: Section | null = null
    let bestScore = -1

    for (const section of sections) {
      const headingBoost = scoreText(section.heading, terms) * 2
      const bodyScore = scoreText(section.body, terms)
      const total = headingBoost + bodyScore
      if (total > bestScore) {
        bestScore = total
        bestSection = section
      }
    }

    const totalScore = filenameBoost + Math.max(bestScore, 0)
    if (totalScore <= 0 || !bestSection) continue

    scored.push({
      title: bestSection.heading,
      content: bestSection.body.slice(0, 1500),
      source: relSource,
      score: totalScore,
      type: 'unknown'
    })
  }

  scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return scored.slice(0, 5)
}

/**
 * Searches GBrain according to settings.gbrain.mode, with automatic fallback to the local
 * markdown search whenever cli/http fails or returns nothing. Always reports which mode
 * actually served the result via contextSource.
 */
export async function searchGBrain(
  query: string,
  settings: AppSettings,
  brainDir: string
): Promise<GBrainSearchResult> {
  const { mode, cliPath, endpoint, token, timeoutMs } = settings.gbrain

  if (mode === 'cli') {
    const results = await searchViaCli(query, cliPath || 'gbrain', timeoutMs)
    if (results && results.length > 0) {
      return { results, contextSource: 'gbrain-cli' }
    }
  } else if (mode === 'http') {
    const results = await searchViaHttp(query, endpoint, token, timeoutMs)
    if (results && results.length > 0) {
      return { results, contextSource: 'gbrain-http' }
    }
  }

  const localResults = await searchLocalBrain(query, brainDir)
  if (localResults.length > 0) {
    return { results: localResults, contextSource: 'local-fallback' }
  }

  return { results: [], contextSource: 'none' }
}
