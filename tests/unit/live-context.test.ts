import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildLiveContextDigest, screenOcrCandidateLines } from '../../src/shared/live-context.ts'
import type { CurrentContext } from '../../src/shared/types'

function baseContext(overrides: Partial<CurrentContext> = {}): CurrentContext {
  return {
    activeApp: 'Notion',
    windowTitle: 'ST Sales',
    contextKind: 'document',
    primaryContentSource: 'accessibility-text',
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

test('buildLiveContextDigest prefers document content over Notion chrome', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      accessibilityText: [
        'Share',
        'Copy link',
        'Filter',
        'Sort',
        'ST Sales',
        '目標 （~2026/07）',
        '20商談創出',
        'リード→商談化率：25%',
        'AIサービスはAPI仕様の変化が非常に高速。Claudeは数ヶ月単位で分析APIの使用が変わり…'
      ].join('\n')
    })
  )

  assert.match(digest, /20商談創出/)
  assert.match(digest, /AIサービスはAPI仕様の変化が非常に高速/)
  assert.doesNotMatch(digest, /Copy link|Filter|Sort/)
})

test('buildLiveContextDigest keeps meaningful general content but drops generic UI labels', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      contextKind: 'general',
      accessibilityText: [
        'Add comment',
        'Favorite',
        'Overview',
        'This document explains the rollout plan and the current blockers.'
      ].join('\n')
    })
  )

  assert.match(digest, /rollout plan/)
  assert.doesNotMatch(digest, /Add comment|Favorite/)
})

test('buildLiveContextDigest prioritizes OCR lines when screen-ocr is the winning source', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Cursor',
      contextKind: 'coding',
      primaryContentSource: 'screen-ocr',
      accessibilityText: 'Cursor\nExplorer\nSearch\nExtensions',
      screenText: [
        'TypeError: Cannot read properties of undefined',
        'at captureCurrentContext (context-reader.ts:120)',
        'const canSkipOcr = Boolean(accessibilityContext.accessibilityText.length > 240)'
      ].join('\n')
    })
  )

  assert.match(digest, /TypeError/)
  assert.match(digest, /captureCurrentContext/)
  assert.doesNotMatch(digest, /Explorer|Extensions/)
})

test('buildLiveContextDigest drops OCR garbage and chat chrome while keeping message content', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Slack',
      contextKind: 'social',
      primaryContentSource: 'screen-ocr',
      screenText: [
        'M',
        '21',
        '①',
        'Bold',
        'Schedule for later',
        'という場済なので、印葉者の話像度をもっとけて取りにいく必要がありそう',
        '比較のために12日文金はおじので行こうかなと考えています！',
        'Message #mk-biz'
      ].join('\n')
    })
  )

  assert.match(digest, /取りにいく必要がありそう/)
  assert.match(digest, /行こうかなと考えています/)
  assert.doesNotMatch(digest, /^M$/m)
  assert.doesNotMatch(digest, /^21$/m)
  assert.doesNotMatch(digest, /Bold|Schedule for later|Message #mk-biz/)
})

test('buildLiveContextDigest prefers Discord conversation lines over sidebar and link-preview OCR noise', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Discord',
      contextKind: 'social',
      primaryContentSource: 'screen-ocr',
      screenText: [
        '• イベント',
        '◎ サーバーブースト',
        'テキストチャンネル',
        '#一般',
        'さっき、transposeの方からdmをもらったんですけど、多分ycスタートアップスクールのサイドイベントみたいな感じでhackathonする予定なんで、',
        'それ一回参加していいかなという感じなんです',
        '賞金は5,000ドルぐらいで前と一緒ぐらいかもうちょっとかっていうかんじですね',
        'Toru Tano 9:40',
        'なるほどー',
        'YC本体ってよりサブって感じなんだね。。',
        'woojin C: 11:34',
        'そんな感じです！多分本体よりかサイトイベントのほうがroiいいと思います笑',
        'Technical Founder vs. Content Creator？',
        'Product vs. Distribution？',
        'これも登録しました',
        '+#一般へメッセージを送信'
      ].join('\n')
    }),
    1200
  )

  assert.match(digest, /それ一回参加していいかなという感じなんです/)
  assert.match(digest, /賞金は5,000ドルぐらい/)
  assert.match(digest, /YC本体ってよりサブって感じなんだね/)
  assert.match(digest, /多分本体よりかサイトイベントのほうがroiいいと思います笑/)
  assert.match(digest, /これも登録しました/)
  assert.doesNotMatch(digest, /@woojin 賞金は5,000ドルぐらい/)
  assert.doesNotMatch(digest, /● @woojin/)
  assert.doesNotMatch(digest, /S @Toru Tano/)
  assert.doesNotMatch(digest, /^ShogunAl$/m)
  assert.doesNotMatch(digest, /ShogunAl y/)
  assert.doesNotMatch(digest, /サーバーブースト|テキストチャンネル|#一般/)
  assert.doesNotMatch(digest, /Toru Tano 9:40|woojin C: 11:34/)
  assert.doesNotMatch(digest, /Technical Founder vs\. Content Creator|Product vs\. Distribution/)
  assert.doesNotMatch(digest, /Wrong questions, The best choose both/)
  assert.doesNotMatch(digest, /https:\/\/luma\.com\//)
  assert.doesNotMatch(digest, /一般へメッセージを送信/)
})

test('screenOcrCandidateLines drops short OCR garbage and generic system overlay labels', () => {
  const lines = screenOcrCandidateLines(
    [
      'esc',
      '100%',
      'WiFi',
      'Battery',
      'M',
      '21',
      'KashinAI pricing plans help teams standardize AI workflows across sales and support.',
      'The enterprise plan adds SSO, audit logs, and managed memory controls.'
    ].join('\n')
  )

  assert.deepEqual(lines, [
    'KashinAI pricing plans help teams standardize AI workflows across sales and support.',
    'The enterprise plan adds SSO, audit logs, and managed memory controls.'
  ])
})

test('screenOcrCandidateLines rejoins wrapped OCR lines when a sentence is split across adjacent rows', () => {
  const lines = screenOcrCandidateLines(
    [
      '確認はcontext-fixture-expectationsも含めて通していて、全体のpnpm test:unitは今186 passedで',
      'す。いまのパイプラインは Discord についてはかなり実画面寄りに守られる状態になったので、次にやるなら同じや',
      'り方で"AXが弱い native/Electron アプリをもう1つ増やすのが一番効きます。'
    ].join('\n')
  )

  assert.deepEqual(lines, [
    '確認はcontext-fixture-expectationsも含めて通していて、全体のpnpm test:unitは今186 passedです。いまのパイプラインは Discord についてはかなり実画面寄りに守られる状態になったので、次にやるなら同じやり方で"AXが弱い native/Electron アプリをもう1つ増やすのが一番効きます。'
  ])
})

test('buildLiveContextDigest drops browser tab chrome while keeping meaningful browser page text', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Dia',
      contextKind: 'browser',
      primaryContentSource: 'screen-ocr',
      screenText: [
        'esc',
        '100%',
        'HN Top Links - Popular Stories from Hacker News',
        'Slack | Internal updates',
        'KashinAI pricing plans help teams standardize AI workflows across sales and support.',
        'The enterprise plan adds SSO, audit logs, and managed memory controls.',
        'New tab',
        'Back',
        'Forward'
      ].join('\n')
    })
  )

  assert.match(digest, /KashinAI pricing plans help teams standardize AI workflows/)
  assert.match(digest, /enterprise plan adds SSO/)
  assert.doesNotMatch(digest, /HN Top Links - Popular Stories from Hacker News/)
  assert.doesNotMatch(digest, /Slack \| Internal updates/)
  assert.doesNotMatch(digest, /\bNew tab\b|\bBack\b|\bForward\b|\besc\b|100%/)
})

test('buildLiveContextDigest keeps Codex task content while dropping Codex sidebar and workflow chrome', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'ChatGPT',
      contextKind: 'social',
      primaryContentSource: 'screen-ocr',
      screenText: [
        'ChatGPT Codex',
        '新しいタスク',
        'プラグイン',
        'ピン留め',
        'KashinAIで開発を進める',
        'Discord の live fallback を、その場しのぎではなく正式なregression に乗せました。（',
        '確認はcontext-fixture-expectationsも含めて通していて、全体のpnpm test:unitは今186 passedです。',
        'Codex/ChatGPT 系はAXが完全に title-onlyで、いまはOCRfallback が本体です。',
        'ChatGPT / Codex面は、本文は取れているけど sidebar/作業UIの混入がまだあります。',
        'レビューする',
        '進行中の目標',
        'コミットまたはプッシュ'
      ].join('\n')
    }),
    1200
  )

  assert.match(digest, /Discord の live fallback/)
  assert.match(digest, /Codex\/ChatGPT 系はAXが完全に title-only/)
  assert.match(digest, /全体のpnpm test:unitは今186 passedです/)
  assert.doesNotMatch(digest, /新しいタスク|プラグイン|ピン留め|レビューする|進行中の目標|コミットまたはプッシュ/)
})

test('buildLiveContextDigest ignores noisy selected text on Codex-style OCR-heavy surfaces', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'ChatGPT',
      contextKind: 'social',
      primaryContentSource: 'screen-ocr',
      selectedText: 'レビューする',
      selectedTextSource: 'top-level-selected-text',
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
    1200
  )

  assert.match(digest, /Discord の live fallback/)
  assert.match(digest, /Codex\/ChatGPT 系はAXが完全に title-only/)
  assert.doesNotMatch(digest, /新しいタスク|プラグイン|ピン留め|レビューする/)
})

test('screenOcrCandidateLines does not merge stacked short Codex sidebar labels into fake prose', () => {
  const lines = screenOcrCandidateLines(
    [
      'リリース不足項目を洗い出す',
      'グリードアイランド風企画整理',
      'この指示通りに設計をまず進めてく！！',
      'セットアップする',
      'selectdev'
    ].join('\n')
  )

  assert.deepEqual(lines, [
    'リリース不足項目を洗い出す',
    'グリードアイランド風企画整理',
    'この指示通りに設計をまず進めてく！！',
    'セットアップする',
    'selectdev'
  ])
})

test('buildLiveContextDigest drops Codex sidebar task-list lines and operator workflow chrome from the full OCR fixture', () => {
  const fixturePath = path.join(process.cwd(), 'tests/fixtures/context/chatgpt-codex-thread-ocr.json')
  const context = JSON.parse(readFileSync(fixturePath, 'utf8')) as CurrentContext
  const digest = buildLiveContextDigest(context, 1600)

  assert.match(digest, /Claudeを引き続きご利用いただくには再度サインインしてください/)
  assert.match(digest, /Fix subsidy application document format/)
  assert.doesNotMatch(
    digest,
    /デスクトップ1|A Home|新規|プロジェクト|カスタマイズ|ピン留め済み|チャット|Cowork|メッセージを入力|ロロー/
  )
})

test('screenOcrCandidateLines trims the Codex sidebar prefix before the first real task-body paragraph', () => {
  const lines = screenOcrCandidateLines(
    [
      'ChatGPT Codex',
      '新しいタスク',
      'プラグイン',
      'ピン留め',
      'この指示通りに設計をまず進めてく！！',
      'KashinAIで開発を進める',
      'Discord の live fallback を、その場しのぎではなく正式なregression に乗せました。（',
      'Codex/ChatGPT 系はAXが完全に title-onlyで、いまはOCRfallback が本体です。'
    ].join('\n')
  )

  assert.deepEqual(lines, [
    'Discord の live fallback を、その場しのぎではなく正式なregression に乗せました。（',
    'Codex/ChatGPT 系はAXが完全に title-onlyで、いまはOCRfallback が本体です。'
  ])
})

test('buildLiveContextDigest humanizes local file urls and full paths into basenames', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Preview',
      contextKind: 'document',
      primaryContentSource: 'page-text',
      pageTitle: 'file:///Users/toru/Documents/LaunchPlan.html',
      pageUrl: 'file:///Users/toru/Documents/LaunchPlan.html',
      pageText: [
        '/Users/toru/Documents/LaunchPlan.html',
        'Next customer sync agenda',
        'Pricing risks and open questions'
      ].join('\n')
    })
  )

  assert.match(digest, /LaunchPlan\.html/)
  assert.match(digest, /Next customer sync agenda/)
  assert.doesNotMatch(digest, /file:\/\/\/Users\/toru\/Documents\/LaunchPlan\.html/)
  assert.doesNotMatch(digest, /\/Users\/toru\/Documents\/LaunchPlan\.html/)
})

test('buildLiveContextDigest keeps Xcode code and error lines while dropping IDE chrome', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Xcode',
      contextKind: 'coding',
      primaryContentSource: 'accessibility-text',
      pageTitle: 'CapturePlan.swift',
      accessibilityText: [
        'Navigator',
        'Search',
        'Issues',
        'struct CapturePlan { let pageTitle: String? }',
        'func buildContext() -> CurrentContext {',
        'throw ContextError.captureFailed',
        "Type 'CurrentContext' has no member 'captureMethod'"
      ].join('\n')
    })
  )

  assert.match(digest, /struct CapturePlan/)
  assert.match(digest, /throw ContextError\.captureFailed/)
  assert.match(digest, /captureMethod/)
  assert.doesNotMatch(digest, /Navigator|Issues/)
})

test('buildLiveContextDigest keeps calendar event details while dropping app shell chrome', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Calendar',
      contextKind: 'document',
      primaryContentSource: 'accessibility-text',
      pageTitle: 'KashinAI context review',
      pageUrl: 'https://zoom.us/j/1234567890',
      accessibilityText: [
        'Today',
        'Inbox',
        'Search',
        'KashinAI context review',
        '明日 14:00 - 14:30',
        '参加者: toru@example.com, pm@example.com',
        '議題: アクセシビリティ経由で取れている文脈の精度確認'
      ].join('\n')
    })
  )

  assert.match(digest, /KashinAI context review/)
  assert.match(digest, /参加者: toru@example.com, pm@example.com/)
  assert.match(digest, /議題: アクセシビリティ経由で取れている文脈の精度確認/)
  assert.doesNotMatch(digest, /\bToday\b|\bInbox\b|\bSearch\b/)
})

test('buildLiveContextDigest keeps figma selection details while dropping design tool chrome', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Figma',
      contextKind: 'document',
      primaryContentSource: 'accessibility-text',
      pageTitle: 'Marketing Site',
      accessibilityText: [
        'Layers',
        'Assets',
        'Inspect',
        'Frame: Hero / Pricing',
        'Component: Primary CTA',
        'Button label: Start free trial',
        'Auto layout: vertical, spacing 24',
        'Notes: pricing comparison and social proof need tighter hierarchy'
      ].join('\n')
    })
  )

  assert.match(digest, /Hero \/ Pricing/)
  assert.match(digest, /Primary CTA/)
  assert.match(digest, /social proof need tighter hierarchy/)
  assert.doesNotMatch(digest, /\bLayers\b|\bAssets\b|\bInspect\b/)
})

test('buildLiveContextDigest prioritizes selected text when it is the chosen primary source', () => {
  const digest = buildLiveContextDigest(
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
        'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)\nfunction captureCurrentContext() { const browserCapturePlan = resolveBrowserCapturePlan(...); }',
      screenText: null
    }),
    400
  )

  assert.match(digest, /const canSkipOcr = hasSubstantialText\(accessibilityContext\.accessibilityText\)/)
  assert.match(digest, /function captureCurrentContext/)
  assert.ok(
    digest.indexOf('const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)') <=
      digest.indexOf('function captureCurrentContext()')
  )
})

test('buildLiveContextDigest keeps IDE launcher context when Cursor is open without an editor buffer yet', () => {
  const digest = buildLiveContextDigest(
    baseContext({
      activeApp: 'Cursor',
      windowTitle: 'Cursor',
      contextKind: 'coding',
      primaryContentSource: 'page-text',
      pageTitle: 'Cursor',
      pageText:
        'Editor Group 1 (empty) Try a new window for running parallel agents Recent projects Free Plan Upgrade View all ( 18 Open project Clone repo Connect via SSH CRM ~/Documents internal-corporate-site ShogunAI3 ~/ShogunAI3 internal-corporate-site-staging internal-corporate-site-main Cursor logo このボタンにはウインドウを拡大する操作もあります',
      accessibilityText:
        'Editor Group 1 (empty) Try a new window for running parallel agents Recent projects Free Plan Upgrade View all ( 18 Open project Clone repo Connect via SSH CRM ~/Documents internal-corporate-site ShogunAI3 ~/ShogunAI3 internal-corporate-site-staging internal-corporate-site-main Cursor logo Cursor このボタンにはウインドウを拡大する操作もあります'
    }),
    1000
  )

  assert.match(digest, /Try a new window for running parallel agents/)
  assert.match(digest, /Recent projects/)
  assert.match(digest, /Open project/)
  assert.match(digest, /Clone repo/)
  assert.match(digest, /ShogunAI3/)
})
