import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildSearchQuery } from '../../src/main/search-query.ts'
import type { CurrentContext } from '../../src/shared/types'

function baseContext(overrides: Partial<CurrentContext> = {}): CurrentContext {
  return {
    activeApp: 'Notion',
    windowTitle: 'Meridian / Launch plan',
    contextKind: 'document',
    primaryContentSource: 'none',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: '2026-07-06T00:00:00.000Z',
    ...overrides
  }
}

test('buildSearchQuery uses AX/page text even when there is no selection', () => {
  const result = buildSearchQuery(
    baseContext({
      pageTitle: 'Meridian launch checklist',
      accessibilityText: 'Need to confirm onboarding timeline and pricing policy before next customer sync.'
    }),
    'reply',
    'この件の返信を考えて'
  )

  assert.match(result.searchQuery, /Meridian/)
  assert.match(result.searchQuery, /pricing/)
  assert.match(result.detectedEntities.topic ?? '', /Need to confirm onboarding timelin/)
})

test('buildSearchQuery falls back to OCR text when AX/page text are absent', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Cursor',
      contextKind: 'coding',
      screenText: 'TypeError: Cannot read properties of undefined in context-reader.ts'
    }),
    'custom',
    '原因を調べたい'
  )

  assert.match(result.searchQuery, /TypeError/)
  assert.match(result.searchQuery, /context-reader ts/)
  assert.match(result.detectedEntities.topic ?? '', /TypeError/)
})

test('buildSearchQuery prefers cleaned digest over noisy OCR chrome', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Slack',
      contextKind: 'social',
      primaryContentSource: 'screen-ocr',
      screenText: [
        'esc',
        '100%',
        'M',
        '21',
        'Bold',
        'Schedule for later',
        '比較のために12日文金はおじので行こうかなと考えています！',
        '営系リストに店舗数のカラムに追加して欲しい',
        'Message #mk-biz'
      ].join('\n')
    }),
    'custom',
    '何の話か掴みたい'
  )

  assert.match(result.searchQuery, /店舗数/)
  assert.match(result.searchQuery, /行こうかなと考えています/)
  assert.doesNotMatch(result.searchQuery, /\bBold\b|Schedule for later|Message mk-biz|\besc\b|100%/)
})

test('buildSearchQuery keeps Codex task vocabulary while dropping Codex sidebar chrome from OCR-heavy surfaces', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'ChatGPT',
      contextKind: 'social',
      primaryContentSource: 'screen-ocr',
      screenText: [
        'ChatGPT Codex',
        '新しいタスク',
        'プラグイン',
        'ピン留め',
        'Discord の live fallback を、その場しのぎではなく正式なregression に乗せました。（',
        'Codex/ChatGPT 系はAXが完全に title-onlyで、いまはOCRfallback が本体です。',
        'ChatGPT / Codex面は、本文は取れているけど sidebar/作業UIの混入がまだあります。',
        'レビューする'
      ].join('\n')
    }),
    'custom',
    'この文脈を確認したい'
  )

  assert.match(result.searchQuery, /Discord/)
  assert.match(result.searchQuery, /fallback/)
  assert.match(result.searchQuery, /Codex/)
  assert.match(result.searchQuery, /title only|title-only/i)
  assert.doesNotMatch(result.searchQuery, /新しいタスク|プラグイン|ピン留め|レビューする/)
})

test('buildSearchQuery drops Codex sidebar task names and operator workflow chrome from the full OCR fixture', () => {
  const fixturePath = path.join(process.cwd(), 'tests/fixtures/context/chatgpt-codex-thread-ocr.json')
  const context = JSON.parse(readFileSync(fixturePath, 'utf8')) as CurrentContext
  const result = buildSearchQuery(context, 'custom', 'この文脈を確認したい')

  assert.match(result.searchQuery, /Claude/)
  assert.match(result.searchQuery, /subsidy/i)
  assert.match(result.searchQuery, /SHOGUNAl|SHOGUNAI/i)
  assert.doesNotMatch(
    result.searchQuery,
    /デスクトップ1|A Home|新規|プロジェクト|カスタマイズ|ピン留め済み|チャット|Cowork|メッセージを入力|ロロー/
  )
})

test('buildSearchQuery extracts readable basename hints from local file urls', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Preview',
      windowTitle: 'LaunchPlan.html',
      contextKind: 'document',
      pageTitle: 'file:///Users/toru/Documents/LaunchPlan.html',
      pageUrl: 'file:///Users/toru/Documents/LaunchPlan.html',
      accessibilityText: 'Next customer sync agenda and pricing risks.'
    }),
    'summarize',
    '要点を整理したい'
  )

  assert.match(result.searchQuery, /LaunchPlan\.html/)
  assert.match(result.searchQuery, /pricing/)
  assert.doesNotMatch(result.searchQuery, /file:\/\/\/Users\/toru\/Documents\/LaunchPlan\.html file:\/\/\/Users\/toru\/Documents\/LaunchPlan\.html file:\/\//)
})

test('buildSearchQuery keeps Xcode error terms and file name for coding context', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Xcode',
      windowTitle: 'CapturePlan.swift',
      contextKind: 'coding',
      primaryContentSource: 'accessibility-text',
      accessibilityText: [
        'struct CapturePlan { let pageTitle: String? }',
        'func buildContext() -> CurrentContext {',
        'throw ContextError.captureFailed',
        "Type 'CurrentContext' has no member 'captureMethod'"
      ].join('\n')
    }),
    'custom',
    'このエラーの原因を調べたい'
  )

  assert.match(result.searchQuery, /CapturePlan\.swift/)
  assert.match(result.searchQuery, /ContextError/)
  assert.match(result.searchQuery, /captureMethod/)
})

test('buildSearchQuery keeps calendar event subject and agenda terms for document context', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Calendar',
      windowTitle: 'KashinAI context review',
      contextKind: 'document',
      primaryContentSource: 'accessibility-text',
      pageTitle: 'KashinAI context review',
      pageUrl: 'https://zoom.us/j/1234567890',
      accessibilityText: [
        '明日 14:00 - 14:30',
        '参加者: toru@example.com, pm@example.com',
        '議題: アクセシビリティ経由で取れている文脈の精度確認'
      ].join('\n')
    }),
    'summarize',
    'この予定の要点を整理したい'
  )

  assert.match(result.searchQuery, /KashinAI/)
  assert.match(result.searchQuery, /context review/)
  assert.match(result.searchQuery, /アクセシビリティ経由で取れている文脈の精度確認/)
})

test('buildSearchQuery keeps figma selection details for design context', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Figma',
      windowTitle: 'Marketing Site',
      contextKind: 'document',
      primaryContentSource: 'accessibility-text',
      pageTitle: 'Marketing Site',
      accessibilityText: [
        'Frame: Hero / Pricing',
        'Component: Primary CTA',
        'Button label: Start free trial',
        'Notes: pricing comparison and social proof need tighter hierarchy'
      ].join('\n')
    }),
    'summarize',
    'このデザインの意図を整理したい'
  )

  assert.match(result.searchQuery, /Marketing Site/)
  assert.match(result.searchQuery, /Primary CTA/)
  assert.match(result.searchQuery, /social proof/)
})

test('buildSearchQuery filters generic OCR/system tokens even when they leak into the digest source', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Dia',
      contextKind: 'browser',
      primaryContentSource: 'screen-ocr',
      screenText: [
        'esc',
        '100%',
        'WiFi',
        'Battery',
        'KashinAI pricing plans help teams standardize AI workflows across sales and support.',
        'The enterprise plan adds SSO, audit logs, and managed memory controls.'
      ].join('\n')
    }),
    'summarize',
    'この内容を要約したい'
  )

  assert.match(result.searchQuery, /KashinAI pricing plans/)
  assert.match(result.searchQuery, /enterprise adds SSO/)
  assert.doesNotMatch(result.searchQuery, /\besc\b|100%|\bWiFi\b|\bBattery\b/)
})

test('buildSearchQuery prioritizes selected text tokens when selected-text is the primary source', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Cursor',
      windowTitle: 'context-reader.ts',
      contextKind: 'coding',
      primaryContentSource: 'selected-text',
      selectedText: 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
      pageTitle: 'context-reader.ts',
      pageUrl: null,
      pageText:
        'function captureCurrentContext() { const browserCapturePlan = resolveBrowserCapturePlan(...); const screenCapturePlan = resolveScreenCapturePlan(...); }',
      accessibilityText:
        'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)\nfunction captureCurrentContext() { const browserCapturePlan = resolveBrowserCapturePlan(...); }'
    }),
    'next_actions',
    'この選択範囲を前提に修正方針を考えて'
  )

  assert.match(result.searchQuery, /\bcanSkipOcr\b/)
  assert.match(result.searchQuery, /\baccessibilityContext\b/)
  assert.match(result.searchQuery, /\bcontext-reader\b/)
})

test('buildSearchQuery ignores top-level selected-text chrome when richer page context exists', () => {
  const result = buildSearchQuery(
    baseContext({
      activeApp: 'Slack',
      windowTitle: 'mk-biz (Channel) - aisaac - Slack',
      contextKind: 'social',
      primaryContentSource: 'accessibility-text',
      selectedText: 'Message #mk-biz',
      selectedTextSource: 'top-level-selected-text',
      pageText: '比較のために12日文金はおじので行こうかなと考えています！\n営系リストに店舗数のカラムに追加して欲しい',
      accessibilityText:
        '比較のために12日文金はおじので行こうかなと考えています！\n営系リストに店舗数のカラムに追加して欲しい'
    }),
    'custom',
    '何の話か掴みたい'
  )

  assert.match(result.searchQuery, /店舗数/)
  assert.match(result.searchQuery, /行こうかなと考えています/)
  assert.doesNotMatch(result.searchQuery, /Message mk-biz|Message #mk-biz/)
})
