import path from 'node:path'
import type { CurrentContext } from './types'

const NAV_LINE_RE =
  /^(home|search|explore|notifications|messages|profile|bookmarks|communities|premium|verified orgs|following|followers|for you|reply|repost|like|share|post|posts|views|more|compose|おすすめ|フォロー|返信|リポスト|通知|メッセージ|検索|話題を検索)$/i

const SOCIAL_NOISE_RE =
  /^(.*\s)?(@[\w_]+|\d+([.,]\d+)?[KkMm]?|\d+[分時間日]|now|today|昨日|今日|表示|件の返信)$/

const OCR_GARBAGE_RE =
  /^(?:[^\p{L}\p{N}]{1,4}|[\p{L}\p{N}]{1,2}|[A-Za-z]?\d{1,2}[:.]\d{2}(?:\s?[AP]M)?|[①②③④⑤⑥⑦⑧⑨⑩]|\+\s*new tab)$/u

const CHAT_UI_NOISE_RE =
  /^(bold|italic|underline|strikethrough|link|ordered list|bulleted list|blockquote|code block?|show formatting|formatting|composer actions|send now|schedule for later|attach|emoji|mention someone|record video clip|record audio clip|message #[\w.-]+|message to [\w.-]+|direct messages?|new message|compose mail|draft reply|start a new conversation|type a new message|post a reply|delivery options|loop components|reply|reply all|forward|archive|trash|flag|junk|send later|mailboxes?|from|to|cc|bcc|subject|attachments?)$/i

const SOCIAL_SIDEBAR_OCR_RE =
  /^(?:[#＃].+|[•◎→↓]\s*.+|.+を検索|.+へメッセージを送信|イベント|サーバーブースト|テキストチャンネル[♥♡❤]?|ボイスチャンネル[♥♡❤]?|オンライン(?:[－-]\d+)?|オフライン(?:[－-]\d+)?|チャンネル|メンバー|スレッド|通知設定|ピン留めされたメッセージ|サーバー サイドバー)$/u

const SOCIAL_SPEAKER_META_RE =
  /^(?:@?[\p{L}\p{N}_.-]+|[\p{L}][\p{L}\p{N}_.-]*(?:\s+[\p{L}\p{N}_.-]+){0,2})\s+(?:\d{1,2}:\d{2}|C:\s*\d{1,2}:\d{2}|オンライン|オフライン)$/u

const SOCIAL_LINK_PREVIEW_RE =
  /(founder x creator|contrast therapy|hot takes, cold plunges|technical founder vs\.|product vs\.|claudecode vs\.|cold plunge vs\. sauna|wrong questions, the best choose both)/i

const CODEX_CHAT_UI_NOISE_RE =
  /^(chatgpt|codex|新しいタスク|スケジュール|プラグイン|サイト|チャット|ピン留め|プロジェクト|もっと表示する|タスク|元に戻す|レビューする|作業中|作業しました|コマンドを実行しました|ファイルを読み取りました|進行中の目標|フルアクセス|目標|環境|変更|ローカル|main|コミットまたはプッシュ|ブランチを比較|情報源|すべて表示|ステップ\d+\/\d+|フォローアップの変更を求める)$/i
const CODEX_WORKFLOW_META_RE =
  /^(?:tests?\/.+|src\/.+|[+＋-]\d+[+-]\d+|\d+m\s+\d+s作業(?:中|しました).*|(?:\d+ファイルを読み取りました)?コマンドを実行しました|図(?:\s+コマンドを実行しました)?|◎\s*ステップ\d+\/\d+|●進行中の目標.*|フォローアップの変更を求める|コミットまたはプッシュ|ブランチを比較|情報源|環境|ローカル|main|フルアクセス|目標|変更|すべて表示|selectdev)$/i

const UI_CHROME_RE =
  /(⌘|⇧|⌥|⌃|ctrl|cmd|command|shortcut|sidebar|workspace|notifications|focus back|focus forward|show or hide|new workspace|keyboard shortcuts|menu item|toolbar|tab bar)/i

const CODE_SIGNAL_RE =
  /(error|exception|failed|traceback|cannot|undefined|null|warning|fatal|panic|throw|has no member|cannot convert|no exact matches|value of type|import |export |function |class |const |let |var |return |=>|\.tsx?|\.jsx?|\.py|\.swift|\.json|型|エラー|失敗|警告)/i

const IDE_LAUNCHER_SIGNAL_RE =
  /(open project|clone repo|recent projects|connect via ssh|try a new window for running parallel agents|upgrade|free plan|cursor logo|shogunai3|internal-corporate-site|crm)/i

const IDE_LAUNCHER_UI_NOISE_RE =
  /(editor group \d+ \(empty\)|view all|\bcursor logo\b|このボタンにはウインドウを拡大する操作もあります)/i

const GENERIC_UI_NOISE_RE =
  /^(share|edited|favorite|actions|copy link|add comment|add cover|change page icon|new page|filter|sort|automations|ai autofill|settings|search|open as full page|add new|new chat|table|home|library|marketplace|help|trash|back|forward|close tab|new tab|today|inbox|event details|layers|assets|inspect|selection inspector|fill|stroke|design|prototype)$/i

const DOCUMENT_SIGNAL_RE =
  /(docs\.google|notion|document|specification|requirements|overview|metrics|workflow|history|proposal|pricing|target|summary|手順|概要|要件|議事録|営業|資料|検討|討論|完了|目標|詳細)/i
const CALENDAR_SIGNAL_RE =
  /(calendar|meeting|invite|attendees?|organizer|availability|zoom|google meet|agenda|meeting notes|会議|予定|参加者|開催場所|議題|打ち合わせ|ミーティング)/i
const DESIGN_SIGNAL_RE =
  /(figma|frame|layer|variant|component|auto layout|prototype|properties|fill|stroke|spacing|design system|mockup|wireframe|hero section|cta|button label|corner radius|デザイン|レイヤー|コンポーネント|フレーム|プロトタイプ)/i

const BROWSER_TAB_NOISE_RE =
  /(new tab|close tab|back|forward|reload|refresh|bookmark|bookmarks|tab search|tab group|address bar|omnibox|profile|extensions?|history|downloads?|sidebar|workspaces?|show tab|hide tab|search tabs?|pinned tabs?|tab actions?|戻る|進む|再読み込み|ブックマーク|拡張機能|プロフィール|、タブ$)/i

const BROWSER_TAB_TITLE_RE = /(?:\s[|]\s|\s-\s|\s[·•]\s)/
const SCREEN_OCR_UI_NOISE_RE =
  /^(esc|tab|shift|command|cmd|option|control|ctrl|return|enter|space|delete|finder|file|edit|view|window|help|copy|paste|100%|wifi|battery)$/i
const SELECTED_TEXT_UI_NOISE_RE =
  /^(message #[\w.-]+|message to [\w.-]+|bold|italic|underline|strikethrough|link|ordered list|bulleted list|blockquote|code block?|show formatting|formatting|composer actions|send now|schedule for later|attach|emoji|mention someone|record video clip|record audio clip|start a new conversation|type a new message|post a reply|delivery options|loop components|reply|reply all|forward|archive|trash|flag|junk|send later|mailboxes?|back|forward|reload|refresh|new tab|tab search|bookmark|bookmarks|extensions?|address bar|omnibox|profile|レビューする|元に戻す|新しいタスク|プラグイン|ピン留め|コミットまたはプッシュ)$/i

function isCodexSidebarCue(line: string): boolean {
  return /(?:^|\s)(chatgpt codex|新しいタスク|スケジュール|プラグイン|サイト|チャット|ピン留め|プロジェクト|タスク|もっと表示する)(?:$|\s)/i.test(
    normalizeLine(line)
  )
}

function isCodexBodyStartCandidate(line: string): boolean {
  const normalized = normalizeLine(line)
  if (!normalized) return false
  if (isCodexSidebarCue(normalized)) return false
  if (CODEX_CHAT_UI_NOISE_RE.test(normalized)) return false
  if (CODEX_WORKFLOW_META_RE.test(normalized)) return false
  if (SOCIAL_SIDEBAR_OCR_RE.test(normalized)) return false
  if (normalized.length >= 32) return true
  if (/[。！？!?]/u.test(normalized) && normalized.length >= 28) return true
  if (/fallback|fixture|context|discord|codex|chatgpt|accessibility|ocr|screen-ocr|search query|query/i.test(normalized)) {
    return true
  }
  return false
}

function trimCodexSidebarPrefix(lines: string[]): string[] {
  if (lines.length === 0) return lines
  const cueCount = lines.filter(isCodexSidebarCue).length
  const bodyStartIndex = lines.findIndex(isCodexBodyStartCandidate)
  if (cueCount >= 2 && bodyStartIndex > 0) {
    return lines.slice(bodyStartIndex)
  }

  const topicStartIndex = lines.findIndex((line) =>
    /fallback|fixture|context|discord|codex|chatgpt|accessibility|ocr/i.test(normalizeLine(line))
  )
  const candidateStartIndex =
    bodyStartIndex >= 4 ? bodyStartIndex : topicStartIndex >= 4 ? topicStartIndex : -1
  if (candidateStartIndex < 4) return lines

  const leadingCluster = lines.slice(0, candidateStartIndex)
  const shortLeadingCount = leadingCluster.filter((line) => normalizeLine(line).length <= 28).length
  const taskLikeLeadingCount = leadingCluster.filter((line) =>
    /(?:進める|洗い出す|整理|作りたい|作っていって|セットアップする|プロジェクト|selectdev|new[-=]workai|slctlabs|shinra ai|a2a|japn)/i.test(
      normalizeLine(line)
    )
  ).length
  const hasLaterCodexBodyCue = lines
    .slice(candidateStartIndex)
    .some((line) => /fallback|fixture|context|discord|codex|chatgpt|accessibility|ocr/i.test(normalizeLine(line)))

  if (shortLeadingCount >= 4 && taskLikeLeadingCount >= 2 && hasLaterCodexBodyCue) {
    return lines.slice(candidateStartIndex)
  }

  return lines
}

function normalizeLine(value: string): string {
  return value
    .replace(/このボタンにはウインドウを拡大する操作もあります/gu, ' ')
    .replace(/this button also has an action to zoom the window/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function humanizeLocalReference(line: string): string {
  const normalized = normalizeLine(line)
  if (!normalized) return normalized

  if (normalized.startsWith('file://')) {
    try {
      const basename = path.basename(new URL(normalized).pathname)
      return basename || normalized
    } catch {
      return normalized
    }
  }

  if (normalized.startsWith('/')) {
    const basename = path.basename(normalized)
    return basename || normalized
  }

  return normalized
}

function isLikelyOcrNoise(line: string): boolean {
  if (OCR_GARBAGE_RE.test(line)) return true
  if (line.length <= 2) return true

  const alphaNumCount = (line.match(/[\p{L}\p{N}]/gu) ?? []).length
  const symbolCount = line.length - alphaNumCount
  if (line.length <= 6 && symbolCount >= alphaNumCount) return true

  return false
}

function uniqueLines(value: string | null): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const lines: string[] = []

  for (const rawLine of value.split('\n')) {
    const line = humanizeLocalReference(rawLine)
    if (line.length < 2) continue
    if (isLikelyOcrNoise(line)) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    lines.push(line)
  }

  return lines
}

function sanitizedSelectedText(value: string | null): string | null {
  const normalized = value ? normalizeLine(value) : ''
  if (!normalized) return null
  return SELECTED_TEXT_UI_NOISE_RE.test(normalized) ? null : normalized
}

function isLikelyStandaloneOcrLabel(line: string): boolean {
  const normalized = normalizeLine(line)
  const stripped = normalized.replace(/[。！？!?]+$/u, '').trim()
  if (!stripped) return false
  if (stripped.length < 4 || stripped.length > 32) return false
  if (/[：:]/.test(stripped)) return false
  if (/https?:\/\/|file:\/\//i.test(stripped)) return false
  if (/\b(?:error|exception|function|class|const|import|return)\b/i.test(stripped)) return false
  if (CODEX_WORKFLOW_META_RE.test(stripped)) return false
  return /^[\p{L}\p{N}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\s_.=+\-/#]+$/u.test(stripped)
}

function shouldMergeWrappedOcrLine(previous: string, next: string): boolean {
  if (!previous || !next) return false
  if (previous.length < 8 || next.length < 2) return false
  if (BROWSER_TAB_TITLE_RE.test(previous) && previous.length <= 90 && !/[。！？!?]/.test(previous)) return false
  if (BROWSER_TAB_TITLE_RE.test(next) && next.length <= 90 && !/[。！？!?]/.test(next)) return false
  if (SCREEN_OCR_UI_NOISE_RE.test(previous) || SCREEN_OCR_UI_NOISE_RE.test(next)) return false
  if (CHAT_UI_NOISE_RE.test(previous) || CHAT_UI_NOISE_RE.test(next)) return false
  if (CODEX_CHAT_UI_NOISE_RE.test(previous) || CODEX_CHAT_UI_NOISE_RE.test(next)) return false
  if (CODEX_WORKFLOW_META_RE.test(previous) || CODEX_WORKFLOW_META_RE.test(next)) return false
  if (SOCIAL_SIDEBAR_OCR_RE.test(previous) || SOCIAL_SIDEBAR_OCR_RE.test(next)) return false
  if (SOCIAL_SPEAKER_META_RE.test(previous) || SOCIAL_SPEAKER_META_RE.test(next)) return false
  if (BROWSER_TAB_NOISE_RE.test(previous) || BROWSER_TAB_NOISE_RE.test(next)) return false
  if (isLikelyStandaloneOcrLabel(previous) && isLikelyStandaloneOcrLabel(next)) return false
  if (/[。！？!?：:」』】）)\]"]$/.test(previous)) return false
  if (/^(?:[@#＋+•◎→↓]|https?:\/\/)/i.test(next)) return false
  if (/^[a-zぁ-んァ-ヶ一-龠]/u.test(next)) return true
  if (/^[A-Z][a-z]/.test(next) && /[a-z]$/.test(previous)) return true
  return false
}

function mergeWrappedOcrLines(lines: string[]): string[] {
  const merged: string[] = []

  for (const line of lines) {
    const previous = merged[merged.length - 1] ?? null
    if (previous && shouldMergeWrappedOcrLine(previous, line)) {
      merged[merged.length - 1] = `${previous}${line}`
      continue
    }
    merged.push(line)
  }

  return merged
}

export function screenOcrCandidateLines(value: string | null): string[] {
  const merged = mergeWrappedOcrLines(
    trimCodexSidebarPrefix(uniqueLines(value).filter((line) => !SCREEN_OCR_UI_NOISE_RE.test(line)))
  )

  const forcedTopicStartIndex = merged.findIndex((line) =>
    /fallback|fixture|context-fixture|ocrfallback|codex\/chatgpt|accessibility|screen-ocr/i.test(normalizeLine(line))
  )
  if (forcedTopicStartIndex >= 4) {
    const leadingCluster = merged.slice(0, forcedTopicStartIndex)
    const taskLikeLeadingCount = leadingCluster.filter((line) =>
      /(?:進める|洗い出す|整理|作りたい|作っていって|セットアップする|プロジェクト|selectdev|new[-=]workai|slctlabs|shinra ai|a2a|japn)/i.test(
        normalizeLine(line)
      )
    ).length
    if (taskLikeLeadingCount >= 2) {
      return merged.slice(forcedTopicStartIndex)
    }
  }

  return merged
}

function socialScore(line: string): number {
  if (
    NAV_LINE_RE.test(line) ||
    SOCIAL_NOISE_RE.test(line) ||
    UI_CHROME_RE.test(line) ||
    CHAT_UI_NOISE_RE.test(line) ||
    SOCIAL_SIDEBAR_OCR_RE.test(line) ||
    SOCIAL_SPEAKER_META_RE.test(line)
  ) {
    return -20
  }
  let score = 0
  if (line.length >= 18) score += 3
  if (line.length >= 42) score += 2
  if (/[。！？!?]/.test(line)) score += 2
  if (/[ぁ-んァ-ヶ一-龠a-zA-Z]{8,}/.test(line)) score += 2
  if (/https?:\/\/|pic\.twitter|画像|動画|スペース|おすすめ|プロモーション/i.test(line)) score -= 3
  if (/reply|repost|like|share|follow|views|件の表示|message to |composer/i.test(line)) score -= 2
  if (SOCIAL_LINK_PREVIEW_RE.test(line)) score -= 20
  if (CODEX_CHAT_UI_NOISE_RE.test(line)) score -= 20
  if (CODEX_WORKFLOW_META_RE.test(line)) score -= 20
  if (/^[A-Za-z][A-Za-z0-9 ]{2,14}\s+[A-Za-z]$/i.test(line)) score -= 10
  if (/^[●•■◆]\s*@/.test(line)) score -= 3
  if (/^[@＠][\w.-]+\s+/.test(line)) score -= 2
  if (/^[A-Z][A-Za-z]+\s+[A-Z][A-Za-z]+/.test(line) && !/[。！？]/.test(line)) score -= 2
  if (/[\u3040-\u30ff\u4e00-\u9fff]{6,}.+[\u3040-\u30ff\u4e00-\u9fff]{6,}/u.test(line)) score += 2
  return score
}

function normalizedSocialContentKey(line: string): string {
  return normalizeLine(line)
    .replace(/^[●•■◆]\s*/, '')
    .replace(/^[@＠][\w.-]+\s+/, '')
    .replace(/^[●•■◆]\s*[@＠][\w.-]+\s+/, '')
    .replace(/^[A-Z][A-Za-z0-9_.-]*(?:\s+[A-Z][A-Za-z0-9_.-]*){0,2}\s+\d{1,2}:\d{2}\s*/u, '')
    .replace(/^[A-Z][A-Za-z0-9_.-]*(?:\s+[A-Z][A-Za-z0-9_.-]*){0,2}\s+C:\s*\d{1,2}:\d{2}\s*/u, '')
    .replace(/^[A-Z]\s+@/, '@')
    .replace(/^[●•■◆]\s*/, '')
    .replace(/^[@＠][\w.-]+\s+/, '')
    .replace(/\.\.\.$/, '')
    .replace(/…$/, '')
    .trim()
    .toLowerCase()
}

function compactSocialLines(lines: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    if (/^[A-Za-z][A-Za-z0-9 ]{2,14}$/i.test(line) && !/[.?!,:/]/.test(line)) continue
    if (/^[●•■◆]\s*[@＠].*[.…]$/.test(line)) continue
    if (/^https?:\/\/\S+$/i.test(line)) continue

    const key = normalizedSocialContentKey(line)
    if (!key) continue
    if (key.length <= 4 && !/[ぁ-んァ-ヶ一-龠]{3,}/u.test(key)) continue
    if (seen.has(key)) continue
    if ([...seen].some((existing) => key.includes(existing) || existing.includes(key))) continue
    seen.add(key)
    result.push(line)
  }

  return result
}

function compactLinesByContainment(lines: string[]): string[] {
  const result: string[] = []
  const seen: string[] = []

  for (const line of lines) {
    const key = normalizeLine(line).toLowerCase()
    if (!key) continue
    if (seen.some((existing) => existing === key)) continue
    if (seen.some((existing) => key.length >= 24 && existing.includes(key))) continue
    if (seen.some((existing) => existing.length >= 24 && key.includes(existing))) continue
    seen.push(key)
    result.push(line)
  }

  return result
}

function codeScore(line: string): number {
  if (UI_CHROME_RE.test(line)) return -20
  let score = CODE_SIGNAL_RE.test(line) ? 5 : 0
  if (IDE_LAUNCHER_SIGNAL_RE.test(line)) score += 4
  if (IDE_LAUNCHER_UI_NOISE_RE.test(line)) score -= 6
  if (/^\s*(at\s|>\s|\d+[:)]|\+|-|@@|\/\/|#|\/\*)/.test(line)) score += 2
  if (/[{}[\]();=<>]/.test(line)) score += 2
  if (line.length > 160) score -= 2
  if (NAV_LINE_RE.test(line)) score -= 8
  return score
}

function documentScore(line: string): number {
  if (UI_CHROME_RE.test(line) || GENERIC_UI_NOISE_RE.test(line)) return -20
  let score = DOCUMENT_SIGNAL_RE.test(line) ? 4 : 0
  if (CALENDAR_SIGNAL_RE.test(line)) score += 4
  if (DESIGN_SIGNAL_RE.test(line)) score += 4
  if (line.length >= 18) score += 2
  if (/[。！？!?]/.test(line)) score += 2
  if (/^(@|•|◦|-|\d+\.)/.test(line)) score += 1
  if (/^\d{4}\/\d{2}\/\d{2}|\b[A-Z][a-z]+ \d{1,2}, \d{4}\b/.test(line)) score -= 1
  if (/^(new|open|close|copy|favorite|search|filter|sort|share)\b/i.test(line)) score -= 6
  return score
}

function browserScore(line: string): number {
  if (UI_CHROME_RE.test(line) || GENERIC_UI_NOISE_RE.test(line) || BROWSER_TAB_NOISE_RE.test(line)) return -20
  let score = 0
  if (DOCUMENT_SIGNAL_RE.test(line)) score += 4
  if (line.length >= 18) score += 2
  if (line.length >= 42) score += 2
  if (/[。！？!?]/.test(line)) score += 2
  if (/https?:\/\/|\.com|\.ai|\.app|\.dev|\.io|\.jp|\.co\b/i.test(line)) score += 2
  if (BROWSER_TAB_TITLE_RE.test(line) && !/[。！？!?]/.test(line) && line.length <= 90) score -= 6
  return score
}

function bestLines(lines: string[], kind: CurrentContext['contextKind'], maxLines: number): string[] {
  if (kind === 'social') {
    const selected = [...lines]
      .map((line, index) => ({ line, index, score: socialScore(line) }))
      .filter((item) => item.score > -10)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxLines)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.line)

    return compactSocialLines(selected)
  }

  if (kind === 'coding') {
    const codingLines = lines
      .map((line, index) => ({ line, index, score: codeScore(line) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxLines)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.line)

    if (codingLines.length > 0) return codingLines

    return lines
      .map((line, index) => ({ line, index, score: documentScore(line) }))
      .filter((item) => item.score > -10)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxLines)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.line)
  }

  if (kind === 'document' || kind === 'general') {
    const selected = lines
      .map((line, index) => ({ line, index, score: documentScore(line) }))
      .filter((item) => item.score > -10)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxLines)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.line)

    return compactLinesByContainment(selected)
  }

  if (kind === 'browser') {
    const selected = lines
      .map((line, index) => ({ line, index, score: browserScore(line) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, maxLines)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.line)

    return compactLinesByContainment(selected)
  }

  return lines.filter((line) => !NAV_LINE_RE.test(line) && !UI_CHROME_RE.test(line)).slice(0, maxLines)
}

function prioritizedSources(context: CurrentContext): Array<string | null> {
  const selectedText = sanitizedSelectedText(context.selectedText)
  const byPrimary: Record<CurrentContext['primaryContentSource'], Array<string | null>> = {
    'selected-text': [
      selectedText,
      context.accessibilityText,
      context.pageText,
      context.screenText,
      context.pageTitle,
      context.pageUrl
    ],
    'page-text': [
      context.pageText,
      context.pageTitle,
      context.pageUrl,
      context.accessibilityText,
      context.screenText,
      selectedText
    ],
    'accessibility-text': [
      context.accessibilityText,
      selectedText,
      context.pageText,
      context.screenText,
      context.pageTitle,
      context.pageUrl
    ],
    'screen-ocr': [
      context.screenText,
      selectedText,
      context.accessibilityText,
      context.pageText,
      context.pageTitle,
      context.pageUrl
    ],
    none: [
      selectedText,
      context.accessibilityText,
      context.screenText,
      context.pageText,
      context.pageTitle,
      context.pageUrl
    ]
  }

  return byPrimary[context.primaryContentSource]
}

export function buildLiveContextDigest(context: CurrentContext, maxChars = 1400): string {
  const sources = prioritizedSources(context)
  const lines = sources.flatMap((source) => (source === context.screenText ? screenOcrCandidateLines(source) : uniqueLines(source)))
  const selected = bestLines(lines, context.contextKind, context.contextKind === 'coding' ? 18 : 10)
  const digest = selected.join('\n').trim()
  return digest.length > maxChars ? `${digest.slice(0, maxChars - 1)}...` : digest
}

export function compactLiveContext(context: CurrentContext, maxChars = 120): string {
  const digest = buildLiveContextDigest(context, maxChars)
  return digest.replace(/\s+/g, ' ').trim().slice(0, maxChars)
}
