import type { CurrentContext } from './types'

/**
 * Best-effort redaction of obviously-sensitive substrings before on-screen text is sent to a
 * third-party LLM. This is a pragmatic filter, NOT a guarantee: it targets high-signal patterns
 * (emails, long digit runs, bearer/API tokens) that most commonly leak. It is opt-in
 * (privacy.redactSensitive) so the default experience — sending the user's own screen to their own
 * provider — is unchanged.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
// Bearer/API-key-ish tokens: long runs of key-like characters, and common provider prefixes.
const API_KEY_RE = /\b(?:sk|pk|rk|api|key|token|ghp|gho|xox[baprs])[-_][A-Za-z0-9-_]{12,}\b/gi
// 12+ digit runs (card / account / long id numbers), allowing spaces or dashes as separators.
// Anchored to start and end on a digit so a trailing separator is never swallowed.
const LONG_NUMBER_RE = /\b\d(?:[ -]?\d){11,}\b/g
// Phone-like: +country and 9+ digits with separators.
const PHONE_RE = /\+?\d[\d ().-]{8,}\d/g

const EMAIL_MASK = '[redacted-email]'
const KEY_MASK = '[redacted-key]'
const NUMBER_MASK = '[redacted-number]'
const PHONE_MASK = '[redacted-phone]'

/** Returns `text` with sensitive substrings masked. Order matters: keys/emails before numbers. */
export function redactSensitive(text: string): string {
  if (!text) return text
  return text
    .replace(EMAIL_RE, EMAIL_MASK)
    .replace(API_KEY_RE, KEY_MASK)
    .replace(LONG_NUMBER_RE, NUMBER_MASK)
    .replace(PHONE_RE, PHONE_MASK)
}

/** Nullable convenience: passes null/empty through unchanged. */
export function redactNullable(text: string | null): string | null {
  return text ? redactSensitive(text) : text
}

/** The free-text context fields that get embedded into an LLM prompt. */
const REDACTED_CONTEXT_FIELDS = [
  'pageText',
  'accessibilityText',
  'screenText',
  'selectedText',
  'clipboardText',
  'pageTitle',
  'windowTitle'
] as const

/** Returns a copy of `context` with its free-text fields redacted. Structural fields are untouched. */
export function redactCurrentContext(context: CurrentContext): CurrentContext {
  const next = { ...context }
  for (const field of REDACTED_CONTEXT_FIELDS) {
    next[field] = redactNullable(context[field])
  }
  return next
}
