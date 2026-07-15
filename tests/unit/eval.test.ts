import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreGeneration } from '../../src/shared/eval.ts'

test('passes a clean Japanese reply on a social surface', () => {
  const r = scoreGeneration('返信ありがとうございます。来週の打ち合わせで詳細を詰めましょう。', {
    language: 'ja',
    contextKind: 'social'
  })
  assert.equal(r.passed, true)
  assert.deepEqual(r.failures, [])
})

test('passes a clean English reply', () => {
  const r = scoreGeneration('Thanks for the update — happy to review the pricing draft tomorrow.', {
    language: 'en',
    contextKind: 'browser'
  })
  assert.equal(r.passed, true)
})

test('flags empty output', () => {
  assert.deepEqual(scoreGeneration('   ', { language: 'ja', contextKind: 'social' }), {
    passed: false,
    failures: ['empty-output']
  })
})

test('flags a language mismatch', () => {
  const r = scoreGeneration('This is English text.', { language: 'ja', contextKind: 'document' })
  assert.equal(r.passed, false)
  assert.ok(r.failures.includes('language-mismatch'))
})

test('flags chat preamble in both languages', () => {
  assert.ok(scoreGeneration('Sure! Here is a reply you can use.', { language: 'en', contextKind: 'browser' }).failures.includes('has-preamble'))
  assert.ok(scoreGeneration('はい、以下の返信文を作成しました。', { language: 'ja', contextKind: 'browser' }).failures.includes('has-preamble'))
})

test('flags company-context leakage only on screen-only surfaces', () => {
  const social = scoreGeneration('この投稿はGBrainの会社メモを参考にしました。', { language: 'ja', contextKind: 'social' })
  assert.ok(social.failures.includes('company-context-leak'))
  // On a document surface, referencing memory is allowed.
  const doc = scoreGeneration('会社メモの価格ポリシーに沿って提案します。', { language: 'ja', contextKind: 'document' })
  assert.ok(!doc.failures.includes('company-context-leak'))
})

test('flags overly long output', () => {
  const long = 'あ'.repeat(2100)
  assert.ok(scoreGeneration(long, { language: 'ja', contextKind: 'browser' }).failures.includes('too-long'))
})
