import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  classifyAccessibilityContentLine,
  buildPageTextFromAccessibilityLines,
  classifyAccessibilityLowSignalReason,
  classifySnapshotSuppression,
  computeAccessibilityLineBaseScore,
  computeAccessibilityRoleScoreAdjustment,
  computeAccessibilityTitleScoreAdjustment,
  collectAccessibilityUrlCandidates,
  diagnoseAccessibilitySnapshot,
  extractAccessibilityContext,
  resolveAccessibilityCaptureOutcome,
  isBrowserChromeOnlySurface,
  isSocialChromeOnlySurface,
  normalizeAccessibilityPageTextLines,
  normalizeResolvedPageTitleCandidate,
  parseAccessibilityHelperOutput,
  rankAccessibilityUrlCandidates,
  resolveSnapshotAppResolution,
  resolveSnapshotWindowTitleResolution,
  resolveSelectedTextCandidate,
  rankAccessibilityLines,
  selectAccessibilityContentLines,
  shouldAcceptAccessibilityUrlCandidate,
  shouldIncludeAccessibilityLineInContent,
  selectAccessibilityContent
} from '../../src/main/accessibility-context.ts'

function fixture(name: string) {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), 'tests/fixtures/accessibility', name), 'utf8')
  )
}

test('parseAccessibilityHelperOutput accepts structured helper JSON', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Safari',
      windowTitle: 'Pricing',
      focusedRole: 'AXWebArea',
      selectedText: 'Selected paragraph',
      valueText: 'Visible body',
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing',
      lines: ['Selected paragraph', 'Visible body', 'CTA button']
    })
  )

  assert.deepEqual(snapshot, {
    appName: 'Safari',
    workspaceAppName: null,
    topWindowOwnerName: null,
    windowTitle: 'Pricing',
    topWindowTitle: null,
    focusedRole: 'AXWebArea',
    selectedText: 'Selected paragraph',
    selectedRangeText: null,
    valueText: 'Visible body',
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    focusChain: undefined,
    lines: ['Selected paragraph', 'Visible body', 'CTA button']
  })
})

test('parseAccessibilityHelperOutput keeps normalized focus chain diagnostics', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Notion',
      windowTitle: 'Weekly plan',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Weekly plan',
      focusChain: [
        {
          role: 'AXTextArea',
          title: ' Editor ',
          value: ' ',
          visibleText: '  Launch review summary with action items. ',
          selectedRangeText: null,
          selectedMarkerText: null,
          description: null,
          help: null,
          placeholder: 'Type here',
          selectedText: null,
          document: null,
          url: null,
          childCount: 2,
          attributeNames: ['AXValue', 'AXVisibleCharacterRange'],
          selectedTextRange: '{location:0, length:0}',
          visibleCharacterRange: '{location:0, length:42}'
        }
      ],
      lines: ['Notion', 'Home']
    })
  )

  assert.equal(snapshot?.focusChain?.[0]?.title, 'Editor')
  assert.equal(snapshot?.focusChain?.[0]?.visibleText, 'Launch review summary with action items.')
  assert.equal(snapshot?.focusChain?.[0]?.placeholder, 'Type here')
})

test('parseAccessibilityHelperOutput preserves helper fallback metadata for top window ownership', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'loginwindow',
      workspaceAppName: 'loginwindow',
      topWindowOwnerName: 'Google Chrome',
      windowTitle: null,
      topWindowTitle: 'Pricing | KashinAI',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing',
      lines: ['Pricing', 'The enterprise plan adds SSO and audit logs.']
    })
  )

  assert.equal(snapshot?.workspaceAppName, 'loginwindow')
  assert.equal(snapshot?.topWindowOwnerName, 'Google Chrome')
  assert.equal(snapshot?.topWindowTitle, 'Pricing | KashinAI')
})

test('parseAccessibilityHelperOutput falls back to legacy plain-text output', () => {
  const snapshot = parseAccessibilityHelperOutput('Line one\nLine two\nLine one')

  assert.equal(snapshot?.selectedText, null)
  assert.deepEqual(snapshot?.lines, ['Line one', 'Line two'])
})

test('resolveSnapshotAppResolution prefers helper frontmost, then top-window owner, then workspace app, while ignoring noisy shells', () => {
  assert.deepEqual(
    resolveSnapshotAppResolution({
      appName: 'Safari',
      workspaceAppName: 'Finder',
      topWindowOwnerName: 'Google Chrome',
      windowTitle: 'Pricing',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: null,
      lines: []
    }),
    {
      appName: 'Safari',
      source: 'helper-frontmost'
    }
  )

  assert.deepEqual(
    resolveSnapshotAppResolution({
      appName: 'loginwindow',
      workspaceAppName: 'Dock',
      topWindowOwnerName: 'Google Chrome',
      windowTitle: null,
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: null,
      lines: []
    }),
    {
      appName: 'Google Chrome',
      source: 'top-window-owner'
    }
  )

  assert.deepEqual(
    resolveSnapshotAppResolution({
      appName: 'NotificationCenter',
      workspaceAppName: 'Cursor',
      topWindowOwnerName: 'Dock',
      windowTitle: null,
      focusedRole: 'AXTextArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: null,
      lines: []
    }),
    {
      appName: 'Cursor',
      source: 'workspace-app'
    }
  )

  assert.deepEqual(
    resolveSnapshotAppResolution({
      appName: 'loginwindow',
      workspaceAppName: 'Cursor',
      topWindowOwnerName: 'Google Chrome',
      windowTitle: null,
      topWindowTitle: 'main.ts - Cursor',
      focusedRole: 'AXTextArea',
      selectedText: 'const result = true',
      selectedRangeText: null,
      valueText: 'const result = true',
      document: null,
      url: null,
      title: null,
      lines: ['const result = true', 'function renderApp() {', 'return <App />', '}']
    }),
    {
      appName: 'Cursor',
      source: 'workspace-app'
    }
  )

  assert.deepEqual(
    resolveSnapshotAppResolution({
      appName: 'loginwindow',
      workspaceAppName: 'Dock',
      topWindowOwnerName: 'Window Server',
      windowTitle: null,
      focusedRole: null,
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: null,
      lines: []
    }),
    {
      appName: 'loginwindow',
      source: 'none'
    }
  )
})

test('resolveSnapshotWindowTitleResolution prefers explicit window title, then top-window title, then snapshot title', () => {
  assert.deepEqual(
    resolveSnapshotWindowTitleResolution({
      appName: 'Safari',
      topWindowTitle: 'Top title',
      windowTitle: '  Window title  ',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Snapshot title',
      lines: []
    }),
    {
      windowTitle: 'Window title',
      source: 'window-title'
    }
  )

  assert.deepEqual(
    resolveSnapshotWindowTitleResolution({
      appName: 'Safari',
      topWindowTitle: '  Top title  ',
      windowTitle: '   ',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Snapshot title',
      lines: []
    }),
    {
      windowTitle: 'Top title',
      source: 'top-window-title'
    }
  )

  assert.deepEqual(
    resolveSnapshotWindowTitleResolution({
      appName: 'Safari',
      topWindowTitle: null,
      windowTitle: null,
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: '  Snapshot title  ',
      lines: []
    }),
    {
      windowTitle: 'Snapshot title',
      source: 'snapshot-title'
    }
  )

  assert.deepEqual(
    resolveSnapshotWindowTitleResolution({
      appName: 'Safari',
      topWindowTitle: '   ',
      windowTitle: null,
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: null,
      lines: []
    }),
    {
      windowTitle: null,
      source: 'none'
    }
  )
})

test('classifySnapshotSuppression distinguishes notification-center prompts and loginwindow shells without suppressing ordinary app copy', () => {
  assert.deepEqual(
    classifySnapshotSuppression({
      appName: 'UserNotificationCenter',
      windowTitle: 'Privacy Access',
      focusedRole: 'AXWindow',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'UserNotificationCenter',
      lines: [
        'Codex uses Apple Events to control Mac apps on your behalf',
        'Allow access',
        "Don't Allow"
      ]
    }),
    {
      notificationCenter: true,
      systemShell: false
    }
  )

  assert.deepEqual(
    classifySnapshotSuppression({
      appName: 'loginwindow',
      windowTitle: 'ログイン',
      focusedRole: 'AXWindow',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'ログイン',
      lines: ['ログイン', 'loginwindow']
    }),
    {
      notificationCenter: false,
      systemShell: true
    }
  )

  assert.deepEqual(
    classifySnapshotSuppression({
      appName: 'Google Chrome',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing overview',
      lines: [
        'Pricing overview',
        'Allow access for enterprise audit logs and SSO settings in this workspace.'
      ]
    }),
    {
      notificationCenter: false,
      systemShell: false
    }
  )
})

test('shouldAcceptAccessibilityUrlCandidate keeps direct metadata but rejects loose editor urls outside browser-like surfaces', () => {
  const editorSnapshot = {
    appName: 'Cursor',
    windowTitle: 'notes.md',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: '/Users/toru/project/notes.md',
    url: null,
    title: 'notes.md',
    lines: ['Reference: https://example.com/pricing']
  }

  assert.equal(
    shouldAcceptAccessibilityUrlCandidate({
      snapshot: editorSnapshot,
      url: 'https://example.com/pricing',
      text: 'Reference: https://example.com/pricing',
      source: 'snapshot-text'
    }),
    false
  )

  assert.equal(
    shouldAcceptAccessibilityUrlCandidate({
      snapshot: editorSnapshot,
      url: 'file:///Users/toru/project/notes.md',
      text: 'file:///Users/toru/project/notes.md',
      source: 'direct-metadata'
    }),
    true
  )

  assert.equal(
    shouldAcceptAccessibilityUrlCandidate({
      snapshot: {
        ...editorSnapshot,
        appName: 'Google Chrome',
        focusedRole: 'AXWebArea'
      },
      url: 'https://example.com/pricing',
      text: 'https://example.com/pricing',
      source: 'snapshot-text'
    }),
    true
  )
})

test('extractAccessibilityContext promotes selected text and page metadata', () => {
  const context = extractAccessibilityContext({
    appName: 'Safari',
    windowTitle: 'Pricing',
    focusedRole: 'AXWebArea',
    selectedText: 'Selected paragraph',
    valueText: 'Visible body copy',
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Visible body copy', 'CTA button']
  })

  assert.equal(context.selectedText, 'Selected paragraph')
  assert.equal(context.selectedTextSource, 'top-level-selected-text')
  assert.equal(context.appName, 'Safari')
  assert.equal(context.windowTitle, 'Pricing')
  assert.equal(context.pageTitle, 'Pricing')
  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.match(context.pageText ?? '', /Selected paragraph/)
  assert.equal(context.accessibilityCaptureMethod, 'ax-tree')
})

test('extractAccessibilityContext falls back to top-window metadata when the helper frontmost app is noisy', () => {
  const context = extractAccessibilityContext({
    appName: 'loginwindow',
    workspaceAppName: 'loginwindow',
    topWindowOwnerName: 'Google Chrome',
    windowTitle: null,
    topWindowTitle: 'Pricing | KashinAI',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Pricing', 'The enterprise plan adds SSO and audit logs.']
  })

  assert.equal(context.appName, 'Google Chrome')
  assert.equal(context.windowTitle, 'Pricing | KashinAI')
  assert.equal(context.pageTitle, 'Pricing')
  assert.match(context.pageText ?? '', /enterprise plan adds SSO/)
})

test('extractAccessibilityContext prefers workspace app over a browser-like top-window owner when the snapshot looks editor-like', () => {
  const context = extractAccessibilityContext({
    appName: 'loginwindow',
    workspaceAppName: 'Cursor',
    topWindowOwnerName: 'Google Chrome',
    windowTitle: null,
    topWindowTitle: 'main.ts - Cursor',
    focusedRole: 'AXTextArea',
    selectedText: 'const result = true',
    selectedRangeText: null,
    valueText: 'const result = true',
    document: '/Users/toru/project/src/main.ts',
    url: null,
    title: 'main.ts - Cursor',
    lines: ['main.ts', 'const result = true', 'function renderApp() {', 'return <App />', '}']
  })

  assert.equal(context.appName, 'Cursor')
  assert.equal(context.windowTitle, 'main.ts - Cursor')
  assert.equal(context.selectedText, 'const result = true')
  assert.match(context.accessibilityText ?? '', /function renderApp/)
})

test('diagnoseAccessibilitySnapshot also uses top-window metadata when the helper frontmost app is noisy', () => {
  const diagnostics = diagnoseAccessibilitySnapshot({
    appName: 'loginwindow',
    workspaceAppName: 'loginwindow',
    topWindowOwnerName: 'Google Chrome',
    windowTitle: null,
    topWindowTitle: 'Pricing | KashinAI',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Pricing', 'The enterprise plan adds SSO and audit logs.']
  })

  assert.equal(diagnostics.appName, 'Google Chrome')
  assert.equal(diagnostics.rawAppName, 'loginwindow')
  assert.equal(diagnostics.workspaceAppName, 'loginwindow')
  assert.equal(diagnostics.topWindowOwnerName, 'Google Chrome')
  assert.equal(diagnostics.windowTitle, 'Pricing | KashinAI')
  assert.equal(diagnostics.rawWindowTitle, null)
  assert.equal(diagnostics.topWindowTitle, 'Pricing | KashinAI')
  assert.equal(diagnostics.appResolutionSource, 'top-window-owner')
  assert.equal(diagnostics.windowTitleResolutionSource, 'top-window-title')
  assert.equal(diagnostics.pageUrlCandidate, 'https://example.com/pricing')
})

test('extractAccessibilityContext uses top-window title metadata when scoring competing browser url candidates', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'loginwindow',
      workspaceAppName: 'loginwindow',
      topWindowOwnerName: 'Google Chrome',
      windowTitle: null,
      topWindowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: null,
      lines: [
        'Back',
        'Forward',
        'https://news.ycombinator.com/',
        'https://example.com/pricing',
        'Pricing overview',
        'Pricing plans help teams standardize AI workflows across support and sales.'
      ]
    })
  )

  assert.ok(snapshot)
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.appName, 'Google Chrome')
  assert.equal(diagnostics.windowTitle, 'Pricing overview')
  assert.equal(diagnostics.pageUrlCandidate, 'https://example.com/pricing')
  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.match(context.pageText ?? '', /Pricing plans help teams standardize AI workflows/)
})

test('diagnoseAccessibilitySnapshot reports direct helper-frontmost and window-title sources when they are available', () => {
  const diagnostics = diagnoseAccessibilitySnapshot({
    appName: 'Safari',
    workspaceAppName: 'Safari',
    topWindowOwnerName: 'Safari',
    windowTitle: 'Pricing',
    topWindowTitle: 'Pricing',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Pricing', 'The enterprise plan adds SSO and audit logs.']
  })

  assert.equal(diagnostics.appName, 'Safari')
  assert.equal(diagnostics.appResolutionSource, 'helper-frontmost')
  assert.equal(diagnostics.windowTitleResolutionSource, 'window-title')
})

test('diagnoseAccessibilitySnapshot reports top-level selected text as the source when available', () => {
  const diagnostics = diagnoseAccessibilitySnapshot({
    appName: 'Safari',
    windowTitle: 'Pricing',
    focusedRole: 'AXWebArea',
    selectedText: 'Selected paragraph',
    valueText: 'Visible body copy',
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Selected paragraph', 'Visible body copy', 'CTA button']
  })

  assert.equal(diagnostics.selectedTextPresent, true)
  assert.equal(diagnostics.selectedTextSource, 'top-level-selected-text')
})

test('extractAccessibilityContext falls back to focus-chain selected text when top-level selectedText is absent', () => {
  const context = extractAccessibilityContext({
    appName: 'Cursor',
    windowTitle: 'context-reader.ts',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: '/Users/toru/project/src/main/context-reader.ts',
    url: null,
    title: null,
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Editor',
        value: null,
        visibleText: 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
        selectedRangeText: null,
        selectedMarkerText: 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: '/Users/toru/project/src/main/context-reader.ts',
        url: null,
        childCount: 2
      }
    ],
    lines: ['Explorer', 'Search', 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)']
  })

  assert.equal(
    context.selectedText,
    'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)'
  )
  assert.equal(context.selectedTextSource, 'focus-chain-selected-marker-text')
  assert.match(context.pageText ?? '', /const canSkipOcr/)
})

test('diagnoseAccessibilitySnapshot reports focus-chain selected marker text as the source when recovered from fallback', () => {
  const diagnostics = diagnoseAccessibilitySnapshot({
    appName: 'Cursor',
    windowTitle: 'context-reader.ts',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: '/Users/toru/project/src/main/context-reader.ts',
    url: null,
    title: null,
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Editor',
        value: null,
        visibleText: 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
        selectedRangeText: null,
        selectedMarkerText: 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: '/Users/toru/project/src/main/context-reader.ts',
        url: null,
        childCount: 2
      }
    ],
    lines: ['Explorer', 'Search', 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)']
  })

  assert.equal(diagnostics.selectedTextPresent, true)
  assert.equal(diagnostics.selectedTextSource, 'focus-chain-selected-marker-text')
})

test('extractAccessibilityContext ignores placeholder-like focus-chain selection fallbacks', () => {
  const context = extractAccessibilityContext({
    appName: 'Slack',
    windowTitle: 'mk-biz (Channel) - aisaac - Slack',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'mk-biz (Channel) - aisaac - Slack',
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Message field',
        value: null,
        visibleText: null,
        selectedRangeText: null,
        selectedMarkerText: 'Message #mk-biz',
        description: null,
        help: null,
        placeholder: 'Message #mk-biz',
        selectedText: null,
        document: null,
        url: null,
        childCount: 1
      }
    ],
    lines: ['Message to mk-biz', 'Bold', 'Schedule for later', 'Slack']
  })

  assert.equal(context.selectedText, null)
  assert.equal(context.selectedTextSource, 'none')
  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
})

test('diagnoseAccessibilitySnapshot reports none when no trustworthy selected text is available', () => {
  const diagnostics = diagnoseAccessibilitySnapshot({
    appName: 'Slack',
    windowTitle: 'mk-biz (Channel) - aisaac - Slack',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'mk-biz (Channel) - aisaac - Slack',
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Message field',
        value: null,
        visibleText: null,
        selectedRangeText: null,
        selectedMarkerText: 'Message #mk-biz',
        description: null,
        help: null,
        placeholder: 'Message #mk-biz',
        selectedText: null,
        document: null,
        url: null,
        childCount: 1
      }
    ],
    lines: ['Message to mk-biz', 'Bold', 'Schedule for later', 'Slack']
  })

  assert.equal(diagnostics.selectedTextPresent, false)
  assert.equal(diagnostics.selectedTextSource, 'none')
})

test('extractAccessibilityContext recovers selected text from selected range output when direct selected text is missing', () => {
  const context = extractAccessibilityContext({
    appName: 'Xcode',
    windowTitle: 'CapturePlan.swift',
    focusedRole: 'AXTextArea',
    selectedText: null,
    selectedRangeText: null,
    valueText: null,
    document: '/Users/toru/project/KashinAI/Sources/CapturePlan.swift',
    url: null,
    title: null,
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Editor',
        value: null,
        visibleText: 'struct CapturePlan { let pageTitle: String? }',
        selectedRangeText: 'let pageTitle: String?',
        selectedMarkerText: null,
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: '/Users/toru/project/KashinAI/Sources/CapturePlan.swift',
        url: null,
        childCount: 1
      }
    ],
    lines: ['struct CapturePlan { let pageTitle: String? }', 'func buildContext() -> CurrentContext {']
  })

  assert.equal(context.selectedText, 'let pageTitle: String?')
  assert.equal(context.selectedTextSource, 'focus-chain-selected-range-text')
})

test('buildPageTextFromAccessibilityLines removes title and url duplicates when body text exists', () => {
  const pageText = buildPageTextFromAccessibilityLines({
    pageTitle: 'DESIGN.md Examples for AI Agents | Refero Styles',
    pageUrl: 'https://www.refero.design/content/design-md-examples',
    lowSignal: false,
    contentLines: [
      'DESIGN.md Examples for AI Agents | Refero Styles',
      'https://www.refero.design/content/design-md-examples',
      'High-quality DESIGN.md examples for AI agents.',
      'Patterns for instruction design, context windows, and evaluation prompts.'
    ]
  })

  assert.doesNotMatch(pageText ?? '', /Refero Styles/)
  assert.doesNotMatch(pageText ?? '', /https:\/\/www\.refero\.design/)
  assert.match(pageText ?? '', /High-quality DESIGN\.md examples for AI agents\./)
  assert.match(pageText ?? '', /evaluation prompts/)
})

test('normalizeAccessibilityPageTextLines strips browser decorators and removes duplicate title/url rows before assembly', () => {
  assert.deepEqual(
    normalizeAccessibilityPageTextLines({
      pageTitle: 'DESIGN.md Examples for AI Agents | Refero Styles',
      pageUrl: 'https://www.refero.design/content/design-md-examples',
      contentLines: [
        'DESIGN.md Examples for AI Agents | Refero Styles - Google Chrome',
        'https://www.refero.design/content/design-md-examples',
        'High-quality DESIGN.md examples for AI agents.',
        'Patterns for instruction design, context windows, and evaluation prompts.'
      ]
    }),
    [
      'High-quality DESIGN.md examples for AI agents.',
      'Patterns for instruction design, context windows, and evaluation prompts.'
    ]
  )
})

test('normalizeAccessibilityPageTextLines keeps a lone title row when it is the only surviving line', () => {
  assert.deepEqual(
    normalizeAccessibilityPageTextLines({
      pageTitle: 'Pricing overview',
      pageUrl: 'https://example.com/pricing',
      contentLines: ['Pricing overview']
    }),
    ['Pricing overview']
  )
})

test('normalizeResolvedPageTitleCandidate strips generic browser suffixes but preserves matched decorated titles', () => {
  assert.equal(
    normalizeResolvedPageTitleCandidate({
      rawTitle: 'Pricing overview - Google Chrome',
      appName: 'Google Chrome',
      candidateLines: ['Back', 'Forward', 'New tab']
    }),
    'Pricing overview'
  )

  assert.equal(
    normalizeResolvedPageTitleCandidate({
      rawTitle: 'DESIGN.md Examples for AI Agents | Refero Styles',
      appName: 'Dia',
      candidateLines: [
        'DESIGN.md Examples for AI Agents | Refero Styles - Google Chrome',
        'High-quality DESIGN.md examples for AI agents.'
      ]
    }),
    'DESIGN.md Examples for AI Agents | Refero Styles'
  )

  assert.equal(
    normalizeResolvedPageTitleCandidate({
      rawTitle: 'KashinAI context review - Calendar',
      appName: 'Calendar',
      candidateLines: ['KashinAI context review - Calendar']
    }),
    'KashinAI context review - Calendar'
  )
})

test('classifyAccessibilityLowSignalReason distinguishes title-only, browser chrome-only, weak-content, and strong content', () => {
  const titleOnlySnapshot = {
    appName: 'Codex',
    windowTitle: 'Codex',
    focusedRole: null,
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Codex',
    lines: ['Codex']
  }
  assert.equal(
    classifyAccessibilityLowSignalReason({
      snapshot: titleOnlySnapshot,
      rankedLines: [{ line: 'Codex', score: 2 }]
    }),
    'title-only'
  )

  const browserChromeSnapshot = {
    appName: 'Dia',
    windowTitle: 'Personal: Open tabs',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: 'Search tabs',
    document: null,
    url: null,
    title: 'Personal: Open tabs',
    lines: ['Personal: Open tabs', 'New tab', 'Back', 'Forward']
  }
  assert.equal(
    classifyAccessibilityLowSignalReason({
      snapshot: browserChromeSnapshot,
      rankedLines: [
        { line: 'Personal: Open tabs', score: 3 },
        { line: 'New tab', score: 1 },
        { line: 'Back', score: 1 }
      ]
    }),
    'browser-chrome-only'
  )

  const weakContentSnapshot = {
    appName: 'Dia',
    windowTitle: 'Workspace',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Workspace',
    lines: ['alpha beta gamma delta epsilon zeta']
  }
  assert.equal(
    classifyAccessibilityLowSignalReason({
      snapshot: weakContentSnapshot,
      rankedLines: [{ line: 'alpha beta gamma delta epsilon zeta', score: 4 }]
    }),
    'weak-content'
  )

  const strongSnapshot = {
    appName: 'Dia',
    windowTitle: 'Pricing overview',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing overview',
    lines: ['Pricing plans help teams standardize AI workflows across support and sales.']
  }
  assert.equal(
    classifyAccessibilityLowSignalReason({
      snapshot: strongSnapshot,
      rankedLines: [{ line: 'Pricing plans help teams standardize AI workflows across support and sales.', score: 9 }]
    }),
    null
  )
})

test('extractAccessibilityContext ignores non-url document metadata', () => {
  const context = extractAccessibilityContext({
    appName: 'VS Code',
    windowTitle: 'context-reader.ts',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: 'const value = 1',
    document: '/Users/toru/project/src/main/context-reader.ts',
    url: null,
    title: null,
    lines: ['const value = 1', 'function test() {}']
  })

  assert.equal(context.pageUrl, null)
  assert.equal(context.appName, 'VS Code')
  assert.equal(context.windowTitle, 'context-reader.ts')
  assert.equal(context.pageTitle, 'context-reader.ts')
  assert.match(context.accessibilityText ?? '', /function test/)
})

test('extractAccessibilityContext falls back to local document basename when title metadata is missing', () => {
  const context = extractAccessibilityContext({
    appName: 'Xcode',
    windowTitle: null,
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: 'struct CapturePlan { let pageTitle: String? }',
    document: '/Users/toru/project/KashinAI/Sources/CapturePlan.swift',
    url: null,
    title: null,
    lines: ['struct CapturePlan { let pageTitle: String? }', 'func buildContext() -> CurrentContext {']
  })

  assert.equal(context.windowTitle, 'CapturePlan.swift')
  assert.equal(context.pageTitle, 'CapturePlan.swift')
  assert.equal(context.pageUrl, null)
  assert.match(context.pageText ?? '', /struct CapturePlan/)
})

test('extractAccessibilityContext preserves file urls returned directly by accessibility metadata', () => {
  const context = extractAccessibilityContext({
    appName: 'Preview',
    windowTitle: 'LaunchPlan.html',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'file:///Users/toru/Documents/LaunchPlan.html',
    title: 'Launch Plan',
    lines: ['Launch Plan', 'Next customer sync agenda', 'Pricing risks and open questions']
  })

  const diagnostics = diagnoseAccessibilitySnapshot({
    appName: 'Preview',
    windowTitle: 'LaunchPlan.html',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'file:///Users/toru/Documents/LaunchPlan.html',
    title: 'Launch Plan',
    lines: ['Launch Plan', 'Next customer sync agenda', 'Pricing risks and open questions']
  })

  assert.equal(context.pageUrl, 'file:///Users/toru/Documents/LaunchPlan.html')
  assert.equal(diagnostics.pageUrlCandidate, 'file:///Users/toru/Documents/LaunchPlan.html')
  assert.match(context.pageText ?? '', /Next customer sync agenda/)
})

test('extractAccessibilityContext does not treat mailto links as page urls for native mail surfaces', () => {
  const snapshot = {
    appName: 'Mail',
    windowTitle: 'Re: KashinAI launch plan - Mail',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'mailto:pm@example.com',
    title: 'Re: KashinAI launch plan',
    lines: [
      'From',
      'pm@example.com',
      'To',
      'team@example.com',
      'mailto:pm@example.com',
      '今回は価格ではなく、まずは画面文脈の精度改善を主眼に進めたいです。'
    ]
  }

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.pageUrlCandidate, null)
  assert.equal(context.pageUrl, null)
  assert.equal(context.pageTitle, 'Re: KashinAI launch plan')
})

test('resolveSelectedText does not promote mailto-only marker text as meaningful selection', () => {
  const context = extractAccessibilityContext({
    appName: 'Mail',
    windowTitle: 'Re: KashinAI launch plan - Mail',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Re: KashinAI launch plan',
    focusChain: [
      {
        role: 'AXTextField',
        title: 'To',
        value: null,
        visibleText: null,
        selectedRangeText: null,
        selectedMarkerText: 'mailto:pm@example.com',
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: null,
        url: null,
        childCount: 1
      }
    ],
    lines: ['To', 'pm@example.com', 'Reply', 'Send later']
  })

  assert.equal(context.selectedText, null)
  assert.equal(context.selectedTextSource, 'none')
})

test('resolveSelectedTextCandidate rejects placeholder and title-matched chrome while keeping substantive selected text', () => {
  assert.equal(
    resolveSelectedTextCandidate({
      candidate: 'Search',
      placeholder: 'Search',
      title: null
    }),
    null
  )

  assert.equal(
    resolveSelectedTextCandidate({
      candidate: 'Message to mk-biz',
      placeholder: null,
      title: 'Message to mk-biz'
    }),
    null
  )

  assert.equal(
    resolveSelectedTextCandidate({
      candidate: '来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。',
      placeholder: 'Type a new message',
      title: 'Composer'
    }),
    '来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。'
  )
})

test('resolveSelectedTextCandidate reuses the shared ui-noise suppression before applying AX-specific rules', () => {
  assert.equal(
    resolveSelectedTextCandidate({
      candidate: ' コミットまたはプッシュ ',
      appName: 'Codex',
      focusedRole: 'AXButton',
      lines: ['進行中の目標', 'コミットまたはプッシュ']
    }),
    null
  )
})

test('resolveSelectedText does not promote top-level mailto-only selected text as meaningful selection', () => {
  const context = extractAccessibilityContext({
    appName: 'Mail',
    windowTitle: 'Re: KashinAI launch plan - Mail',
    focusedRole: 'AXTextArea',
    selectedText: 'mailto:pm@example.com',
    valueText: null,
    document: null,
    url: null,
    title: 'Re: KashinAI launch plan',
    lines: ['From', 'pm@example.com', 'To', 'team@example.com', 'Subject', 'Re: KashinAI launch plan']
  })

  const diagnostics = diagnoseAccessibilitySnapshot({
    appName: 'Mail',
    windowTitle: 'Re: KashinAI launch plan - Mail',
    focusedRole: 'AXTextArea',
    selectedText: 'mailto:pm@example.com',
    valueText: null,
    document: null,
    url: null,
    title: 'Re: KashinAI launch plan',
    lines: ['From', 'pm@example.com', 'To', 'team@example.com', 'Subject', 'Re: KashinAI launch plan']
  })

  assert.equal(context.selectedText, null)
  assert.equal(context.selectedTextSource, 'none')
  assert.equal(diagnostics.selectedTextPresent, false)
  assert.equal(diagnostics.selectedTextSource, 'none')
})

test('resolveSelectedText does not promote top-level social composer chrome as meaningful selection', () => {
  const snapshot = {
    appName: 'Slack',
    windowTitle: 'mk-biz (Channel) - aisaac - Slack',
    focusedRole: 'AXTextArea',
    selectedText: 'Message #mk-biz',
    valueText: null,
    document: null,
    url: null,
    title: 'mk-biz (Channel) - aisaac - Slack',
    lines: ['Message to mk-biz', 'Bold', 'Schedule for later', 'Slack']
  } as const

  const context = extractAccessibilityContext(snapshot)
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)

  assert.equal(context.selectedText, null)
  assert.equal(context.selectedTextSource, 'none')
  assert.equal(diagnostics.selectedTextPresent, false)
  assert.equal(diagnostics.selectedTextSource, 'none')
})

test('resolveSelectedText does not promote top-level browser chrome as meaningful selection', () => {
  const snapshot = {
    appName: 'Safari',
    windowTitle: 'Pricing',
    focusedRole: 'AXWebArea',
    selectedText: 'Back',
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Back', 'Forward', 'Reload', 'Pricing', 'Visible body copy']
  } as const

  const context = extractAccessibilityContext(snapshot)
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)

  assert.equal(context.selectedText, null)
  assert.equal(context.selectedTextSource, 'none')
  assert.equal(diagnostics.selectedTextPresent, false)
  assert.equal(diagnostics.selectedTextSource, 'none')
  assert.match(context.pageText ?? '', /Visible body copy/)
})

test('resolveSelectedText does not promote Codex workflow action labels as meaningful selection', () => {
  const snapshot = {
    appName: 'Codex',
    windowTitle: 'Codex',
    focusedRole: 'AXGroup',
    selectedText: 'レビューする',
    valueText: null,
    document: null,
    url: null,
    title: 'Codex',
    lines: [
      '新しいタスク',
      'プラグイン',
      '進行中の目標',
      'コミットまたはプッシュ',
      'Discord の live fallback を、その場しのぎではなく正式なregression に乗せました。'
    ]
  } as const

  const context = extractAccessibilityContext(snapshot)
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)

  assert.equal(context.selectedText, null)
  assert.equal(context.selectedTextSource, 'none')
  assert.equal(diagnostics.selectedTextPresent, false)
  assert.equal(diagnostics.selectedTextSource, 'none')
  assert.match(context.pageText ?? '', /Discord の live fallback/)
})

test('extractAccessibilityContext filters generic UI chrome out of page text when content exists', () => {
  const context = extractAccessibilityContext({
    appName: 'Arc',
    windowTitle: 'Pricing | KashinAI',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: [
      'Back',
      'Search',
      'Mark read',
      'KashinAI pricing plans help teams standardize AI workflows across sales and support.',
      'The enterprise plan adds SSO, audit logs, and managed memory controls.',
      'Settings'
    ]
  })

  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.match(context.pageText ?? '', /pricing plans help teams/)
  assert.match(context.pageText ?? '', /enterprise plan adds SSO/)
  assert.doesNotMatch(context.pageText ?? '', /\bMark read\b/i)
  assert.doesNotMatch(context.pageText ?? '', /\bBack\b/i)
})

test('extractAccessibilityContext preserves code-oriented text for editor surfaces', () => {
  const context = extractAccessibilityContext({
    appName: 'Cursor',
    windowTitle: 'context-reader.ts',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
    document: '/Users/toru/project/src/main/context-reader.ts',
    url: null,
    title: null,
    lines: [
      'Explorer',
      'Search',
      'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
      'if (!options.skipOcr && !screenText && screenshot.sourceKind === "window") {',
      'Settings'
    ]
  })

  assert.match(context.pageText ?? '', /const canSkipOcr/)
  assert.match(context.pageText ?? '', /!options\.skipOcr/)
  assert.doesNotMatch(context.pageText ?? '', /\bExplorer\b/)
  assert.doesNotMatch(context.pageText ?? '', /\bSettings\b/)
})

test('low-signal detection does not treat browser chrome valueText alone as real content', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Personal: Open tabs',
      focusedRole: 'AXTextField',
      selectedText: null,
      valueText: 'Search tabs',
      document: null,
      url: null,
      title: 'Personal: Open tabs',
      lines: ['Personal: Open tabs', 'New tab', 'Back', 'Forward']
    })
  )

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, true)
  assert.equal(diagnostics.lowSignalReason, 'browser-chrome-only')
  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
})

test('low-signal detection still treats substantial editor valueText as real content', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Cursor',
      windowTitle: 'context-reader.ts',
      focusedRole: 'AXTextArea',
      selectedText: null,
      valueText: 'const canSkipOcr = hasSubstantialText(accessibilityContext.accessibilityText)',
      document: '/Users/toru/project/src/main/context-reader.ts',
      url: null,
      title: null,
      lines: ['Explorer', 'Search', 'Settings']
    })
  )

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, false)
  assert.match(context.pageText ?? '', /const canSkipOcr/)
  assert.match(context.accessibilityText ?? '', /accessibilityContext/)
})

test('rankAccessibilityLines prioritizes contentful lines ahead of UI chrome', () => {
  const ranked = rankAccessibilityLines({
    appName: 'Arc',
    windowTitle: 'Pricing',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: [
      'Settings',
      'Search',
      'The enterprise plan adds SSO, audit logs, and managed memory controls.',
      'Back'
    ]
  })

  assert.equal(ranked[0]?.line, 'The enterprise plan adds SSO, audit logs, and managed memory controls.')
  assert.ok((ranked.find((item) => item.line === 'The enterprise plan adds SSO, audit logs, and managed memory controls.')?.score ?? 0) >
    (ranked.find((item) => item.line === 'Settings')?.score ?? -999))
})

test('computeAccessibilityLineBaseScore rewards content cues and demotes generic browser chrome', () => {
  assert.ok(
    computeAccessibilityLineBaseScore('The enterprise plan adds SSO, audit logs, and managed memory controls.') >
      computeAccessibilityLineBaseScore('Settings')
  )
  assert.ok(computeAccessibilityLineBaseScore('Pricing, tab') < computeAccessibilityLineBaseScore('Pricing overview'))
})

test('computeAccessibilityRoleScoreAdjustment boosts text-like roles and penalizes button-like roles', () => {
  assert.deepEqual(
    computeAccessibilityRoleScoreAdjustment('Pricing plans help teams standardize AI workflows.', 'AXWebArea'),
    { roleBonus: 2, rolePenalty: 0 }
  )
  assert.deepEqual(
    computeAccessibilityRoleScoreAdjustment('Open', 'AXButton'),
    { roleBonus: 0, rolePenalty: 8 }
  )
})

test('computeAccessibilityTitleScoreAdjustment boosts title-aligned lines and further demotes unrelated browser tabs', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing overview',
      lines: ['Pricing overview', 'Hacker News, tab', 'Pricing plans help teams standardize AI workflows.']
    })
  )

  assert.ok(snapshot)
  assert.deepEqual(computeAccessibilityTitleScoreAdjustment('Pricing overview', snapshot), {
    titleBoost: 29,
    browserTabPenalty: 0
  })
  assert.deepEqual(computeAccessibilityTitleScoreAdjustment('Hacker News, tab', snapshot), {
    titleBoost: 0,
    browserTabPenalty: 6
  })
})

test('isSocialChromeOnlySurface distinguishes sidebar/composer chrome from real message content', () => {
  const snapshot = {
    appName: 'Slack',
    windowTitle: 'mk-biz (Channel) - aisaac - Slack',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'mk-biz (Channel) - aisaac - Slack',
    lines: ['Message to mk-biz', 'Bold', 'Schedule for later', 'Slack']
  } as const

  assert.equal(
    isSocialChromeOnlySurface({
      appName: snapshot.appName,
      snapshot,
      rankedLines: rankAccessibilityLines(snapshot)
    }),
    true
  )

  const contentfulSnapshot = {
    ...snapshot,
    lines: ['Message to mk-biz', '来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。']
  } as const

  assert.equal(
    isSocialChromeOnlySurface({
      appName: contentfulSnapshot.appName,
      snapshot: contentfulSnapshot,
      rankedLines: rankAccessibilityLines(contentfulSnapshot)
    }),
    false
  )
})

test('isBrowserChromeOnlySurface distinguishes tab chrome from meaningful browser body content', () => {
  const snapshot = {
    appName: 'Safari',
    windowTitle: 'Pricing',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Back', 'Forward', 'Reload', 'Pricing, tab']
  } as const

  assert.equal(
    isBrowserChromeOnlySurface({
      appName: snapshot.appName,
      snapshot,
      rankedLines: rankAccessibilityLines(snapshot)
    }),
    true
  )

  const contentfulSnapshot = {
    ...snapshot,
    lines: ['Back', 'Forward', 'Pricing plans help teams standardize AI workflows across support and sales.']
  } as const

  assert.equal(
    isBrowserChromeOnlySurface({
      appName: contentfulSnapshot.appName,
      snapshot: contentfulSnapshot,
      rankedLines: rankAccessibilityLines(contentfulSnapshot)
    }),
    false
  )
})

test('rankAccessibilityLines can promote focus-chain visible text when flat lines are weak', () => {
  const ranked = rankAccessibilityLines({
    appName: 'Notion',
    windowTitle: 'Weekly plan',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Weekly plan',
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Editor',
        value: null,
        visibleText: 'Launch review summary with action items and owners.',
        selectedMarkerText: null,
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: null,
        url: null,
        childCount: 1
      }
    ],
    lines: ['Home', 'Search', 'Inbox']
  })

  assert.equal(ranked[0]?.line, 'Launch review summary with action items and owners.')
})

test('selectAccessibilityContent returns rescued focus-chain content lines in reading order', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Notion',
      windowTitle: 'Weekly plan',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Weekly plan',
      focusChain: [
        {
          role: 'AXTextArea',
          title: 'Editor',
          value: null,
          visibleText: 'Launch review summary with action items and owners.',
          selectedMarkerText: null,
          description: null,
          help: null,
          placeholder: null,
          selectedText: null,
          document: null,
          url: null,
          childCount: 1
        }
      ],
      lines: ['Notion', 'Home', 'Inbox', 'Search']
    })
  )

  assert.ok(snapshot)
  const selection = selectAccessibilityContent(snapshot)

  assert.equal(selection.lowSignal, false)
  assert.equal(selection.contentLines[0], 'Launch review summary with action items and owners.')
  assert.ok(selection.contentLines.every((line) => line !== 'Editor'))
})

test('shouldIncludeAccessibilityLineInContent keeps body copy while filtering browser and social chrome labels', () => {
  const browserSnapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing overview',
      lines: ['Pricing overview', 'Back', 'Forward', 'Pricing plans help teams standardize AI workflows.']
    })
  )

  assert.ok(browserSnapshot)
  assert.equal(shouldIncludeAccessibilityLineInContent('Back', browserSnapshot), false)
  assert.equal(
    shouldIncludeAccessibilityLineInContent('Pricing plans help teams standardize AI workflows.', browserSnapshot),
    true
  )

  const socialSnapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Slack',
      windowTitle: 'mk-biz (Channel) - aisaac - Slack',
      focusedRole: 'AXTextArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'mk-biz (Channel) - aisaac - Slack',
      lines: ['Mark read', 'Message to mk-biz', '来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。']
    })
  )

  assert.ok(socialSnapshot)
  assert.equal(shouldIncludeAccessibilityLineInContent('Mark read', socialSnapshot), false)
  assert.equal(
    shouldIncludeAccessibilityLineInContent(
      '来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。',
      socialSnapshot
    ),
    true
  )
})

test('classifyAccessibilityContentLine explains why mixed app chrome lines are dropped or kept', () => {
  const browserSnapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing overview',
      lines: ['Pricing overview', 'Back', 'Pricing plans help teams standardize AI workflows.']
    })
  )

  assert.ok(browserSnapshot)
  assert.equal(classifyAccessibilityContentLine('Back', browserSnapshot), 'generic-noise')
  assert.equal(classifyAccessibilityContentLine('Pricing overview', browserSnapshot), 'keep')
  assert.equal(
    classifyAccessibilityContentLine('Pricing plans help teams standardize AI workflows.', browserSnapshot),
    'keep'
  )

  const socialSnapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Slack',
      windowTitle: 'mk-biz (Channel) - aisaac - Slack',
      focusedRole: 'AXTextArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'mk-biz (Channel) - aisaac - Slack',
      lines: ['Mark read', 'Message to mk-biz', '来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。']
    })
  )

  assert.ok(socialSnapshot)
  assert.equal(classifyAccessibilityContentLine('Mark read', socialSnapshot), 'generic-noise')
  assert.equal(classifyAccessibilityContentLine('Message to mk-biz', socialSnapshot), 'content-ui-noise')
  assert.equal(
    classifyAccessibilityContentLine(
      '来週の提案ではまずアクセシビリティ経由の文脈取得精度を上げる方針で揃えたいです。',
      socialSnapshot
    ),
    'keep'
  )

  const notionSnapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Notion',
      windowTitle: 'Weekly plan',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Weekly plan',
      lines: ['Search', 'Launch review summary with action items and owners.']
    })
  )

  assert.ok(notionSnapshot)
  assert.equal(classifyAccessibilityContentLine('Search', notionSnapshot), 'generic-noise')
  assert.equal(
    classifyAccessibilityContentLine('Launch review summary with action items and owners.', notionSnapshot),
    'keep'
  )
})

test('selectAccessibilityContentLines filters ranked lines for page text while preserving reading order', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing overview',
      lines: ['Pricing overview', 'Back', 'Pricing plans help teams standardize AI workflows.', 'Forward']
    })
  )

  assert.ok(snapshot)
  const ranked = rankAccessibilityLines(snapshot)
  const contentLines = selectAccessibilityContentLines(snapshot, ranked)

  assert.deepEqual(contentLines, ['Pricing overview', 'Pricing plans help teams standardize AI workflows.'])
})

test('selectAccessibilityContent ignores placeholder-only focus-chain hints when they do not contain real content', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Slack',
      windowTitle: 'mk-biz (Channel) - aisaac - Slack',
      focusedRole: 'AXTextArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'mk-biz (Channel) - aisaac - Slack',
      focusChain: [
        {
          role: 'AXTextArea',
          title: 'Message Body',
          value: null,
          visibleText: null,
          selectedMarkerText: null,
          description: 'Compose area',
          help: 'Type a new message',
          placeholder: 'Message #mk-biz',
          selectedText: null,
          document: null,
          url: null,
          childCount: 1
        }
      ],
      lines: ['Slack', 'Message to mk-biz', 'Bold', 'Schedule for later']
    })
  )

  assert.ok(snapshot)
  const selection = selectAccessibilityContent(snapshot)

  assert.equal(selection.lowSignal, true)
  assert.equal(selection.lowSignalReason, 'social-chrome-only')
  assert.deepEqual(selection.contentLines, [])
  assert.ok(selection.rankedLines.every((item) => item.line !== 'Message #mk-biz'))
  assert.ok(selection.rankedLines.every((item) => item.line !== 'Type a new message'))
})

test('selectAccessibilityContent does not rescue supplemental focus-chain labels from nodes without readable text signals', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Personal: Open tabs',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Personal: Open tabs',
      focusChain: [
        {
          role: 'AXGroup',
          title: 'Pricing overview',
          value: null,
          visibleText: null,
          selectedMarkerText: null,
          description: 'Pricing plans help teams standardize AI workflows across support and sales.',
          help: 'The enterprise plan adds SSO and audit logs.',
          placeholder: null,
          selectedText: null,
          document: null,
          url: null,
          childCount: 1,
          attributeNames: ['AXTitle', 'AXDescription'],
          selectedTextRange: '{location:0, length:0}',
          visibleCharacterRange: '{location:0, length:0}'
        }
      ],
      lines: ['Personal: Open tabs', 'HN Top Links - Popular Stories from Hacker News、タブ', 'New tab', 'Back']
    })
  )

  assert.ok(snapshot)
  const selection = selectAccessibilityContent(snapshot)

  assert.equal(selection.lowSignal, true)
  assert.equal(selection.lowSignalReason, 'browser-chrome-only')
  assert.deepEqual(selection.contentLines, [])
  assert.ok(selection.rankedLines.every((item) => item.line !== 'Pricing overview'))
  assert.ok(selection.rankedLines.every((item) => item.line !== 'The enterprise plan adds SSO and audit logs.'))
})

test('selectAccessibilityContent rescues substantial focus-chain description text when the node is tied to a real page url', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing overview',
      focusChain: [
        {
          role: 'AXWebArea',
          title: 'Pricing overview',
          value: null,
          visibleText: null,
          selectedMarkerText: null,
          description: 'Pricing plans help teams standardize AI workflows across support and sales.',
          help: 'The enterprise plan adds SSO, audit logs, and managed memory controls.',
          placeholder: null,
          selectedText: null,
          document: null,
          url: 'https://example.com/pricing',
          childCount: 1,
          attributeNames: ['AXRole', 'AXTitle', 'AXURL', 'AXDescription', 'AXHelp']
        }
      ],
      lines: ['Pricing overview', 'https://example.com/pricing', 'Back', 'Forward']
    })
  )

  assert.ok(snapshot)
  const selection = selectAccessibilityContent(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(selection.lowSignal, false)
  assert.match(selection.contentLines.join('\n'), /Pricing plans help teams standardize AI workflows/)
  assert.match(selection.contentLines.join('\n'), /enterprise plan adds SSO/)
  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.match(context.pageText ?? '', /Pricing plans help teams standardize AI workflows/)
  assert.match(context.pageText ?? '', /enterprise plan adds SSO/)
})

test('selectAccessibilityContent returns no content lines for browser chrome-only snapshots', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Personal: Open tabs',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: 'Search tabs',
      document: null,
      url: null,
      title: 'Personal: Open tabs',
      lines: ['Personal: Open tabs', 'New tab', 'Back', 'Forward']
    })
  )

  assert.ok(snapshot)
  const selection = selectAccessibilityContent(snapshot)

  assert.equal(selection.lowSignal, true)
  assert.equal(selection.lowSignalReason, 'browser-chrome-only')
  assert.deepEqual(selection.contentLines, [])
})

test('rankAccessibilityLines prefers lines aligned with the frontmost browser title over unrelated tab labels', () => {
  const ranked = rankAccessibilityLines({
    appName: 'ChatGPT Atlas',
    windowTitle: 'ブランド一覧｜全品鑑定済み【クレバッグ】',
    focusedRole: null,
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://clebag.com/brands/louis-vuitton',
    title: 'ブランド一覧｜全品鑑定済み【クレバッグ】',
    lines: [
      '次世代アバターSNSアプリ『ポケユニ』、情報初解禁＆事前登録キャンペーン開始！ | ココネ株式会社、タブ',
      'https://clebag.com/brands/louis-vuitton',
      'ブランド一覧｜全品鑑定済み【クレバッグ】、タブ',
      'ブランド一覧｜全品鑑定済み【クレバッグ】',
      'HN Top Links - Popular Stories from Hacker News、タブ'
    ]
  })

  assert.match(ranked[0]?.line ?? '', /ブランド一覧｜全品鑑定済み【クレバッグ】|https:\/\/clebag\.com\/brands\/louis-vuitton/)
  const topThree = ranked.slice(0, 3).map((item) => item.line)
  assert.ok(topThree.includes('https://clebag.com/brands/louis-vuitton') || topThree.includes('ブランド一覧｜全品鑑定済み【クレバッグ】'))
})

test('extractAccessibilityContext drops title-only snapshots as low-signal context', () => {
  const context = extractAccessibilityContext({
    appName: 'Codex',
    windowTitle: 'Codex',
    focusedRole: null,
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Codex',
    lines: ['Codex']
  })

  assert.equal(context.pageTitle, 'Codex')
  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
  assert.equal(context.accessibilityCaptureMethod, 'none')
})

test('extractAccessibilityContext keeps browser url metadata but drops url-only chrome snapshots as low-signal', () => {
  const snapshot = {
    appName: 'Dia',
    windowTitle: 'Pricing | KashinAI',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Pricing', 'https://example.com/pricing', 'Back', 'Forward', 'New tab']
  }

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.pageUrlCandidate, 'https://example.com/pricing')
  assert.equal(diagnostics.lowSignal, true)
  assert.equal(diagnostics.lowSignalReason, 'browser-chrome-only')
  assert.equal(context.pageTitle, 'Pricing')
  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
  assert.equal(context.accessibilityCaptureMethod, 'none')
})

test('resolveAccessibilityCaptureOutcome packages both extraction output and low-signal diagnostics from the same snapshot', () => {
  const snapshot = {
    appName: 'Dia',
    windowTitle: 'Pricing | KashinAI',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://example.com/pricing',
    title: 'Pricing',
    lines: ['Pricing', 'https://example.com/pricing', 'Back', 'Forward', 'New tab']
  }

  const outcome = resolveAccessibilityCaptureOutcome(snapshot)

  assert.equal(outcome.extraction.pageTitle, 'Pricing')
  assert.equal(outcome.extraction.pageUrl, 'https://example.com/pricing')
  assert.equal(outcome.extraction.pageText, null)
  assert.equal(outcome.extraction.accessibilityCaptureMethod, 'none')
  assert.equal(outcome.diagnostics.pageUrlCandidate, 'https://example.com/pricing')
  assert.equal(outcome.diagnostics.lowSignal, true)
  assert.equal(outcome.diagnostics.lowSignalReason, 'browser-chrome-only')
})

test('resolveAccessibilityCaptureOutcome classifies a missing snapshot as low-signal without duplicating fallback rules in the caller', () => {
  const outcome = resolveAccessibilityCaptureOutcome(null)

  assert.equal(outcome.extraction.appName, null)
  assert.equal(outcome.extraction.windowTitle, null)
  assert.equal(outcome.extraction.selectedText, null)
  assert.equal(outcome.extraction.accessibilityText, null)
  assert.equal(outcome.extraction.accessibilityCaptureMethod, 'none')
  assert.equal(outcome.extraction.pageTitle, null)
  assert.equal(outcome.extraction.pageUrl, null)
  assert.equal(outcome.extraction.pageText, null)
  assert.equal(outcome.diagnostics.lowSignal, true)
  assert.equal(outcome.diagnostics.lowSignalReason, 'missing-snapshot')
  assert.equal(outcome.diagnostics.appResolutionSource, 'none')
  assert.equal(outcome.diagnostics.windowTitleResolutionSource, 'none')
})

test('extractAccessibilityContext suppresses UserNotificationCenter permission prompts', () => {
  const context = extractAccessibilityContext({
    appName: 'UserNotificationCenter',
    windowTitle: null,
    focusedRole: 'AXWindow',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'UserNotificationCenter',
    lines: [
      '“Codex”が“Google Chrome”を制御するアクセスを要求しています。',
      'Codex uses Apple Events to control Mac apps on your behalf',
      '通知',
      '許可しない',
      '許可'
    ]
  })

  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
  assert.equal(context.accessibilityCaptureMethod, 'none')
})

test('extractAccessibilityContext suppresses loginwindow system shell snapshots', () => {
  const snapshot = {
    appName: 'loginwindow',
    windowTitle: 'ログイン',
    focusedRole: 'AXWindow',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'ログイン',
    lines: ['ログイン', 'loginwindow']
  }

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, true)
  assert.equal(diagnostics.lowSignalReason, 'system-shell')
  assert.equal(context.accessibilityCaptureMethod, 'none')
  assert.equal(context.accessibilityText, null)
  assert.equal(context.pageTitle, null)
  assert.equal(context.pageText, null)
})

test('extractAccessibilityContext drops chrome-only Slack style snapshots without strong content', () => {
  const context = extractAccessibilityContext({
    appName: 'Slack',
    windowTitle: 'mk-biz (Channel) - aisaac - Slack',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'mk-biz (Channel) - aisaac - Slack',
    lines: ['mk-biz (Channel) - aisaac - Slack', 'Message to mk-biz', 'Slack']
  })

  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
  assert.equal(context.accessibilityCaptureMethod, 'none')
})

test('extractAccessibilityContext drops notion chrome-only snapshots without body content', () => {
  const context = extractAccessibilityContext({
    appName: 'Notion',
    windowTitle: '2026/7',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: '2026/7',
    lines: ['Converted to Page', 'Moved to Trash', 'Skip to content', 'Notion', 'Chat', 'Meetings', 'Inbox']
  })

  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
  assert.equal(context.accessibilityCaptureMethod, 'none')
})

test('extractAccessibilityContext keeps a single contentful notion line when it looks like real page text', () => {
  const context = extractAccessibilityContext({
    appName: 'Notion',
    windowTitle: '2026/7',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: '2026/7',
    lines: [
      'Converted to Page',
      'Moved to Trash',
      '【業務委託】Welcome 田野 徹 さん！',
      'Skip to content',
      'Notion',
      'Home'
    ]
  })

  assert.match(context.pageText ?? '', /Welcome 田野 徹 さん/)
  assert.match(context.accessibilityText ?? '', /Welcome 田野 徹 さん/)
  assert.equal(context.accessibilityCaptureMethod, 'ax-tree')
})

test('extractAccessibilityContext uses focus-chain visible text when top-level lines are only chrome', () => {
  const context = extractAccessibilityContext({
    appName: 'Notion',
    windowTitle: 'Weekly plan',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Weekly plan',
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Editor',
        value: null,
        visibleText: 'Launch review summary with action items and owners.',
        selectedMarkerText: null,
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: null,
        url: null,
        childCount: 1
      }
    ],
    lines: ['Notion', 'Home', 'Inbox', 'Search']
  })

  assert.match(context.pageText ?? '', /Launch review summary/)
  assert.match(context.accessibilityText ?? '', /action items and owners/)
  assert.equal(context.accessibilityCaptureMethod, 'ax-tree')
})

test('extractAccessibilityContext favors frontmost browser title and URL over unrelated tab titles', () => {
  const context = extractAccessibilityContext({
    appName: 'ChatGPT Atlas',
    windowTitle: 'ブランド一覧｜全品鑑定済み【クレバッグ】',
    focusedRole: null,
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://clebag.com/brands/louis-vuitton',
    title: 'ブランド一覧｜全品鑑定済み【クレバッグ】',
    lines: [
      '次世代アバターSNSアプリ『ポケユニ』、情報初解禁＆事前登録キャンペーン開始！ | ココネ株式会社、タブ',
      'https://clebag.com/brands/louis-vuitton',
      'ブランド一覧｜全品鑑定済み【クレバッグ】、タブ',
      'ブランド一覧｜全品鑑定済み【クレバッグ】',
      'HN Top Links - Popular Stories from Hacker News、タブ',
      '戻る',
      '進む'
    ]
  })

  const pageText = context.pageText ?? ''
  assert.equal(context.pageUrl, 'https://clebag.com/brands/louis-vuitton')
  assert.equal(context.pageTitle, 'ブランド一覧｜全品鑑定済み【クレバッグ】')
  assert.match(pageText, /ブランド一覧｜全品鑑定済み【クレバッグ】/)
  assert.doesNotMatch(pageText, /Hacker News/)
})

test('extractAccessibilityContext recovers schemeless browser urls from accessibility lines', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing | KashinAI',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: 'example.com/pricing',
      document: null,
      url: null,
      title: 'Pricing',
      lines: [
        'Back',
        'example.com/pricing',
        'Pricing plans help teams standardize AI workflows across support and sales.',
        'The enterprise plan adds SSO and audit logs.'
      ]
    })
  )

  assert.ok(snapshot)
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.pageUrlCandidate, 'https://example.com/pricing')
  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.match(context.pageText ?? '', /Pricing plans help teams/)
  assert.match(context.pageText ?? '', /enterprise plan adds SSO/)
})

test('collectAccessibilityUrlCandidates deduplicates mixed browser sources before ranking', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: 'example.com/pricing-overview',
      document: null,
      url: null,
      title: 'Pricing overview',
      focusChain: [
        {
          role: 'AXWebArea',
          title: 'Pricing overview',
          value: 'https://example.com/pricing-overview',
          visibleText: 'Pricing overview',
          selectedRangeText: null,
          selectedMarkerText: null,
          description: null,
          help: null,
          placeholder: null,
          selectedText: null,
          document: null,
          url: null,
          childCount: 1
        }
      ],
      lines: [
        'example.com/pricing-overview',
        'https://example.com/pricing-overview',
        'https://docs.google.com/document/d/pricing-overview/edit'
      ]
    })
  )

  assert.ok(snapshot)
  const candidates = collectAccessibilityUrlCandidates(snapshot)

  assert.deepEqual(candidates, [
    { text: 'https://example.com/pricing-overview', url: 'https://example.com/pricing-overview' },
    {
      text: 'https://docs.google.com/document/d/pricing-overview/edit',
      url: 'https://docs.google.com/document/d/pricing-overview/edit'
    }
  ])
})

test('collectAccessibilityUrlCandidates ignores loose https links on editor-like surfaces while preserving direct file metadata elsewhere', () => {
  const editorSnapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Cursor',
      windowTitle: 'notes.md',
      focusedRole: 'AXTextArea',
      selectedText: null,
      valueText: 'Reference: https://example.com/pricing',
      document: '/Users/toru/project/notes.md',
      url: null,
      title: 'notes.md',
      lines: ['Reference: https://example.com/pricing']
    })
  )

  assert.ok(editorSnapshot)
  assert.deepEqual(collectAccessibilityUrlCandidates(editorSnapshot), [])
})

test('rankAccessibilityUrlCandidates prefers the candidate aligned with the frontmost title over private but similarly named urls', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Pricing overview',
      lines: [
        'Pricing overview',
        'https://docs.google.com/document/d/pricing-overview/edit',
        'https://example.com/pricing-overview'
      ]
    })
  )

  assert.ok(snapshot)
  const ranked = rankAccessibilityUrlCandidates(snapshot, collectAccessibilityUrlCandidates(snapshot))

  assert.equal(ranked[0]?.url, 'https://example.com/pricing-overview')
  assert.ok((ranked[0]?.score ?? -999) > (ranked[1]?.score ?? -999))
})

test('extractAccessibilityContext prefers the browser url candidate that matches the frontmost title when multiple urls are visible', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Pricing overview',
      lines: [
        'https://news.ycombinator.com/news',
        'https://example.com/pricing-overview',
        'Pricing plans help teams standardize AI workflows across support and sales.',
        'The enterprise plan adds SSO and audit logs.'
      ]
    })
  )

  assert.ok(snapshot)
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.pageUrlCandidate, 'https://example.com/pricing-overview')
  assert.equal(context.pageUrl, 'https://example.com/pricing-overview')
  assert.match(context.pageText ?? '', /Pricing plans help teams/)
})

test('extractAccessibilityContext keeps page title metadata while avoiding duplicate title/url lines in page text', () => {
  const context = extractAccessibilityContext({
    appName: 'Dia',
    windowTitle: 'Personal: DESIGN.md Examples for AI Agents',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://www.refero.design/content/design-md-examples',
    title: 'DESIGN.md Examples for AI Agents | Refero Styles',
    lines: [
      'DESIGN.md Examples for AI Agents | Refero Styles',
      'https://www.refero.design/content/design-md-examples',
      'High-quality DESIGN.md examples for AI agents.',
      'Patterns for instruction design, context windows, and evaluation prompts.'
    ]
  })

  assert.equal(context.pageTitle, 'DESIGN.md Examples for AI Agents | Refero Styles')
  assert.equal(context.pageUrl, 'https://www.refero.design/content/design-md-examples')
  assert.match(context.pageText ?? '', /High-quality DESIGN\.md examples for AI agents\./)
  assert.match(context.pageText ?? '', /evaluation prompts/)
  assert.doesNotMatch(context.pageText ?? '', /Refero Styles/)
  assert.doesNotMatch(context.pageText ?? '', /https:\/\/www\.refero\.design/)
})

test('diagnoseAccessibilitySnapshot marks Slack chrome-only snapshots as low-signal with explicit reason', () => {
  const snapshot = parseAccessibilityHelperOutput(JSON.stringify(fixture('slack-chrome-only.json')))
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, true)
  assert.equal(diagnostics.lowSignalReason, 'social-chrome-only')
  assert.equal(context.accessibilityText, null)
})

test('extractAccessibilityContext keeps native mail body text while dropping header chrome', () => {
  const context = extractAccessibilityContext({
    appName: 'Mail',
    windowTitle: 'Re: KashinAI launch plan - Mail',
    focusedRole: 'AXTextArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Re: KashinAI launch plan',
    focusChain: [
      {
        role: 'AXTextArea',
        title: 'Message Body',
        value: null,
        visibleText:
          '先方には来週火曜までに初回の提案を返します。\n今回は価格ではなく、まずは画面文脈の精度改善を主眼に進めたいです。',
        selectedMarkerText: null,
        description: null,
        help: null,
        placeholder: 'Message Body',
        selectedText: null,
        document: null,
        url: null,
        childCount: 2
      }
    ],
    lines: [
      'From',
      'pm@example.com',
      'To',
      'team@example.com',
      'Subject',
      'Re: KashinAI launch plan',
      'Reply',
      'Send later',
      '先方には来週火曜までに初回の提案を返します。',
      '今回は価格ではなく、まずは画面文脈の精度改善を主眼に進めたいです。'
    ]
  })

  assert.match(context.accessibilityText ?? '', /画面文脈の精度改善/)
  assert.doesNotMatch(context.accessibilityText ?? '', /\bFrom\b|\bTo\b|\bSubject\b|Send later/)
  assert.doesNotMatch(context.pageText ?? '', /\bFrom\b|\bTo\b|\bSubject\b|Send later/)
})

test('extractAccessibilityContext keeps calendar event details while dropping shell chrome', () => {
  const context = extractAccessibilityContext({
    appName: 'Calendar',
    windowTitle: 'KashinAI context review',
    focusedRole: 'AXGroup',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'KashinAI context review',
    focusChain: [
      {
        role: 'AXGroup',
        title: 'Event details',
        value: null,
        visibleText:
          'KashinAI context review\n明日 14:00 - 14:30\n参加者: toru@example.com, pm@example.com\n議題: アクセシビリティ経由で取れている文脈の精度確認\nZoom\nhttps://zoom.us/j/1234567890',
        selectedMarkerText: null,
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: null,
        url: null,
        childCount: 5
      }
    ],
    lines: [
      'Today',
      'Inbox',
      'Search',
      'KashinAI context review',
      '明日 14:00 - 14:30',
      '参加者: toru@example.com, pm@example.com',
      '議題: アクセシビリティ経由で取れている文脈の精度確認',
      'Zoom',
      'https://zoom.us/j/1234567890'
    ]
  })

  assert.equal(context.pageUrl, 'https://zoom.us/j/1234567890')
  assert.match(context.pageText ?? '', /参加者: toru@example.com, pm@example.com/)
  assert.match(context.pageText ?? '', /議題: アクセシビリティ経由で取れている文脈の精度確認/)
  assert.doesNotMatch(context.pageText ?? '', /\bToday\b|\bInbox\b|\bSearch\b/)
})

test('extractAccessibilityContext keeps figma selection details while dropping design chrome', () => {
  const context = extractAccessibilityContext({
    appName: 'Figma',
    windowTitle: 'Marketing Site',
    focusedRole: 'AXGroup',
    selectedText: null,
    valueText: null,
    document: null,
    url: null,
    title: 'Marketing Site',
    focusChain: [
      {
        role: 'AXGroup',
        title: 'Selection inspector',
        value: null,
        visibleText:
          'Frame: Hero / Pricing\nComponent: Primary CTA\nButton label: Start free trial\nAuto layout: vertical, spacing 24\nNotes: pricing comparison and social proof need tighter hierarchy',
        selectedMarkerText: null,
        description: null,
        help: null,
        placeholder: null,
        selectedText: null,
        document: null,
        url: null,
        childCount: 5
      }
    ],
    lines: [
      'Layers',
      'Assets',
      'Design',
      'Prototype',
      'Inspect',
      'Frame: Hero / Pricing',
      'Component: Primary CTA',
      'Button label: Start free trial',
      'Auto layout: vertical, spacing 24',
      'Notes: pricing comparison and social proof need tighter hierarchy',
      'Fill',
      'Stroke'
    ]
  })

  assert.match(context.pageText ?? '', /Primary CTA/)
  assert.match(context.pageText ?? '', /social proof need tighter hierarchy/)
  assert.doesNotMatch(context.pageText ?? '', /\bLayers\b|\bAssets\b|\bInspect\b/)
})

test('diagnoseAccessibilitySnapshot marks browser tab chrome-only snapshots as low-signal with explicit reason', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Dia',
      windowTitle: 'Personal: Open tabs',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Personal: Open tabs',
      lines: [
        'Personal: Open tabs',
        'HN Top Links - Popular Stories from Hacker News、タブ',
        'Slack | Internal updates、タブ',
        'New tab',
        'Back',
        'Forward'
      ]
    })
  )

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, true)
  assert.equal(diagnostics.lowSignalReason, 'browser-chrome-only')
  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
})

test('diagnoseAccessibilitySnapshot treats English browser tab labels as browser chrome-only noise', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Google Chrome',
      windowTitle: 'Open tabs',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: 'Open tabs',
      lines: ['Open tabs', 'Hacker News, tab', 'Internal updates, tab', 'New tab', 'Back', 'Forward']
    })
  )

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, true)
  assert.equal(diagnostics.lowSignalReason, 'browser-chrome-only')
  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
})

test('extractAccessibilityContext keeps frontmost browser body text even when other tabs are labeled in English', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Google Chrome',
      windowTitle: 'Pricing overview',
      focusedRole: 'AXWebArea',
      selectedText: null,
      valueText: null,
      document: null,
      url: 'https://example.com/pricing',
      title: 'Pricing overview',
      focusChain: [
        {
          role: 'AXWebArea',
          title: 'Pricing overview',
          value: null,
          visibleText: 'Pricing plans help teams standardize AI workflows across support and sales.',
          selectedRangeText: null,
          selectedMarkerText: null,
          description: null,
          help: null,
          placeholder: null,
          selectedText: null,
          document: null,
          url: 'https://example.com/pricing',
          childCount: 8
        }
      ],
      lines: [
        'Hacker News, tab',
        'Internal updates, tab',
        'Pricing overview',
        'https://example.com/pricing',
        'Pricing plans help teams standardize AI workflows across support and sales.'
      ]
    })
  )

  const context = extractAccessibilityContext(snapshot)

  assert.equal(context.accessibilityCaptureMethod, 'ax-tree')
  assert.equal(context.pageUrl, 'https://example.com/pricing')
  assert.match(context.pageText ?? '', /Pricing plans help teams standardize AI workflows/)
  assert.doesNotMatch(context.pageText ?? '', /Hacker News, tab/)
})

test('fixture: Dia browser tabs snapshot keeps frontmost page signals and stays high-signal', () => {
  const snapshot = parseAccessibilityHelperOutput(JSON.stringify(fixture('dia-browser-tabs.json')))
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, false)
  assert.equal(diagnostics.pageUrlCandidate, 'https://www.refero.design/content/design-md-examples')
  assert.match(diagnostics.rankedLines[0]?.line ?? '', /DESIGN\.md Examples|https:\/\/www\.refero\.design/)
  assert.match(context.pageText ?? '', /High-quality DESIGN\.md examples/)
})

test('fixture: Notion dense page snapshot stays high-signal and keeps document body over chrome', () => {
  const snapshot = parseAccessibilityHelperOutput(JSON.stringify(fixture('notion-dense-page.json')))
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, false)
  assert.equal(diagnostics.lowSignalReason, null)
  assert.match(context.pageText ?? '', /Launch review summary with action items and owners\./)
  assert.match(context.pageText ?? '', /trial-to-paid step/)
  assert.match(context.pageText ?? '', /tighten onboarding copy/)
  assert.doesNotMatch(context.pageText ?? '', /\bShare\b|\bFavorite\b|\bAdd comment\b/)
})

test('fixture: Slack contentful compose snapshot stays high-signal when real message text is visible', () => {
  const snapshot = parseAccessibilityHelperOutput(JSON.stringify(fixture('slack-contentful-compose.json')))
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, false)
  assert.equal(diagnostics.lowSignalReason, null)
  assert.match(context.pageText ?? '', /比較のために12日文金はおじので行こうかなと考えています！/)
  assert.match(context.pageText ?? '', /営業導線の詰まりを解くのがよさそうです。/)
  assert.doesNotMatch(context.pageText ?? '', /\bBold\b|Schedule for later|Message to mk-biz/)
})

test('diagnoseAccessibilitySnapshot does not confuse ordinary app notification labels with Notification Center', () => {
  const snapshot = parseAccessibilityHelperOutput(
    JSON.stringify({
      appName: 'Discord',
      windowTitle: '#一般 | ShogunAI - Discord',
      focusedRole: 'AXGroup',
      selectedText: null,
      valueText: null,
      document: null,
      url: null,
      title: '#一般 | ShogunAI - Discord',
      lines: [
        'Toru Tano',
        'Gota Wazumi',
        'woojin',
        '一般のメッセージ',
        'ShogunAI (サーバー)',
        '#一般 | ShogunAI - Discord',
        '通知設定',
        'ピン留めされたメッセージ',
        'メンバーリストを非表示'
      ]
    })
  )

  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignalReason, 'social-chrome-only')
  assert.equal(context.pageText, null)
  assert.equal(context.accessibilityText, null)
})

test('extractAccessibilityContext keeps Product Hunt body text while dropping browser-shell and collection labels', () => {
  const context = extractAccessibilityContext({
    appName: 'Google Chrome',
    windowTitle: 'Product Hunt – テクノロジー分野における最高の新製品。 - 固定済み - Google Chrome - Product (仕事)',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://www.producthunt.com/',
    title: 'Product Hunt – テクノロジー分野における最高の新製品。',
    lines: [
      'クリス・メッシーナ JustVibeの売り文句は「あなたのために作られたアプリを備えた、行動のための検索エンジン」です。',
      'AIエージェントをウェブアプリのように、わずか数分でリリースできます。',
      'Product Hunt – テクノロジー分野における最高の新製品。 - 固定済み - Google Chrome - Product (仕事)',
      'Product Hunt – テクノロジー分野における最高の新製品。',
      'https://www.producthunt.com/',
      'メインナビゲーション',
      '今後のイベント',
      'Google Chrome',
      '新しいタブ',
      'タブ検索',
      '再読み込み',
      'Product (仕事)',
      'Chrome',
      '本日発売の注目商品'
    ]
  })

  assert.match(context.pageText ?? '', /JustVibeの売り文句/)
  assert.match(context.pageText ?? '', /AIエージェントをウェブアプリのように/)
  assert.equal(context.pageTitle, 'Product Hunt – テクノロジー分野における最高の新製品。')
  assert.doesNotMatch(context.pageText ?? '', /\bGoogle Chrome\b/)
  assert.doesNotMatch(context.pageText ?? '', /Product \(仕事\)/)
  assert.doesNotMatch(context.pageText ?? '', /新しいタブ|タブ検索|再読み込み|メインナビゲーション|今後のイベント/)
})

test('extractAccessibilityContext strips browser-shell suffixes from decorated browser window titles when they are the only title signal', () => {
  const context = extractAccessibilityContext({
    appName: 'Google Chrome',
    windowTitle: 'Town - 固定済み - Google Chrome - dev',
    focusedRole: 'AXWebArea',
    selectedText: null,
    valueText: null,
    document: null,
    url: 'https://www.town.com/',
    title: null,
    lines: [
      'https://www.town.com/',
      'Task Assignee: Ticker.',
      'Cmd/Ctrl+Shift+M to open Assign to menu.',
      'Add to task',
      'Delay start',
      'Permission',
      'Submit type: Task',
      'Dictate (tap to toggle, hold to speak)'
    ]
  })

  assert.equal(context.pageTitle, 'Town')
  assert.equal(context.pageUrl, 'https://www.town.com/')
  assert.match(context.pageText ?? '', /Task Assignee: Ticker/)
})

test('fixture: Cursor editor snapshot stays high-signal and preserves code context', () => {
  const snapshot = parseAccessibilityHelperOutput(JSON.stringify(fixture('cursor-editor.json')))
  const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
  const context = extractAccessibilityContext(snapshot)

  assert.equal(diagnostics.lowSignal, false)
  assert.equal(diagnostics.pageUrlCandidate, null)
  assert.match(context.pageText ?? '', /const canSkipOcr/)
  assert.match(context.pageText ?? '', /!options\.skipOcr/)
})
