import path from 'node:path'
import type { CurrentContext } from '../shared/types'
import { decidePublicPageFetch, resolveSharedSelectedTextCandidate } from './context-reader-utils.ts'

export type AccessibilitySnapshot = {
  appName: string | null
  workspaceAppName?: string | null
  topWindowOwnerName?: string | null
  windowTitle: string | null
  topWindowTitle?: string | null
  focusedRole: string | null
  selectedText: string | null
  selectedRangeText?: string | null
  valueText: string | null
  document: string | null
  url: string | null
  title: string | null
  focusChain?: Array<{
    role: string | null
    title: string | null
    value: string | null
    visibleText?: string | null
    selectedRangeText?: string | null
    selectedMarkerText?: string | null
    description: string | null
    help: string | null
    placeholder: string | null
    selectedText: string | null
    document: string | null
    url: string | null
    childCount: number
    attributeNames?: string[]
    selectedTextRange?: string | null
    visibleCharacterRange?: string | null
  }>
  lines: string[]
}

export type AccessibilityExtraction = {
  appName: string | null
  windowTitle: string | null
  accessibilityText: string | null
  accessibilityCaptureMethod: CurrentContext['accessibilityCaptureMethod']
  selectedText: string | null
  selectedTextSource:
    | 'top-level-selected-text'
    | 'top-level-selected-range-text'
    | 'focus-chain-selected-text'
    | 'focus-chain-selected-range-text'
    | 'focus-chain-selected-marker-text'
    | 'none'
  pageTitle: string | null
  pageUrl: string | null
  pageText: string | null
}

export type AccessibilityCaptureOutcome = {
  extraction: AccessibilityExtraction
  diagnostics: AccessibilityDiagnostics
}

export type AccessibilityContentSelection = {
  rankedLines: RankedAccessibilityLine[]
  contentLines: string[]
  lowSignal: boolean
  lowSignalReason: AccessibilityDiagnostics['lowSignalReason']
}

export type RankedAccessibilityLine = {
  line: string
  score: number
}

type IndexedAccessibilityLine = RankedAccessibilityLine & {
  index: number
}

export type AccessibilityUrlCandidate = {
  text: string | null
  url: string
}

export type AccessibilityDiagnostics = {
  appName: string | null
  rawAppName: string | null
  workspaceAppName: string | null
  topWindowOwnerName: string | null
  windowTitle: string | null
  rawWindowTitle: string | null
  topWindowTitle: string | null
  appResolutionSource: 'helper-frontmost' | 'top-window-owner' | 'workspace-app' | 'none'
  windowTitleResolutionSource: 'window-title' | 'top-window-title' | 'snapshot-title' | 'none'
  focusedRole: string | null
  pageUrlCandidate: string | null
  selectedTextPresent: boolean
  selectedTextSource: AccessibilityExtraction['selectedTextSource']
  valueTextPresent: boolean
  focusChainNodeCount: number
  rankedLines: RankedAccessibilityLine[]
  lowSignal: boolean
  lowSignalReason:
    | 'missing-snapshot'
    | 'notification-center'
    | 'system-shell'
    | 'empty-ranked-lines'
    | 'title-only'
    | 'social-chrome-only'
    | 'browser-chrome-only'
    | 'weak-content'
    | null
}

export type PageTextAssemblyInput = {
  pageTitle: string | null
  pageUrl: string | null
  contentLines: string[]
  lowSignal: boolean
}

export type AccessibilityPageTextLineNormalizationInput = Pick<PageTextAssemblyInput, 'pageTitle' | 'pageUrl' | 'contentLines'>

export type ResolvedPageTitleCandidateInput = {
  rawTitle: string | null
  appName: string | null
  candidateLines: string[]
}

export type SnapshotAppResolution = {
  appName: string | null
  source: AccessibilityDiagnostics['appResolutionSource']
}

export type SnapshotWindowTitleResolution = {
  windowTitle: string | null
  source: AccessibilityDiagnostics['windowTitleResolutionSource']
}

export type SnapshotSuppressionClassification = {
  notificationCenter: boolean
  systemShell: boolean
}

export type AccessibilityUrlCandidateAcceptanceInput = {
  snapshot: AccessibilitySnapshot
  url: string
  text: string | null
  source: 'direct-metadata' | 'focus-chain' | 'snapshot-text'
}

export type AccessibilityContentLineDisposition =
  | 'keep'
  | 'menu-noise'
  | 'generic-noise'
  | 'content-ui-noise'
  | 'browser-surface-noise'
  | 'email-header'
  | 'chrome-title'
  | 'browser-chrome'
  | 'social-chrome'

export type AccessibilityRoleScoreAdjustment = {
  roleBonus: number
  rolePenalty: number
}

export type AccessibilityTitleScoreAdjustment = {
  titleBoost: number
  browserTabPenalty: number
}

export type LowSignalClassificationInput = {
  snapshot: AccessibilitySnapshot
  rankedLines: RankedAccessibilityLine[]
}

const GENERIC_AX_NOISE_RE =
  /^(ok|cancel|close|open|save|share|edit|done|next|back|search|settings|help|home|library|inbox|today|new tab|new chat|filter|sort|format|favorites?|bookmark|copy link|mark read|notifications?|messages?|profile|sidebar|toolbar|menu|button|tab bar|explorer|extensions|outline|problems|debug console|source control|navigator|issues|editor|event details|layers|assets|inspect|selection inspector|fill|stroke|design|prototype|chat)$/i

const MENU_AX_NOISE_RE =
  /(preferences|services|hide others|show all|quit |reload|force reload|zoom in|zoom out|toggle full screen|app store|システム設定|このMacについて|最近使った項目|をFinderに表示)/i

const CONTENT_SIGNAL_RE =
  /(https?:\/\/|\.com|\.ai|\.ts|\.tsx|\.js|\.jsx|\.py|\.swift|error|exception|failed|has no member|cannot convert|no exact matches|value of type|function |class |const |import |export |return |=>|document|summary|proposal|pricing|要件|概要|議事録|検討|手順|完了)/i
const CALENDAR_CONTENT_SIGNAL_RE =
  /(meeting|invite|attendees?|organizer|availability|zoom|google meet|agenda|meeting notes|calendar|会議|予定|参加者|開催場所|議題|打ち合わせ|ミーティング)/i
const DESIGN_CONTENT_SIGNAL_RE =
  /(figma|frame|layer|variant|component|auto layout|prototype|properties|fill|stroke|spacing|design system|mockup|wireframe|hero section|cta|button label|corner radius|デザイン|レイヤー|コンポーネント|フレーム|プロトタイプ)/i

const CONTENTFUL_LINE_RE =
  /([。！？!?]|【.+】|「.+」|『.+』|[一-龠ぁ-んァ-ヶ]{4,}|[A-Za-z]{6,}\s+[A-Za-z]{3,})/
const SOCIAL_CHROME_ONLY_RE =
  /slack|discord|teams|\(channel\)|channel|message #|message to |composer|compose (area|box)|bold|italic|underline|strikethrough|link|ordered list|bulleted list|blockquote|code block?|show formatting|formatting|composer actions|send now|schedule for later|attach|emoji|mention someone|record video clip|record audio clip|new message|compose mail|draft reply|start a new conversation|type a new message|post a reply|delivery options|loop components|chat|inbox|archive|trash|flag|junk|reply|reply all|forward|send later|mailboxes?|server sidebar|member list|members?|online|offline|text channels?|voice channels?|pinned messages?|notifications?|threads?|チャンネル|メンバー|オンライン|オフライン|通知設定|ピン留めされたメッセージ|サーバー サイドバー|メンバーリスト/i
const EMAIL_HEADER_ONLY_RE =
  /^(from|to|cc|bcc|subject|attachment|attachments|reply-to|送信先|件名|差出人|添付)$/i
const BROWSER_CHROME_ONLY_RE =
  /(back|forward|reload|refresh|new tab|tab search|bookmark|extensions?|address bar|search tabs?|omnibox|profile|incognito|reader mode|home|tab group|split view|downloads?|history|sidebar|workspaces?|pinned tabs?|tab actions?|show tab|hide tab|close tab|open tab|新しいタブ|戻る|進む|再読み込み|ブックマーク|拡張機能|プロフィール)/i
const CONTENT_LINE_UI_NOISE_RE =
  /^(editor|message field|message body|message #[\w.-]+|message to [\w.-]+|compose area|compose (box|window)|bold|italic|underline|strikethrough|link|ordered list|bulleted list|blockquote|code block?|show formatting|formatting|composer actions|send now|schedule for later|attach|emoji|mention someone|record video clip|record audio clip|share|favorite|add comment|updates|last edited .+|new message|compose mail|draft reply|start a new conversation|type a new message|post a reply|delivery options|loop components|chat|format|send later|reply|reply all|forward|archive|trash|flag|junk|mailboxes?|navigator|issues|layers|assets|inspect|selection inspector|fill|stroke|design|prototype|server sidebar|member list|members?|online|offline|text channels?|voice channels?|pinned messages?|notifications?|threads?|チャンネルのヘッダー|サーバー サイドバー|メンバーリストを非表示|通知設定|ピン留めされたメッセージ)$/i
const BROWSER_SURFACE_UI_NOISE_RE =
  /^(google chrome|chrome|safari|firefox|arc|brave|edge|product \(.+\)|personal \(.+\)|仕事|メインナビゲーション|プロダクトハントのロゴ|今後のイベント|話題のフォーラムスレッド|本日発売の注目商品|昨日の人気商品|先週の人気商品|先月の人気商品|本日の商品一覧を見る|昨日の人気商品をすべて見る|先週の人気商品をすべて見る|先月の人気商品をすべて見る|提出する|戻る|進む|再読み込み|新しいタブ|タブ検索)$/i
const SCHEMELESS_URL_RE =
  /\b(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"'）)」】]*)?/i
const BROWSER_TAB_LABEL_RE = /(?:、タブ|,\s*tab|\btab\b)$/i
const ACTIONABLE_SELECTED_TEXT_NOISE_RE =
  /^(review|approve|reject|request changes|follow up|mark read|show more|more|open next|settings|plugins|schedule|new task|reviewする|レビューする|元に戻す|フォローアップの変更を求める|次で開く|すべて表示|もっと表示|進行中の目標|コミットまたはプッシュ|ブランチを比較)$/i

function titleTokens(snapshot: AccessibilitySnapshot): string[] {
  return [snapshot.title, resolvedSnapshotWindowTitle(snapshot), snapshot.url]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) =>
      value
        .split(/[\s/|:：\-–—_()[\]【】「」『』,.]+/u)
        .map((token) => token.trim().toLowerCase())
        .filter((token) => token.length >= 3)
    )
}

function titleAlignedBoost(line: string, snapshot: AccessibilitySnapshot): number {
  const normalized = line.toLowerCase()
  const tokens = titleTokens(snapshot)
  const resolvedWindowTitle = resolvedSnapshotWindowTitle(snapshot)
  let boost = 0

  for (const token of tokens) {
    if (normalized.includes(token)) boost += 3
  }

  if (snapshot.url) {
    try {
      if (normalized === snapshot.url.toLowerCase()) boost += 12
      const hostname = new URL(snapshot.url).hostname.toLowerCase()
      if (normalized.includes(hostname)) boost += 4
    } catch {
      // Ignore invalid urls from helpers.
    }
  }

  if (snapshot.title && normalized === snapshot.title.toLowerCase()) boost += 8
  if (resolvedWindowTitle && normalized === resolvedWindowTitle.toLowerCase()) boost += 6
  return boost
}

function isBrowserTabLabel(line: string): boolean {
  return BROWSER_TAB_LABEL_RE.test(line.trim())
}

function isChromeTitleLike(line: string, snapshot: AccessibilitySnapshot): boolean {
  const normalized = line.toLowerCase()
  const resolvedWindowTitle = resolvedSnapshotWindowTitle(snapshot)
  const matchesExactTitle =
    normalized === (snapshot.title?.toLowerCase() ?? '') || normalized === (resolvedWindowTitle?.toLowerCase() ?? '')
  const hasBrowserShellDecorators =
    /(google chrome|chrome|safari|firefox|arc|brave|edge|固定済み|新しいタブ|タブ検索|再読み込み|product \(.+\)|personal \(.+\))/i.test(
      line
    )

  if (!matchesExactTitle) {
    const title = snapshot.title?.toLowerCase() ?? ''
    if (!title || normalized === title) return false
    if (normalized.includes(title) && hasBrowserShellDecorators) return true
    return false
  }
  if (/https?:\/\/|\.(com|ai|app|dev|io|jp|co)\b/i.test(line)) return false
  if (CONTENTFUL_LINE_RE.test(line) && /[。！？!?]/.test(line)) return false

  return hasBrowserShellDecorators || /(slack|discord|teams|chatgpt|channel|message|tab|window|ホーム|home)/i.test(line)
}

export function classifySnapshotSuppression(snapshot: AccessibilitySnapshot): SnapshotSuppressionClassification {
  const appName = resolvedSnapshotAppName(snapshot)?.toLowerCase() ?? snapshot.appName?.toLowerCase() ?? ''
  const title = snapshot.title?.toLowerCase() ?? ''
  const windowTitle = resolvedSnapshotWindowTitle(snapshot)?.toLowerCase() ?? snapshot.windowTitle?.toLowerCase() ?? ''
  const joined = uniqueLines(snapshot.lines).join('\n')
  const joinedLower = joined.toLowerCase()

  const notificationCenter =
    appName === 'usernotificationcenter' ||
    title === 'usernotificationcenter' ||
    windowTitle === 'usernotificationcenter' ||
    /control mac apps on your behalf|制御するアクセスを要求しています|allow access|don'?t allow|許可しない/.test(joined)

  const systemShell =
    appName === 'loginwindow' ||
    title === 'loginwindow' ||
    windowTitle === 'loginwindow' ||
    /\bloginwindow\b/.test(joinedLower)

  return {
    notificationCenter,
    systemShell
  }
}

function isNotificationCenterSnapshot(snapshot: AccessibilitySnapshot): boolean {
  return classifySnapshotSuppression(snapshot).notificationCenter
}

function isSystemShellSnapshot(snapshot: AccessibilitySnapshot): boolean {
  return classifySnapshotSuppression(snapshot).systemShell
}

function hasSocialSidebarChromeCues(snapshot: AccessibilitySnapshot, rankedLines: RankedAccessibilityLine[]): boolean {
  const appName = snapshot.appName?.toLowerCase() ?? ''
  if (!/discord|slack|teams|chatwork/i.test(appName)) return false

  const joined = uniqueLines(snapshot.lines).join('\n')
  const hasSidebarCue =
    /member list|server sidebar|text channels?|voice channels?|members?|online|offline|チャンネル|メンバー|オンライン|オフライン|サーバー サイドバー|メンバーリスト/.test(
      joined
    )

  if (!hasSidebarCue) return false

  const hasLongReadableLine = rankedLines.some(
    (item) =>
      item.line.length >= 24 &&
      (CONTENT_SIGNAL_RE.test(item.line) || CONTENTFUL_LINE_RE.test(item.line)) &&
      !SOCIAL_CHROME_ONLY_RE.test(item.line)
  )

  return !hasLongReadableLine
}

function normalizeText(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 0 ? normalized : null
}

const NOISY_FRONTMOST_APP_RE =
  /^(loginwindow|usernotificationcenter|notificationcenter|controlcenter|window server|windowserver|dock)$/i
const BROWSER_LIKE_APP_RE = /^(safari|google chrome|chrome|chromium|arc|brave browser|brave|microsoft edge|edge|firefox|dia)$/i

function isNoisyFrontmostAppName(value: string | null | undefined): boolean {
  return Boolean(normalizeText(value) && NOISY_FRONTMOST_APP_RE.test(normalizeText(value) as string))
}

function isBrowserLikeAppName(value: string | null | undefined): boolean {
  return Boolean(normalizeText(value) && BROWSER_LIKE_APP_RE.test(normalizeText(value) as string))
}

function shouldPreferWorkspaceAppResolution(snapshot: AccessibilitySnapshot): boolean {
  const workspaceAppName = normalizeText(snapshot.workspaceAppName)
  const topWindowOwnerName = normalizeText(snapshot.topWindowOwnerName)
  if (!workspaceAppName || !topWindowOwnerName) return false
  if (isNoisyFrontmostAppName(workspaceAppName)) return false
  if (!isBrowserLikeAppName(topWindowOwnerName) || isBrowserLikeAppName(workspaceAppName)) return false

  const focusedRole = normalizeText(snapshot.focusedRole)?.toLowerCase() ?? ''
  const normalizedUrl = normalizeText(snapshot.url)
  const hasBrowserPageIdentity = Boolean(
    normalizedUrl && /^(https?:\/\/|file:\/\/)/i.test(normalizedUrl)
  )
  const looksEditorOrDocumentLike =
    /text|textarea|editor|code|outline|document|sheet|scroll area|web area/i.test(focusedRole) ||
    Boolean(resolveSelectedTextCandidate({ candidate: snapshot.selectedText })) ||
    Boolean(resolveSelectedTextCandidate({ candidate: snapshot.selectedRangeText })) ||
    Boolean(normalizeText(snapshot.valueText))

  return looksEditorOrDocumentLike && !hasBrowserPageIdentity
}

export function resolveSnapshotAppResolution(snapshot: AccessibilitySnapshot): SnapshotAppResolution {
  const appName = normalizeText(snapshot.appName)
  if (appName && !isNoisyFrontmostAppName(appName)) {
    return {
      appName,
      source: 'helper-frontmost'
    }
  }

  const topWindowOwnerName = normalizeText(snapshot.topWindowOwnerName)
  const workspaceAppName = normalizeText(snapshot.workspaceAppName)
  if (shouldPreferWorkspaceAppResolution(snapshot) && workspaceAppName) {
    return {
      appName: workspaceAppName,
      source: 'workspace-app'
    }
  }

  if (topWindowOwnerName && !isNoisyFrontmostAppName(topWindowOwnerName)) {
    return {
      appName: topWindowOwnerName,
      source: 'top-window-owner'
    }
  }

  if (workspaceAppName && !isNoisyFrontmostAppName(workspaceAppName)) {
    return {
      appName: workspaceAppName,
      source: 'workspace-app'
    }
  }

  return {
    appName: appName ?? topWindowOwnerName ?? workspaceAppName,
    source: 'none'
  }
}

function resolvedSnapshotAppName(snapshot: AccessibilitySnapshot): string | null {
  return resolveSnapshotAppResolution(snapshot).appName
}

function resolvedSnapshotAppSource(snapshot: AccessibilitySnapshot): AccessibilityDiagnostics['appResolutionSource'] {
  return resolveSnapshotAppResolution(snapshot).source
}

export function resolveSnapshotWindowTitleResolution(
  snapshot: AccessibilitySnapshot
): SnapshotWindowTitleResolution {
  const windowTitle = normalizeText(snapshot.windowTitle)
  if (windowTitle) {
    return {
      windowTitle,
      source: 'window-title'
    }
  }

  const topWindowTitle = normalizeText(snapshot.topWindowTitle)
  if (topWindowTitle) {
    return {
      windowTitle: topWindowTitle,
      source: 'top-window-title'
    }
  }

  const snapshotTitle = normalizeText(snapshot.title)
  if (snapshotTitle) {
    return {
      windowTitle: snapshotTitle,
      source: 'snapshot-title'
    }
  }

  return {
    windowTitle: null,
    source: 'none'
  }
}

function resolvedSnapshotWindowTitle(snapshot: AccessibilitySnapshot): string | null {
  return resolveSnapshotWindowTitleResolution(snapshot).windowTitle
}

function resolvedSnapshotWindowTitleSource(
  snapshot: AccessibilitySnapshot
): AccessibilityDiagnostics['windowTitleResolutionSource'] {
  return resolveSnapshotWindowTitleResolution(snapshot).source
}

function normalizedKey(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)
  return normalized ? normalized.toLowerCase() : null
}

function uniqueLines(lines: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const line of lines) {
    const normalized = normalizeText(line)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }

  return result
}

function parsedRangeLength(value: string | null | undefined): number {
  const match = value?.match(/length:\s*(\d+)/i)
  return match ? Number.parseInt(match[1] ?? '0', 10) : 0
}

function focusNodeHasReadableContentSignal(
  node: NonNullable<AccessibilitySnapshot['focusChain']>[number]
): boolean {
  if (normalizeText(node.selectedText)) return true
  if (normalizeText(node.selectedRangeText)) return true
  if (normalizeText(node.selectedMarkerText)) return true
  if (normalizeText(node.visibleText)) return true
  if (normalizeText(node.value)) return true
  if (parsedRangeLength(node.selectedTextRange) > 0) return true
  if (parsedRangeLength(node.visibleCharacterRange) > 0) return true
  if (node.attributeNames?.includes('AXVisibleCharacterRange')) return true
  if (node.attributeNames?.includes('AXSelectedText')) return true
  if (node.attributeNames?.includes('AXValue')) return true
  const role = normalizeText(node.role)?.toLowerCase() ?? ''
  const hasDocumentIdentity = Boolean(normalizeText(node.url) || normalizeText(node.document))
  const hasSubstantialSupplementalText = [node.description, node.help].some((value) => {
    const normalized = normalizeText(value)
    return Boolean(
      normalized &&
        normalized.length >= 24 &&
        !GENERIC_AX_NOISE_RE.test(normalized) &&
        !CONTENT_LINE_UI_NOISE_RE.test(normalized) &&
        !SOCIAL_CHROME_ONLY_RE.test(normalized) &&
        !BROWSER_CHROME_ONLY_RE.test(normalized)
    )
  })
  if (hasDocumentIdentity && /webarea|group|document|textarea|text/.test(role) && hasSubstantialSupplementalText) return true
  return false
}

function isContentfulAccessibilityCandidate(value: string | null | undefined): value is string {
  const normalized = normalizeText(value)
  if (!normalized) return false
  if (GENERIC_AX_NOISE_RE.test(normalized)) return false
  if (CONTENT_LINE_UI_NOISE_RE.test(normalized)) return false
  if (EMAIL_HEADER_ONLY_RE.test(normalized)) return false
  if (normalized.length >= 24) return true
  if (CONTENT_SIGNAL_RE.test(normalized)) return true
  if (CALENDAR_CONTENT_SIGNAL_RE.test(normalized)) return true
  if (DESIGN_CONTENT_SIGNAL_RE.test(normalized)) return true
  if (CONTENTFUL_LINE_RE.test(normalized)) return true
  if (looksLikeUrl(normalized)) return true
  return false
}

function hasMeaningfulAccessibilityCandidate(value: string | null | undefined): boolean {
  const normalized = normalizeText(value)
  if (!normalized) return false
  if (/^mailto:/i.test(normalized)) return false
  if (GENERIC_AX_NOISE_RE.test(normalized)) return false
  if (CONTENT_LINE_UI_NOISE_RE.test(normalized)) return false
  if (EMAIL_HEADER_ONLY_RE.test(normalized)) return false
  if (BROWSER_CHROME_ONLY_RE.test(normalized) && !CONTENT_SIGNAL_RE.test(normalized) && !CONTENTFUL_LINE_RE.test(normalized)) {
    return false
  }
  if (SOCIAL_CHROME_ONLY_RE.test(normalized) && !CONTENT_SIGNAL_RE.test(normalized) && !CONTENTFUL_LINE_RE.test(normalized)) {
    return false
  }
  if (normalized.length >= 8) return true
  return Boolean(
    CONTENT_SIGNAL_RE.test(normalized) ||
      CALENDAR_CONTENT_SIGNAL_RE.test(normalized) ||
      DESIGN_CONTENT_SIGNAL_RE.test(normalized) ||
      CONTENTFUL_LINE_RE.test(normalized) ||
      looksLikeUrl(normalized)
  )
}

export function resolveSelectedTextCandidate(params: {
  candidate: string | null | undefined
  placeholder?: string | null | undefined
  title?: string | null | undefined
  appName?: string | null | undefined
  focusedRole?: string | null | undefined
  lines?: string[] | undefined
}): string | null {
  const sharedCandidate = resolveSharedSelectedTextCandidate(params.candidate)
  if (sharedCandidate.reason !== 'accepted' || !sharedCandidate.candidate) return null
  const candidate = sharedCandidate.candidate

  const placeholder = normalizeText(params.placeholder)
  if (placeholder && candidate.toLowerCase() === placeholder.toLowerCase()) return null

  const title = normalizeText(params.title)
  if (title && candidate.toLowerCase() === title.toLowerCase() && CONTENT_LINE_UI_NOISE_RE.test(candidate)) {
    return null
  }

  const focusedRole = normalizeText(params.focusedRole)?.toLowerCase() ?? ''
  const appName = normalizeText(params.appName)?.toLowerCase() ?? ''
  const chromeJoined = (params.lines ?? [])
    .map((line) => normalizeText(line))
    .filter((line): line is string => Boolean(line))
    .join('\n')
    .toLowerCase()
  const isTextEditingRole = /textarea|text|document|editor/.test(focusedRole)
  const isCodexLikeSurface = /codex|chatgpt/.test(appName)
  const hasCodexWorkflowChromeCue =
    /新しいタスク|プラグイン|進行中の目標|コミットまたはプッシュ|ブランチを比較|reviewする|レビューする|フォローアップの変更を求める/i.test(
      chromeJoined
    )
  if (
    candidate.length <= 24 &&
    ACTIONABLE_SELECTED_TEXT_NOISE_RE.test(candidate) &&
    (!isTextEditingRole || (isCodexLikeSurface && hasCodexWorkflowChromeCue))
  ) {
    return null
  }

  if (!hasMeaningfulAccessibilityCandidate(candidate)) return null
  return candidate.slice(0, 12000)
}

function focusChainTextCandidates(snapshot: AccessibilitySnapshot): string[] {
  if (!snapshot.focusChain?.length) return []

  return uniqueLines(
    snapshot.focusChain.flatMap((node) => {
      const strongCandidates = [node.selectedText, node.selectedRangeText, node.selectedMarkerText, node.visibleText, node.value].filter(
        (value): value is string => typeof value === 'string' && value.length > 0
      )
      const supplementalCandidates = focusNodeHasReadableContentSignal(node)
        ? [node.title, node.description, node.help].filter(isContentfulAccessibilityCandidate)
        : []
      return [...strongCandidates, ...supplementalCandidates]
    })
  )
}

function resolveSelectedText(snapshot: AccessibilitySnapshot): Pick<AccessibilityExtraction, 'selectedText' | 'selectedTextSource'> {
  const direct = resolveSelectedTextCandidate({
    candidate: snapshot.selectedText,
    appName: snapshot.appName,
    focusedRole: snapshot.focusedRole,
    lines: snapshot.lines
  })
  if (direct) {
    return {
      selectedText: direct,
      selectedTextSource: 'top-level-selected-text'
    }
  }
  const topLevelRangeText = resolveSelectedTextCandidate({
    candidate: snapshot.selectedRangeText,
    appName: snapshot.appName,
    focusedRole: snapshot.focusedRole,
    lines: snapshot.lines
  })
  if (topLevelRangeText) {
    return {
      selectedText: topLevelRangeText,
      selectedTextSource: 'top-level-selected-range-text'
    }
  }
  if (!snapshot.focusChain?.length) {
    return {
      selectedText: null,
      selectedTextSource: 'none'
    }
  }

  for (const node of snapshot.focusChain) {
    const selectedText = resolveSelectedTextCandidate({
      candidate: node.selectedText,
      placeholder: node.placeholder,
      title: node.title,
      appName: snapshot.appName,
      focusedRole: node.role ?? snapshot.focusedRole,
      lines: snapshot.lines
    })
    if (selectedText) {
      return {
        selectedText,
        selectedTextSource: 'focus-chain-selected-text'
      }
    }

    const selectedRangeText = resolveSelectedTextCandidate({
      candidate: node.selectedRangeText,
      placeholder: node.placeholder,
      title: node.title,
      appName: snapshot.appName,
      focusedRole: node.role ?? snapshot.focusedRole,
      lines: snapshot.lines
    })
    if (selectedRangeText) {
      return {
        selectedText: selectedRangeText,
        selectedTextSource: 'focus-chain-selected-range-text'
      }
    }

    const candidate = resolveSelectedTextCandidate({
      candidate: node.selectedMarkerText,
      placeholder: node.placeholder,
      title: node.title,
      appName: snapshot.appName,
      focusedRole: node.role ?? snapshot.focusedRole,
      lines: snapshot.lines
    })
    if (!candidate) continue
    return {
      selectedText: candidate,
      selectedTextSource: 'focus-chain-selected-marker-text'
    }
  }

  return {
    selectedText: null,
    selectedTextSource: 'none'
  }
}

export function classifyAccessibilityContentLine(line: string, snapshot: AccessibilitySnapshot): AccessibilityContentLineDisposition {
  if (MENU_AX_NOISE_RE.test(line)) return 'menu-noise'
  if (GENERIC_AX_NOISE_RE.test(line)) return 'generic-noise'
  if (CONTENT_LINE_UI_NOISE_RE.test(line)) return 'content-ui-noise'
  if (BROWSER_SURFACE_UI_NOISE_RE.test(line)) return 'browser-surface-noise'
  if (EMAIL_HEADER_ONLY_RE.test(line)) return 'email-header'
  if (isChromeTitleLike(line, snapshot)) return 'chrome-title'

  if (BROWSER_CHROME_ONLY_RE.test(line) && !CONTENT_SIGNAL_RE.test(line) && !CONTENTFUL_LINE_RE.test(line)) {
    return 'browser-chrome'
  }

  if (SOCIAL_CHROME_ONLY_RE.test(line) && !CONTENT_SIGNAL_RE.test(line) && !CONTENTFUL_LINE_RE.test(line)) {
    return 'social-chrome'
  }

  return 'keep'
}

export function shouldIncludeAccessibilityLineInContent(line: string, snapshot: AccessibilitySnapshot): boolean {
  return classifyAccessibilityContentLine(line, snapshot) === 'keep'
}

function looksLikeUrl(value: string | null): boolean {
  return Boolean(value && /^(https?:\/\/|file:\/\/)/i.test(value))
}

function normalizeUrlCandidate(value: string | null | undefined): string | null {
  const normalized = normalizeText(value)
  if (!normalized) return null

  const directMatch = normalized.match(/(?:https?:\/\/|file:\/\/|mailto:)[^\s<>"'）)」】]+/i)?.[0] ?? null
  if (directMatch) {
    if (/^mailto:/i.test(directMatch)) return null
    try {
      return new URL(directMatch).toString()
    } catch {
      return null
    }
  }

  const schemelessMatch = normalized.match(SCHEMELESS_URL_RE)?.[0] ?? null
  if (!schemelessMatch) return null
  if (schemelessMatch.includes('@')) return null
  if (normalized.toLowerCase().includes(`@${schemelessMatch.toLowerCase()}`)) return null
  if (!/\.(com|ai|app|dev|io|jp|co|net|org|io|me|fm|gg|sh|so|xyz|cloud)(\/|$)/i.test(schemelessMatch) && !/^localhost(?::\d+)?(\/|$)/i.test(schemelessMatch)) {
    return null
  }

  try {
    return new URL(`https://${schemelessMatch.replace(/^https?:\/\//i, '')}`).toString()
  } catch {
    return null
  }
}

function decodedUrlForMatching(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${decodeURIComponent(parsed.pathname)}${decodeURIComponent(parsed.search)}`.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

function isBrowserLikeAccessibilitySurface(snapshot: AccessibilitySnapshot): boolean {
  const appName = resolvedSnapshotAppName(snapshot)?.toLowerCase() ?? snapshot.appName?.toLowerCase() ?? ''
  const focusedRole = snapshot.focusedRole?.toLowerCase() ?? ''

  return /chrome|arc|brave|edge|chromium|safari|firefox|opera|dia|chatgpt atlas/i.test(appName) ||
    focusedRole.includes('webarea')
}

function isCalendarLikeAccessibilitySurface(snapshot: AccessibilitySnapshot): boolean {
  const appName = resolvedSnapshotAppName(snapshot)?.toLowerCase() ?? snapshot.appName?.toLowerCase() ?? ''
  return /calendar/i.test(appName)
}

export function shouldAcceptAccessibilityUrlCandidate(
  params: AccessibilityUrlCandidateAcceptanceInput
): boolean {
  if (params.source === 'direct-metadata') {
    return true
  }

  if (params.url.startsWith('file://')) {
    return false
  }

  if (isCalendarLikeAccessibilitySurface(params.snapshot) && /(zoom|meet|calendar)/i.test(params.text ?? params.url)) {
    return true
  }

  return isBrowserLikeAccessibilitySurface(params.snapshot)
}

function scoreUrlCandidate(url: string, snapshot: AccessibilitySnapshot, sourceText: string | null, index: number): number {
  const titleTokenList = titleTokens(snapshot)
  const decoded = decodedUrlForMatching(url)
  const source = normalizeText(sourceText)?.toLowerCase() ?? ''
  const resolvedWindowTitle = resolvedSnapshotWindowTitle(snapshot)
  const fetchDecision = decidePublicPageFetch(url)
  let score = -index * 0.01

  for (const token of titleTokenList) {
    if (decoded.includes(token)) score += 4
    if (source.includes(token)) score += 2
  }

  if (resolvedWindowTitle && source === resolvedWindowTitle.toLowerCase()) score += 6
  if (snapshot.title && source === snapshot.title.toLowerCase()) score += 8
  if (fetchDecision.allowed) {
    score += 3
  } else if (fetchDecision.reason === 'private-host' || fetchDecision.reason === 'local-host') {
    score -= 5
  }
  if (/^localhost(?::\d+)?(\/|$)/i.test(url)) score -= 3
  if (/\/(newtab|startpages?|tabs?)\b/i.test(url)) score -= 6

  return score
}

export function collectAccessibilityUrlCandidates(snapshot: AccessibilitySnapshot): AccessibilityUrlCandidate[] {
  const direct = [snapshot.url, snapshot.document]
    .map((value) => normalizeUrlCandidate(value))
    .find((value): value is string => Boolean(value))
  if (direct) {
    return [{ text: snapshot.url ?? snapshot.document ?? null, url: direct }]
  }

  const candidateSources = [
    ...(snapshot.focusChain?.flatMap((node) => [
      { text: node.url, url: normalizeUrlCandidate(node.url), source: 'focus-chain' as const },
      { text: node.document, url: normalizeUrlCandidate(node.document), source: 'focus-chain' as const },
      { text: node.value, url: normalizeUrlCandidate(node.value), source: 'focus-chain' as const },
      { text: node.visibleText, url: normalizeUrlCandidate(node.visibleText), source: 'focus-chain' as const },
      { text: node.title, url: normalizeUrlCandidate(node.title), source: 'focus-chain' as const }
    ]) ?? []),
    ...[snapshot.valueText, snapshot.selectedText, snapshot.title, snapshot.windowTitle, ...snapshot.lines].map((text) => ({
      text,
      url: normalizeUrlCandidate(text),
      source: 'snapshot-text' as const
    }))
  ]

  const seen = new Set<string>()
  return candidateSources
    .filter(
      (
        entry
      ): entry is { text: string | null; url: string; source: 'focus-chain' | 'snapshot-text' } =>
        Boolean(entry.url)
    )
    .filter((entry) =>
      shouldAcceptAccessibilityUrlCandidate({
        snapshot,
        url: entry.url,
        text: entry.text,
        source: entry.source
      })
    )
    .filter((entry) => {
      if (seen.has(entry.url)) return false
      seen.add(entry.url)
      return true
    })
    .map(({ text, url }) => ({ text, url }))
}

export function rankAccessibilityUrlCandidates(
  snapshot: AccessibilitySnapshot,
  candidates: AccessibilityUrlCandidate[]
): Array<AccessibilityUrlCandidate & { score: number }> {
  return candidates
    .map((entry, index) => ({
      ...entry,
      index,
      score: scoreUrlCandidate(entry.url, snapshot, entry.text, index)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
}

function pageUrlCandidate(snapshot: AccessibilitySnapshot): string | null {
  return rankAccessibilityUrlCandidates(snapshot, collectAccessibilityUrlCandidates(snapshot))[0]?.url ?? null
}

function localDocumentTitle(snapshot: AccessibilitySnapshot): string | null {
  const candidates = [
    snapshot.document,
    ...(snapshot.focusChain?.flatMap((node) => [node.document]) ?? [])
  ]

  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)
    if (!normalized) continue
    if (looksLikeUrl(normalized)) continue
    if (!normalized.includes('/')) continue

    const base = path.basename(normalized)
    const cleaned = normalizeText(base)
    if (cleaned) return cleaned
  }

  return null
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripBrowserWindowDecorators(line: string, pageTitle: string | null): string {
  if (!pageTitle) return line

  const titlePattern = escapeRegex(pageTitle)
  const browserDecoratorRe = new RegExp(
    `^(${titlePattern})(?:\\s+-\\s+[^-]+)*\\s+-\\s+(?:Google Chrome|Chrome|Safari|Firefox|Arc|Brave|Edge)(?:\\s+-\\s+.+)?$`,
    'i'
  )

  const match = line.match(browserDecoratorRe)
  return match?.[1] ?? line
}

function stripGenericBrowserTitleSuffix(title: string): string {
  return title
    .replace(/\s+-\s+固定済み\s+-\s+(?:Google Chrome|Chrome|Safari|Firefox|Arc|Brave|Edge)(?:\s+-\s+.+)?$/i, '')
    .replace(/\s+-\s+(?:Google Chrome|Chrome|Safari|Firefox|Arc|Brave|Edge)(?:\s+-\s+.+)?$/i, '')
    .trim()
}

function isBrowserLikeTitleApp(appName: string | null): boolean {
  return /chrome|safari|firefox|arc|brave|edge|chromium|dia/i.test(appName ?? '')
}

export function normalizeResolvedPageTitleCandidate(params: ResolvedPageTitleCandidateInput): string | null {
  const normalizedTitle = normalizeText(params.rawTitle)
  if (!normalizedTitle) return null

  if (!isBrowserLikeTitleApp(params.appName)) {
    return normalizedTitle
  }

  const lineMatchedTitle = uniqueLines(params.candidateLines).find(
    (line) => line !== normalizedTitle && stripBrowserWindowDecorators(line, normalizedTitle) === normalizedTitle
  )
  if (lineMatchedTitle) {
    return normalizedTitle
  }

  const strippedWindowTitle = stripGenericBrowserTitleSuffix(normalizedTitle)
  return normalizeText(strippedWindowTitle) ?? normalizedTitle
}

function normalizeResolvedPageTitle(snapshot: AccessibilitySnapshot): string | null {
  const rawTitle = snapshot.title ?? snapshot.windowTitle ?? snapshot.topWindowTitle ?? localDocumentTitle(snapshot)
  const candidateLines = uniqueLines(
    [
      ...(snapshot.focusChain?.flatMap((node) => [node.title, node.visibleText, node.value]) ?? []),
      ...snapshot.lines
    ].filter((value): value is string => typeof value === 'string' && value.length > 0)
  )
  return normalizeResolvedPageTitleCandidate({
    rawTitle,
    appName: resolvedSnapshotAppName(snapshot),
    candidateLines
  })
}

export function normalizeAccessibilityPageTextLines(params: AccessibilityPageTextLineNormalizationInput): string[] {
  const pageTitleKey = normalizedKey(params.pageTitle)
  const pageUrlKey = normalizedKey(params.pageUrl)
  const normalizedLines = uniqueLines(params.contentLines).map((line) => stripBrowserWindowDecorators(line, params.pageTitle))

  const filtered = normalizedLines.filter((line) => {
    const lineKey = line.toLowerCase()
    if (pageUrlKey && lineKey === pageUrlKey && normalizedLines.length > 1) return false
    if (pageTitleKey && lineKey === pageTitleKey && normalizedLines.length > 1) return false
    return true
  })

  return filtered.length > 0 ? filtered : normalizedLines
}

export function buildPageTextFromAccessibilityLines(params: PageTextAssemblyInput): string | null {
  if (params.lowSignal) return null

  const effectiveLines = normalizeAccessibilityPageTextLines(params)
  return normalizeText(effectiveLines.join('\n'))?.slice(0, 12000) ?? null
}

function hasStrongValueText(snapshot: AccessibilitySnapshot): boolean {
  const valueText = normalizeText(snapshot.valueText)
  if (!valueText) return false
  if (valueText.length < 24 && !CONTENTFUL_LINE_RE.test(valueText)) return false
  if (GENERIC_AX_NOISE_RE.test(valueText)) return false
  if (BROWSER_CHROME_ONLY_RE.test(valueText) && !CONTENT_SIGNAL_RE.test(valueText)) return false
  if (SOCIAL_CHROME_ONLY_RE.test(valueText) && !CONTENT_SIGNAL_RE.test(valueText)) return false
  if (isChromeTitleLike(valueText, snapshot)) return false
  return true
}

function hasStrongStructuralSignal(snapshot: AccessibilitySnapshot): boolean {
  if (snapshot.selectedText) return true
  if (hasStrongValueText(snapshot)) return true
  return false
}

export function computeAccessibilityLineBaseScore(line: string): number {
  let score = 0
  if (line.length >= 18) score += 3
  if (line.length >= 48) score += 4
  if (/[。！？!?]/.test(line)) score += 2
  if (CONTENT_SIGNAL_RE.test(line)) score += 4
  if (CALENDAR_CONTENT_SIGNAL_RE.test(line)) score += 3
  if (DESIGN_CONTENT_SIGNAL_RE.test(line)) score += 3
  if (/^[•◦-]|\d+\./.test(line)) score += 1
  if (isBrowserTabLabel(line)) score -= 3

  if (GENERIC_AX_NOISE_RE.test(line)) score -= 10
  if (MENU_AX_NOISE_RE.test(line)) score -= 20
  if (/^(⌘|⇧|⌥|⌃|ctrl|cmd|command)/i.test(line)) score -= 12
  if (/^[\d.]+[smhd]$|^\d+[分時間日]$/.test(line)) score -= 4
  return score
}

export function computeAccessibilityRoleScoreAdjustment(
  line: string,
  focusedRole: string | null
): AccessibilityRoleScoreAdjustment {
  let roleBonus = 0
  let rolePenalty = 0

  const role = focusedRole?.toLowerCase() ?? ''
  if (role.includes('webarea') || role.includes('document') || role.includes('textarea') || role.includes('text')) {
    if (line.length >= 24) roleBonus += 2
  }
  if (role.includes('button') || role.includes('toolbar') || role.includes('menu')) {
    rolePenalty += 8
  }

  return { roleBonus, rolePenalty }
}

export function computeAccessibilityTitleScoreAdjustment(
  line: string,
  snapshot?: AccessibilitySnapshot
): AccessibilityTitleScoreAdjustment {
  if (!snapshot) {
    return {
      titleBoost: 0,
      browserTabPenalty: 0
    }
  }

  const titleBoost = titleAlignedBoost(line, snapshot)
  let browserTabPenalty = 0
  if (isChromeTitleLike(line, snapshot)) browserTabPenalty += 14
  if (isBrowserTabLabel(line) && titleBoost === 0) browserTabPenalty += 6

  return {
    titleBoost,
    browserTabPenalty
  }
}

function accessibilityLineScore(line: string, focusedRole: string | null, snapshot?: AccessibilitySnapshot): number {
  let score = computeAccessibilityLineBaseScore(line)
  const roleAdjustment = computeAccessibilityRoleScoreAdjustment(line, focusedRole)
  score += roleAdjustment.roleBonus
  score -= roleAdjustment.rolePenalty

  const titleAdjustment = computeAccessibilityTitleScoreAdjustment(line, snapshot)
  score += titleAdjustment.titleBoost
  score -= titleAdjustment.browserTabPenalty

  return score
}

function isLowSignalSnapshot(snapshot: AccessibilitySnapshot, lines: string[]): boolean {
  if (lines.length === 0) return true
  if (hasStrongStructuralSignal(snapshot)) return false
  if (lines.length > 1) return false

  const onlyLine = normalizeText(lines[0])?.toLowerCase()
  const titleLike = [
    snapshot.appName,
    snapshot.windowTitle,
    snapshot.title
  ]
    .map((value) => normalizeText(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value))

  return Boolean(onlyLine && titleLike.includes(onlyLine) && onlyLine.length <= 24)
}

export function isSocialChromeOnlySurface(params: {
  appName: string | null
  snapshot: AccessibilitySnapshot
  rankedLines: RankedAccessibilityLine[]
}): boolean {
  const socialApp = /slack|discord|teams|chatwork|mail|outlook|superhuman|spark/i.test(params.appName ?? '')
  if (!socialApp || params.rankedLines.length === 0) return false

  return (
    params.rankedLines.every((item) => {
      if (titleAlignedBoost(item.line, params.snapshot) > 0) return true
      return SOCIAL_CHROME_ONLY_RE.test(item.line)
    }) &&
    !params.rankedLines.some(
      (item) =>
        item.score >= 7 &&
        CONTENTFUL_LINE_RE.test(item.line) &&
        titleAlignedBoost(item.line, params.snapshot) === 0 &&
        !SOCIAL_CHROME_ONLY_RE.test(item.line)
    )
  )
}

export function isBrowserChromeOnlySurface(params: {
  appName: string | null
  snapshot: AccessibilitySnapshot
  rankedLines: RankedAccessibilityLine[]
}): boolean {
  const browserLikeApp = /chrome|arc|brave|edge|chromium|safari|firefox|opera|dia|chatgpt atlas/i.test(
    params.appName ?? ''
  )
  if (!browserLikeApp || params.rankedLines.length === 0) return false

  return (
    params.rankedLines.every((item) => {
      if (titleAlignedBoost(item.line, params.snapshot) > 0) return true
      if (isBrowserTabLabel(item.line)) return true
      return BROWSER_CHROME_ONLY_RE.test(item.line)
    }) &&
    !params.rankedLines.some(
      (item) => item.score >= 7 && CONTENTFUL_LINE_RE.test(item.line) && !isBrowserTabLabel(item.line)
    )
  )
}

function lowSignalReason(
  snapshot: AccessibilitySnapshot,
  rankedLines: RankedAccessibilityLine[]
): AccessibilityDiagnostics['lowSignalReason'] {
  return classifyAccessibilityLowSignalReason({ snapshot, rankedLines })
}

export function classifyAccessibilityLowSignalReason(
  params: LowSignalClassificationInput
): AccessibilityDiagnostics['lowSignalReason'] {
  const { snapshot, rankedLines } = params

  if (isNotificationCenterSnapshot(snapshot)) return 'notification-center'
  if (isSystemShellSnapshot(snapshot)) return 'system-shell'
  if (rankedLines.length === 0) return 'empty-ranked-lines'
  if (isLowSignalSnapshot(snapshot, rankedLines.map((item) => item.line))) return 'title-only'
  if (hasStrongStructuralSignal(snapshot)) return null

  if (hasSocialSidebarChromeCues(snapshot, rankedLines)) return 'social-chrome-only'
  if (isSocialChromeOnlySurface({ appName: snapshot.appName, snapshot, rankedLines })) return 'social-chrome-only'
  if (isBrowserChromeOnlySurface({ appName: snapshot.appName, snapshot, rankedLines })) return 'browser-chrome-only'

  const strongestScore = rankedLines[0]?.score ?? -999
  const strongLineCount = rankedLines.filter((item) => item.score >= 6).length
  const hasContentfulLine = rankedLines.some((item) => item.score >= 5 && CONTENTFUL_LINE_RE.test(item.line))
  return strongestScore < 6 && strongLineCount === 0 && !hasContentfulLine ? 'weak-content' : null
}

export function rankAccessibilityLines(snapshot: AccessibilitySnapshot): RankedAccessibilityLine[] {
  const ranked = collectRankedAccessibilityLines(snapshot)
  return ranked.map((item) => ({ line: item.line, score: item.score }))
}

function collectRankedAccessibilityLines(snapshot: AccessibilitySnapshot): IndexedAccessibilityLine[] {
  const lines = uniqueLines([
    snapshot.selectedText ?? '',
    snapshot.valueText ?? '',
    ...focusChainTextCandidates(snapshot),
    ...snapshot.lines
  ])

  const ranked = lines
    .map((line, index) => ({
      line,
      index,
      score: accessibilityLineScore(line, snapshot.focusedRole, snapshot)
    }))
    .filter((item) => item.score > -2)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 40)
  return ranked
}

export function selectAccessibilityContentLines(
  snapshot: AccessibilitySnapshot,
  rankedLines: Array<RankedAccessibilityLine | IndexedAccessibilityLine> = collectRankedAccessibilityLines(snapshot)
): string[] {
  const indexedLines = rankedLines.map((item, index) => ({
    ...item,
    index: 'index' in item ? item.index : index
  }))

  return indexedLines
    .filter((item) => shouldIncludeAccessibilityLineInContent(item.line, snapshot))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 40)
    .sort((a, b) => a.index - b.index)
    .map((item) => ({ line: item.line, score: item.score }))
    .map((item) => item.line)
}

export function selectAccessibilityContent(snapshot: AccessibilitySnapshot): AccessibilityContentSelection {
  const rankedLines = collectRankedAccessibilityLines(snapshot)
  const reason = lowSignalReason(snapshot, rankedLines)

  return {
    rankedLines: rankedLines.map((item) => ({ line: item.line, score: item.score })),
    contentLines: reason ? [] : selectAccessibilityContentLines(snapshot, rankedLines),
    lowSignal: reason !== null,
    lowSignalReason: reason
  }
}

export function parseAccessibilityHelperOutput(stdout: string): AccessibilitySnapshot | null {
  const trimmed = stdout.trim()
  if (!trimmed) return null

  try {
    const parsed = JSON.parse(trimmed) as Partial<AccessibilitySnapshot>
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.filter((line): line is string => typeof line === 'string')
      : []
    const focusChain = Array.isArray(parsed.focusChain)
      ? parsed.focusChain
          .map((node) => {
            if (!node || typeof node !== 'object') return null
            const entry = node as Record<string, unknown>
            return {
              role: normalizeText(typeof entry.role === 'string' ? entry.role : null),
              title: normalizeText(typeof entry.title === 'string' ? entry.title : null),
              value: normalizeText(typeof entry.value === 'string' ? entry.value : null),
              visibleText: normalizeText(typeof entry.visibleText === 'string' ? entry.visibleText : null),
              selectedRangeText: normalizeText(typeof entry.selectedRangeText === 'string' ? entry.selectedRangeText : null),
              selectedMarkerText: normalizeText(typeof entry.selectedMarkerText === 'string' ? entry.selectedMarkerText : null),
              description: normalizeText(typeof entry.description === 'string' ? entry.description : null),
              help: normalizeText(typeof entry.help === 'string' ? entry.help : null),
              placeholder: normalizeText(typeof entry.placeholder === 'string' ? entry.placeholder : null),
              selectedText: normalizeText(typeof entry.selectedText === 'string' ? entry.selectedText : null),
              document: normalizeText(typeof entry.document === 'string' ? entry.document : null),
              url: normalizeText(typeof entry.url === 'string' ? entry.url : null),
              childCount: typeof entry.childCount === 'number' ? entry.childCount : 0,
              attributeNames: Array.isArray(entry.attributeNames)
                ? entry.attributeNames.filter((name): name is string => typeof name === 'string')
                : undefined,
              selectedTextRange: normalizeText(typeof entry.selectedTextRange === 'string' ? entry.selectedTextRange : null),
              visibleCharacterRange: normalizeText(typeof entry.visibleCharacterRange === 'string' ? entry.visibleCharacterRange : null)
            }
          })
          .filter((node): node is NonNullable<typeof node> => Boolean(node))
      : undefined

    return {
      appName: normalizeText(parsed.appName),
      workspaceAppName: normalizeText((parsed as Record<string, unknown>).workspaceAppName as string | null | undefined),
      topWindowOwnerName: normalizeText((parsed as Record<string, unknown>).topWindowOwnerName as string | null | undefined),
      windowTitle: normalizeText(parsed.windowTitle),
      topWindowTitle: normalizeText((parsed as Record<string, unknown>).topWindowTitle as string | null | undefined),
      focusedRole: normalizeText(parsed.focusedRole),
      selectedText: normalizeText(parsed.selectedText),
      selectedRangeText: normalizeText(parsed.selectedRangeText),
      valueText: normalizeText(parsed.valueText),
      document: normalizeText(parsed.document),
      url: normalizeText(parsed.url),
      title: normalizeText(parsed.title),
      focusChain,
      lines: uniqueLines(lines)
    }
  } catch {
    return {
      appName: null,
      workspaceAppName: null,
      topWindowOwnerName: null,
      windowTitle: null,
      topWindowTitle: null,
      focusedRole: null,
      selectedText: null,
      selectedRangeText: null,
      valueText: null,
      document: null,
      url: null,
      title: null,
      focusChain: undefined,
      lines: uniqueLines(trimmed.split('\n'))
    }
  }
}

export function extractAccessibilityContext(snapshot: AccessibilitySnapshot | null): AccessibilityExtraction {
  if (!snapshot) {
    return {
      appName: null,
      windowTitle: null,
      accessibilityText: null,
      accessibilityCaptureMethod: 'none',
      selectedText: null,
      selectedTextSource: 'none',
      pageTitle: null,
      pageUrl: null,
      pageText: null
    }
  }

  if (isNotificationCenterSnapshot(snapshot)) {
    return {
      appName: resolvedSnapshotAppName(snapshot),
      windowTitle: resolvedSnapshotWindowTitle(snapshot),
      accessibilityText: null,
      accessibilityCaptureMethod: 'none',
      selectedText: null,
      selectedTextSource: 'none',
      pageTitle: snapshot.title ?? resolvedSnapshotWindowTitle(snapshot),
      pageUrl: null,
      pageText: null
    }
  }

  if (isSystemShellSnapshot(snapshot)) {
    return {
      appName: resolvedSnapshotAppName(snapshot),
      windowTitle: resolvedSnapshotWindowTitle(snapshot),
      accessibilityText: null,
      accessibilityCaptureMethod: 'none',
      selectedText: null,
      selectedTextSource: 'none',
      pageTitle: null,
      pageUrl: null,
      pageText: null
    }
  }

  const selection = selectAccessibilityContent(snapshot)
  const lines = selection.contentLines
  const accessibilityText = selection.lowSignal ? null : normalizeText(lines.join('\n'))?.slice(0, 12000) ?? null
  const resolvedTitle = normalizeResolvedPageTitle(snapshot)
  const selectedTextResolution = resolveSelectedText(snapshot)

  const pageUrl = pageUrlCandidate(snapshot)

  const pageText = buildPageTextFromAccessibilityLines({
    pageTitle: resolvedTitle,
    pageUrl,
    contentLines: lines,
    lowSignal: selection.lowSignal
  })

  return {
    appName: resolvedSnapshotAppName(snapshot),
    windowTitle: resolvedSnapshotWindowTitle(snapshot) ?? localDocumentTitle(snapshot),
    accessibilityText,
    accessibilityCaptureMethod: accessibilityText ? 'ax-tree' : 'none',
    selectedText: selectedTextResolution.selectedText,
    selectedTextSource: selectedTextResolution.selectedTextSource,
    pageTitle: resolvedTitle,
    pageUrl,
    pageText
  }
}

export function resolveAccessibilityCaptureOutcome(
  snapshot: AccessibilitySnapshot | null
): AccessibilityCaptureOutcome {
  return {
    extraction: extractAccessibilityContext(snapshot),
    diagnostics: diagnoseAccessibilitySnapshot(snapshot)
  }
}

export function diagnoseAccessibilitySnapshot(snapshot: AccessibilitySnapshot | null): AccessibilityDiagnostics {
  if (!snapshot) {
    return {
      appName: null,
      rawAppName: null,
      workspaceAppName: null,
      topWindowOwnerName: null,
      windowTitle: null,
      rawWindowTitle: null,
      topWindowTitle: null,
      appResolutionSource: 'none',
      windowTitleResolutionSource: 'none',
      focusedRole: null,
      pageUrlCandidate: null,
      selectedTextPresent: false,
      selectedTextSource: 'none',
      valueTextPresent: false,
      focusChainNodeCount: 0,
      rankedLines: [],
      lowSignal: true,
      lowSignalReason: 'missing-snapshot'
    }
  }

  const selection = selectAccessibilityContent(snapshot)
  const detectedPageUrl = pageUrlCandidate(snapshot)
  const selectedTextResolution = resolveSelectedText(snapshot)

  return {
    appName: resolvedSnapshotAppName(snapshot),
    rawAppName: normalizeText(snapshot.appName),
    workspaceAppName: normalizeText(snapshot.workspaceAppName),
    topWindowOwnerName: normalizeText(snapshot.topWindowOwnerName),
    windowTitle: resolvedSnapshotWindowTitle(snapshot),
    rawWindowTitle: normalizeText(snapshot.windowTitle),
    topWindowTitle: normalizeText(snapshot.topWindowTitle),
    appResolutionSource: resolvedSnapshotAppSource(snapshot),
    windowTitleResolutionSource: resolvedSnapshotWindowTitleSource(snapshot),
    focusedRole: snapshot.focusedRole,
    pageUrlCandidate: detectedPageUrl,
    selectedTextPresent: Boolean(selectedTextResolution.selectedText),
    selectedTextSource: selectedTextResolution.selectedTextSource,
    valueTextPresent: Boolean(snapshot.valueText),
    focusChainNodeCount: snapshot.focusChain?.length ?? 0,
    rankedLines: selection.rankedLines,
    lowSignal: selection.lowSignal,
    lowSignalReason: selection.lowSignalReason
  }
}
