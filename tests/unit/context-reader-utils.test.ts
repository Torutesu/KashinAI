import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAccessibilityPageContextDebugOverrides,
  applyBrowserCaptureStepResult,
  advanceBrowserCaptureExecutionLoopState,
  applyBrowserCaptureDebugOverrides,
  buildCaptureTrace,
  buildBrowserPageContext,
  buildPreliminaryContextClassificationInput,
  buildScreenCaptureMethod,
  buildCurrentContext,
  analyzeDesktopCaptureSourceSelection,
  browserMetadata,
  browserScriptName,
  buildBrowserBodyExtractionJavaScript,
  buildChromiumTabBodyTextAppleScript,
  buildChromiumTabMetadataAppleScript,
  buildSafariPageCaptureAppleScript,
  classifyContext,
  cleanSessionUrl,
  decidePublicPageFetch,
  EMPTY_PAGE_CONTEXT,
  extractSessionUrls,
  extractTextFromHtml,
  finalizeContextCaptureResult,
  hasSubstantialText,
  hasCapturedBrowserPageSignal,
  hasCapturedBrowserPageText,
  hasStrongAccessibilityPageContext,
  mergeBrowserPageContexts,
  mergePageContext,
  normalizeCopiedText,
  normalizeBrowserPageCapture,
  normalizeFrontmostAppInfo,
  parseBrowserAutomationCapture,
  parseChromiumTabMetadata,
  parseLsAppInfoFrontRecord,
  pageContextFromAccessibility,
  pickRecentChromiumSessionFiles,
  pickDesktopCaptureSource,
  pickBestSessionUrlCandidate,
  primaryContentSource,
  resolvePrimaryContentSelection,
  resolveBundledResourcePathCandidates,
  resolveBundledResourceRuntimePath,
  resolveCaptureDecisions,
  resolveBrowserAutomationTarget,
  resolveBrowserPageCaptureDispatch,
  resolveBrowserPageCaptureRuntimeInvocation,
  resolveBrowserPageContextResolutionPlan,
  resolveBrowserPageContextFetchExecutionPlan,
  resolvePublicPageFetchRequest,
  resolvePublicPageTextFetchExecutionPlan,
  resolveBrowserPageTextFetchPlan,
  resolveBrowserCaptureActionPlan,
  resolveBrowserCaptureCollectionPlan,
  resolveBrowserCaptureCollectionState,
  resolveBrowserCaptureExecutionRequests,
  resolveBrowserCaptureExecutionPlan,
  resolveBrowserCaptureExecutionState,
  resolveBrowserCaptureExecutionLoopState,
  resolveBrowserCaptureTrace,
  resolveBrowserCaptureStepExecutionPlan,
  resolveBrowserCaptureLoopIteration,
  resolveBrowserCaptureRuntimeState,
  resolveBrowserCaptureOutcome,
  resolveBrowserCaptureRuntimeInvocation,
  resolveBrowserCaptureStepPlan,
  resolveBrowserCaptureProgress,
  resolveBrowserFallbackExecutionPlan,
  resolveBrowserCapturePlan,
  resolveChromiumBrowserPageContext,
  resolveChromiumSessionBrowserPageContext,
  resolveChromiumSessionPageContextPlan,
  resolveCaptureSurface,
  resolveKeyboardCopyBrowserPageContext,
  resolveRetainedSelectedText,
  resolveSharedSelectedTextCandidate,
  resolveContextIdentity,
  resolveScreenCaptureAttemptPlan,
  resolveScreenCaptureRuntimeState,
  resolveScreenCaptureRetryPlan,
  resolveFrontmostAppName,
  resolveInitialScreenCaptureMode,
  resolveInitialScreenCaptureRuntimeInvocation,
  resolveScreenCaptureExecutionDecision,
  resolveScreenOcrRuntimeInvocation,
  resolveCapturedScreenshotRuntime,
  resolveScreenCaptureAttemptExecution,
  resolveScreenCaptureAttemptOutcome,
  resolveScreenCapturePlan,
  resolveFinalScreenCapturePlan,
  resolveScreenContextCaptureRequest,
  resolveScreenContextExecutionPlan,
  resolveScreenCaptureDecisionReason,
  resolveInitialScreenSourceSelection,
  resolveScreenSourceSelection,
  resolveDesktopCaptureRuntimePlan,
  resolveContextCapturePlan,
  resolveContextCapturePreparation,
  resolveContextCaptureRuntimeState,
  escapeAppleScriptString,
  resolveAccessibilityFallbackPriority,
  resolveClipboardSelectionCapturePolicy,
  resolveSelectedText,
  resolveFetchedBrowserPageContext,
  finalizeScreenContext,
  shouldPreferSelectedTextAsPrimary,
  shouldReuseCompiledHelperBinary,
  shouldAcceptPublicPageFetchResponse,
  shouldFetchPublicPageTextForBrowserCapture,
  shouldCaptureScreenContext,
  shouldRunScreenOcr,
  shouldRetryWithNativeScreenCapture,
  shouldSkipBrowserCapture,
  shouldSkipOcr,
  shouldTryKeyboardFallback,
  shouldTrySessionFallback,
  isLikelyFrontmostNoiseApp,
  isChromiumSessionFileName,
  sourceScore
} from '../../src/main/context-reader-utils.ts'

test('hasSubstantialText ignores whitespace-only padding', () => {
  assert.equal(hasSubstantialText('a'.repeat(241)), true)
  assert.equal(hasSubstantialText(`a${' '.repeat(400)}b`, 4), false)
  assert.equal(hasSubstantialText(null), false)
})

test('parseLsAppInfoFrontRecord extracts display name and bundle id from lsappinfo output', () => {
  assert.deepEqual(
    parseLsAppInfoFrontRecord(`"loginwindow" ASN:0x0-0xa130126: (in front)
    bundleID="com.apple.loginwindow"`),
    {
      asn: 'ASN:0x0-0xa130126:',
      displayName: null,
      bundleId: 'com.apple.loginwindow'
    }
  )

  assert.deepEqual(
    parseLsAppInfoFrontRecord(`ASN:0x0-0xa130126:
"LSDisplayName"="Google Chrome"`),
    {
      asn: 'ASN:0x0-0xa130126:',
      displayName: 'Google Chrome',
      bundleId: null
    }
  )
})

test('isLikelyFrontmostNoiseApp detects loginwindow-style frontmost noise', () => {
  assert.equal(isLikelyFrontmostNoiseApp('loginwindow'), true)
  assert.equal(isLikelyFrontmostNoiseApp('UserNotificationCenter'), true)
  assert.equal(isLikelyFrontmostNoiseApp('LINE'), false)
  assert.equal(isLikelyFrontmostNoiseApp(null), false)
})

test('normalizeFrontmostAppInfo prefers real accessibility app names over noisy script frontmost apps', () => {
  assert.deepEqual(
    normalizeFrontmostAppInfo({
      scriptActiveApp: 'loginwindow',
      scriptWindowTitle: null,
      accessibilityAppName: 'LINE',
      accessibilityWindowTitle: 'ログイン'
    }),
    {
      activeApp: 'LINE',
      windowTitle: 'ログイン'
    }
  )

  assert.deepEqual(
    normalizeFrontmostAppInfo({
      scriptActiveApp: 'Safari',
      scriptWindowTitle: 'Pricing',
      accessibilityAppName: 'loginwindow',
      accessibilityWindowTitle: 'Ignored'
    }),
    {
      activeApp: 'Safari',
      windowTitle: 'Pricing'
    }
  )
})

test('resolveFrontmostAppName prefers System Events when it has a real app, but falls back from noise to lsappinfo', () => {
  assert.deepEqual(
    resolveFrontmostAppName({
      systemEventsAppName: 'LINE',
      lsappinfoAppName: 'loginwindow'
    }),
    {
      activeApp: 'LINE',
      source: 'system-events'
    }
  )

  assert.deepEqual(
    resolveFrontmostAppName({
      systemEventsAppName: 'loginwindow',
      lsappinfoAppName: 'Google Chrome'
    }),
    {
      activeApp: 'Google Chrome',
      source: 'lsappinfo'
    }
  )

  assert.deepEqual(
    resolveFrontmostAppName({
      systemEventsAppName: null,
      lsappinfoAppName: 'UserNotificationCenter'
    }),
    {
      activeApp: 'UserNotificationCenter',
      source: 'lsappinfo'
    }
  )
})

test('classifyContext detects social surfaces first', () => {
  const result = classifyContext({
    activeApp: 'Google Chrome',
    windowTitle: 'Home / X',
    pageTitle: 'For you',
    pageUrl: 'https://x.com/home',
    accessibilityText: '返信とリポストを確認する',
    screenText: null
  })

  assert.equal(result, 'social')
})

test('classifyContext treats Slack-style chat surfaces as social', () => {
  const result = classifyContext({
    activeApp: 'Slack',
    windowTitle: 'mk-biz (Channel) - aisaac - Slack',
    pageTitle: 'mk-biz (Channel) - aisaac - Slack',
    pageUrl: null,
    accessibilityText: 'Message to mk-biz\ncomposer\nSend now\nMention someone',
    screenText: null
  })

  assert.equal(result, 'social')
})

test('classifyContext treats Microsoft Teams compose surfaces as social', () => {
  const result = classifyContext({
    activeApp: 'Microsoft Teams',
    windowTitle: 'Growth sync | Microsoft Teams',
    pageTitle: 'Growth sync',
    pageUrl: null,
    accessibilityText:
      'Chat\nStart a new conversation\nType a new message\nDelivery options\n来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。',
    screenText: null
  })

  assert.equal(result, 'social')
})

test('classifyContext treats native mail compose surfaces as social', () => {
  const result = classifyContext({
    activeApp: 'Mail',
    windowTitle: 'Re: KashinAI launch plan - Mail',
    pageTitle: 'Re: KashinAI launch plan',
    pageUrl: null,
    accessibilityText:
      'From pm@example.com To team@example.com Subject Re: KashinAI launch plan まずは画面文脈の精度改善を主眼に進めたいです。',
    screenText: null
  })

  assert.equal(result, 'social')
})

test('classifyContext detects coding and document contexts', () => {
  const coding = classifyContext({
    activeApp: 'Visual Studio Code',
    windowTitle: 'context-reader.ts',
    pageTitle: null,
    pageUrl: null,
    accessibilityText: 'function buildPrompt() { const value = import.meta.env.DEV }',
    screenText: null
  })
  const document = classifyContext({
    activeApp: 'Notion',
    windowTitle: 'Weekly document',
    pageTitle: null,
    pageUrl: null,
    accessibilityText: 'markdown draft in notion',
    screenText: null
  })

  assert.equal(coding, 'coding')
  assert.equal(document, 'document')
})

test('classifyContext treats native calendar event details as document context', () => {
  const result = classifyContext({
    activeApp: 'Calendar',
    windowTitle: 'KashinAI context review',
    pageTitle: 'KashinAI context review',
    pageUrl: 'https://zoom.us/j/1234567890',
    accessibilityText:
      '明日 14:00 - 14:30 参加者: toru@example.com, pm@example.com 議題: アクセシビリティ経由で取れている文脈の精度確認',
    screenText: null
  })

  assert.equal(result, 'document')
})

test('classifyContext treats figma selection inspector surfaces as document context', () => {
  const result = classifyContext({
    activeApp: 'Figma',
    windowTitle: 'Marketing Site',
    pageTitle: 'Marketing Site',
    pageUrl: null,
    accessibilityText:
      'Frame: Hero / Pricing Component: Primary CTA Button label: Start free trial Auto layout: vertical, spacing 24',
    screenText: null
  })

  assert.equal(result, 'document')
})

test('classifyContext treats local file surfaces as document unless they are inside a browser app', () => {
  const previewDocument = classifyContext({
    activeApp: 'Preview',
    windowTitle: 'LaunchPlan.html',
    pageTitle: 'Launch Plan',
    pageUrl: 'file:///Users/toru/Documents/LaunchPlan.html',
    accessibilityText: 'Next customer sync agenda and pricing risks',
    screenText: null
  })
  const browserLocalPage = classifyContext({
    activeApp: 'Safari',
    windowTitle: 'LaunchPlan.html',
    pageTitle: 'Launch Plan',
    pageUrl: 'file:///Users/toru/Documents/LaunchPlan.html',
    accessibilityText: 'Next customer sync agenda and pricing risks',
    screenText: null
  })

  assert.equal(previewDocument, 'document')
  assert.equal(browserLocalPage, 'browser')
})

test('classifyContext treats GitHub issue pages in a browser as browser, not coding', () => {
  const result = classifyContext({
    activeApp: 'Dia',
    windowTitle: 'コンビニ決済を導入する（GMO-PG・審査通過済み） · Issue #434 · aisaac-lab/clebag',
    pageTitle: 'Issue #434 · aisaac-lab/clebag',
    pageUrl: null,
    accessibilityText:
      'github.com / aisaac-lab/clebag Issue #434 決済手段が現状クレジットカードと銀行振込のみ。コンビニ決済を求める層を取りこぼしている。',
    screenText: null
  })

  assert.equal(result, 'browser')
})

test('classifyContext treats GitHub diff or stack-trace surfaces as coding', () => {
  const result = classifyContext({
    activeApp: 'Dia',
    windowTitle: 'Pull Request #424 · aisaac-lab/clebag',
    pageTitle: 'Files changed',
    pageUrl: null,
    accessibilityText:
      'github.com / aisaac-lab/clebag Pull Request #424 diff --git a/src/main/context-reader.ts b/src/main/context-reader.ts @@ function captureCurrentContext() { const canSkipOcr = true }',
    screenText: null
  })

  assert.equal(result, 'coding')
})

test('classifyContext falls back to browser when browser app or page URL exists', () => {
  const viaApp = classifyContext({
    activeApp: 'Safari',
    windowTitle: 'Open tabs',
    pageTitle: null,
    pageUrl: null,
    accessibilityText: null,
    screenText: null
  })
  const viaUrl = classifyContext({
    activeApp: 'Preview',
    windowTitle: 'Notes',
    pageTitle: null,
    pageUrl: 'https://example.com',
    accessibilityText: null,
    screenText: null
  })

  assert.equal(viaApp, 'browser')
  assert.equal(viaUrl, 'browser')
})

test('classifyContext detects browser-like chromium apps from tab and URL signals even without pageUrl', () => {
  const result = classifyContext({
    activeApp: 'Dia',
    windowTitle: 'Personal: Meet - 諸々共有',
    pageTitle: 'Meet - 諸々共有',
    pageUrl: null,
    accessibilityText:
      'meet.google.com / 諸々共有 Cloudflare Dashboard | Manage Your Account コンビニ決済を導入する（GMO-PG・審査通過済み） · Issue #434 · aisaac-lab/clebag',
    screenText: null
  })

  assert.equal(result, 'browser')
})

test('classifyContext does not misclassify browser tabs as social only because page text contains generic chat wording', () => {
  const result = classifyContext({
    activeApp: 'Dia',
    windowTitle: 'Personal: Meet - 諸々共有',
    pageTitle: 'Meet - 諸々共有',
    pageUrl: null,
    accessibilityText:
      'meet.google.com / 諸々共有 Linzumi — A chat where every channel ships code Cloudflare Dashboard | Manage Your Account',
    screenText: null
  })

  assert.equal(result, 'browser')
})

test('browserScriptName matches supported browsers only', () => {
  assert.equal(browserScriptName('Google Chrome'), 'Google Chrome')
  assert.equal(browserScriptName('Google Chrome Canary'), 'Google Chrome Canary')
  assert.equal(browserScriptName('Arc'), 'Arc')
  assert.equal(browserScriptName('Brave Browser'), 'Brave Browser')
  assert.equal(browserScriptName('Dia'), 'Dia')
  assert.equal(browserScriptName('Microsoft Edge'), 'Microsoft Edge')
  assert.equal(browserScriptName('Firefox'), 'Firefox')
  assert.equal(browserScriptName('Vivaldi'), 'Vivaldi')
  assert.equal(browserScriptName('Opera'), 'Opera')
  assert.equal(browserScriptName('Safari'), 'Safari')
  assert.equal(browserScriptName('Finder'), null)
})

test('isChromiumSessionFileName accepts Chromium session artifacts only', () => {
  assert.equal(isChromiumSessionFileName('Session_123456789'), true)
  assert.equal(isChromiumSessionFileName('Tabs_123456789'), true)
  assert.equal(isChromiumSessionFileName('Preferences'), false)
  assert.equal(isChromiumSessionFileName('Current Session'), false)
})

test('pickRecentChromiumSessionFiles keeps the newest session or tabs files only', () => {
  const files = [
    { filePath: '/tmp/Profile 1/Sessions/Preferences', mtimeMs: 1000 },
    { filePath: '/tmp/Profile 1/Sessions/Session_3', mtimeMs: 3000 },
    { filePath: '/tmp/Profile 2/Sessions/Tabs_4', mtimeMs: 4000 },
    { filePath: '/tmp/Profile 1/Sessions/Session_1', mtimeMs: 1000 },
    { filePath: '/tmp/Profile 1/Sessions/Tabs_2', mtimeMs: 2000 }
  ]

  assert.deepEqual(pickRecentChromiumSessionFiles(files), [
    '/tmp/Profile 2/Sessions/Tabs_4',
    '/tmp/Profile 1/Sessions/Session_3',
    '/tmp/Profile 1/Sessions/Tabs_2',
    '/tmp/Profile 1/Sessions/Session_1'
  ])
})

test('pickRecentChromiumSessionFiles caps the candidate list to the newest six files', () => {
  const files = Array.from({ length: 8 }, (_, index) => ({
    filePath: `/tmp/Profile/Sessions/Session_${index + 1}`,
    mtimeMs: index + 1
  }))

  assert.deepEqual(pickRecentChromiumSessionFiles(files), [
    '/tmp/Profile/Sessions/Session_8',
    '/tmp/Profile/Sessions/Session_7',
    '/tmp/Profile/Sessions/Session_6',
    '/tmp/Profile/Sessions/Session_5',
    '/tmp/Profile/Sessions/Session_4',
    '/tmp/Profile/Sessions/Session_3'
  ])
})

test('browserMetadata exposes session roots for chromium apps', () => {
  const canary = browserMetadata('Google Chrome Canary')
  const arc = browserMetadata('Arc')
  const dia = browserMetadata('Dia')
  const firefox = browserMetadata('Firefox')
  const opera = browserMetadata('Opera')
  const safari = browserMetadata('Safari')
  const vivaldi = browserMetadata('Vivaldi')

  assert.equal(canary?.family, 'chromium')
  assert.match(canary?.sessionRoots[0] ?? '', /Library\/Application Support\/Google\/Chrome Canary$/)
  assert.equal(arc?.family, 'chromium')
  assert.match(arc?.sessionRoots[0] ?? '', /Library\/Application Support\/Arc$/)
  assert.equal(dia?.family, 'chromium')
  assert.match(dia?.sessionRoots[0] ?? '', /Library\/Application Support\/Dia$/)
  assert.equal(firefox?.family, 'keyboard-only')
  assert.deepEqual(firefox?.sessionRoots, [])
  assert.equal(opera?.family, 'chromium')
  assert.match(opera?.sessionRoots[0] ?? '', /Library\/Application Support\/com\.operasoftware\.Opera$/)
  assert.equal(safari?.family, 'safari')
  assert.deepEqual(safari?.sessionRoots, [])
  assert.equal(vivaldi?.family, 'chromium')
  assert.match(vivaldi?.sessionRoots[0] ?? '', /Library\/Application Support\/Vivaldi$/)
})

test('resolveBundledResourcePathCandidates prefers dev paths first and resources last in development', () => {
  assert.deepEqual(
    resolveBundledResourcePathCandidates({
      isPackaged: false,
      cwd: '/repo',
      appPath: '/repo/dist/app',
      resourcesPath: '/repo/resources',
      devRelativePath: 'scripts/ocr.swift',
      packagedFileName: 'ocr.swift'
    }),
    ['/repo/scripts/ocr.swift', '/repo/dist/app/scripts/ocr.swift', '/repo/resources/ocr.swift']
  )
})

test('resolveBundledResourcePathCandidates only returns the packaged resource when app is packaged', () => {
  assert.deepEqual(
    resolveBundledResourcePathCandidates({
      isPackaged: true,
      cwd: '/repo',
      appPath: '/repo/dist/app',
      resourcesPath: '/Applications/KashinAI.app/Contents/Resources',
      devRelativePath: 'scripts/ax-context.swift',
      packagedFileName: 'ax-context.swift'
    }),
    ['/Applications/KashinAI.app/Contents/Resources/ax-context.swift']
  )
})

test('resolveBundledResourceRuntimePath prefers the first existing candidate and falls back deterministically', () => {
  assert.equal(
    resolveBundledResourceRuntimePath({
      candidates: ['/repo/scripts/ocr.swift', '/repo/dist/app/scripts/ocr.swift', '/repo/resources/ocr.swift'],
      existingPaths: ['/repo/dist/app/scripts/ocr.swift', '/repo/resources/ocr.swift'],
      fallbackPath: '/repo/scripts/ocr.swift'
    }),
    '/repo/dist/app/scripts/ocr.swift'
  )

  assert.equal(
    resolveBundledResourceRuntimePath({
      candidates: ['/repo/scripts/ocr.swift', '/repo/dist/app/scripts/ocr.swift'],
      existingPaths: [],
      fallbackPath: '/repo/scripts/ocr.swift'
    }),
    '/repo/scripts/ocr.swift'
  )

  assert.equal(
    resolveBundledResourceRuntimePath({
      candidates: [],
      existingPaths: [],
      fallbackPath: '/repo/scripts/ocr.swift'
    }),
    '/repo/scripts/ocr.swift'
  )
})

test('shouldReuseCompiledHelperBinary only reuses a cached helper when it is at least as new as the source script', () => {
  assert.equal(
    shouldReuseCompiledHelperBinary({
      binaryMtimeMs: 2000,
      scriptMtimeMs: 1000
    }),
    true
  )
  assert.equal(
    shouldReuseCompiledHelperBinary({
      binaryMtimeMs: 1000,
      scriptMtimeMs: 1000
    }),
    true
  )
  assert.equal(
    shouldReuseCompiledHelperBinary({
      binaryMtimeMs: 999,
      scriptMtimeMs: 1000
    }),
    false
  )
  assert.equal(
    shouldReuseCompiledHelperBinary({
      binaryMtimeMs: null,
      scriptMtimeMs: 1000
    }),
    false
  )
})

test('resolveBrowserAutomationTarget exposes the automation family for browser capture', () => {
  assert.deepEqual(resolveBrowserAutomationTarget('Safari'), {
    scriptName: 'Safari',
    family: 'safari'
  })
  assert.deepEqual(resolveBrowserAutomationTarget('Dia'), {
    scriptName: 'Dia',
    family: 'chromium'
  })
  assert.deepEqual(resolveBrowserAutomationTarget('Firefox'), {
    scriptName: 'Firefox',
    family: 'keyboard-only'
  })
  assert.deepEqual(resolveBrowserAutomationTarget('Finder'), {
    scriptName: null,
    family: null
  })
})

test('resolveBrowserPageCaptureDispatch only enables direct automation for Safari and Chromium-family browsers', () => {
  assert.deepEqual(resolveBrowserPageCaptureDispatch('Safari'), {
    scriptName: 'Safari',
    mode: 'safari'
  })
  assert.deepEqual(resolveBrowserPageCaptureDispatch('Dia'), {
    scriptName: 'Dia',
    mode: 'chromium'
  })
  assert.deepEqual(resolveBrowserPageCaptureDispatch('Firefox'), {
    scriptName: null,
    mode: 'none'
  })
  assert.deepEqual(resolveBrowserPageCaptureDispatch('Finder'), {
    scriptName: null,
    mode: 'none'
  })
})

test('resolveBrowserPageCaptureRuntimeInvocation makes the browser-page runtime branch explicit', () => {
  assert.deepEqual(resolveBrowserPageCaptureRuntimeInvocation('Safari'), {
    kind: 'capture-safari-page',
    scriptName: 'Safari'
  })
  assert.deepEqual(resolveBrowserPageCaptureRuntimeInvocation('Dia'), {
    kind: 'capture-chromium-page',
    scriptName: 'Dia'
  })
  assert.deepEqual(resolveBrowserPageCaptureRuntimeInvocation('Firefox'), {
    kind: 'skip-browser-page-capture',
    scriptName: null
  })
})

test('browser automation script builders stay pure and escape app names safely', () => {
  assert.equal(escapeAppleScriptString('My "Browser" \\\\ Dev'), 'My \\"Browser\\" \\\\\\\\ Dev')

  const bodyScript = buildBrowserBodyExtractionJavaScript()
  assert.match(bodyScript, /document\.querySelector\("main"\)/)
  assert.match(bodyScript, /text\.length >= 120/)

  const metadataScript = buildChromiumTabMetadataAppleScript('My "Browser"')
  assert.match(metadataScript, /tell application "My \\"Browser\\""/)
  assert.match(metadataScript, /get title of active tab of front window/)
  assert.match(metadataScript, /get URL of active tab of front window/)

  const bodyAppleScript = buildChromiumTabBodyTextAppleScript('Dia')
  assert.match(bodyAppleScript, /tell application "Dia"/)
  assert.match(bodyAppleScript, /execute active tab of front window javascript/)
  assert.match(bodyAppleScript, /document\.querySelector\(\\\"main\\\"\)/)

  const safariScript = buildSafariPageCaptureAppleScript('Safari')
  assert.match(safariScript, /exists front document/)
  assert.match(safariScript, /do JavaScript "document\.body \? document\.body\.innerText\.slice\(0, 12000\) : ''" in front document/)
})

test('resolveSharedSelectedTextCandidate centralizes the common missing and ui-noise filtering for selected text', () => {
  assert.deepEqual(resolveSharedSelectedTextCandidate(null), {
    candidate: null,
    reason: 'missing'
  })
  assert.deepEqual(resolveSharedSelectedTextCandidate('   コミットまたはプッシュ   '), {
    candidate: null,
    reason: 'ui-noise'
  })
  assert.deepEqual(resolveSharedSelectedTextCandidate('  meaningful selected paragraph  '), {
    candidate: 'meaningful selected paragraph',
    reason: 'accepted'
  })
})

test('pickDesktopCaptureSource prefers a matching window capture over the whole screen', () => {
  const result = pickDesktopCaptureSource(
    [
      { id: 'window:1:0', name: 'Cursor - unrelated.ts', hasThumbnail: true },
      { id: 'window:2:0', name: 'Issue 424 - Dia', hasThumbnail: true },
      { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true }
    ],
    {
      activeApp: 'Dia',
      windowTitle: 'Issue 424'
    }
  )

  assert.equal(result.source?.id, 'window:2:0')
  assert.equal(result.sourceKind, 'window')
})

test('pickDesktopCaptureSource falls back to a screen capture when window matches are weak', () => {
  const result = pickDesktopCaptureSource(
    [
      { id: 'window:1:0', name: 'System Settings', hasThumbnail: true },
      { id: 'window:2:0', name: 'Messages', hasThumbnail: true },
      { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true }
    ],
    {
      activeApp: 'Dia',
      windowTitle: 'Issue 424'
    }
  )

  assert.equal(result.source?.id, 'screen:0:0')
  assert.equal(result.sourceKind, 'screen')
})

test('pickDesktopCaptureSource ignores empty thumbnails and returns null when nothing is usable', () => {
  const result = pickDesktopCaptureSource(
    [
      { id: 'window:1:0', name: 'Issue 424 - Dia', hasThumbnail: false },
      { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: false }
    ],
    {
      activeApp: 'Dia',
      windowTitle: 'Issue 424'
    }
  )

  assert.equal(result.source, null)
  assert.equal(result.sourceKind, null)
})

test('analyzeDesktopCaptureSourceSelection exposes when a screen fallback should prefer native capture', () => {
  assert.deepEqual(
    analyzeDesktopCaptureSourceSelection(
      [
        { id: 'window:1:0', name: 'Claude', hasThumbnail: true },
        { id: 'window:2:0', name: 'LINE', hasThumbnail: true },
        { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true }
      ],
      {
        activeApp: 'Codex',
        windowTitle: 'KashinAIで開発を進める'
      }
    ),
    {
      source: { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true },
      sourceKind: 'screen',
      fallbackReason: 'screen-fallback-no-window-match',
      shouldPreferNativeScreenCapture: true
    }
  )

  assert.deepEqual(
    analyzeDesktopCaptureSourceSelection(
      [
        { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true }
      ],
      {
        activeApp: 'Dia',
        windowTitle: 'Issue 424'
      }
    ),
    {
      source: { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true },
      sourceKind: 'screen',
      fallbackReason: 'screen-fallback-no-window-candidates',
      shouldPreferNativeScreenCapture: false
    }
  )

  assert.deepEqual(
    analyzeDesktopCaptureSourceSelection(
      [
        { id: 'window:1:0', name: 'Issue 424 - Dia', hasThumbnail: false },
        { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true }
      ],
      {
        activeApp: 'Dia',
        windowTitle: 'Issue 424'
      }
    ),
    {
      source: { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true },
      sourceKind: 'screen',
      fallbackReason: 'screen-fallback-no-viable-window-thumbnails',
      shouldPreferNativeScreenCapture: false
    }
  )
})

test('resolveDesktopCaptureRuntimePlan maps analyzed capture selection into executable runtime steps', () => {
  assert.deepEqual(
    resolveDesktopCaptureRuntimePlan(
      {
        source: { id: 'screen:0:0', name: 'Entire Screen', hasThumbnail: true },
        sourceKind: 'screen',
        fallbackReason: 'screen-fallback-no-window-match',
        shouldPreferNativeScreenCapture: true
      },
      ['screen:0:0']
    ),
    {
      captureMode: 'native-screen',
      sourceId: null,
      sourceKind: null,
      sourceSelection: {
        fallbackReason: 'screen-fallback-no-window-match',
        preferredCaptureMode: 'native-screen'
      }
    }
  )

  assert.deepEqual(
    resolveDesktopCaptureRuntimePlan(
      {
        source: { id: 'window:2:0', name: 'Issue 424 - Dia', hasThumbnail: true },
        sourceKind: 'window',
        fallbackReason: 'matched-window',
        shouldPreferNativeScreenCapture: false
      },
      ['window:2:0', 'screen:0:0']
    ),
    {
      captureMode: 'desktop-source',
      sourceId: 'window:2:0',
      sourceKind: 'window',
      sourceSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      }
    }
  )

  assert.deepEqual(
    resolveDesktopCaptureRuntimePlan(
      {
        source: { id: 'window:2:0', name: 'Issue 424 - Dia', hasThumbnail: true },
        sourceKind: 'window',
        fallbackReason: 'matched-window',
        shouldPreferNativeScreenCapture: false
      },
      ['screen:0:0']
    ),
    {
      captureMode: 'unavailable',
      sourceId: null,
      sourceKind: null,
      sourceSelection: null
    }
  )
})

test('cleanSessionUrl trims garbage and rejects invalid or blocked URLs', () => {
  assert.equal(cleanSessionUrl('https://example.com/path));'), 'https://example.com/path')
  assert.equal(cleanSessionUrl('file:///tmp/test.txt'), null)
  assert.equal(cleanSessionUrl('https://contacts.google.com/u/0/'), null)
  assert.equal(cleanSessionUrl('not a url'), null)
})

test('decidePublicPageFetch allows normal public html pages', () => {
  assert.deepEqual(decidePublicPageFetch('https://example.com/pricing'), {
    allowed: true,
    normalizedUrl: 'https://example.com/pricing',
    reason: 'allowed'
  })
})

test('decidePublicPageFetch blocks private app surfaces and local hosts', () => {
  assert.equal(decidePublicPageFetch('https://docs.google.com/document/d/abc/edit').reason, 'private-host')
  assert.equal(decidePublicPageFetch('https://app.slack.com/client/T1/C2').reason, 'private-host')
  assert.equal(decidePublicPageFetch('https://www.notion.so/My-Workspace-abc123').reason, 'private-host')
  assert.equal(decidePublicPageFetch('http://localhost:3000/debug').reason, 'local-host')
  assert.equal(decidePublicPageFetch('http://127.0.0.1:5173/').reason, 'local-host')
})

test('decidePublicPageFetch rejects unsupported schemes and malformed urls', () => {
  assert.equal(decidePublicPageFetch('file:///tmp/test.txt').reason, 'unsupported-scheme')
  assert.equal(decidePublicPageFetch('chrome-extension://abcd/page.html').reason, 'unsupported-scheme')
  assert.equal(decidePublicPageFetch('not a url').reason, 'invalid-url')
})

test('resolvePublicPageFetchRequest exposes the actual fetchable url only for allowed public pages', () => {
  assert.deepEqual(resolvePublicPageFetchRequest('https://example.com/pricing'), {
    shouldFetch: true,
    url: 'https://example.com/pricing',
    reason: 'allowed'
  })

  assert.deepEqual(resolvePublicPageFetchRequest('https://docs.google.com/document/d/abc/edit'), {
    shouldFetch: false,
    url: null,
    reason: 'private-host'
  })

  assert.deepEqual(resolvePublicPageFetchRequest(null), {
    shouldFetch: false,
    url: null,
    reason: 'invalid-url'
  })
})

test('resolvePublicPageTextFetchExecutionPlan turns fetch eligibility into an explicit runtime branch', () => {
  assert.deepEqual(
    resolvePublicPageTextFetchExecutionPlan(
      resolvePublicPageFetchRequest('https://example.com/pricing')
    ),
    {
      request: {
        shouldFetch: true,
        url: 'https://example.com/pricing',
        reason: 'allowed'
      },
      shouldFetch: true,
      url: 'https://example.com/pricing'
    }
  )

  assert.deepEqual(
    resolvePublicPageTextFetchExecutionPlan(
      resolvePublicPageFetchRequest('https://docs.google.com/document/d/abc/edit')
    ),
    {
      request: {
        shouldFetch: false,
        url: null,
        reason: 'private-host'
      },
      shouldFetch: false,
      url: null
    }
  )

  assert.deepEqual(
    resolvePublicPageTextFetchExecutionPlan(
      resolvePublicPageFetchRequest(null)
    ),
    {
      request: {
        shouldFetch: false,
        url: null,
        reason: 'invalid-url'
      },
      shouldFetch: false,
      url: null
    }
  )
})

test('shouldAcceptPublicPageFetchResponse only allows successful html responses', () => {
  assert.equal(
    shouldAcceptPublicPageFetchResponse({
      ok: true,
      contentType: 'text/html; charset=utf-8'
    }),
    true
  )
  assert.equal(
    shouldAcceptPublicPageFetchResponse({
      ok: true,
      contentType: 'application/json'
    }),
    false
  )
  assert.equal(
    shouldAcceptPublicPageFetchResponse({
      ok: false,
      contentType: 'text/html'
    }),
    false
  )
  assert.equal(
    shouldAcceptPublicPageFetchResponse({
      ok: true,
      contentType: null
    }),
    false
  )
})

test('extractTextFromHtml removes scripts, styles, and tags while keeping readable body text', () => {
  const text = extractTextFromHtml(`
    <html>
      <head>
        <style>.hidden { display:none; }</style>
        <script>window.__TEST__ = true</script>
      </head>
      <body>
        <main>
          <h1>Pricing</h1>
          <p>Simple plans for teams.</p>
        </main>
      </body>
    </html>
  `)

  assert.equal(text, 'Pricing Simple plans for teams.')
})

test('parseBrowserAutomationCapture normalizes multi-line tab output into page fields', () => {
  assert.deepEqual(
    parseBrowserAutomationCapture('Issue 424\nhttps://github.com/example/repo/issues/424\nFirst line\nSecond line'),
    {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'First line\nSecond line'
    }
  )

  assert.deepEqual(parseBrowserAutomationCapture('Only title\n\n   '), {
    pageTitle: 'Only title',
    pageUrl: null,
    pageText: null
  })
})

test('parseChromiumTabMetadata normalizes title and url lines from AppleScript output', () => {
  assert.deepEqual(parseChromiumTabMetadata('Issue 424\nhttps://github.com/example/repo/issues/424'), {
    pageTitle: 'Issue 424',
    pageUrl: 'https://github.com/example/repo/issues/424'
  })

  assert.deepEqual(parseChromiumTabMetadata('Only title\n   '), {
    pageTitle: 'Only title',
    pageUrl: null
  })
})

test('shouldFetchPublicPageTextForBrowserCapture only falls back when body text is still missing', () => {
  assert.equal(
    shouldFetchPublicPageTextForBrowserCapture({
      pageText: null,
      pageUrl: 'https://example.com/pricing'
    }),
    true
  )

  assert.equal(
    shouldFetchPublicPageTextForBrowserCapture({
      pageText: 'Visible browser body',
      pageUrl: 'https://example.com/pricing'
    }),
    false
  )

  assert.equal(
    shouldFetchPublicPageTextForBrowserCapture({
      pageText: null,
      pageUrl: null
    }),
    false
  )
})

test('resolveBrowserPageTextFetchPlan normalizes duplicated capture text before deciding whether html fetch is still needed', () => {
  assert.deepEqual(
    resolveBrowserPageTextFetchPlan({
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Issue 424\nhttps://github.com/example/repo/issues/424\nFirst line\nSecond line'
    }),
    {
      normalizedCapture: {
        pageTitle: 'Issue 424',
        pageUrl: 'https://github.com/example/repo/issues/424',
        pageText: 'First line\nSecond line'
      },
      shouldFetchPublicPageText: false
    }
  )

  assert.deepEqual(
    resolveBrowserPageTextFetchPlan({
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing'
    }),
    {
      normalizedCapture: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      },
      shouldFetchPublicPageText: true
    }
  )
})

test('resolveBrowserPageContextResolutionPlan keeps fetch decisions and capture provenance together for context-reader', () => {
  assert.deepEqual(
    resolveBrowserPageContextResolutionPlan({
      capture: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      },
      pageCaptureMethod: 'browser-automation'
    }),
    {
      normalizedCapture: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      },
      shouldFetchPublicPageText: true,
      pageCaptureMethod: 'browser-automation'
    }
  )

  assert.deepEqual(
    resolveBrowserPageContextResolutionPlan({
      capture: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Visible pricing copy'
      },
      pageCaptureMethod: 'keyboard-copy'
    }),
    {
      normalizedCapture: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Visible pricing copy'
      },
      shouldFetchPublicPageText: false,
      pageCaptureMethod: 'keyboard-copy'
    }
  )
})

test('resolveBrowserPageContextFetchExecutionPlan keeps normalized browser capture and public-page fetch gating in one pure plan', () => {
  assert.deepEqual(
    resolveBrowserPageContextFetchExecutionPlan({
      capture: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      },
      pageCaptureMethod: 'browser-automation'
    }),
    {
      normalizedCapture: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      },
      shouldFetchPublicPageText: true,
      pageCaptureMethod: 'browser-automation',
      fetchRequest: {
        shouldFetch: true,
        url: 'https://example.com/pricing',
        reason: 'allowed'
      }
    }
  )

  assert.deepEqual(
    resolveBrowserPageContextFetchExecutionPlan({
      capture: {
        pageTitle: 'Inbox',
        pageUrl: 'https://mail.google.com/mail/u/0/#inbox',
        pageText: null
      },
      pageCaptureMethod: 'chrome-session'
    }),
    {
      normalizedCapture: {
        pageTitle: 'Inbox',
        pageUrl: 'https://mail.google.com/mail/u/0/#inbox',
        pageText: null
      },
      shouldFetchPublicPageText: true,
      pageCaptureMethod: 'chrome-session',
      fetchRequest: {
        shouldFetch: false,
        url: null,
        reason: 'private-host'
      }
    }
  )
})

test('resolveKeyboardCopyBrowserPageContext preserves keyboard-copy provenance even when text is recovered later from the page URL', () => {
  assert.deepEqual(
    resolveKeyboardCopyBrowserPageContext({
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered from fetched public page text.',
      fetchedPageText: 'Fetched fallback body'
    }),
    {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered from fetched public page text.',
      pageCaptureMethod: 'keyboard-copy'
    }
  )

  assert.deepEqual(
    resolveKeyboardCopyBrowserPageContext({
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      fetchedPageText: 'Fetched release notes body'
    }),
    {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Fetched release notes body',
      pageCaptureMethod: 'keyboard-copy'
    }
  )
})

test('normalizeBrowserPageCapture drops duplicated title/url lines from captured page text', () => {
  assert.deepEqual(
    normalizeBrowserPageCapture({
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Issue 424\nhttps://github.com/example/repo/issues/424\nFirst line\nSecond line'
    }),
    {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'First line\nSecond line'
    }
  )

  assert.deepEqual(
    normalizeBrowserPageCapture({
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'https://github.com/example/repo/issues/424'
    }),
    {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null
    }
  )
})

test('buildBrowserPageContext keeps the requested method only when browser capture has usable url or text', () => {
  assert.deepEqual(
    buildBrowserPageContext(
      {
        pageTitle: 'Issue 424',
        pageUrl: null,
        pageText: null
      },
      'browser-automation'
    ),
    {
      pageTitle: 'Issue 424',
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'none'
    }
  )

  assert.deepEqual(
    buildBrowserPageContext(
      {
        pageTitle: 'Issue 424',
        pageUrl: 'https://github.com/example/repo/issues/424',
        pageText: 'Issue 424\nhttps://github.com/example/repo/issues/424\nFirst line\nSecond line'
      },
      'keyboard-copy'
    ),
    {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'First line\nSecond line',
      pageCaptureMethod: 'keyboard-copy'
    }
  )
})

test('resolveFetchedBrowserPageContext centralizes browser text precedence while preserving capture provenance', () => {
  assert.deepEqual(
    resolveFetchedBrowserPageContext({
      capture: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Pricing overview\nhttps://example.com/pricing\nActual body copy'
      },
      fetchedPageText: 'Fetched fallback copy',
      pageCaptureMethod: 'keyboard-copy'
    }),
    {
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Actual body copy',
      pageCaptureMethod: 'keyboard-copy'
    }
  )

  assert.deepEqual(
    resolveFetchedBrowserPageContext({
      capture: {
        pageTitle: 'Release notes',
        pageUrl: 'https://example.com/releases',
        pageText: null
      },
      fetchedPageText: 'Fetched release notes body',
      pageCaptureMethod: 'browser-automation'
    }),
    {
      pageTitle: 'Release notes',
      pageUrl: 'https://example.com/releases',
      pageText: 'Fetched release notes body',
      pageCaptureMethod: 'browser-automation'
    }
  )
})

test('resolveChromiumBrowserPageContext prefers direct browser body text and otherwise falls back to fetched text', () => {
  assert.deepEqual(
    resolveChromiumBrowserPageContext({
      metadata: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing'
      },
      bodyText: 'Visible browser body',
      fetchedPageText: 'Fetched html body'
    }),
    {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Visible browser body',
      pageCaptureMethod: 'browser-automation'
    }
  )

  assert.deepEqual(
    resolveChromiumBrowserPageContext({
      metadata: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing'
      },
      bodyText: null,
      fetchedPageText: 'Fetched html body'
    }),
    {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Fetched html body',
      pageCaptureMethod: 'browser-automation'
    }
  )

  assert.deepEqual(
    resolveChromiumBrowserPageContext({
      metadata: {
        pageTitle: 'Pricing',
        pageUrl: null
      },
      bodyText: null
    }),
    {
      pageTitle: 'Pricing',
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'none'
    }
  )
})

test('resolveChromiumSessionBrowserPageContext keeps chrome-session provenance while using fetched page text when available', () => {
  assert.deepEqual(
    resolveChromiumSessionBrowserPageContext({
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      fetchedPageText: 'Fetched html body'
    }),
    {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Fetched html body',
      pageCaptureMethod: 'chrome-session'
    }
  )

  assert.deepEqual(
    resolveChromiumSessionBrowserPageContext({
      pageTitle: 'New Tab',
      pageUrl: null,
      fetchedPageText: null
    }),
    {
      pageTitle: 'New Tab',
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'none'
    }
  )
})

test('normalizeCopiedText trims whitespace, applies max length, and returns null for empty content', () => {
  assert.equal(normalizeCopiedText('  selected text  '), 'selected text')
  assert.equal(normalizeCopiedText(`  ${'a'.repeat(20)}  `, 10), 'a'.repeat(10))
  assert.equal(normalizeCopiedText('   \n\t  '), null)
})

test('extractSessionUrls cleans valid session urls and drops blocked or invalid matches', () => {
  const result = extractSessionUrls(`
    https://example.com/path));
    https://contacts.google.com/u/0/
    file:///tmp/test.txt
    https://app.slack.com/client/T1/C2
    https://example.com/roadmap?view=compact
  `)

  assert.deepEqual(result, [
    'https://example.com/path',
    'https://app.slack.com/client/T1/C2',
    'https://example.com/roadmap?view=compact'
  ])
})

test('pickBestSessionUrlCandidate prefers urls aligned with the frontmost window title', () => {
  const picked = pickBestSessionUrlCandidate({
    frontmost: {
      activeApp: 'Dia',
      windowTitle: 'DESIGN.md Examples for AI Agents | Refero Styles'
    },
    urls: [
      'https://news.ycombinator.com/news',
      'https://slack.com/client/T123/C456',
      'https://www.refero.design/content/design-md-examples',
      'https://docs.google.com/document/d/abc123/edit'
    ]
  })

  assert.equal(picked, 'https://www.refero.design/content/design-md-examples')
})

test('pickBestSessionUrlCandidate prefers a fetchable public page over a private host when title signals are similar', () => {
  const picked = pickBestSessionUrlCandidate({
    frontmost: {
      activeApp: 'Google Chrome',
      windowTitle: 'Pricing overview'
    },
    urls: [
      'https://docs.google.com/document/d/pricing-overview/edit',
      'https://example.com/pricing-overview'
    ]
  })

  assert.equal(picked, 'https://example.com/pricing-overview')
})

test('pickBestSessionUrlCandidate falls back to the most recent usable url when titles provide no match', () => {
  const picked = pickBestSessionUrlCandidate({
    frontmost: {
      activeApp: 'Google Chrome',
      windowTitle: 'Untitled Window'
    },
    urls: [
      'https://example.com/older',
      'https://example.com/newer',
      'file:///tmp/not-allowed'
    ]
  })

  assert.equal(picked, 'https://example.com/newer')
})

test('resolveChromiumSessionPageContextPlan carries the frontmost title and only fetches usable public urls', () => {
  assert.deepEqual(
    resolveChromiumSessionPageContextPlan({
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing overview'
      },
      urls: [
        'https://docs.google.com/document/d/pricing-overview/edit',
        'https://example.com/pricing-overview'
      ]
    }),
    {
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing-overview',
      shouldFetchPublicPageText: true
    }
  )

  assert.deepEqual(
    resolveChromiumSessionPageContextPlan({
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Workspace'
      },
      urls: ['https://docs.google.com/document/d/workspace/edit']
    }),
    {
      pageTitle: 'Workspace',
      pageUrl: 'https://docs.google.com/document/d/workspace/edit',
      shouldFetchPublicPageText: false
    }
  )
})

test('primaryContentSource prioritizes stronger capture sources in order', () => {
  assert.equal(
    primaryContentSource({
      selectedText: 'selected text with enough signal',
      pageText: 'p'.repeat(200),
      pageUrl: 'https://example.com/pricing',
      accessibilityText: 'a'.repeat(200),
      screenText: 's'.repeat(200)
    }),
    'selected-text'
  )
  assert.equal(
    primaryContentSource({
      selectedText: null,
      pageText: 'p'.repeat(120),
      pageUrl: 'https://example.com/pricing',
      accessibilityText: 'a'.repeat(200),
      screenText: 's'.repeat(200)
    }),
    'page-text'
  )
  assert.equal(
    primaryContentSource({
      selectedText: null,
      pageText: null,
      pageUrl: null,
      accessibilityText: 'a'.repeat(120),
      screenText: 's'.repeat(200)
    }),
    'accessibility-text'
  )
  assert.equal(
    primaryContentSource({
      selectedText: null,
      pageText: null,
      pageUrl: null,
      accessibilityText: null,
      screenText: 's'.repeat(120)
    }),
    'screen-ocr'
  )
  assert.equal(
    primaryContentSource({
      selectedText: 'tiny',
      pageText: 'short',
      pageUrl: null,
      accessibilityText: null,
      screenText: null
    }),
    'none'
  )
})

test('primaryContentSource does not let url-like selected text outrank richer structured context', () => {
  assert.equal(
    shouldPreferSelectedTextAsPrimary({
      selectedText: 'https://www.town.com',
      pageText: 'Recovered browser page body with the actual page content and summary-worthy text.',
      pageUrl: 'https://www.town.com/',
      accessibilityText: 'Address bar and browser chrome',
      screenText: null
    }),
    false
  )

  assert.equal(
    primaryContentSource({
      selectedText: 'https://www.town.com',
      pageText: 'Recovered browser page body with the actual page content and summary-worthy text.',
      pageUrl: 'https://www.town.com/',
      accessibilityText: 'Address bar and browser chrome',
      screenText: null
    }),
    'page-text'
  )

  assert.equal(
    primaryContentSource({
      selectedText: 'https://example.com/launch-plan',
      pageText: null,
      pageUrl: null,
      accessibilityText: 'Detailed native app context that explains launch blockers and rollout status.',
      screenText: null
    }),
    'accessibility-text'
  )
})

test('resolvePrimaryContentSelection explains why structured context beats weak or url-like selected text', () => {
  assert.deepEqual(
    resolvePrimaryContentSelection({
      selectedText: 'Quoted launch note with next steps',
      pageText: null,
      pageUrl: null,
      pageCaptureMethod: 'none',
      accessibilityText: null,
      screenText: null
    }),
    {
      source: 'selected-text',
      reason: 'selected-text'
    }
  )

  assert.deepEqual(
    resolvePrimaryContentSelection({
      selectedText: 'https://www.town.com',
      pageText: 'Recovered browser page body with the actual page content and summary-worthy text.',
      pageUrl: 'https://www.town.com/',
      pageCaptureMethod: 'chrome-session',
      accessibilityText: 'Address bar and browser chrome',
      screenText: null
    }),
    {
      source: 'page-text',
      reason: 'page-text'
    }
  )

  assert.deepEqual(
    resolvePrimaryContentSelection({
      selectedText: 'tiny label',
      pageText: null,
      pageUrl: null,
      pageCaptureMethod: 'none',
      accessibilityText: null,
      screenText: 'Recovered OCR paragraph with enough detail to understand the current screen contents.'
    }),
    {
      source: 'screen-ocr',
      reason: 'screen-ocr'
    }
  )

  assert.deepEqual(
    resolvePrimaryContentSelection({
      selectedText: 'Message #mk-biz',
      pageText: '比較のために12日文金はおじので行こうかなと考えています！ 画面文脈で見ると、先に営業導線の詰まりを解くのがよさそうです。',
      pageUrl: null,
      pageCaptureMethod: 'accessibility',
      accessibilityText: '比較のために12日文金はおじので行こうかなと考えています！ 画面文脈で見ると、先に営業導線の詰まりを解くのがよさそうです。',
      screenText: null
    }),
    {
      source: 'accessibility-text',
      reason: 'accessibility-text'
    }
  )
})

test('pageContextFromAccessibility returns accessibility page state only when present', () => {
  assert.deepEqual(
    pageContextFromAccessibility({
      pageTitle: 'Doc',
      pageUrl: 'https://example.com/doc',
      pageText: 'Page body'
    }),
    {
      pageTitle: 'Doc',
      pageUrl: 'https://example.com/doc',
      pageText: 'Page body',
      pageCaptureMethod: 'accessibility'
    }
  )

  assert.deepEqual(
    pageContextFromAccessibility({
      pageTitle: null,
      pageUrl: null,
      pageText: null
    }),
    EMPTY_PAGE_CONTEXT
  )

  assert.deepEqual(
    pageContextFromAccessibility({
      pageTitle: 'Only a title',
      pageUrl: null,
      pageText: null
    }),
    EMPTY_PAGE_CONTEXT
  )
})

test('mergePageContext preserves stronger existing text while backfilling missing metadata', () => {
  assert.deepEqual(
    mergePageContext(
      {
        pageTitle: 'AX title',
        pageUrl: null,
        pageText: 'Accessibility page text',
        pageCaptureMethod: 'accessibility'
      },
      {
        pageTitle: null,
        pageUrl: 'https://example.com',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      }
    ),
    {
      pageTitle: 'AX title',
      pageUrl: 'https://example.com',
      pageText: 'Accessibility page text',
      pageCaptureMethod: 'accessibility'
    }
  )

  assert.deepEqual(
    mergePageContext(
      {
        pageTitle: 'Town',
        pageUrl: 'https://www.town.com/',
        pageText: 'Accessibility summary text',
        pageCaptureMethod: 'accessibility'
      },
      {
        pageTitle: 'Town',
        pageUrl: 'https://www.town.com/',
        pageText: 'Full browser automation page body',
        pageCaptureMethod: 'browser-automation'
      }
    ),
    {
      pageTitle: 'Town',
      pageUrl: 'https://www.town.com/',
      pageText: 'Full browser automation page body',
      pageCaptureMethod: 'browser-automation'
    }
  )

  assert.deepEqual(
    mergePageContext(EMPTY_PAGE_CONTEXT, {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Public pricing page',
      pageCaptureMethod: 'chrome-session'
    }),
    {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Public pricing page',
      pageCaptureMethod: 'chrome-session'
    }
  )
})

test('hasCapturedBrowserPageSignal requires page url or text, not title alone', () => {
  assert.equal(
    hasCapturedBrowserPageSignal({
      pageTitle: 'Front tab title',
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }),
    false
  )
  assert.equal(
    hasCapturedBrowserPageSignal({
      pageTitle: 'Front tab title',
      pageUrl: 'https://example.com',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }),
    true
  )
})

test('hasCapturedBrowserPageText requires actual page body text, not only title or url', () => {
  assert.equal(
    hasCapturedBrowserPageText({
      pageTitle: 'Front tab title',
      pageUrl: 'https://example.com',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }),
    false
  )
  assert.equal(
    hasCapturedBrowserPageText({
      pageTitle: 'Front tab title',
      pageUrl: 'https://example.com',
      pageText: 'Visible article body',
      pageCaptureMethod: 'browser-automation'
    }),
    true
  )
})

test('mergeBrowserPageContexts ignores title-only browser captures and uses keyboard fallback next', () => {
  const merged = mergeBrowserPageContexts({
    base: {
      pageTitle: null,
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'none'
    },
    browserContext: {
      pageTitle: 'GitHub Issue',
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'GitHub Issue',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Keyboard-copied issue body',
      pageCaptureMethod: 'keyboard-copy'
    },
    sessionContext: {
      pageTitle: 'GitHub Issue',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Session fallback body',
      pageCaptureMethod: 'chrome-session'
    },
    plan: {
      shouldTryKeyboardFallback: true,
      shouldTrySessionFallback: true
    }
  })

  assert.deepEqual(merged, {
    pageTitle: 'GitHub Issue',
    pageUrl: 'https://github.com/example/repo/issues/424',
    pageText: 'Keyboard-copied issue body',
    pageCaptureMethod: 'keyboard-copy'
  })
})

test('mergeBrowserPageContexts upgrades to richer browser body while keeping the chosen capture method explicit', () => {
  const merged = mergeBrowserPageContexts({
    base: {
      pageTitle: 'Issue 424',
      pageUrl: null,
      pageText: 'Accessibility-derived page body',
      pageCaptureMethod: 'accessibility'
    },
    browserContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Browser automation body with more complete issue details',
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Keyboard body should also stay secondary',
      pageCaptureMethod: 'keyboard-copy'
    },
    sessionContext: null,
    plan: {
      shouldTryKeyboardFallback: true,
      shouldTrySessionFallback: false
    }
  })

  assert.deepEqual(merged, {
    pageTitle: 'Issue 424',
    pageUrl: 'https://github.com/example/repo/issues/424',
    pageText: 'Browser automation body with more complete issue details',
    pageCaptureMethod: 'browser-automation'
  })
})

test('mergeBrowserPageContexts preserves strong accessibility text when later browser fallbacks only add weak metadata', () => {
  const merged = mergeBrowserPageContexts({
    base: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Accessibility captured the full pricing body with plan details and upgrade notes.',
      pageCaptureMethod: 'accessibility'
    },
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    },
    sessionContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'chrome-session'
    },
    plan: {
      shouldTryKeyboardFallback: true,
      shouldTrySessionFallback: true
    }
  })

  assert.deepEqual(merged, {
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Accessibility captured the full pricing body with plan details and upgrade notes.',
    pageCaptureMethod: 'accessibility'
  })
})

test('resolveBrowserFallbackExecutionPlan schedules keyboard first and session next for weak chromium captures', () => {
  const withoutKeyboard = resolveBrowserFallbackExecutionPlan({
    plan: {
      shouldTryKeyboardFallback: true,
      shouldTrySessionFallback: true
    },
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }
  })

  const afterWeakKeyboard = resolveBrowserFallbackExecutionPlan({
    plan: {
      shouldTryKeyboardFallback: true,
      shouldTrySessionFallback: true
    },
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.deepEqual(withoutKeyboard, {
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: true
  })
  assert.deepEqual(afterWeakKeyboard, {
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: true
  })
})

test('resolveBrowserFallbackExecutionPlan suppresses session fallback once browser or keyboard already has page text', () => {
  const richBrowser = resolveBrowserFallbackExecutionPlan({
    plan: {
      shouldTryKeyboardFallback: true,
      shouldTrySessionFallback: true
    },
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing plans for support and sales teams',
      pageCaptureMethod: 'browser-automation'
    }
  })

  const richKeyboard = resolveBrowserFallbackExecutionPlan({
    plan: {
      shouldTryKeyboardFallback: true,
      shouldTrySessionFallback: true
    },
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing plans for support and sales teams',
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.deepEqual(richBrowser, {
    shouldTryKeyboardFallback: false,
    shouldTrySessionFallback: false
  })
  assert.deepEqual(richKeyboard, {
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: false
  })
})

test('resolveBrowserCaptureProgress advances browser fallback steps in order', () => {
  const initial = resolveBrowserCaptureProgress({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT
  })

  const afterWeakBrowser = resolveBrowserCaptureProgress({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }
  })

  const afterWeakKeyboard = resolveBrowserCaptureProgress({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.equal(initial.nextStep, 'browser')
  assert.equal(afterWeakBrowser.nextStep, 'keyboard')
  assert.equal(afterWeakKeyboard.nextStep, 'session')
})

test('resolveBrowserCaptureProgress stops once browser text is rich enough', () => {
  const result = resolveBrowserCaptureProgress({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing plans for support and sales teams',
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.equal(result.nextStep, 'none')
  assert.deepEqual(result.state, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: false,
    shouldTrySessionFallback: false
  })
})

test('resolveBrowserCaptureProgress continues to keyboard fallback when browser automation failed and the only prior page text came from accessibility', () => {
  const result = resolveBrowserCaptureProgress({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: {
      pageTitle: 'Town',
      pageUrl: 'https://www.town.com/',
      pageText: 'Accessibility recovered visible page text',
      pageCaptureMethod: 'accessibility'
    },
    browserContext: {
      pageTitle: null,
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'none'
    }
  })

  assert.equal(result.nextStep, 'keyboard')
  assert.deepEqual(result.state, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: true
  })
})

test('resolveBrowserCaptureProgress does not schedule session fallback for safari', () => {
  const result = resolveBrowserCaptureProgress({
    activeApp: 'Safari',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.equal(result.nextStep, 'none')
  assert.deepEqual(result.state, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: false
  })
})

test('shouldTryKeyboardFallback keeps retrying until the browser capture has real page text', () => {
  assert.equal(
    shouldTryKeyboardFallback({
      plan: {
        shouldTryKeyboardFallback: true,
        shouldTrySessionFallback: true
      },
      browserContext: {
        pageTitle: 'Tab title',
        pageUrl: null,
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      }
    }),
    true
  )

  assert.equal(
    shouldTryKeyboardFallback({
      plan: {
        shouldTryKeyboardFallback: true,
        shouldTrySessionFallback: true
      },
      browserContext: {
        pageTitle: 'Tab title',
        pageUrl: 'https://example.com',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      }
    }),
    true
  )

  assert.equal(
    shouldTryKeyboardFallback({
      plan: {
        shouldTryKeyboardFallback: true,
        shouldTrySessionFallback: true
      },
      browserContext: {
        pageTitle: 'Tab title',
        pageUrl: 'https://example.com',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      }
    }),
    true
  )
})

test('shouldTrySessionFallback waits for keyboard fallback only when browser capture is still weak', () => {
  assert.equal(
    shouldTrySessionFallback({
      plan: {
        shouldTryKeyboardFallback: true,
        shouldTrySessionFallback: true
      },
      browserContext: {
        pageTitle: 'Tab title',
        pageUrl: null,
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      },
      keyboardContext: null
    }),
    true
  )

  assert.equal(
    shouldTrySessionFallback({
      plan: {
        shouldTryKeyboardFallback: true,
        shouldTrySessionFallback: true
      },
      browserContext: {
        pageTitle: 'Tab title',
        pageUrl: null,
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      },
      keyboardContext: {
        pageTitle: 'Tab title',
        pageUrl: 'https://example.com',
        pageText: 'Keyboard body',
        pageCaptureMethod: 'keyboard-copy'
      }
    }),
    false
  )

  assert.equal(
    shouldTrySessionFallback({
      plan: {
        shouldTryKeyboardFallback: true,
        shouldTrySessionFallback: true
      },
      browserContext: {
        pageTitle: 'Tab title',
        pageUrl: 'https://example.com',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      },
      keyboardContext: null
    }),
    true
  )

  assert.equal(
    shouldTrySessionFallback({
      plan: {
        shouldTryKeyboardFallback: true,
        shouldTrySessionFallback: true
      },
      browserContext: {
        pageTitle: 'Tab title',
        pageUrl: 'https://example.com',
        pageText: 'Browser body',
        pageCaptureMethod: 'browser-automation'
      },
      keyboardContext: null
    }),
    false
  )
})

test('shouldSkipBrowserCapture only skips for high-signal social or coding contexts', () => {
  assert.equal(
    shouldSkipBrowserCapture({
      contextKind: 'coding',
      selectedText: 'x'.repeat(121),
      accessibilityText: null
    }),
    true
  )
  assert.equal(
    shouldSkipBrowserCapture({
      contextKind: 'social',
      selectedText: null,
      accessibilityText: 'y'.repeat(121)
    }),
    true
  )
  assert.equal(
    shouldSkipBrowserCapture({
      contextKind: 'browser',
      selectedText: 'x'.repeat(400),
      accessibilityText: null
    }),
    false
  )
  assert.equal(
    shouldSkipBrowserCapture({
      contextKind: 'browser',
      selectedText: null,
      accessibilityText: null,
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'p'.repeat(140)
    }),
    true
  )
  assert.equal(
    shouldSkipBrowserCapture({
      contextKind: 'document',
      selectedText: null,
      accessibilityText: null,
      pageTitle: 'Launch review',
      pageUrl: null,
      pageText: 'd'.repeat(140)
    }),
    true
  )
  assert.equal(
    shouldSkipBrowserCapture({
      contextKind: 'coding',
      selectedText: 'short',
      accessibilityText: null
    }),
    false
  )
  assert.equal(
    shouldSkipBrowserCapture({
      contextKind: 'browser',
      selectedText: null,
      accessibilityText: null,
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'p'.repeat(140),
      accessibilityDiagnostics: {
        lowSignal: true,
        lowSignalReason: 'browser-chrome-only'
      }
    }),
    false
  )
})

test('hasStrongAccessibilityPageContext requires substantial page text plus page metadata', () => {
  assert.equal(
    hasStrongAccessibilityPageContext({
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'p'.repeat(140)
    }),
    true
  )
  assert.equal(
    hasStrongAccessibilityPageContext({
      pageTitle: null,
      pageUrl: null,
      pageText: 'p'.repeat(140)
    }),
    false
  )
  assert.equal(
    hasStrongAccessibilityPageContext({
      pageTitle: 'Pricing overview',
      pageUrl: null,
      pageText: 'short note'
    }),
    false
  )
})

test('shouldSkipOcr skips when accessibility already has strong page context or long text', () => {
  assert.equal(
    shouldSkipOcr({
      accessibilityText: 'a'.repeat(260),
      pageTitle: null,
      pageUrl: null,
      pageText: null
    }),
    true
  )
  assert.equal(
    shouldSkipOcr({
      accessibilityText: 'short note',
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'p'.repeat(140)
    }),
    true
  )
  assert.equal(
    shouldSkipOcr({
      accessibilityText: 'short note',
      pageTitle: null,
      pageUrl: null,
      pageText: 'p'.repeat(140)
    }),
    false
  )
  assert.equal(
    shouldSkipOcr({
      accessibilityText: 'short note',
      pageTitle: null,
      pageUrl: null,
      pageText: null
    }),
    false
  )
  assert.equal(
    shouldSkipOcr({
      accessibilityText: 'a'.repeat(260),
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'p'.repeat(140),
      accessibilityDiagnostics: {
        lowSignal: true,
        lowSignalReason: 'title-only'
      }
    }),
    false
  )
})

test('resolveAccessibilityFallbackPriority maps low-signal accessibility reasons to fallback bias', () => {
  assert.deepEqual(
    resolveAccessibilityFallbackPriority({
      contextKind: 'browser',
      accessibilityDiagnostics: {
        lowSignal: true,
        lowSignalReason: 'browser-chrome-only'
      }
    }),
    {
      shouldTreatAccessibilityAsWeak: true,
      shouldPreferBrowserFallback: true,
      shouldSuppressScreenFallback: false
    }
  )

  assert.deepEqual(
    resolveAccessibilityFallbackPriority({
      contextKind: 'social',
      accessibilityDiagnostics: {
        lowSignal: true,
        lowSignalReason: 'social-chrome-only'
      }
    }),
    {
      shouldTreatAccessibilityAsWeak: true,
      shouldPreferBrowserFallback: false,
      shouldSuppressScreenFallback: false
    }
  )
})

test('shouldCaptureScreenContext only captures the screen when OCR is still needed', () => {
  assert.equal(
    shouldCaptureScreenContext({
      canSkipOcr: true
    }),
    false
  )
  assert.equal(
    shouldCaptureScreenContext({
      canSkipOcr: false
    }),
    true
  )
})

test('resolveScreenCapturePlan explains whether screen capture is skipped or required', () => {
  assert.deepEqual(
    resolveScreenCapturePlan({
      canSkipOcr: true
    }),
    {
      shouldCaptureScreen: false,
      reason: 'strong-accessibility-context'
    }
  )
  assert.deepEqual(
    resolveScreenCapturePlan({
      canSkipOcr: false
    }),
    {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal'
    }
  )
})

test('resolveFinalScreenCapturePlan skips screen capture once browser fallback has already recovered strong page text', () => {
  assert.deepEqual(
    resolveFinalScreenCapturePlan({
      accessibilityText: 'short note',
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4),
        pageCaptureMethod: 'browser-automation'
      }
    }),
    {
      shouldCaptureScreen: false,
      reason: 'strong-accessibility-context'
    }
  )

  assert.deepEqual(
    resolveFinalScreenCapturePlan({
      accessibilityText: 'short note',
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'accessibility'
      }
    }),
    {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal'
    }
  )

  assert.deepEqual(
    resolveFinalScreenCapturePlan({
      accessibilityText: 'Pricing overview https://example.com/pricing',
      accessibilityDiagnostics: {
        lowSignal: true,
        lowSignalReason: 'browser-chrome-only'
      },
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'accessibility'
      }
    }),
    {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal'
    }
  )
})

test('resolveScreenCaptureDecisionReason reuses the final screen-capture semantics for reporting-friendly reasons', () => {
  assert.equal(
    resolveScreenCaptureDecisionReason({
      accessibilityText: 'short note',
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4)
      }
    }),
    'strong-accessibility-context'
  )

  assert.equal(
    resolveScreenCaptureDecisionReason({
      accessibilityText: 'short note',
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      }
    }),
    'needs-screen-signal'
  )

  assert.equal(
    resolveScreenCaptureDecisionReason({
      accessibilityText: 'Pricing overview https://example.com/pricing',
      accessibilityDiagnostics: {
        lowSignal: true,
        lowSignalReason: 'browser-chrome-only'
      },
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      }
    }),
    'needs-screen-signal'
  )
})

test('resolveScreenContextCaptureRequest skips collection entirely when the final page context is already strong', () => {
  assert.deepEqual(
    resolveScreenContextCaptureRequest({
      accessibilityText: 'short fallback text',
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4),
        pageCaptureMethod: 'browser-automation'
      },
      canSkipOcr: false
    }),
    {
      plan: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context'
      },
      options: null
    }
  )
})

test('resolveScreenContextCaptureRequest carries the runtime OCR options through when screen capture is still needed', () => {
  assert.deepEqual(
    resolveScreenContextCaptureRequest({
      accessibilityText: null,
      pageContext: {
        pageTitle: 'ChatGPT',
        pageUrl: null,
        pageText: null,
        pageCaptureMethod: 'none'
      },
      canSkipOcr: false,
      overrides: {
        suppressScreenOcr: true,
        forceNativeScreenCapture: true
      }
    }),
    {
      plan: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal'
      },
      options: {
        skipOcr: false,
        suppressScreenOcr: true,
        forceNativeScreenCapture: true
      }
    }
  )
})

test('resolveScreenContextCaptureRequest keeps forced screen capture screenshot-only when OCR was already skippable', () => {
  assert.deepEqual(
    resolveScreenContextCaptureRequest({
      accessibilityText:
        'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4),
      pageContext: {
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Visible pricing matrix and seat details. '.repeat(4),
        pageCaptureMethod: 'browser-automation'
      },
      canSkipOcr: true,
      overrides: {
        forceScreenCapture: true,
        forceNativeScreenCapture: true
      }
    }),
    {
      plan: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal'
      },
      options: {
        skipOcr: true,
        suppressScreenOcr: undefined,
        forceNativeScreenCapture: true
      }
    }
  )
})

test('resolveScreenContextExecutionPlan makes the runtime branch explicit for capture and skip paths', () => {
  assert.deepEqual(
    resolveScreenContextExecutionPlan({
      plan: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context'
      },
      options: null
    }),
    {
      plan: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context'
      },
      shouldCapture: false,
      options: null,
      skippedResult: {
        screenContext: {
          screenshotPath: null,
          screenText: null,
          screenCaptureMethod: 'none'
        },
        sourceSelection: null
      }
    }
  )

  assert.deepEqual(
    resolveScreenContextExecutionPlan({
      plan: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal'
      },
      options: {
        skipOcr: false,
        suppressScreenOcr: true,
        forceNativeScreenCapture: true
      }
    }),
    {
      plan: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal'
      },
      shouldCapture: true,
      options: {
        skipOcr: false,
        suppressScreenOcr: true,
        forceNativeScreenCapture: true
      },
      skippedResult: {
        screenContext: {
          screenshotPath: null,
          screenText: null,
          screenCaptureMethod: 'none'
        },
        sourceSelection: null
      }
    }
  )
})

test('resolveCaptureDecisions prefers frontmost app, selected clipboard text, and flags skip heuristics', () => {
  const result = resolveCaptureDecisions({
    frontmost: {
      activeApp: 'Google Chrome',
      windowTitle: 'Home / X'
    },
    clipboardSelectedText: 'x'.repeat(150),
    accessibilityContext: {
      appName: 'Safari',
      windowTitle: 'Fallback title',
      selectedText: 'selected from ax',
      accessibilityText: '返信する前に文脈を確認する。' + 'a'.repeat(260),
      pageTitle: 'For you',
      pageUrl: 'https://x.com/home',
      pageText: null
    }
  })

  assert.equal(result.resolvedActiveApp, 'Google Chrome')
  assert.equal(result.resolvedWindowTitle, 'Home / X')
  assert.equal(result.selectedText, 'x'.repeat(150))
  assert.equal(result.preliminaryKind, 'social')
  assert.equal(result.canSkipBrowserCapture, true)
  assert.equal(result.canSkipOcr, true)
})

test('resolveContextIdentity prefers frontmost app metadata and falls back to accessibility identity', () => {
  assert.deepEqual(
    resolveContextIdentity({
      frontmost: {
        activeApp: 'Dia',
        windowTitle: 'Pricing overview'
      },
      clipboardSelectedText: null,
      accessibilityContext: {
        appName: 'Safari',
        windowTitle: 'Fallback title',
        selectedText: null,
        accessibilityText: null,
        pageTitle: null,
        pageUrl: null,
        pageText: null
      }
    }),
    {
      resolvedActiveApp: 'Dia',
      resolvedWindowTitle: 'Pricing overview'
    }
  )

  assert.deepEqual(
    resolveContextIdentity({
      frontmost: {
        activeApp: 'loginwindow',
        windowTitle: null
      },
      clipboardSelectedText: null,
      accessibilityContext: {
        appName: 'LINE',
        windowTitle: 'ログイン',
        selectedText: null,
        accessibilityText: null,
        pageTitle: null,
        pageUrl: null,
        pageText: null
      }
    }),
    {
      resolvedActiveApp: 'LINE',
      resolvedWindowTitle: 'ログイン'
    }
  )

  assert.deepEqual(
    resolveContextIdentity({
      frontmost: {
        activeApp: null,
        windowTitle: null
      },
      clipboardSelectedText: null,
      accessibilityContext: {
        appName: 'Notion',
        windowTitle: 'Weekly plan',
        selectedText: null,
        accessibilityText: null,
        pageTitle: null,
        pageUrl: null,
        pageText: null
      }
    }),
    {
      resolvedActiveApp: 'Notion',
      resolvedWindowTitle: 'Weekly plan'
    }
  )
})

test('resolveCaptureSurface centralizes the resolved app/window identity shared by capture planning', () => {
  assert.deepEqual(
    resolveCaptureSurface({
      frontmost: {
        activeApp: 'loginwindow',
        windowTitle: null
      },
      accessibilityContext: {
        appName: 'Dia',
        windowTitle: 'Issue 424'
      }
    }),
    {
      resolvedActiveApp: 'Dia',
      resolvedWindowTitle: 'Issue 424'
    }
  )

  assert.deepEqual(
    resolveCaptureSurface({
      frontmost: {
        activeApp: 'Safari',
        windowTitle: 'Pricing'
      },
      accessibilityContext: {
        appName: 'loginwindow',
        windowTitle: 'Ignored'
      }
    }),
    {
      resolvedActiveApp: 'Safari',
      resolvedWindowTitle: 'Pricing'
    }
  )
})

test('resolveClipboardSelectionCapturePolicy attempts clipboard capture for browser-like or weak surfaces only', () => {
  assert.deepEqual(
    resolveClipboardSelectionCapturePolicy({
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing'
      },
      accessibilityContext: {
        appName: 'Google Chrome',
        windowTitle: 'Pricing',
        selectedText: null,
        selectedTextSource: 'none',
        accessibilityText: 'Address bar chrome',
        accessibilityCaptureMethod: 'ax-tree',
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Short preview only'
      }
    }),
    {
      shouldAttemptClipboardSelection: true,
      reason: 'browser-surface'
    }
  )

  assert.deepEqual(
    resolveClipboardSelectionCapturePolicy({
      frontmost: {
        activeApp: 'Mail',
        windowTitle: 'Re: launch plan'
      },
      accessibilityContext: {
        appName: 'Mail',
        windowTitle: 'Re: launch plan',
        selectedText: null,
        selectedTextSource: 'none',
        accessibilityText:
          'From pm@example.com To team@example.com Subject Re: launch plan 本文では画面文脈の精度改善を主眼に進めたいです。',
        accessibilityCaptureMethod: 'ax-tree',
        pageTitle: 'Re: launch plan',
        pageUrl: null,
        pageText: null
      }
    }),
    {
      shouldAttemptClipboardSelection: false,
      reason: 'strong-native-context'
    }
  )

  assert.deepEqual(
    resolveClipboardSelectionCapturePolicy({
      frontmost: {
        activeApp: 'Slack',
        windowTitle: 'mk-biz'
      },
      accessibilityContext: {
        appName: 'Slack',
        windowTitle: 'mk-biz',
        selectedText: null,
        selectedTextSource: 'none',
        accessibilityText: 'short note',
        accessibilityCaptureMethod: 'ax-tree',
        pageTitle: null,
        pageUrl: null,
        pageText: null
      }
    }),
    {
      shouldAttemptClipboardSelection: true,
      reason: 'weak-accessibility-context'
    }
  )

  assert.deepEqual(
    resolveClipboardSelectionCapturePolicy({
      frontmost: {
        activeApp: 'Cursor',
        windowTitle: 'context-reader.ts'
      },
      accessibilityContext: {
        appName: 'Cursor',
        windowTitle: 'context-reader.ts',
        selectedText: 'const result = computeContext()',
        selectedTextSource: 'focus-chain-selected-text',
        accessibilityText: 'const result = computeContext()',
        accessibilityCaptureMethod: 'ax-tree',
        pageTitle: 'context-reader.ts',
        pageUrl: null,
        pageText: null
      }
    }),
    {
      shouldAttemptClipboardSelection: false,
      reason: 'existing-selection'
    }
  )
})

test('resolveSelectedText prefers clipboard capture and preserves accessibility source fallback', () => {
  assert.deepEqual(
    resolveSelectedText({
      frontmost: {
        activeApp: 'Dia',
        windowTitle: 'Pricing overview'
      },
      clipboardSelectedText: 'copied selection',
      accessibilityContext: {
        appName: 'Dia',
        windowTitle: 'Pricing overview',
        selectedText: 'ax selection',
        selectedTextSource: 'accessibility-selection',
        accessibilityText: null,
        pageTitle: null,
        pageUrl: null,
        pageText: null
      }
    }),
    {
      selectedText: 'copied selection',
      selectedTextSource: 'clipboard-selection'
    }
  )

  assert.deepEqual(
    resolveSelectedText({
      frontmost: {
        activeApp: 'Dia',
        windowTitle: 'Pricing overview'
      },
      clipboardSelectedText: null,
      accessibilityContext: {
        appName: 'Dia',
        windowTitle: 'Pricing overview',
        selectedText: 'ax selection',
        selectedTextSource: 'accessibility-selection',
        accessibilityText: null,
        pageTitle: null,
        pageUrl: null,
        pageText: null
      }
    }),
    {
      selectedText: 'ax selection',
      selectedTextSource: 'accessibility-selection'
    }
  )
})

test('resolveRetainedSelectedText explains why a selected-text candidate is kept or dropped', () => {
  assert.deepEqual(
    resolveRetainedSelectedText({
      candidate: null,
      source: 'clipboard-selection',
      accessibilityText: null,
      pageUrl: null,
      pageText: null
    }),
    {
      selectedText: null,
      selectedTextSource: 'none',
      reason: 'missing'
    }
  )

  assert.deepEqual(
    resolveRetainedSelectedText({
      candidate: 'コミットまたはプッシュ',
      source: 'clipboard-selection',
      accessibilityText: 'task body',
      pageUrl: null,
      pageText: null
    }),
    {
      selectedText: null,
      selectedTextSource: 'none',
      reason: 'ui-noise'
    }
  )

  assert.deepEqual(
    resolveRetainedSelectedText({
      candidate: 'https://example.com/pricing',
      source: 'clipboard-selection',
      accessibilityText: 'Pricing plans help teams standardize AI workflows across support and sales.'.repeat(2),
      pageUrl: 'https://example.com/pricing',
      pageText: 'Visible pricing matrix and seat details.'.repeat(2)
    }),
    {
      selectedText: null,
      selectedTextSource: 'none',
      reason: 'url-only-with-richer-context'
    }
  )

  assert.deepEqual(
    resolveRetainedSelectedText({
      candidate: 'Need to compare pricing tiers for support seats',
      source: 'clipboard-selection',
      accessibilityText: 'Pricing plans',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Visible pricing matrix'
    }),
    {
      selectedText: 'Need to compare pricing tiers for support seats',
      selectedTextSource: 'clipboard-selection',
      reason: 'accepted'
    }
  )
})

test('resolveSelectedText drops clipboard selections that are only browser urls or app chrome when richer context already exists', () => {
  assert.deepEqual(
    resolveSelectedText({
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Town - 固定済み - Google Chrome - dev'
      },
      clipboardSelectedText: 'https://www.town.com',
      accessibilityContext: {
        appName: 'Google Chrome',
        windowTitle: 'Town - 固定済み - Google Chrome - dev',
        selectedText: null,
        selectedTextSource: 'none',
        accessibilityText: 'Address bar and browser chrome',
        pageTitle: 'Town - 固定済み - Google Chrome - dev',
        pageUrl: 'https://www.town.com/',
        pageText: 'Recovered browser page body with the actual page content and summary-worthy text.'
      }
    }),
    {
      selectedText: null,
      selectedTextSource: 'none'
    }
  )

  assert.deepEqual(
    resolveSelectedText({
      frontmost: {
        activeApp: 'ChatGPT',
        windowTitle: 'ChatGPT'
      },
      clipboardSelectedText: 'レビューする',
      accessibilityContext: {
        appName: 'ChatGPT',
        windowTitle: 'ChatGPT',
        selectedText: null,
        selectedTextSource: 'none',
        accessibilityText:
          'Discord の live fallback を、その場しのぎではなく正式な regression に乗せました。Codex/ChatGPT 系は AX が弱いです。',
        pageTitle: null,
        pageUrl: null,
        pageText: null
      }
    }),
    {
      selectedText: null,
      selectedTextSource: 'none'
    }
  )
})

test('buildPreliminaryContextClassificationInput combines selected text with accessibility text for classification', () => {
  assert.deepEqual(
    buildPreliminaryContextClassificationInput({
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Home / X'
      },
      clipboardSelectedText: 'selected from clipboard',
      resolvedActiveApp: 'Google Chrome',
      resolvedWindowTitle: 'Home / X',
      selectedText: 'selected from clipboard',
      selectedTextSource: 'clipboard-selection',
      accessibilityContext: {
        appName: 'Google Chrome',
        windowTitle: 'Home / X',
        selectedText: null,
        accessibilityText: '返信する前に文脈を確認する。',
        pageTitle: 'For you',
        pageUrl: 'https://x.com/home',
        pageText: null
      }
    }),
    {
      activeApp: 'Google Chrome',
      windowTitle: 'Home / X',
      pageTitle: 'For you',
      pageUrl: 'https://x.com/home',
      accessibilityText: 'selected from clipboard\n返信する前に文脈を確認する。',
      screenText: null
    }
  )
})

test('resolveCaptureDecisions can skip browser capture when accessibility already provides strong page context', () => {
  const result = resolveCaptureDecisions({
    frontmost: {
      activeApp: 'Dia',
      windowTitle: 'Pricing overview'
    },
    clipboardSelectedText: null,
    accessibilityContext: {
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      selectedText: null,
      accessibilityText: 'Visible pricing page context '.repeat(12),
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4)
    }
  })

  assert.equal(result.preliminaryKind, 'browser')
  assert.equal(result.canSkipBrowserCapture, true)
  assert.equal(result.canSkipOcr, true)
})

test('resolveCaptureDecisions falls back to accessibility identity and keeps browser capture enabled for weak signal', () => {
  const result = resolveCaptureDecisions({
    frontmost: {
      activeApp: null,
      windowTitle: null
    },
    clipboardSelectedText: null,
    accessibilityContext: {
      appName: 'Notion',
      windowTitle: 'Weekly plan',
      selectedText: null,
      accessibilityText: 'short note',
      pageTitle: null,
      pageUrl: null,
      pageText: null
    }
  })

  assert.equal(result.resolvedActiveApp, 'Notion')
  assert.equal(result.resolvedWindowTitle, 'Weekly plan')
  assert.equal(result.selectedText, null)
  assert.equal(result.preliminaryKind, 'document')
  assert.equal(result.canSkipBrowserCapture, false)
  assert.equal(result.canSkipOcr, false)
})

test('resolveContextCapturePlan assembles the initial page context and downstream capture plans in one pure step', () => {
  const result = resolveContextCapturePlan({
    frontmost: {
      activeApp: 'Dia',
      windowTitle: 'Pricing overview'
    },
    clipboardSelectedText: null,
    accessibilityContext: {
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      selectedText: null,
      accessibilityText: 'short note',
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: null
    }
  })

  assert.equal(result.resolvedActiveApp, 'Dia')
  assert.equal(result.resolvedWindowTitle, 'Pricing overview')
  assert.deepEqual(result.initialPageContext, {
    pageTitle: 'Pricing overview',
    pageUrl: 'https://example.com/pricing',
    pageText: null,
    pageCaptureMethod: 'accessibility'
  })
  assert.equal(result.browserProgress.nextStep, 'browser')
  assert.deepEqual(result.browserProgress.state, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: true
  })
  assert.deepEqual(result.screenCapturePlan, {
    shouldCaptureScreen: true,
    reason: 'needs-screen-signal'
  })
})

test('resolveContextCapturePreparation packages clipboard policy and the downstream plan input before runtime capture begins', () => {
  const result = resolveContextCapturePreparation({
    frontmost: {
      activeApp: 'Google Chrome',
      windowTitle: 'Pricing overview'
    },
    clipboardSelectedText: null,
    accessibilityContext: {
      appName: 'Google Chrome',
      windowTitle: 'Pricing overview',
      selectedText: null,
      accessibilityText: 'short note',
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: null
    },
    accessibilityDiagnostics: {
      lowSignal: true,
      lowSignalReason: 'browser-chrome-only'
    }
  })

  assert.deepEqual(result.clipboardSelectionPolicy, {
    shouldAttemptClipboardSelection: true,
    reason: 'browser-surface'
  })
  assert.equal(result.shouldAttemptClipboardSelection, true)
  assert.deepEqual(result.capturePlanInput, {
    frontmost: {
      activeApp: 'Google Chrome',
      windowTitle: 'Pricing overview'
    },
    clipboardSelectedText: null,
    accessibilityDiagnostics: {
      lowSignal: true,
      lowSignalReason: 'browser-chrome-only'
    },
    accessibilityContext: {
      appName: 'Google Chrome',
      windowTitle: 'Pricing overview',
      selectedText: null,
      accessibilityText: 'short note',
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: null
    }
  })
})

test('resolveContextCaptureRuntimeState derives the post-clipboard capture plan and initial browser loop together', () => {
  const result = resolveContextCaptureRuntimeState({
    capturePlanInput: {
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing overview'
      },
      clipboardSelectedText: null,
      accessibilityContext: {
        appName: 'Google Chrome',
        windowTitle: 'Pricing overview',
        selectedText: null,
        selectedTextSource: 'none',
        accessibilityText: 'short note',
        accessibilityCaptureMethod: 'macos-accessibility',
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: null
      },
      accessibilityDiagnostics: {
        lowSignal: true,
        lowSignalReason: 'browser-chrome-only'
      }
    },
    clipboardSelectedText: 'copied pricing snippet'
  })

  assert.equal(result.resolvedActiveApp, 'Google Chrome')
  assert.equal(result.selectedText, 'copied pricing snippet')
  assert.equal(result.selectedTextSource, 'clipboard-selection')
  assert.equal(result.browserLoopState.execution.requests[0]?.step, 'browser')
  assert.deepEqual(result.browserLoopState.execution.plan.initial.finalPageContext, {
    pageTitle: 'Pricing overview',
    pageUrl: 'https://example.com/pricing',
    pageText: null,
    pageCaptureMethod: 'accessibility'
  })
  assert.equal(result.browserLoopState.execution.plan.initial.shouldCollectBrowserContext, true)
})

test('resolveContextCapturePlan does not treat title-only accessibility metadata as a captured page context', () => {
  const result = resolveContextCapturePlan({
    frontmost: {
      activeApp: 'Google Chrome',
      windowTitle: 'Pricing'
    },
    accessibilityContext: {
      appName: 'Google Chrome',
      windowTitle: 'Pricing',
      selectedText: null,
      selectedTextSource: 'none',
      accessibilityText: null,
      accessibilityCaptureMethod: 'none',
      pageTitle: 'Pricing',
      pageUrl: null,
      pageText: null
    },
    clipboardSelectedText: null
  })

  assert.deepEqual(result.initialPageContext, EMPTY_PAGE_CONTEXT)
  assert.equal(result.canSkipBrowserCapture, false)
  assert.equal(result.browserProgress.nextStep, 'browser')
})

test('resolveContextCapturePlan supports debug overrides that force browser and screen capture paths on', () => {
  const result = resolveContextCapturePlan(
    {
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing overview'
      },
      clipboardSelectedText: null,
      accessibilityContext: {
        appName: 'Google Chrome',
        windowTitle: 'Pricing overview',
        selectedText: null,
        accessibilityText: 'Visible pricing page context '.repeat(12),
        pageTitle: 'Pricing overview',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(4)
      }
    },
    {
      forceBrowserCapture: true,
      forceScreenCapture: true
    }
  )

  assert.equal(result.canSkipBrowserCapture, false)
  assert.equal(result.canSkipOcr, false)
  assert.equal(result.browserProgress.nextStep, 'browser')
  assert.deepEqual(result.screenCapturePlan, {
    shouldCaptureScreen: true,
    reason: 'needs-screen-signal'
  })
})

test('applyAccessibilityPageContextDebugOverrides can suppress only accessibility page text while retaining page metadata', () => {
  assert.deepEqual(
    applyAccessibilityPageContextDebugOverrides(
      {
        pageTitle: 'Town',
        pageUrl: 'https://www.town.com/',
        pageText: 'Strong accessibility page text',
        pageCaptureMethod: 'accessibility'
      },
      {
        suppressAccessibilityPageText: true
      }
    ),
    {
      pageTitle: 'Town',
      pageUrl: 'https://www.town.com/',
      pageText: null,
      pageCaptureMethod: 'accessibility'
    }
  )

  assert.deepEqual(
    applyAccessibilityPageContextDebugOverrides(
      {
        pageTitle: 'Town',
        pageUrl: 'https://www.town.com/',
        pageText: 'Recovered browser text',
        pageCaptureMethod: 'browser-automation'
      },
      {
        suppressAccessibilityPageText: true
      }
    ),
    {
      pageTitle: 'Town',
      pageUrl: 'https://www.town.com/',
      pageText: 'Recovered browser text',
      pageCaptureMethod: 'browser-automation'
    }
  )
})

test('resolveContextCapturePlan can suppress the initial accessibility page text while keeping browser capture enabled', () => {
  const result = resolveContextCapturePlan(
    {
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Town - dev'
      },
      clipboardSelectedText: null,
      accessibilityContext: {
        appName: 'Google Chrome',
        windowTitle: 'Town - dev',
        selectedText: null,
        accessibilityText: 'Strong accessibility text',
        pageTitle: 'Town',
        pageUrl: 'https://www.town.com/',
        pageText: 'Strong accessibility page text'
      }
    },
    {
      forceBrowserCapture: true,
      suppressAccessibilityPageText: true
    }
  )

  assert.equal(result.initialPageContext.pageCaptureMethod, 'accessibility')
  assert.equal(result.initialPageContext.pageText, null)
  assert.equal(result.browserProgress.nextStep, 'browser')
})

test('applyBrowserCaptureDebugOverrides can suppress browser and keyboard page text to force later fallback steps', () => {
  const browserContext = {
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Recovered from browser automation',
    pageCaptureMethod: 'browser-automation' as const
  }
  const keyboardContext = {
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Recovered from keyboard copy',
    pageCaptureMethod: 'keyboard-copy' as const
  }

  const overridden = applyBrowserCaptureDebugOverrides({
    browserContext,
    keyboardContext,
    overrides: {
      suppressBrowserPageText: true,
      suppressKeyboardPageText: true
    }
  })

  assert.deepEqual(overridden.browserContext, {
    ...browserContext,
    pageText: null
  })
  assert.deepEqual(overridden.keyboardContext, {
    ...keyboardContext,
    pageText: null
  })
})

test('resolveBrowserCapturePlan disables browser capture when heuristics already say to skip it', () => {
  const plan = resolveBrowserCapturePlan({
    activeApp: 'Slack',
    canSkipBrowserCapture: true,
    pageContext: EMPTY_PAGE_CONTEXT
  })

  assert.deepEqual(plan, {
    shouldCaptureBrowserPage: false,
    shouldTryKeyboardFallback: false,
    shouldTrySessionFallback: false
  })
})

test('resolveBrowserCapturePlan enables browser fallbacks for chromium apps with no captured page text yet', () => {
  const plan = resolveBrowserCapturePlan({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT
  })

  assert.deepEqual(plan, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: true
  })
})

test('resolveBrowserCapturePlan avoids fallback retries once page text already exists', () => {
  const plan = resolveBrowserCapturePlan({
    activeApp: 'Safari',
    canSkipBrowserCapture: false,
    pageContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Visible pricing body',
      pageCaptureMethod: 'accessibility'
    }
  })

  assert.deepEqual(plan, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: false
  })
})

test('resolveBrowserCapturePlan still allows deeper browser fallbacks when the only page text came from accessibility', () => {
  const plan = resolveBrowserCapturePlan({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: {
      pageTitle: 'Town',
      pageUrl: 'https://www.town.com/',
      pageText: 'Accessibility recovered visible page text',
      pageCaptureMethod: 'accessibility'
    }
  })

  assert.deepEqual(plan, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: true
  })
})

test('resolveBrowserCaptureExecutionState skips browser work entirely when capture can be skipped', () => {
  const state = resolveBrowserCaptureExecutionState({
    activeApp: 'Dia',
    canSkipBrowserCapture: true,
    pageContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Already captured from accessibility',
      pageCaptureMethod: 'accessibility'
    }
  })

  assert.deepEqual(state, {
    shouldCaptureBrowserPage: false,
    shouldTryKeyboardFallback: false,
    shouldTrySessionFallback: false
  })
})

test('resolveBrowserCaptureExecutionState requests keyboard and session fallbacks after weak browser capture', () => {
  const state = resolveBrowserCaptureExecutionState({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.deepEqual(state, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: true
  })
})

test('resolveBrowserCaptureExecutionState stops at keyboard fallback once page text is recovered', () => {
  const state = resolveBrowserCaptureExecutionState({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Recovered by select-all copy',
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.deepEqual(state, {
    shouldCaptureBrowserPage: true,
    shouldTryKeyboardFallback: true,
    shouldTrySessionFallback: false
  })
})

test('resolveBrowserCaptureOutcome keeps the base context untouched when browser capture can be skipped', () => {
  const pageContext = {
    pageTitle: 'Weekly plan',
    pageUrl: 'https://example.com/weekly-plan',
    pageText: 'Captured from accessibility already.',
    pageCaptureMethod: 'accessibility' as const
  }

  const outcome = resolveBrowserCaptureOutcome({
    activeApp: 'Dia',
    canSkipBrowserCapture: true,
    pageContext
  })

  assert.equal(outcome.initialNextStep, 'none')
  assert.deepEqual(outcome.attemptedSteps, [])
  assert.deepEqual(outcome.pageContext, pageContext)
  assert.equal(outcome.browserCaptureMethod, null)
})

test('resolveBrowserCaptureOutcome records browser then keyboard fallback when keyboard recovers page text', () => {
  const outcome = resolveBrowserCaptureOutcome({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Recovered by select-all copy',
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.equal(outcome.initialNextStep, 'browser')
  assert.equal(outcome.afterBrowserNextStep, 'keyboard')
  assert.equal(outcome.afterKeyboardNextStep, 'none')
  assert.deepEqual(outcome.attemptedSteps, ['browser', 'keyboard'])
  assert.equal(outcome.pageContext.pageCaptureMethod, 'keyboard-copy')
  assert.equal(outcome.pageContext.pageText, 'Recovered by select-all copy')
})

test('resolveBrowserCaptureOutcome upgrades weak accessibility metadata to browser automation once real page text is recovered', () => {
  const outcome = resolveBrowserCaptureOutcome({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'accessibility'
    },
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered browser automation body with the actual pricing details.',
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.equal(outcome.initialNextStep, 'browser')
  assert.equal(outcome.afterBrowserNextStep, 'none')
  assert.deepEqual(outcome.attemptedSteps, ['browser'])
  assert.equal(outcome.pageContext.pageCaptureMethod, 'browser-automation')
  assert.equal(
    outcome.pageContext.pageText,
    'Recovered browser automation body with the actual pricing details.'
  )
})

test('resolveBrowserCaptureOutcome records the session fallback when both earlier browser captures stay weak', () => {
  const outcome = resolveBrowserCaptureOutcome({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    },
    sessionContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered from session metadata.',
      pageCaptureMethod: 'chrome-session'
    }
  })

  assert.equal(outcome.afterBrowserNextStep, 'keyboard')
  assert.equal(outcome.afterKeyboardNextStep, 'session')
  assert.deepEqual(outcome.attemptedSteps, ['browser', 'keyboard', 'session'])
  assert.equal(outcome.pageContext.pageCaptureMethod, 'chrome-session')
  assert.equal(outcome.pageContext.pageText, 'Recovered from session metadata.')
})

test('resolveBrowserCaptureOutcome retains accessibility as the winner when browser fallbacks never recover page text', () => {
  const outcome = resolveBrowserCaptureOutcome({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Accessibility captured the full pricing body with plan details and upgrade notes.',
      pageCaptureMethod: 'accessibility'
    },
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    },
    sessionContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'chrome-session'
    }
  })

  assert.deepEqual(outcome.attemptedSteps, ['browser', 'keyboard', 'session'])
  assert.equal(outcome.pageContext.pageCaptureMethod, 'accessibility')
  assert.equal(
    outcome.pageContext.pageText,
    'Accessibility captured the full pricing body with plan details and upgrade notes.'
  )
})

test('resolveBrowserCaptureActionPlan mirrors the staged browser fallback execution decisions', () => {
  const basePageContext = {
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none' as const
  }

  assert.deepEqual(
    resolveBrowserCaptureActionPlan({
      activeApp: 'Google Chrome',
      canSkipBrowserCapture: false,
      pageContext: basePageContext
    }),
    {
      shouldRunBrowserCapture: true,
      shouldRunKeyboardFallback: false,
      shouldRunSessionFallback: false,
      initialNextStep: 'browser',
      afterBrowserNextStep: 'browser',
      afterKeyboardNextStep: 'browser'
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureActionPlan({
      activeApp: 'Google Chrome',
      canSkipBrowserCapture: false,
      pageContext: basePageContext,
      browserContext: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      }
    }),
    {
      shouldRunBrowserCapture: false,
      shouldRunKeyboardFallback: true,
      shouldRunSessionFallback: false,
      initialNextStep: 'browser',
      afterBrowserNextStep: 'keyboard',
      afterKeyboardNextStep: 'keyboard'
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureActionPlan({
      activeApp: 'Google Chrome',
      canSkipBrowserCapture: false,
      pageContext: basePageContext,
      browserContext: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      },
      keyboardContext: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'keyboard-copy'
      }
    }),
    {
      shouldRunBrowserCapture: false,
      shouldRunKeyboardFallback: false,
      shouldRunSessionFallback: true,
      initialNextStep: 'browser',
      afterBrowserNextStep: 'keyboard',
      afterKeyboardNextStep: 'session'
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureActionPlan({
      activeApp: 'Google Chrome',
      canSkipBrowserCapture: false,
      pageContext: basePageContext,
      browserContext: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      },
      keyboardContext: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Visible pricing details',
        pageCaptureMethod: 'keyboard-copy'
      }
    }),
    {
      shouldRunBrowserCapture: false,
      shouldRunKeyboardFallback: false,
      shouldRunSessionFallback: false,
      initialNextStep: 'browser',
      afterBrowserNextStep: 'keyboard',
      afterKeyboardNextStep: 'none'
    }
  )
})

test('resolveBrowserCaptureStepPlan exposes the ordered fallback steps still required at each stage', () => {
  const initial = resolveBrowserCaptureStepPlan({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT
  })

  const afterWeakBrowser = resolveBrowserCaptureStepPlan({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }
  })

  const afterWeakKeyboard = resolveBrowserCaptureStepPlan({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  const recovered = resolveBrowserCaptureStepPlan({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Recovered issue body',
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.deepEqual(initial.steps, ['browser'])
  assert.deepEqual(afterWeakBrowser.steps, ['keyboard'])
  assert.deepEqual(afterWeakKeyboard.steps, ['session'])
  assert.deepEqual(recovered.steps, [])
})

test('resolveBrowserCaptureExecutionPlan snapshots the staged runtime decisions in one pure helper', () => {
  const plan = resolveBrowserCaptureExecutionPlan({
    activeApp: 'Dia',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    },
    sessionContext: {
      pageTitle: 'Issue #424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'Recovered from Chromium session history.',
      pageCaptureMethod: 'chrome-session'
    }
  })

  assert.deepEqual(plan.initial.steps, ['browser'])
  assert.deepEqual(plan.afterBrowser.steps, ['keyboard'])
  assert.deepEqual(plan.afterKeyboard.steps, ['session'])
  assert.deepEqual(plan.final.steps, [])
  assert.deepEqual(plan.final.outcome.attemptedSteps, ['browser', 'keyboard', 'session'])
  assert.equal(plan.final.outcome.pageContext.pageCaptureMethod, 'chrome-session')
  assert.equal(plan.final.outcome.pageContext.pageText, 'Recovered from Chromium session history.')
})

test('resolveBrowserCaptureRuntimeState packages runnable fallback actions and final outcome together', () => {
  const runtimeState = resolveBrowserCaptureRuntimeState({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.deepEqual(runtimeState.actionPlan, {
    shouldRunBrowserCapture: false,
    shouldRunKeyboardFallback: false,
    shouldRunSessionFallback: true,
    initialNextStep: 'browser',
    afterBrowserNextStep: 'keyboard',
    afterKeyboardNextStep: 'session'
  })
  assert.deepEqual(runtimeState.outcome.attemptedSteps, ['browser', 'keyboard'])
  assert.equal(runtimeState.outcome.pageContext.pageCaptureMethod, 'none')
  assert.equal(runtimeState.outcome.pageContext.pageText, null)
})

test('resolveBrowserCaptureRuntimeState stays inert when accessibility already supplied strong page context', () => {
  const runtimeState = resolveBrowserCaptureRuntimeState({
    activeApp: 'Dia',
    canSkipBrowserCapture: true,
    pageContext: {
      pageTitle: 'Weekly plan',
      pageUrl: 'https://example.com/weekly-plan',
      pageText: 'Already captured from accessibility.',
      pageCaptureMethod: 'accessibility'
    }
  })

  assert.deepEqual(runtimeState.actionPlan, {
    shouldRunBrowserCapture: false,
    shouldRunKeyboardFallback: false,
    shouldRunSessionFallback: false,
    initialNextStep: 'none',
    afterBrowserNextStep: 'none',
    afterKeyboardNextStep: 'none'
  })
  assert.deepEqual(runtimeState.outcome.attemptedSteps, [])
  assert.equal(runtimeState.outcome.pageContext.pageCaptureMethod, 'accessibility')
})

test('resolveBrowserCaptureCollectionState exposes the next runnable browser collection step', () => {
  assert.deepEqual(
    resolveBrowserCaptureCollectionState({
      activeApp: 'Google Chrome',
      canSkipBrowserCapture: false,
      pageContext: EMPTY_PAGE_CONTEXT
    }),
    {
      actionPlan: {
        shouldRunBrowserCapture: true,
        shouldRunKeyboardFallback: false,
        shouldRunSessionFallback: false,
        initialNextStep: 'browser',
        afterBrowserNextStep: 'browser',
        afterKeyboardNextStep: 'browser'
      },
      outcome: {
        state: {
          shouldCaptureBrowserPage: true,
          shouldTryKeyboardFallback: true,
          shouldTrySessionFallback: true
        },
        initialNextStep: 'browser',
        afterBrowserNextStep: 'browser',
        afterKeyboardNextStep: 'browser',
        attemptedSteps: [],
        pageContext: EMPTY_PAGE_CONTEXT,
        browserCaptureMethod: null,
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null
      },
      nextStep: 'browser',
      shouldCollectBrowserContext: true,
      shouldCollectKeyboardContext: false,
      shouldCollectSessionContext: false,
      finalPageContext: EMPTY_PAGE_CONTEXT
    }
  )

  const afterWeakBrowser = resolveBrowserCaptureCollectionState({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.equal(afterWeakBrowser.nextStep, 'keyboard')
  assert.equal(afterWeakBrowser.shouldCollectBrowserContext, false)
  assert.equal(afterWeakBrowser.shouldCollectKeyboardContext, true)
  assert.equal(afterWeakBrowser.shouldCollectSessionContext, false)

  const afterWeakKeyboard = resolveBrowserCaptureCollectionState({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.equal(afterWeakKeyboard.nextStep, 'session')
  assert.equal(afterWeakKeyboard.shouldCollectSessionContext, true)

  const recovered = resolveBrowserCaptureCollectionState({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered visible pricing details',
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.equal(recovered.nextStep, 'none')
  assert.equal(recovered.shouldCollectKeyboardContext, false)
  assert.equal(recovered.shouldCollectSessionContext, false)
  assert.equal(recovered.finalPageContext.pageCaptureMethod, 'browser-automation')
})

test('resolveBrowserCaptureCollectionPlan snapshots the remaining staged browser steps for the runtime loop', () => {
  const initial = resolveBrowserCaptureCollectionPlan({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT
  })

  assert.deepEqual(initial.steps, ['browser'])
  assert.equal(initial.initial.nextStep, 'browser')
  assert.equal(initial.final.finalPageContext.pageCaptureMethod, 'none')

  const afterWeakBrowser = resolveBrowserCaptureCollectionPlan({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.deepEqual(afterWeakBrowser.steps, ['keyboard'])
  assert.equal(afterWeakBrowser.afterBrowser.nextStep, 'keyboard')

  const afterWeakKeyboard = resolveBrowserCaptureCollectionPlan({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.deepEqual(afterWeakKeyboard.steps, ['session'])
  assert.equal(afterWeakKeyboard.afterKeyboard.nextStep, 'session')

  const recovered = resolveBrowserCaptureCollectionPlan({
    activeApp: 'Google Chrome',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered visible pricing details',
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.deepEqual(recovered.steps, [])
  assert.equal(recovered.final.finalPageContext.pageCaptureMethod, 'browser-automation')
  assert.equal(recovered.final.finalPageContext.pageText, 'Recovered visible pricing details')
})

test('resolveBrowserCaptureExecutionRequests turns staged fallback steps into executable requests', () => {
  const initial = resolveBrowserCaptureExecutionRequests({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT
  })

  assert.deepEqual(initial.requests, [
    {
      step: 'browser',
      activeApp: 'Google Chrome'
    }
  ])

  const afterWeakBrowser = resolveBrowserCaptureExecutionRequests({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.deepEqual(afterWeakBrowser.requests, [
    {
      step: 'keyboard',
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing'
      }
    }
  ])

  const afterWeakKeyboard = resolveBrowserCaptureExecutionRequests({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    }
  })

  assert.deepEqual(afterWeakKeyboard.requests, [
    {
      step: 'session',
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing'
      }
    }
  ])

  const recovered = resolveBrowserCaptureExecutionRequests({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered visible pricing details',
      pageCaptureMethod: 'browser-automation'
    }
  })

  assert.deepEqual(recovered.requests, [])
  assert.equal(recovered.plan.final.finalPageContext.pageCaptureMethod, 'browser-automation')
})

test('resolveBrowserCaptureExecutionRequests advances to keyboard then session when earlier page text is debug-suppressed', () => {
  const suppressedBrowser = applyBrowserCaptureDebugOverrides({
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered visible pricing details',
      pageCaptureMethod: 'browser-automation'
    },
    overrides: {
      suppressBrowserPageText: true
    }
  })

  const afterSuppressedBrowser = resolveBrowserCaptureExecutionRequests({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: suppressedBrowser.browserContext
  })

  assert.deepEqual(afterSuppressedBrowser.requests, [
    {
      step: 'keyboard',
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing'
      }
    }
  ])

  const suppressedBrowserAndKeyboard = applyBrowserCaptureDebugOverrides({
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered visible pricing details',
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered keyboard text',
      pageCaptureMethod: 'keyboard-copy'
    },
    overrides: {
      suppressBrowserPageText: true,
      suppressKeyboardPageText: true
    }
  })

  const afterSuppressedKeyboard = resolveBrowserCaptureExecutionRequests({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: suppressedBrowserAndKeyboard.browserContext,
    keyboardContext: suppressedBrowserAndKeyboard.keyboardContext
  })

  assert.deepEqual(afterSuppressedKeyboard.requests, [
    {
      step: 'session',
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing'
      }
    }
  ])
})

test('resolveBrowserCaptureExecutionLoopState applies debug overrides before deriving the next fallback request', () => {
  const loopState = resolveBrowserCaptureExecutionLoopState({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Example page',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Example',
      pageUrl: 'https://example.com',
      pageText: 'Visible browser text',
      pageCaptureMethod: 'browser-automation'
    },
    overrides: {
      suppressBrowserPageText: true
    }
  })

  assert.equal(loopState.browserContext?.pageText, null)
  assert.deepEqual(loopState.execution.requests, [
    {
      step: 'keyboard',
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Example page'
      }
    }
  ])
  assert.equal(loopState.execution.plan.final.finalPageContext.pageCaptureMethod, 'none')
})

test('applyBrowserCaptureStepResult updates only the context bucket owned by the completed step', () => {
  const baseContexts = {
    browserContext: {
      pageTitle: 'Browser title',
      pageUrl: 'https://example.com',
      pageText: null,
      pageCaptureMethod: 'browser-automation' as const
    },
    keyboardContext: null,
    sessionContext: null
  }

  assert.deepEqual(
    applyBrowserCaptureStepResult(baseContexts, {
      step: 'keyboard',
      context: {
        pageTitle: 'Keyboard title',
        pageUrl: 'https://example.com/keyboard',
        pageText: 'Recovered keyboard text',
        pageCaptureMethod: 'keyboard-copy'
      }
    }),
    {
      browserContext: baseContexts.browserContext,
      keyboardContext: {
        pageTitle: 'Keyboard title',
        pageUrl: 'https://example.com/keyboard',
        pageText: 'Recovered keyboard text',
        pageCaptureMethod: 'keyboard-copy'
      },
      sessionContext: null
    }
  )

  assert.deepEqual(
    applyBrowserCaptureStepResult(baseContexts, {
      step: 'session',
      context: {
        pageTitle: 'Session title',
        pageUrl: 'https://example.com/session',
        pageText: 'Recovered session text',
        pageCaptureMethod: 'chrome-session'
      }
    }),
    {
      browserContext: baseContexts.browserContext,
      keyboardContext: null,
      sessionContext: {
        pageTitle: 'Session title',
        pageUrl: 'https://example.com/session',
        pageText: 'Recovered session text',
        pageCaptureMethod: 'chrome-session'
      }
    }
  )
})

test('resolveBrowserCaptureStepExecutionPlan maps each loop request to the expected runtime strategy', () => {
  const browserRequest = resolveBrowserCaptureExecutionRequests({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT
  }).requests[0]
  assert.ok(browserRequest)
  assert.deepEqual(resolveBrowserCaptureStepExecutionPlan(browserRequest), {
    step: 'browser',
    strategy: 'browser-automation',
    activeApp: 'Google Chrome',
    requiresClipboardRestore: false
  })

  const keyboardLoopState = advanceBrowserCaptureExecutionLoopState({
    activeApp: 'Firefox',
    resolvedWindowTitle: 'Docs',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Docs',
      pageUrl: 'https://example.com/docs',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: null,
    sessionContext: null
  })
  const keyboardRequest = keyboardLoopState.execution.requests[0]
  assert.ok(keyboardRequest)
  assert.deepEqual(resolveBrowserCaptureStepExecutionPlan(keyboardRequest), {
    step: 'keyboard',
    strategy: 'keyboard-copy',
    frontmost: {
      activeApp: 'Firefox',
      windowTitle: 'Docs'
    },
    requiresClipboardRestore: true
  })

  const sessionLoopState = advanceBrowserCaptureExecutionLoopState({
    activeApp: 'Dia',
    resolvedWindowTitle: 'Issue view',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Issue view',
      pageUrl: 'https://example.com/issue',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: {
      pageTitle: 'Issue view',
      pageUrl: 'https://example.com/issue',
      pageText: null,
      pageCaptureMethod: 'keyboard-copy'
    },
    sessionContext: null
  })
  const sessionRequest = sessionLoopState.execution.requests[0]
  assert.ok(sessionRequest)
  assert.deepEqual(resolveBrowserCaptureStepExecutionPlan(sessionRequest), {
    step: 'session',
    strategy: 'chromium-session',
    frontmost: {
      activeApp: 'Dia',
      windowTitle: 'Issue view'
    },
    requiresClipboardRestore: false
  })
})

test('resolveBrowserCaptureRuntimeInvocation keeps runtime side-effects aligned with the pure step plan', () => {
  assert.deepEqual(
    resolveBrowserCaptureRuntimeInvocation({
      step: 'browser',
      strategy: 'browser-automation',
      activeApp: 'Google Chrome',
      requiresClipboardRestore: false
    }),
    {
      kind: 'capture-browser-page-context',
      activeApp: 'Google Chrome',
      usesOriginalClipboard: false
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureRuntimeInvocation({
      step: 'keyboard',
      strategy: 'keyboard-copy',
      frontmost: {
        activeApp: 'Firefox',
        windowTitle: 'Docs'
      },
      requiresClipboardRestore: true
    }),
    {
      kind: 'capture-browser-page-via-keyboard',
      frontmost: {
        activeApp: 'Firefox',
        windowTitle: 'Docs'
      },
      usesOriginalClipboard: true
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureRuntimeInvocation({
      step: 'session',
      strategy: 'chromium-session',
      frontmost: {
        activeApp: 'Dia',
        windowTitle: 'Issue view'
      },
      requiresClipboardRestore: false
    }),
    {
      kind: 'capture-chromium-page-via-session',
      frontmost: {
        activeApp: 'Dia',
        windowTitle: 'Issue view'
      },
      usesOriginalClipboard: false
    }
  )
})

test('resolveBrowserCaptureLoopIteration exposes the next executable browser step and becomes inert when the loop is done', () => {
  const pendingLoop = resolveBrowserCaptureExecutionLoopState({
    activeApp: 'Firefox',
    resolvedWindowTitle: 'Docs',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Docs',
      pageUrl: 'https://example.com/docs',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: null,
    sessionContext: null
  })

  assert.deepEqual(resolveBrowserCaptureLoopIteration(pendingLoop), {
    hasRequest: true,
    request: {
      step: 'keyboard',
      frontmost: {
        activeApp: 'Firefox',
        windowTitle: 'Docs'
      }
    },
    executionPlan: {
      step: 'keyboard',
      strategy: 'keyboard-copy',
      frontmost: {
        activeApp: 'Firefox',
        windowTitle: 'Docs'
      },
      requiresClipboardRestore: true
    },
    invocation: {
      kind: 'capture-browser-page-via-keyboard',
      frontmost: {
        activeApp: 'Firefox',
        windowTitle: 'Docs'
      },
      usesOriginalClipboard: true
    }
  })

  const settledLoop = resolveBrowserCaptureExecutionLoopState({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered page text',
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: null,
    sessionContext: null
  })

  assert.deepEqual(resolveBrowserCaptureLoopIteration(settledLoop), {
    hasRequest: false,
    request: null,
    executionPlan: null,
    invocation: null
  })
})

test('advanceBrowserCaptureExecutionLoopState stores a browser result and advances to keyboard fallback when browser text is still weak', () => {
  const advanced = advanceBrowserCaptureExecutionLoopState({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: null,
    keyboardContext: null,
    sessionContext: null,
    stepResult: {
      step: 'browser',
      context: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'browser-automation'
      }
    }
  })

  assert.equal(advanced.browserContext?.pageCaptureMethod, 'browser-automation')
  assert.equal(advanced.keyboardContext, null)
  assert.equal(advanced.sessionContext, null)
  assert.deepEqual(advanced.execution.requests, [
    {
      step: 'keyboard',
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing'
      }
    }
  ])
})

test('advanceBrowserCaptureExecutionLoopState stores a keyboard result and advances chromium fallback to session capture when page text is still weak', () => {
  const advanced = advanceBrowserCaptureExecutionLoopState({
    activeApp: 'Google Chrome',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    pageContext: EMPTY_PAGE_CONTEXT,
    browserContext: {
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null,
      pageCaptureMethod: 'browser-automation'
    },
    keyboardContext: null,
    sessionContext: null,
    stepResult: {
      step: 'keyboard',
      context: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: null,
        pageCaptureMethod: 'keyboard-copy'
      }
    }
  })

  assert.equal(advanced.browserContext?.pageCaptureMethod, 'browser-automation')
  assert.equal(advanced.keyboardContext?.pageCaptureMethod, 'keyboard-copy')
  assert.equal(advanced.sessionContext, null)
  assert.deepEqual(advanced.execution.requests, [
    {
      step: 'session',
      frontmost: {
        activeApp: 'Google Chrome',
        windowTitle: 'Pricing'
      }
    }
  ])
})

test('shouldRetryWithNativeScreenCapture only retries window OCR misses', () => {
  assert.equal(
    shouldRetryWithNativeScreenCapture({
      skipOcr: false,
      sourceKind: 'window',
      screenText: null
    }),
    true
  )
  assert.equal(
    shouldRetryWithNativeScreenCapture({
      skipOcr: true,
      sourceKind: 'window',
      screenText: null
    }),
    false
  )
  assert.equal(
    shouldRetryWithNativeScreenCapture({
      skipOcr: false,
      sourceKind: 'screen',
      screenText: null
    }),
    false
  )
  assert.equal(
    shouldRetryWithNativeScreenCapture({
      skipOcr: false,
      sourceKind: 'window',
      screenText: 'Recovered OCR text'
    }),
    false
  )
})

test('shouldRunScreenOcr respects both normal skip heuristics and explicit OCR suppression', () => {
  assert.equal(
    shouldRunScreenOcr({
      skipOcr: false,
      suppressScreenOcr: false
    }),
    true
  )
  assert.equal(
    shouldRunScreenOcr({
      skipOcr: true,
      suppressScreenOcr: false
    }),
    false
  )
  assert.equal(
    shouldRunScreenOcr({
      skipOcr: false,
      suppressScreenOcr: true
    }),
    false
  )
})

test('resolveInitialScreenCaptureMode prefers native screen capture only when explicitly forced', () => {
  assert.equal(resolveInitialScreenCaptureMode({ overrides: {} }), 'desktop-source')
  assert.equal(resolveInitialScreenCaptureMode({ overrides: { forceNativeScreenCapture: false } }), 'desktop-source')
  assert.equal(resolveInitialScreenCaptureMode({ overrides: { forceNativeScreenCapture: true } }), 'native-screen')
})

test('resolveInitialScreenCaptureRuntimeInvocation maps the first screen step into an explicit runtime action', () => {
  assert.deepEqual(resolveInitialScreenCaptureRuntimeInvocation({ overrides: {} }), {
    kind: 'capture-screen-screenshot',
    mode: 'desktop-source'
  })

  assert.deepEqual(resolveInitialScreenCaptureRuntimeInvocation({ overrides: { forceNativeScreenCapture: true } }), {
    kind: 'capture-screen-screenshot',
    mode: 'native-screen'
  })
})

test('resolveInitialScreenSourceSelection only seeds provenance for forced native-screen capture', () => {
  assert.equal(
    resolveInitialScreenSourceSelection({
      initialCaptureMode: 'desktop-source'
    }),
    null
  )

  assert.deepEqual(
    resolveInitialScreenSourceSelection({
      initialCaptureMode: 'native-screen'
    }),
    {
      fallbackReason: 'screen-fallback-no-window-candidates',
      preferredCaptureMode: 'native-screen'
    }
  )
})

test('resolveScreenSourceSelection preserves screenshot provenance unless a native retry fallback supersedes it', () => {
  assert.deepEqual(
    resolveScreenSourceSelection({
      currentSelection: {
        fallbackReason: 'screen-fallback-no-window-candidates',
        preferredCaptureMode: 'native-screen'
      },
      screenshotSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      }
    }),
    {
      fallbackReason: 'matched-window',
      preferredCaptureMode: 'desktop-source'
    }
  )

  assert.deepEqual(
    resolveScreenSourceSelection({
      currentSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      usedNativeRetryFallback: true
    }),
    {
      fallbackReason: 'screen-fallback-no-window-match',
      preferredCaptureMode: 'native-screen'
    }
  )
})

test('resolveScreenCaptureExecutionDecision keeps OCR and native retry rules pure and explicit', () => {
  assert.deepEqual(
    resolveScreenCaptureExecutionDecision({
      skipOcr: false,
      suppressScreenOcr: false,
      sourceKind: 'window',
      screenText: null
    }),
    {
      shouldRunOcr: true,
      shouldRetryWithNativeFallback: true
    }
  )

  assert.deepEqual(
    resolveScreenCaptureExecutionDecision({
      skipOcr: false,
      suppressScreenOcr: false,
      sourceKind: 'screen',
      screenText: null
    }),
    {
      shouldRunOcr: true,
      shouldRetryWithNativeFallback: false
    }
  )

  assert.deepEqual(
    resolveScreenCaptureExecutionDecision({
      skipOcr: false,
      suppressScreenOcr: true,
      sourceKind: 'window',
      screenText: null
    }),
    {
      shouldRunOcr: false,
      shouldRetryWithNativeFallback: false
    }
  )

  assert.deepEqual(
    resolveScreenCaptureExecutionDecision({
      skipOcr: true,
      suppressScreenOcr: false,
      sourceKind: 'window',
      screenText: null
    }),
    {
      shouldRunOcr: false,
      shouldRetryWithNativeFallback: false
    }
  )
})

test('resolveScreenCaptureAttemptPlan precomputes the initial and native-fallback OCR decisions', () => {
  assert.deepEqual(
    resolveScreenCaptureAttemptPlan({
      skipOcr: false,
      suppressScreenOcr: false,
      initialSourceKind: 'window',
      initialScreenText: null
    }),
    {
      initialAttempt: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: true
      },
      fallbackAttempt: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: false
      }
    }
  )

  assert.deepEqual(
    resolveScreenCaptureAttemptPlan({
      skipOcr: false,
      suppressScreenOcr: true,
      initialSourceKind: 'window',
      initialScreenText: null
    }),
    {
      initialAttempt: {
        shouldRunOcr: false,
        shouldRetryWithNativeFallback: false
      },
      fallbackAttempt: null
    }
  )
})

test('resolveScreenCaptureRetryPlan only retries when the current decision requests a native fallback', () => {
  assert.deepEqual(
    resolveScreenCaptureRetryPlan({
      executionDecision: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: true
      },
      fallbackAttempt: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: false
      }
    }),
    {
      shouldRetryWithNativeFallback: true,
      retryAttempt: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: false
      }
    }
  )

  assert.deepEqual(
    resolveScreenCaptureRetryPlan({
      executionDecision: {
        shouldRunOcr: false,
        shouldRetryWithNativeFallback: false
      },
      fallbackAttempt: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: false
      }
    }),
    {
      shouldRetryWithNativeFallback: false,
      retryAttempt: null
    }
  )
})

test('resolveScreenCaptureRuntimeState collapses missing screenshot inputs into a stable empty state', () => {
  assert.deepEqual(
    resolveScreenCaptureRuntimeState({
      skipOcr: false,
      suppressScreenOcr: false,
      screenshotPath: null,
      sourceKind: null,
      screenText: null
    }),
    {
      screenshotPath: null,
      sourceKind: null,
      screenText: null,
      executionDecision: null,
      retryPlan: null
    }
  )
})

test('resolveScreenCaptureRuntimeState keeps retry decisions pure for weak window captures', () => {
  assert.deepEqual(
    resolveScreenCaptureRuntimeState({
      skipOcr: false,
      suppressScreenOcr: false,
      screenshotPath: '/tmp/window-capture.png',
      sourceKind: 'window',
      screenText: null
    }),
    {
      screenshotPath: '/tmp/window-capture.png',
      sourceKind: 'window',
      screenText: null,
      executionDecision: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: true
      },
      retryPlan: {
        shouldRetryWithNativeFallback: true,
        retryAttempt: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: false
        }
      }
    }
  )
})

test('resolveScreenCaptureRuntimeState stops retrying once native-screen OCR already produced text', () => {
  assert.deepEqual(
    resolveScreenCaptureRuntimeState({
      skipOcr: false,
      suppressScreenOcr: false,
      screenshotPath: '/tmp/screen-capture.png',
      sourceKind: 'screen',
      screenText: 'Recovered OCR text'
    }),
    {
      screenshotPath: '/tmp/screen-capture.png',
      sourceKind: 'screen',
      screenText: 'Recovered OCR text',
      executionDecision: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: false
      },
      retryPlan: {
        shouldRetryWithNativeFallback: false,
        retryAttempt: null
      }
    }
  )
})

test('resolveScreenOcrRuntimeInvocation only requests OCR when the runtime state still needs text extraction', () => {
  assert.deepEqual(
    resolveScreenOcrRuntimeInvocation({
      screenshotPath: '/tmp/window.png',
      executionDecision: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: true
      }
    }),
    {
      kind: 'recognize-screenshot-text',
      screenshotPath: '/tmp/window.png'
    }
  )

  assert.deepEqual(
    resolveScreenOcrRuntimeInvocation({
      screenshotPath: '/tmp/window.png',
      executionDecision: {
        shouldRunOcr: false,
        shouldRetryWithNativeFallback: false
      }
    }),
    {
      kind: 'no-screen-ocr'
    }
  )

  assert.deepEqual(
    resolveScreenOcrRuntimeInvocation({
      screenshotPath: null,
      executionDecision: {
        shouldRunOcr: true,
        shouldRetryWithNativeFallback: false
      }
    }),
    {
      kind: 'no-screen-ocr'
    }
  )
})

test('resolveCapturedScreenshotRuntime packages source selection, runtime state, and OCR invocation for an initial window capture', () => {
  assert.deepEqual(
    resolveCapturedScreenshotRuntime({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: null,
      screenshot: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        sourceSelection: {
          fallbackReason: 'matched-window',
          preferredCaptureMode: 'desktop-source'
        }
      }
    }),
    {
      sourceSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      runtimeState: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        screenText: null,
        executionDecision: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: true
        },
        retryPlan: {
          shouldRetryWithNativeFallback: true,
          retryAttempt: {
            shouldRunOcr: true,
            shouldRetryWithNativeFallback: false
          }
        }
      },
      ocrInvocation: {
        kind: 'recognize-screenshot-text',
        screenshotPath: '/tmp/window-capture.png'
      }
    }
  )
})

test('resolveCapturedScreenshotRuntime preserves a native retry fallback as the authoritative source selection', () => {
  assert.deepEqual(
    resolveCapturedScreenshotRuntime({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      screenshot: {
        screenshotPath: '/tmp/native-screen.png',
        sourceKind: 'screen',
        sourceSelection: null
      },
      usedNativeRetryFallback: true
    }),
    {
      sourceSelection: {
        fallbackReason: 'screen-fallback-no-window-match',
        preferredCaptureMode: 'native-screen'
      },
      runtimeState: {
        screenshotPath: '/tmp/native-screen.png',
        sourceKind: 'screen',
        screenText: null,
        executionDecision: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: false
        },
        retryPlan: {
          shouldRetryWithNativeFallback: false,
          retryAttempt: null
        }
      },
      ocrInvocation: {
        kind: 'recognize-screenshot-text',
        screenshotPath: '/tmp/native-screen.png'
      }
    }
  )
})

test('resolveCapturedScreenshotRuntime returns a stable no-op shape when no screenshot is available', () => {
  assert.deepEqual(
    resolveCapturedScreenshotRuntime({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: null,
      screenshot: null
    }),
    {
      sourceSelection: null,
      runtimeState: {
        screenshotPath: null,
        sourceKind: null,
        screenText: null,
        executionDecision: null,
        retryPlan: null
      },
      ocrInvocation: {
        kind: 'no-screen-ocr'
      }
    }
  )
})

test('resolveScreenCaptureAttemptOutcome keeps weak window OCR misses retryable after text extraction still fails', () => {
  assert.deepEqual(
    resolveScreenCaptureAttemptOutcome({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      screenshot: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        sourceSelection: {
          fallbackReason: 'matched-window',
          preferredCaptureMode: 'desktop-source'
        }
      },
      screenText: null
    }),
    {
      sourceSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      runtimeState: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        screenText: null,
        executionDecision: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: true
        },
        retryPlan: {
          shouldRetryWithNativeFallback: true,
          retryAttempt: {
            shouldRunOcr: true,
            shouldRetryWithNativeFallback: false
          }
        }
      }
    }
  )
})

test('resolveScreenCaptureAttemptOutcome stops retrying once OCR already recovered text or a native retry won', () => {
  assert.deepEqual(
    resolveScreenCaptureAttemptOutcome({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      screenshot: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        sourceSelection: {
          fallbackReason: 'matched-window',
          preferredCaptureMode: 'desktop-source'
        }
      },
      screenText: 'Recovered OCR text'
    }),
    {
      sourceSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      runtimeState: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        screenText: 'Recovered OCR text',
        executionDecision: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: false
        },
        retryPlan: {
          shouldRetryWithNativeFallback: false,
          retryAttempt: null
        }
      }
    }
  )

  assert.deepEqual(
    resolveScreenCaptureAttemptOutcome({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      screenshot: {
        screenshotPath: '/tmp/native-screen.png',
        sourceKind: 'screen',
        sourceSelection: null
      },
      usedNativeRetryFallback: true,
      screenText: null
    }),
    {
      sourceSelection: {
        fallbackReason: 'screen-fallback-no-window-match',
        preferredCaptureMode: 'native-screen'
      },
      runtimeState: {
        screenshotPath: '/tmp/native-screen.png',
        sourceKind: 'screen',
        screenText: null,
        executionDecision: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: false
        },
        retryPlan: {
          shouldRetryWithNativeFallback: false,
          retryAttempt: null
        }
      }
    }
  )
})

test('resolveScreenCaptureAttemptExecution keeps attempt outcome and OCR invocation aligned for initial and retry captures', () => {
  assert.deepEqual(
    resolveScreenCaptureAttemptExecution({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      screenshot: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        sourceSelection: {
          fallbackReason: 'matched-window',
          preferredCaptureMode: 'desktop-source'
        }
      },
      screenText: null
    }),
    {
      sourceSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      runtimeState: {
        screenshotPath: '/tmp/window-capture.png',
        sourceKind: 'window',
        screenText: null,
        executionDecision: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: true
        },
        retryPlan: {
          shouldRetryWithNativeFallback: true,
          retryAttempt: {
            shouldRunOcr: true,
            shouldRetryWithNativeFallback: false
          }
        }
      },
      ocrInvocation: {
        kind: 'recognize-screenshot-text',
        screenshotPath: '/tmp/window-capture.png'
      }
    }
  )

  assert.deepEqual(
    resolveScreenCaptureAttemptExecution({
      skipOcr: false,
      suppressScreenOcr: false,
      currentSelection: {
        fallbackReason: 'matched-window',
        preferredCaptureMode: 'desktop-source'
      },
      screenshot: {
        screenshotPath: '/tmp/native-screen.png',
        sourceKind: 'screen',
        sourceSelection: null
      },
      usedNativeRetryFallback: true,
      screenText: 'Recovered OCR text'
    }),
    {
      sourceSelection: {
        fallbackReason: 'screen-fallback-no-window-match',
        preferredCaptureMode: 'native-screen'
      },
      runtimeState: {
        screenshotPath: '/tmp/native-screen.png',
        sourceKind: 'screen',
        screenText: 'Recovered OCR text',
        executionDecision: {
          shouldRunOcr: true,
          shouldRetryWithNativeFallback: false
        },
        retryPlan: {
          shouldRetryWithNativeFallback: false,
          retryAttempt: null
        }
      },
      ocrInvocation: {
        kind: 'recognize-screenshot-text',
        screenshotPath: '/tmp/native-screen.png'
      }
    }
  )
})

test('finalizeScreenContext maps missing and completed captures to stable screen context output', () => {
  assert.deepEqual(
    finalizeScreenContext({
      screenshotPath: null,
      sourceKind: null,
      screenText: null
    }),
    {
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none'
    }
  )

  assert.deepEqual(
    finalizeScreenContext({
      screenshotPath: '/tmp/capture.png',
      sourceKind: 'screen',
      screenText: 'Recovered OCR text'
    }),
    {
      screenshotPath: '/tmp/capture.png',
      screenText: 'Recovered OCR text',
      screenCaptureMethod: 'screen-ocr'
    }
  )
})

test('buildScreenCaptureMethod maps source kind and OCR availability to the final capture method', () => {
  assert.equal(buildScreenCaptureMethod('window', 'Recovered OCR text'), 'window-ocr')
  assert.equal(buildScreenCaptureMethod('window', null), 'window-screenshot-only')
  assert.equal(buildScreenCaptureMethod('screen', 'Recovered OCR text'), 'screen-ocr')
  assert.equal(buildScreenCaptureMethod('screen', null), 'screen-screenshot-only')
})

test('buildCaptureTrace summarizes attempted browser fallbacks and screen decision', () => {
  const browserTrace = resolveBrowserCaptureTrace({
    browserExecutionPlan: {
      actionPlan: {
        shouldCollectBrowserContext: true,
        shouldCollectKeyboardContext: true,
        shouldCollectSessionContext: false
      },
      outcome: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser', 'keyboard'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: 'keyboard-copy',
        sessionCaptureMethod: null
      },
      nextStep: 'none',
      shouldCollectBrowserContext: false,
      shouldCollectKeyboardContext: false,
      shouldCollectSessionContext: false,
      finalPageContext: {
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Visible pricing body',
        pageCaptureMethod: 'browser-automation'
      }
    },
    finalPageCaptureMethod: 'browser-automation'
  })

  const trace = buildCaptureTrace({
    resolvedActiveApp: 'Dia',
    resolvedWindowTitle: 'Pricing',
    canSkipBrowserCapture: false,
    canSkipOcr: false,
    browserTrace,
    finalPageCaptureMethod: 'browser-automation',
    shouldCaptureScreen: true,
    screenReason: 'needs-screen-signal',
    finalScreenCaptureMethod: 'window-ocr',
    screenSourceSelection: {
      fallbackReason: 'screen-fallback-no-window-match',
      preferredCaptureMode: 'native-screen'
    }
  })

  assert.deepEqual(trace.browser.attemptedSteps, ['browser', 'keyboard'])
  assert.equal(trace.browser.finalPageCaptureMethod, 'browser-automation')
  assert.equal(trace.screen.reason, 'needs-screen-signal')
  assert.equal(trace.screen.finalScreenCaptureMethod, 'window-ocr')
  assert.deepEqual(trace.screen.sourceSelection, {
    fallbackReason: 'screen-fallback-no-window-match',
    preferredCaptureMode: 'native-screen'
  })
})

test('resolveBrowserCaptureTrace derives the browser trace directly from the final browser execution plan', () => {
  assert.deepEqual(
    resolveBrowserCaptureTrace({
      browserExecutionPlan: {
        actionPlan: {
          shouldCollectBrowserContext: true,
          shouldCollectKeyboardContext: true,
          shouldCollectSessionContext: true
        },
        outcome: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'session',
          attemptedSteps: ['browser', 'keyboard', 'session'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: 'chrome-session'
        },
        nextStep: 'none',
        shouldCollectBrowserContext: false,
        shouldCollectKeyboardContext: false,
        shouldCollectSessionContext: false,
        finalPageContext: {
          pageTitle: 'Pricing',
          pageUrl: 'https://example.com/pricing',
          pageText: 'Recovered from session fallback',
          pageCaptureMethod: 'chrome-session'
        }
      },
      finalPageCaptureMethod: 'chrome-session'
    }),
    {
      initialNextStep: 'browser',
      afterBrowserNextStep: 'keyboard',
      afterKeyboardNextStep: 'session',
      attemptedSteps: ['browser', 'keyboard', 'session'],
      browserCaptureMethod: 'browser-automation',
      keyboardCaptureMethod: 'keyboard-copy',
      sessionCaptureMethod: 'chrome-session',
      finalPageCaptureMethod: 'chrome-session'
    }
  )
})

test('buildCurrentContext assembles final metadata without reusing clipboard history', () => {
  const context = buildCurrentContext({
    resolvedActiveApp: 'Dia',
    resolvedWindowTitle: 'Issue 424',
    selectedText: 'Fix the browser capture fallback for the current tab.',
    selectedTextSource: 'clipboard-selection',
    pageContext: {
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'The current issue tracks browser capture fallback behavior.',
      pageCaptureMethod: 'browser-automation'
    },
    accessibilityContext: {
      appName: 'Dia',
      windowTitle: 'Issue 424',
      selectedText: null,
      accessibilityText: 'Visible issue text in the current browser tab.',
      accessibilityCaptureMethod: 'ax-tree',
      pageTitle: 'Issue 424',
      pageUrl: 'https://github.com/example/repo/issues/424',
      pageText: 'The current issue tracks browser capture fallback behavior.'
    },
    screenContext: {
      screenshotPath: '/tmp/capture.png',
      screenText: null,
      screenCaptureMethod: 'window-screenshot-only'
    },
    timestamp: '2026-07-06T00:00:00.000Z'
  })

  assert.equal(context.contextKind, 'browser')
  assert.equal(context.primaryContentSource, 'selected-text')
  assert.equal(context.clipboardText, null)
  assert.equal(context.pageCaptureMethod, 'browser-automation')
  assert.equal(context.selectedTextSource, 'clipboard-selection')
  assert.equal(context.accessibilityCaptureMethod, 'ax-tree')
})

test('buildCurrentContext preserves a no-screen-capture result when strong accessibility context made screen capture unnecessary', () => {
  const context = buildCurrentContext({
    resolvedActiveApp: 'Dia',
    resolvedWindowTitle: 'Pricing overview',
    selectedText: null,
    selectedTextSource: 'none',
    pageContext: {
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing plans help teams standardize AI workflows across support and sales.',
      pageCaptureMethod: 'accessibility'
    },
    accessibilityContext: {
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      selectedText: null,
      accessibilityText: 'Pricing plans help teams standardize AI workflows across support and sales.',
      accessibilityCaptureMethod: 'ax-tree',
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing plans help teams standardize AI workflows across support and sales.'
    },
    screenContext: {
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none'
    },
    timestamp: '2026-07-06T00:00:00.000Z'
  })

  assert.equal(context.primaryContentSource, 'accessibility-text')
  assert.equal(context.screenCaptureMethod, 'none')
  assert.equal(context.screenshotPath, null)
  assert.equal(context.screenText, null)
})

test('buildCurrentContext preserves chrome-session provenance when session fallback provides the winning page text', () => {
  const context = buildCurrentContext({
    resolvedActiveApp: 'Dia',
    resolvedWindowTitle: 'KashinAI Pricing',
    selectedText: null,
    selectedTextSource: 'none',
    pageContext: {
      pageTitle: 'KashinAI Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'KashinAI pricing plans help teams standardize AI workflows across sales and support.',
      pageCaptureMethod: 'chrome-session'
    },
    accessibilityContext: {
      appName: 'Dia',
      windowTitle: 'KashinAI Pricing',
      selectedText: null,
      accessibilityText: null,
      accessibilityCaptureMethod: 'none',
      pageTitle: null,
      pageUrl: null,
      pageText: null
    },
    screenContext: {
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none'
    },
    timestamp: '2026-07-06T00:00:00.000Z'
  })

  assert.equal(context.contextKind, 'browser')
  assert.equal(context.primaryContentSource, 'page-text')
  assert.equal(context.pageCaptureMethod, 'chrome-session')
  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.equal(context.selectedTextSource, 'none')
})

test('buildCurrentContext keeps page-text primary when selected text is only the browser url', () => {
  const context = buildCurrentContext({
    resolvedActiveApp: 'Google Chrome',
    resolvedWindowTitle: 'Town - 固定済み - Google Chrome - dev',
    selectedText: null,
    selectedTextSource: 'none',
    pageContext: {
      pageTitle: 'Town - 固定済み - Google Chrome - dev',
      pageUrl: 'https://www.town.com/',
      pageText: 'Recovered browser page body with the actual page content and summary-worthy text.',
      pageCaptureMethod: 'chrome-session'
    },
    accessibilityContext: {
      appName: 'Google Chrome',
      windowTitle: 'Town - 固定済み - Google Chrome - dev',
      selectedText: null,
      accessibilityText: 'https://www.town.com アドレス検索バー',
      accessibilityCaptureMethod: 'ax-tree',
      pageTitle: 'Town - 固定済み - Google Chrome - dev',
      pageUrl: null,
      pageText: null
    },
    screenContext: {
      screenshotPath: null,
      screenText: null,
      screenCaptureMethod: 'none'
    },
    timestamp: '2026-07-14T00:00:00.000Z'
  })

  assert.equal(context.primaryContentSource, 'page-text')
  assert.equal(context.selectedText, null)
  assert.equal(context.pageCaptureMethod, 'chrome-session')
})

test('finalizeContextCaptureResult derives final context and trace from the pure execution plan result', () => {
  const result = finalizeContextCaptureResult({
    resolvedActiveApp: 'Google Chrome',
    resolvedWindowTitle: 'KashinAI Pricing',
    selectedText: 'Focus on enterprise rollout blockers.',
    selectedTextSource: 'clipboard-selection',
    accessibilityContext: {
      appName: 'Google Chrome',
      windowTitle: 'KashinAI Pricing',
      selectedText: null,
      accessibilityText: 'Visible pricing notes',
      accessibilityCaptureMethod: 'ax-tree',
      pageTitle: 'KashinAI Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null
    },
    screenContext: {
      screenshotPath: '/tmp/pricing.png',
      screenText: 'Visible pricing screenshot text',
      screenCaptureMethod: 'window-ocr'
    },
    browserExecutionPlan: {
      actionPlan: {
        shouldCollectBrowserContext: true,
        shouldCollectKeyboardContext: true,
        shouldCollectSessionContext: true
      },
      outcome: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'session',
        attemptedSteps: ['browser', 'keyboard', 'session'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: 'keyboard-copy',
        sessionCaptureMethod: 'chrome-session'
      },
      nextStep: 'none',
      shouldCollectBrowserContext: false,
      shouldCollectKeyboardContext: false,
      shouldCollectSessionContext: false,
      finalPageContext: {
        pageTitle: 'KashinAI Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'KashinAI pricing plans help enterprise teams standardize AI workflows.',
        pageCaptureMethod: 'chrome-session'
      }
    },
    canSkipBrowserCapture: false,
    canSkipOcr: false,
    screenCapturePlan: {
      shouldCaptureScreen: true,
      reason: 'needs-screen-signal'
    },
    timestamp: '2026-07-13T00:00:00.000Z'
  })

  assert.equal(result.context.pageCaptureMethod, 'chrome-session')
  assert.equal(result.context.primaryContentSource, 'selected-text')
  assert.equal(result.captureTrace.browser.finalPageCaptureMethod, 'chrome-session')
  assert.deepEqual(result.captureTrace.browser.attemptedSteps, ['browser', 'keyboard', 'session'])
  assert.equal(result.captureTrace.screen.finalScreenCaptureMethod, 'window-ocr')
})

test('sourceScore favors matching window and app names but demotes KashinAI windows', () => {
  const frontmost = { activeApp: 'Google Chrome', windowTitle: 'Launch Plan - Docs' }

  assert.equal(sourceScore('KashinAI Overlay', frontmost), -100)
  assert.ok(sourceScore('Launch Plan - Docs - Google Chrome', frontmost) > 8)
  assert.equal(sourceScore('Unrelated Window', frontmost), 0)
})
