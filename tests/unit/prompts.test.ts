import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPrompt, buildChatPrompt } from '../../src/shared/prompts.ts'
import type { ContextPack, CurrentContext } from '../../src/shared/types.ts'
import type { LanguagePreference } from '../../src/shared/language.ts'

function context(overrides: Partial<CurrentContext> = {}): CurrentContext {
  return {
    activeApp: 'Slack',
    windowTitle: 'general',
    contextKind: 'social',
    primaryContentSource: 'accessibility-text',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: null,
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: '2026-07-15T00:00:00.000Z',
    ...overrides
  }
}

function pack(overrides: Partial<ContextPack> = {}, language: LanguagePreference = 'auto'): ContextPack {
  return {
    currentContext: context(),
    userInstruction: '',
    actionType: 'reply',
    detectedEntities: {},
    searchQuery: '',
    retrievedContext: [],
    outputPreferences: { language, tone: 'professional', length: 'medium' },
    ...overrides
  }
}

test('buildPrompt auto-detects Japanese from the screen context', () => {
  const p = pack({
    currentContext: context({ accessibilityText: 'このメッセージに返信してください。よろしくお願いします。' })
  })
  const { system, user } = buildPrompt(p)
  assert.match(system, /あなたは社内の業務文脈を理解した/)
  assert.match(user, /出力条件:/)
  assert.match(user, /言語: 日本語/)
})

test('buildPrompt auto-detects English from the screen context', () => {
  const p = pack({
    currentContext: context({
      contextKind: 'browser',
      primaryContentSource: 'page-text',
      pageText: 'Please draft a reply to this customer email about the pricing question.'
    })
  })
  const { system, user } = buildPrompt(p)
  assert.match(system, /You are an AI assistant/)
  assert.match(user, /Output requirements:/)
  assert.match(user, /Language: English/)
})

test('buildPrompt honors an explicit language preference over the detected one', () => {
  const p = pack(
    { currentContext: context({ accessibilityText: 'これは日本語の画面です' }) },
    'en'
  )
  const { system, user } = buildPrompt(p)
  assert.match(system, /You are an AI assistant/)
  assert.match(user, /Language: English/)
})

test('buildPrompt always targets English for the translate action', () => {
  const p = pack(
    { actionType: 'translate', currentContext: context({ accessibilityText: '契約書の内容を翻訳したい' }) },
    'ja'
  )
  const { system, user } = buildPrompt(p)
  assert.match(system, /You are an AI assistant/)
  assert.match(user, /Language: English/)
  assert.match(user, /Translate the text below into English/)
})

test('buildChatPrompt selects language from context and includes chat rules', () => {
  const jaChat = buildChatPrompt({
    currentContext: context({ accessibilityText: 'この画面について教えてください' }),
    messages: [{ role: 'user', content: 'これは何ですか' }],
    retrievedContext: [],
    searchQuery: '',
    outputPreferences: { language: 'auto', tone: 'professional', length: 'medium' }
  })
  assert.match(jaChat.system, /チャットモードの追加ルール/)
  assert.match(jaChat.user, /言語: 日本語/)

  const enChat = buildChatPrompt({
    currentContext: context({
      contextKind: 'browser',
      primaryContentSource: 'page-text',
      pageText: 'What does this dashboard show about revenue this quarter?'
    }),
    messages: [{ role: 'user', content: 'What is this?' }],
    retrievedContext: [],
    searchQuery: '',
    outputPreferences: { language: 'auto', tone: 'professional', length: 'medium' }
  })
  assert.match(enChat.system, /Additional rules for chat mode/)
  assert.match(enChat.user, /Language: English/)
})
