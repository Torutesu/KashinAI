import test from 'node:test'
import assert from 'node:assert/strict'
import { extractDelta, createSseParser } from '../../src/shared/sse.ts'

test('extractDelta reads Anthropic text_delta events only', () => {
  assert.equal(
    extractDelta('anthropic', { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } }),
    'Hi'
  )
  assert.equal(extractDelta('anthropic', { type: 'message_start' }), '')
  assert.equal(
    extractDelta('anthropic', { type: 'content_block_delta', delta: { type: 'input_json_delta' } }),
    ''
  )
})

test('extractDelta reads OpenAI choices delta content', () => {
  assert.equal(extractDelta('openai', { choices: [{ delta: { content: 'wor' } }] }), 'wor')
  assert.equal(extractDelta('openai', { choices: [{ delta: {} }] }), '')
})

test('extractDelta reads Gemini candidate parts', () => {
  assert.equal(
    extractDelta('gemini', { candidates: [{ content: { parts: [{ text: 'ld' }] } }] }),
    'ld'
  )
})

test('createSseParser assembles deltas across chunk boundaries (OpenAI)', () => {
  const parser = createSseParser('openai')
  const out: string[] = []
  // A data line is split across two chunks.
  out.push(...parser.push('data: {"choices":[{"delta":{"content":"Hel'))
  out.push(...parser.push('lo"}}]}\n'))
  out.push(...parser.push('data: {"choices":[{"delta":{"content":" world"}}]}\n'))
  out.push(...parser.push('data: [DONE]\n'))
  assert.equal(out.join(''), 'Hello world')
})

test('createSseParser handles Anthropic event/data framing and ignores non-text events', () => {
  const parser = createSseParser('anthropic')
  const stream =
    'event: message_start\ndata: {"type":"message_start"}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"こん"}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"にちは"}}\n\n'
  const out = parser.push(stream)
  assert.equal(out.join(''), 'こんにちは')
})

test('createSseParser ignores malformed JSON lines without throwing', () => {
  const parser = createSseParser('openai')
  const out = parser.push('data: {not json}\ndata: {"choices":[{"delta":{"content":"ok"}}]}\n')
  assert.deepEqual(out, ['ok'])
})

test('createSseParser flush emits a trailing complete data line', () => {
  const parser = createSseParser('openai')
  assert.deepEqual(parser.push('data: {"choices":[{"delta":{"content":"tail"}}]}'), [])
  assert.deepEqual(parser.flush(), ['tail'])
})
