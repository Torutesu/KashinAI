import type { CurrentContext } from './types'
import { detectLanguage, type OutputLanguage } from './language'

/**
 * Deterministic scoring of a generated suggestion against the product's paste-ready rules. Used by
 * the prompt-eval harness (scripts/eval-prompts.mjs) to catch regressions when prompts change:
 * language match, no chat-preamble, reasonable length, and no company-context leakage on
 * screen-only surfaces (SNS/code). Pure — no LLM — so it is CI-testable and cheap.
 */

export type GenerationExpectation = {
  language: OutputLanguage
  contextKind: CurrentContext['contextKind']
}

export type EvalRuleFailure =
  | 'empty-output'
  | 'language-mismatch'
  | 'has-preamble'
  | 'too-long'
  | 'company-context-leak'

export type EvalResult = {
  passed: boolean
  failures: EvalRuleFailure[]
}

// Chat-preamble openers the paste-ready output must never start with.
const PREAMBLE_RE = /^\s*(sure[,!]?|here(?:'s| is| are)|okay[,!]?|of course|はい[、,。]|以下(?:に|の)|承知|了解|わかりました|もちろん)/i

// Internal-memory scaffolding that must not appear on screen-only surfaces.
const COMPANY_LEAK_RE = /(gbrain|company context|社内メモ|会社メモ|company memory)/i

const MAX_OUTPUT_LENGTH = 2000

/** Screen-only surfaces where company memory must not surface. */
function isScreenOnlySurface(kind: CurrentContext['contextKind']): boolean {
  return kind === 'social' || kind === 'coding'
}

export function scoreGeneration(output: string, expectation: GenerationExpectation): EvalResult {
  const failures: EvalRuleFailure[] = []
  const trimmed = output.trim()

  if (!trimmed) {
    return { passed: false, failures: ['empty-output'] }
  }
  if (detectLanguage(trimmed) !== expectation.language) failures.push('language-mismatch')
  if (PREAMBLE_RE.test(trimmed)) failures.push('has-preamble')
  if (trimmed.length > MAX_OUTPUT_LENGTH) failures.push('too-long')
  if (isScreenOnlySurface(expectation.contextKind) && COMPANY_LEAK_RE.test(trimmed)) {
    failures.push('company-context-leak')
  }

  return { passed: failures.length === 0, failures }
}
