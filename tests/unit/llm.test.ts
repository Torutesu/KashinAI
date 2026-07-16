import test from 'node:test'
import assert from 'node:assert/strict'
import { generate, LlmError } from '../../src/main/llm.ts'

const originalFetch = globalThis.fetch

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  // @ts-expect-error test stub
  globalThis.fetch = (url: string | URL | Request, init?: RequestInit) => impl(String(url), init)
}

test.afterEach(() => {
  globalThis.fetch = originalFetch
})

const ANTHROPIC_SSE =
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n' +
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n'

test('generate streams Anthropic deltas and returns the full text', async () => {
  stubFetch(async () => new Response(ANTHROPIC_SSE, { status: 200 }))
  const deltas: string[] = []
  const out = await generate({
    provider: 'anthropic',
    apiKey: 'k',
    model: 'm',
    temperature: 0.3,
    system: 's',
    user: 'u',
    onDelta: (d) => deltas.push(d)
  })
  assert.equal(out, 'Hello')
  assert.deepEqual(deltas, ['Hel', 'lo'])
})

test('generate throws a typed error without an API key (no request made)', async () => {
  let called = false
  stubFetch(async () => {
    called = true
    return new Response('', { status: 200 })
  })
  await assert.rejects(
    () => generate({ provider: 'anthropic', apiKey: '', model: 'm', temperature: 0.3, system: 's', user: 'u' }),
    (err) => err instanceof LlmError && err.code === 'llm_missing_api_key'
  )
  assert.equal(called, false)
})

test('generate maps a non-ok provider response to llm_request_failed', async () => {
  stubFetch(async () => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }))
  await assert.rejects(
    () => generate({ provider: 'anthropic', apiKey: 'k', model: 'm', temperature: 0.3, system: 's', user: 'u' }),
    (err) => err instanceof LlmError && err.code === 'llm_request_failed'
  )
})
