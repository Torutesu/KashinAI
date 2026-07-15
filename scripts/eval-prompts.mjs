/**
 * Prompt-eval harness (Growth §4). For each checked-in context fixture it builds the real prompt,
 * generates with a live model, and scores the output against the paste-ready rules
 * (src/shared/eval.ts): language match, no chat-preamble, length, no company-context leakage on
 * screen-only surfaces. Use it to catch prompt regressions when editing src/shared/prompts.ts.
 *
 * Run:
 *   KASHINAI_EVAL_API_KEY=sk-... [KASHINAI_EVAL_PROVIDER=anthropic] [KASHINAI_EVAL_MODEL=...] \
 *     node --experimental-strip-types --import ./tests/unit/register-loader.mjs scripts/eval-prompts.mjs
 *
 * With no API key it prints how to run and exits 0 (so it is safe to invoke unconditionally).
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { buildPrompt } from '../src/shared/prompts.ts'
import { detectLanguage } from '../src/shared/language.ts'
import { scoreGeneration } from '../src/shared/eval.ts'
import { generate } from '../src/main/llm.ts'

const provider = process.env.KASHINAI_EVAL_PROVIDER || 'anthropic'
const apiKey = process.env.KASHINAI_EVAL_API_KEY || ''
const model = process.env.KASHINAI_EVAL_MODEL || ''

if (!apiKey) {
  console.log('Prompt eval: set KASHINAI_EVAL_API_KEY (and optionally KASHINAI_EVAL_PROVIDER/MODEL) to run.')
  process.exit(0)
}

const fixturesDir = path.resolve('tests/fixtures/context')
const fixtures = readdirSync(fixturesDir).filter(
  (name) =>
    name.endsWith('.json') &&
    !name.endsWith('.expected.json') &&
    !name.endsWith('.trace.json') &&
    !name.endsWith('.diagnostics.json') &&
    !name.endsWith('.summary.json')
)

function contextText(ctx) {
  return [ctx.selectedText, ctx.accessibilityText, ctx.screenText, ctx.pageText, ctx.pageTitle, ctx.windowTitle]
    .filter(Boolean)
    .join(' ')
}

let failed = 0
for (const name of fixtures) {
  const context = JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf-8'))
  const pack = {
    currentContext: context,
    userInstruction: '',
    actionType: 'reply',
    detectedEntities: {},
    searchQuery: '',
    retrievedContext: [],
    outputPreferences: { language: 'auto', tone: 'professional', length: 'medium' }
  }
  const { system, user } = buildPrompt(pack)

  let output
  try {
    output = await generate({ provider, apiKey, model, temperature: 0.3, system, user })
  } catch (err) {
    console.log(`✗ ${name}: generation error — ${err.message}`)
    failed++
    continue
  }

  const expectation = { language: detectLanguage(contextText(context)), contextKind: context.contextKind }
  const result = scoreGeneration(output, expectation)
  if (result.passed) {
    console.log(`✓ ${name} (${expectation.language}/${expectation.contextKind})`)
  } else {
    failed++
    console.log(`✗ ${name} (${expectation.language}/${expectation.contextKind}): ${result.failures.join(', ')}`)
    console.log(`    output: ${output.replace(/\s+/g, ' ').slice(0, 160)}`)
  }
}

console.log(`\nPrompt eval: ${fixtures.length - failed}/${fixtures.length} passed.`)
process.exit(failed > 0 ? 1 : 0)
