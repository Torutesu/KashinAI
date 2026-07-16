export type OutputLanguage = 'ja' | 'en'
export type LanguagePreference = OutputLanguage | 'auto'

/**
 * Lightweight script-based language detection, scoped to the ja/en binary this product cares about.
 * Presence of kana is a near-certain Japanese signal; CJK-heavy text without Latin also reads as
 * Japanese here. Everything else (including empty input) falls back to English.
 */
export function detectLanguage(text: string | null | undefined): OutputLanguage {
  if (!text) return 'en'
  const kana = (text.match(/[぀-ヿ]/gu) ?? []).length
  if (kana > 0) return 'ja'
  const han = (text.match(/[㐀-鿿]/gu) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  if (han > 0 && han >= latin) return 'ja'
  return 'en'
}

/**
 * Resolves the concrete output language: an explicit ja/en preference wins; `auto` detects from the
 * provided context text. Used so a single Option tap matches the language of whatever is on screen.
 */
export function resolveOutputLanguage(
  preference: LanguagePreference,
  contextText: string | null | undefined
): OutputLanguage {
  if (preference === 'ja' || preference === 'en') return preference
  return detectLanguage(contextText)
}
