import test from 'node:test'
import assert from 'node:assert/strict'
import { detectLanguage, resolveOutputLanguage } from '../../src/shared/language.ts'

test('detectLanguage returns ja for hiragana/katakana text', () => {
  assert.equal(detectLanguage('このページを要約してください'), 'ja')
  assert.equal(detectLanguage('カタカナのテスト'), 'ja')
})

test('detectLanguage returns ja for CJK-heavy text without latin', () => {
  assert.equal(detectLanguage('会社概要 価格 提案'), 'ja')
})

test('detectLanguage returns en for latin text', () => {
  assert.equal(detectLanguage('Please summarize this page for me'), 'en')
})

test('detectLanguage treats mixed text with kana as ja', () => {
  assert.equal(detectLanguage('KashinAI で作業中のSlackメッセージにReply'), 'ja')
})

test('detectLanguage defaults to en for empty or symbol-only input', () => {
  assert.equal(detectLanguage(''), 'en')
  assert.equal(detectLanguage(null), 'en')
  assert.equal(detectLanguage('!!! ### 123'), 'en')
})

test('resolveOutputLanguage honors an explicit preference over the context', () => {
  assert.equal(resolveOutputLanguage('en', 'これは日本語です'), 'en')
  assert.equal(resolveOutputLanguage('ja', 'This is English'), 'ja')
})

test('resolveOutputLanguage auto-detects from the context when preference is auto', () => {
  assert.equal(resolveOutputLanguage('auto', 'これは日本語です'), 'ja')
  assert.equal(resolveOutputLanguage('auto', 'This is English'), 'en')
  assert.equal(resolveOutputLanguage('auto', ''), 'en')
})
