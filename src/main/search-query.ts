import type { ActionType, CurrentContext, DetectedEntities } from '../shared/types'

const STOPWORDS = new Set([
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'to', 'of', 'in', 'on', 'for',
  'and', 'or', 'but', 'with', 'this', 'that', 'it', 'as', 'at', 'by', 'from', 'we', 'i', 'you',
  'he', 'she', 'they', 'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should',
  // Japanese particles / auxiliaries (romaji-independent, matched as-is)
  'です', 'ます', 'した', 'して', 'する', 'ください', 'こと', 'もの', 'これ', 'それ', 'あの',
  'は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'や', 'な', 'か', 'よ', 'ね', 'ため'
])

const ACTION_SEARCH_TERMS: Record<ActionType, string[]> = {
  reply: ['customer profile', 'project status', 'meeting notes', 'proposal template', 'pricing policy'],
  summarize: ['customer profile', 'project status'],
  next_actions: ['project status', 'previous next actions', 'customer concerns'],
  proposal: ['service overview', 'proposal template', 'customer pain points', 'similar projects', 'pricing policy'],
  translate: [],
  custom: []
}

function tokenize(text: string): string[] {
  return text
    .split(/[\s,.。、!?！？「」『』()（）\[\]:：;；\/\\]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOPWORDS.has(token.toLowerCase()) && !STOPWORDS.has(token))
}

function extractQuotedPhrases(text: string): string[] {
  const matches = text.match(/["「『]([^"」』]+)["」』]/gu) ?? []
  return matches.map((m) => m.replace(/["「『」』]/gu, '').trim()).filter(Boolean)
}

/** Best-effort entity detection from window title + selected text. Rule-based only (no LLM
 * call for the MVP, per brief 13.1) — good enough to bias the search query, not authoritative. */
function detectEntities(context: CurrentContext, actionType: ActionType): DetectedEntities {
  const windowTitle = context.windowTitle ?? ''
  const segments = windowTitle
    .split(/[\/|\-–—]/)
    .map((s) => s.trim())
    .filter(Boolean)

  const customer = segments[0] || null
  const project = segments[1] || null

  const text = context.selectedText ?? context.clipboardText ?? ''
  const topic = text.length > 0 ? text.slice(0, 60).replace(/\s+/g, ' ').trim() : null

  return {
    customer,
    project,
    person: null,
    topic: topic || actionType
  }
}

export type SearchQueryResult = {
  searchQuery: string
  detectedEntities: DetectedEntities
}

/**
 * Builds a search query for GBrain using simple rules: keywords from the selection/clipboard
 * text, quoted phrases, window title tokens, and action-specific priority terms from brief 13.2.
 * No LLM call is used for this in the MVP.
 */
export function buildSearchQuery(
  context: CurrentContext,
  actionType: ActionType,
  userInstruction: string
): SearchQueryResult {
  const sourceText = [context.selectedText, context.pageTitle, context.pageUrl, context.pageText, context.clipboardText]
    .filter((value): value is string => Boolean(value))
    .join('\n')
  const quoted = extractQuotedPhrases(sourceText)
  const bodyTokens = tokenize(sourceText)
  const titleTokens = tokenize(context.windowTitle ?? '')
  const instructionTokens = tokenize(userInstruction ?? '')
  const actionTerms = ACTION_SEARCH_TERMS[actionType]

  const detectedEntities = detectEntities(context, actionType)
  const entityTerms = [detectedEntities.customer, detectedEntities.project].filter(
    (v): v is string => Boolean(v)
  )

  const allTerms = [...quoted, ...entityTerms, ...titleTokens, ...bodyTokens, ...instructionTokens, ...actionTerms]

  const seen = new Set<string>()
  const deduped: string[] = []
  for (const term of allTerms) {
    const key = term.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      deduped.push(term)
    }
  }

  const searchQuery = deduped.join(' ').slice(0, 300).trim()

  return {
    searchQuery: searchQuery || actionType,
    detectedEntities
  }
}
