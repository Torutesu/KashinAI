import type { CurrentContext } from './types'

const NAV_LINE_RE =
  /^(home|search|explore|notifications|messages|profile|bookmarks|communities|premium|verified orgs|following|followers|for you|reply|repost|like|share|post|posts|views|more|compose|おすすめ|フォロー|返信|リポスト|通知|メッセージ|検索|話題を検索)$/i

const SOCIAL_NOISE_RE =
  /^(.*\s)?(@[\w_]+|\d+([.,]\d+)?[KkMm]?|\d+[分時間日]|now|today|昨日|今日|表示|件の返信)$/

const UI_CHROME_RE =
  /(⌘|⇧|⌥|⌃|ctrl|cmd|command|shortcut|sidebar|workspace|notifications|focus back|focus forward|show or hide|new workspace|keyboard shortcuts|menu item|toolbar|tab bar)/i

const CODE_SIGNAL_RE =
  /(error|exception|failed|traceback|cannot|undefined|null|warning|fatal|panic|throw|import |export |function |class |const |let |var |return |=>|\.tsx?|\.jsx?|\.py|\.swift|\.json|型|エラー|失敗|警告)/i

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function uniqueLines(value: string | null): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const lines: string[] = []

  for (const rawLine of value.split('\n')) {
    const line = normalizeLine(rawLine)
    if (line.length < 2) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(line)
  }

  return lines
}

function socialScore(line: string): number {
  if (NAV_LINE_RE.test(line) || SOCIAL_NOISE_RE.test(line) || UI_CHROME_RE.test(line)) return -20
  let score = 0
  if (line.length >= 18) score += 3
  if (/[。！？!?]/.test(line)) score += 2
  if (/[ぁ-んァ-ヶ一-龠a-zA-Z]{8,}/.test(line)) score += 2
  if (/https?:\/\/|pic\.twitter|画像|動画|スペース|おすすめ|プロモーション/i.test(line)) score -= 3
  if (/reply|repost|like|share|follow|views|件の表示/i.test(line)) score -= 2
  return score
}

function codeScore(line: string): number {
  if (UI_CHROME_RE.test(line)) return -20
  let score = CODE_SIGNAL_RE.test(line) ? 5 : 0
  if (/^\s*(at\s|>\s|\d+[:)]|\+|-|@@|\/\/|#|\/\*)/.test(line)) score += 2
  if (/[{}[\]();=<>]/.test(line)) score += 2
  if (line.length > 160) score -= 2
  if (NAV_LINE_RE.test(line)) score -= 8
  return score
}

function bestLines(lines: string[], kind: CurrentContext['contextKind'], maxLines: number): string[] {
  if (kind === 'social') {
    return [...lines]
      .map((line, index) => ({ line, index, score: socialScore(line) }))
      .filter((item) => item.score > -10)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxLines)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.line)
  }

  if (kind === 'coding') {
    return lines
      .map((line, index) => ({ line, index, score: codeScore(line) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxLines)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.line)
  }

  return lines.filter((line) => !NAV_LINE_RE.test(line) && !UI_CHROME_RE.test(line)).slice(0, maxLines)
}

export function buildLiveContextDigest(context: CurrentContext, maxChars = 1400): string {
  const sources = [
    context.selectedText,
    context.accessibilityText,
    context.screenText,
    context.pageText,
    context.pageTitle,
    context.pageUrl
  ]
  const lines = sources.flatMap(uniqueLines)
  const selected = bestLines(lines, context.contextKind, context.contextKind === 'coding' ? 18 : 10)
  const digest = selected.join('\n').trim()
  return digest.length > maxChars ? `${digest.slice(0, maxChars - 1)}...` : digest
}

export function compactLiveContext(context: CurrentContext, maxChars = 120): string {
  const digest = buildLiveContextDigest(context, maxChars)
  return digest.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}
