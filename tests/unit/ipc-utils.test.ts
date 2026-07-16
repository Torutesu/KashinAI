import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBackendDiagnostics,
  buildFusionInputs,
  buildInlineFallbackChatResult,
  buildRetrievalOnlyAnswer,
  buildRetrievalOnlyAnswerParams,
  canFuseRetrievedContextSource,
  contentAwareCodingFallback,
  contentAwareSocialFallback,
  contextFromFallbackParams,
  getScreenCaptureStatusForPlatform,
  hasChatInput,
  hasGenerateInput,
  hasUsableRetrievedContext,
  hasUsableCurrentContextSignal,
  hasVisibleCurrentContextSignal,
  isReadyGBrainContextSource,
  latestUserMessage,
  normalizeGBrainLookup,
  resolveDiagnosticsExecutionPlan,
  resolveDiagnosticsRequestPlan,
  resolveDiagnosticsSearchExecutionPlan,
  resolveDiagnosticsRuntimeState,
  resolveRetrievalOnlyInlineAnswerPlan,
  resolveChatRequestPlan,
  resolveChatExecutionPlan,
  resolveGBrainLookup,
  resolveAssistantMemoryPlan,
  resolveDiagnosticsSearchPlan,
  resolveDiagnosticsScreenDecisionReason,
  resolveGenerateExecutionPlan,
  resolveGenerateRequestPlan,
  resolveScreenCapturePermissionRequest,
  resolveShortcutUpdateAttemptPlan,
  resolveShortcutUpdateFlowResolution,
  resolveShortcutUpdateResolution,
  shouldSuppressMemoryForInlineRecommendation,
  wantsInlineRecommendation
} from '../../src/main/ipc-utils.ts'
import {
  buildBrowserCaptureSummary,
  deriveBrowserCaptureUsageFlags,
  deriveSkippedBrowserCapture,
  resolveBrowserCaptureSummaryPath,
  resolveBrowserCaptureSummaryStepState
} from '../../src/shared/browser-capture-summary.ts'
import type { CurrentContext } from '../../src/shared/types'

function baseContext(overrides: Partial<CurrentContext> = {}): CurrentContext {
  return {
    activeApp: 'Dia',
    windowTitle: 'Current page',
    contextKind: 'browser',
    primaryContentSource: 'page-text',
    pageTitle: 'Current page',
    pageUrl: 'https://example.com/current',
    pageText: 'Current page body',
    pageCaptureMethod: 'browser-automation',
    accessibilityText: 'Visible body text',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: '2026-07-07T00:00:00.000Z',
    ...overrides
  }
}

test('wantsInlineRecommendation detects ready-to-send style prompts', () => {
  assert.equal(wantsInlineRecommendation('今すぐ貼り付けて使えるおすすめ文をください'), true)
  assert.equal(wantsInlineRecommendation('ready-to-send reply please'), true)
  assert.equal(wantsInlineRecommendation('この画面を要約して'), false)
})

test('resolveScreenCapturePermissionRequest opens System Settings until screen capture is granted', () => {
  assert.deepEqual(resolveScreenCapturePermissionRequest('granted'), {
    shouldOpenSystemSettings: false
  })
  assert.deepEqual(resolveScreenCapturePermissionRequest('not-determined'), {
    shouldOpenSystemSettings: true
  })
  assert.deepEqual(resolveScreenCapturePermissionRequest('denied'), {
    shouldOpenSystemSettings: true
  })
})

test('resolveDiagnosticsSearchPlan uses a stable custom prompt for context-grounded diagnostics', () => {
  assert.deepEqual(resolveDiagnosticsSearchPlan(), {
    actionType: 'custom',
    userInstruction: 'この文脈を確認したい'
  })
})

test('resolveDiagnosticsExecutionPlan only searches GBrain when visible context was actually captured', () => {
  assert.deepEqual(resolveDiagnosticsExecutionPlan(baseContext()), {
    searchPlan: {
      actionType: 'custom',
      userInstruction: 'この文脈を確認したい'
    },
    shouldSearchGBrain: true
  })

  assert.deepEqual(
    resolveDiagnosticsExecutionPlan(
      baseContext({
        selectedText: null,
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null,
        clipboardText: 'copied fallback only'
      })
    ),
    {
      searchPlan: {
        actionType: 'custom',
        userInstruction: 'この文脈を確認したい'
      },
      shouldSearchGBrain: false
    }
  )
})

test('resolveDiagnosticsRequestPlan keeps diagnostics search-query inputs aligned with the execution plan', () => {
  assert.deepEqual(resolveDiagnosticsRequestPlan(baseContext()), {
    searchPlan: {
      actionType: 'custom',
      userInstruction: 'この文脈を確認したい'
    },
    shouldSearchGBrain: true,
    searchQueryPlan: {
      actionType: 'custom',
      userInstruction: 'この文脈を確認したい',
      shouldBuildSearchQuery: true
    }
  })

  assert.deepEqual(
    resolveDiagnosticsRequestPlan(
      baseContext({
        selectedText: null,
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null
      })
    ),
    {
      searchPlan: {
        actionType: 'custom',
        userInstruction: 'この文脈を確認したい'
      },
      shouldSearchGBrain: false,
      searchQueryPlan: {
        actionType: 'custom',
        userInstruction: 'この文脈を確認したい',
        shouldBuildSearchQuery: false
      }
    }
  )
})

test('resolveDiagnosticsSearchExecutionPlan suppresses GBrain lookup for blank queries and no-visible-context captures', () => {
  const blankQuery = resolveDiagnosticsSearchExecutionPlan({
    currentContext: {
      selectedText: null,
      pageText: 'Visible page body',
      pageUrl: 'https://example.com/pricing',
      accessibilityText: null,
      screenText: null
    },
    searchQuery: '   '
  })

  assert.equal(blankQuery.shouldSearchGBrain, true)
  assert.equal(blankQuery.normalizedSearchQuery, '')
  assert.equal(blankQuery.shouldLookupGBrain, false)
  assert.equal(blankQuery.reason, 'blank-search-query')

  const noVisibleContext = resolveDiagnosticsSearchExecutionPlan({
    currentContext: {
      selectedText: null,
      pageText: null,
      pageUrl: null,
      accessibilityText: null,
      screenText: null
    },
    searchQuery: 'pricing page'
  })

  assert.equal(noVisibleContext.shouldSearchGBrain, false)
  assert.equal(noVisibleContext.shouldLookupGBrain, false)
  assert.equal(noVisibleContext.reason, 'no-visible-context')

  const runnable = resolveDiagnosticsSearchExecutionPlan({
    currentContext: {
      selectedText: 'pricing',
      pageText: null,
      pageUrl: null,
      accessibilityText: null,
      screenText: null
    },
    searchQuery: '  pricing page  '
  })

  assert.equal(runnable.normalizedSearchQuery, 'pricing page')
  assert.equal(runnable.shouldLookupGBrain, true)
  assert.equal(runnable.reason, 'lookup')
})

test('shouldSuppressMemoryForInlineRecommendation only suppresses for social or coding contexts', () => {
  assert.equal(
    shouldSuppressMemoryForInlineRecommendation(baseContext({ contextKind: 'social' }), 'おすすめ文を作って'),
    true
  )
  assert.equal(
    shouldSuppressMemoryForInlineRecommendation(baseContext({ contextKind: 'coding' }), 'ready-to-send fix note'),
    true
  )
  assert.equal(
    shouldSuppressMemoryForInlineRecommendation(baseContext({ contextKind: 'browser' }), 'おすすめ文を作って'),
    false
  )
})

test('resolveAssistantMemoryPlan distinguishes generate suppression from chat inline fallback', () => {
  const socialContext = baseContext({ contextKind: 'social' })

  assert.deepEqual(
    resolveAssistantMemoryPlan({
      mode: 'generate',
      context: socialContext,
      message: 'おすすめ文を作って'
    }),
    {
      suppressMemory: true,
      shouldUseInlineFallback: false,
      reason: 'inline-recommendation'
    }
  )

  assert.deepEqual(
    resolveAssistantMemoryPlan({
      mode: 'chat',
      context: socialContext,
      message: 'おすすめ文を作って'
    }),
    {
      suppressMemory: true,
      shouldUseInlineFallback: true,
      reason: 'inline-recommendation'
    }
  )

  assert.deepEqual(
    resolveAssistantMemoryPlan({
      mode: 'chat',
      context: baseContext({ contextKind: 'browser' }),
      message: 'このページを要約して'
    }),
    {
      suppressMemory: false,
      shouldUseInlineFallback: false,
      reason: 'normal'
    }
  )
})

test('hasGenerateInput accepts either instruction or captured context signals', () => {
  assert.equal(hasGenerateInput({ currentContext: baseContext(), userInstruction: '' }), true)
  assert.equal(
    hasGenerateInput({
      currentContext: baseContext({
        selectedText: null,
        clipboardText: null,
        pageText: 'Visible page body captured from browser context',
        accessibilityText: null,
        screenText: null
      }),
      userInstruction: ''
    }),
    true
  )
  assert.equal(
    hasGenerateInput({
      currentContext: baseContext({
        selectedText: null,
        clipboardText: null,
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null
      }),
      userInstruction: ''
    }),
    false
  )
})

test('hasUsableCurrentContextSignal accepts clipboard-only fallback but visible-signal check does not', () => {
  const clipboardOnly = baseContext({
    selectedText: null,
    clipboardText: 'copied fallback',
    pageText: null,
    pageUrl: null,
    accessibilityText: null,
    screenText: null
  })

  assert.equal(hasUsableCurrentContextSignal(clipboardOnly), true)
  assert.equal(hasVisibleCurrentContextSignal(clipboardOnly), false)
})

test('hasVisibleCurrentContextSignal recognizes visible page or OCR signals only', () => {
  assert.equal(
    hasVisibleCurrentContextSignal(
      baseContext({
        selectedText: null,
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null
      })
    ),
    false
  )

  assert.equal(
    hasVisibleCurrentContextSignal(
      baseContext({
        selectedText: null,
        pageText: null,
        pageUrl: 'https://example.com/current',
        accessibilityText: null,
        screenText: null
      })
    ),
    true
  )
})

test('latestUserMessage returns the most recent user-authored chat message', () => {
  assert.equal(
    latestUserMessage([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'last' }
    ]),
    'last'
  )
  assert.equal(latestUserMessage([{ role: 'assistant', content: 'only assistant' }]), '')
})

test('hasChatInput detects either a user message or visible captured context', () => {
  assert.equal(
    hasChatInput({
      currentContext: baseContext({ pageText: null, accessibilityText: null, screenText: null, selectedText: null, clipboardText: null }),
      messages: [{ role: 'user', content: 'please summarize' }]
    }),
    true
  )
  assert.equal(
    hasChatInput({
      currentContext: baseContext({ pageText: 'Visible page body' }),
      messages: [{ role: 'assistant', content: 'previous reply' }]
    }),
    true
  )
  assert.equal(
    hasChatInput({
      currentContext: baseContext({
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null,
        selectedText: null,
        clipboardText: 'copied fallback'
      }),
      messages: [{ role: 'assistant', content: 'previous reply' }]
    }),
    true
  )
  assert.equal(
    hasChatInput({
      currentContext: baseContext({
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null,
        selectedText: null,
        clipboardText: null
      }),
      messages: [{ role: 'assistant', content: 'previous reply' }]
    }),
    false
  )
})

test('resolveGenerateRequestPlan packages no-input failure and memory suppression as pure data', () => {
  assert.deepEqual(
    resolveGenerateRequestPlan({
      currentContext: baseContext({
        contextKind: 'social',
        selectedText: null,
        clipboardText: null,
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null
      }),
      userInstruction: ''
    }),
    {
      canProceed: false,
      memoryPlan: {
        suppressMemory: false,
        shouldUseInlineFallback: false,
        reason: 'normal'
      },
      error: {
        code: 'no_selection',
        message:
          'No text selected and clipboard is empty. Select some text and try again, or type a custom instruction.'
      }
    }
  )

  assert.deepEqual(
    resolveGenerateRequestPlan({
      currentContext: baseContext({ contextKind: 'coding' }),
      userInstruction: 'ready-to-send fix note'
    }),
    {
      canProceed: true,
      memoryPlan: {
        suppressMemory: true,
        shouldUseInlineFallback: false,
        reason: 'inline-recommendation'
      }
    }
  )
})

test('resolveGenerateExecutionPlan decides whether retrieval runs and whether the response uses LLM', () => {
  assert.deepEqual(
    resolveGenerateExecutionPlan({
      requestPlan: {
        canProceed: true,
        memoryPlan: {
          suppressMemory: true,
          shouldUseInlineFallback: false,
          reason: 'inline-recommendation'
        }
      },
      hasApiKey: false
    }),
    {
      shouldSearchGBrain: false,
      executionMode: 'retrieval-only'
    }
  )

  assert.deepEqual(
    resolveGenerateExecutionPlan({
      requestPlan: {
        canProceed: true,
        memoryPlan: {
          suppressMemory: false,
          shouldUseInlineFallback: false,
          reason: 'normal'
        }
      },
      hasApiKey: true
    }),
    {
      shouldSearchGBrain: true,
      executionMode: 'llm'
    }
  )
})

test('resolveChatRequestPlan returns latest message, inline fallback intent, and no-input failures', () => {
  assert.deepEqual(
    resolveChatRequestPlan({
      currentContext: baseContext({
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null,
        selectedText: null,
        clipboardText: null
      }),
      messages: [{ role: 'assistant', content: 'previous reply' }]
    }),
    {
      canProceed: false,
      latestMessage: '',
      memoryPlan: {
        suppressMemory: false,
        shouldUseInlineFallback: false,
        reason: 'normal'
      },
      shouldUseInlineFallback: false,
      error: {
        code: 'no_selection',
        message: 'No chat message or page context was captured. Open a page, select text, or type a message.'
      }
    }
  )

  assert.deepEqual(
    resolveChatRequestPlan({
      currentContext: baseContext({ contextKind: 'social' }),
      messages: [{ role: 'user', content: 'おすすめ文を作って' }]
    }),
    {
      canProceed: true,
      latestMessage: 'おすすめ文を作って',
      memoryPlan: {
        suppressMemory: true,
        shouldUseInlineFallback: true,
        reason: 'inline-recommendation'
      },
      shouldUseInlineFallback: true
    }
  )
})

test('resolveChatExecutionPlan skips retrieval for inline fallback and otherwise selects llm vs retrieval-only', () => {
  assert.deepEqual(
    resolveChatExecutionPlan({
      requestPlan: {
        canProceed: true,
        latestMessage: 'おすすめ文を作って',
        memoryPlan: {
          suppressMemory: true,
          shouldUseInlineFallback: true,
          reason: 'inline-recommendation'
        },
        shouldUseInlineFallback: true
      },
      hasApiKey: true
    }),
    {
      shouldSearchGBrain: false,
      executionMode: 'inline-fallback'
    }
  )

  assert.deepEqual(
    resolveChatExecutionPlan({
      requestPlan: {
        canProceed: true,
        latestMessage: 'このページを要約して',
        memoryPlan: {
          suppressMemory: false,
          shouldUseInlineFallback: false,
          reason: 'normal'
        },
        shouldUseInlineFallback: false
      },
      hasApiKey: false
    }),
    {
      shouldSearchGBrain: true,
      executionMode: 'retrieval-only'
    }
  )

  // skipMemory forces the fast path: no GBrain retrieval, but the LLM still runs.
  assert.deepEqual(
    resolveChatExecutionPlan({
      requestPlan: {
        canProceed: true,
        latestMessage: 'draft a reply',
        memoryPlan: { suppressMemory: false, shouldUseInlineFallback: false, reason: 'normal' },
        shouldUseInlineFallback: false
      },
      hasApiKey: true,
      skipMemory: true
    }),
    {
      shouldSearchGBrain: false,
      executionMode: 'llm'
    }
  )
})

test('resolveShortcutUpdateResolution encodes shortcut swap rollback behavior explicitly', () => {
  assert.deepEqual(
    resolveShortcutUpdateResolution({
      requestedShortcut: undefined,
      previousShortcut: 'Option+Space',
      swapped: false,
      restored: false,
      registeredShortcutAfterRestore: 'Option+Space'
    }),
    {
      shouldAttemptShortcutSwap: false,
      shouldRollbackSettings: false,
      shouldReturnEarly: false
    }
  )

  assert.deepEqual(
    resolveShortcutUpdateResolution({
      requestedShortcut: 'Option+Space',
      previousShortcut: 'Option+Space',
      swapped: false,
      restored: false,
      registeredShortcutAfterRestore: 'Option+Space'
    }),
    {
      shouldAttemptShortcutSwap: false,
      shouldRollbackSettings: false,
      shouldReturnEarly: false
    }
  )

  assert.deepEqual(
    resolveShortcutUpdateResolution({
      requestedShortcut: 'Option+[',
      previousShortcut: 'Option+Space',
      swapped: true,
      restored: false,
      registeredShortcutAfterRestore: 'Option+['
    }),
    {
      shouldAttemptShortcutSwap: true,
      shouldRollbackSettings: false,
      shouldReturnEarly: false
    }
  )

  assert.deepEqual(
    resolveShortcutUpdateResolution({
      requestedShortcut: 'Option+[',
      previousShortcut: 'Option+Space',
      swapped: false,
      restored: true,
      registeredShortcutAfterRestore: 'Option+Space'
    }),
    {
      shouldAttemptShortcutSwap: true,
      shouldRollbackSettings: true,
      shouldReturnEarly: false
    }
  )

  assert.deepEqual(
    resolveShortcutUpdateResolution({
      requestedShortcut: 'Option+[',
      previousShortcut: 'Option+Space',
      swapped: false,
      restored: false,
      registeredShortcutAfterRestore: 'Option+]'
    }),
    {
      shouldAttemptShortcutSwap: true,
      shouldRollbackSettings: true,
      shouldReturnEarly: true
    }
  )
})

test('resolveShortcutUpdateAttemptPlan isolates whether settings:set should touch OS shortcut registration', () => {
  assert.deepEqual(
    resolveShortcutUpdateAttemptPlan({
      requestedShortcut: undefined,
      previousShortcut: 'Option+Space'
    }),
    {
      shouldAttemptShortcutSwap: false,
      requestedShortcut: null,
      rollbackShortcut: null
    }
  )

  assert.deepEqual(
    resolveShortcutUpdateAttemptPlan({
      requestedShortcut: 'Option+Space',
      previousShortcut: 'Option+Space'
    }),
    {
      shouldAttemptShortcutSwap: false,
      requestedShortcut: null,
      rollbackShortcut: null
    }
  )

  assert.deepEqual(
    resolveShortcutUpdateAttemptPlan({
      requestedShortcut: 'Option+[',
      previousShortcut: 'Option+Space'
    }),
    {
      shouldAttemptShortcutSwap: true,
      requestedShortcut: 'Option+[',
      rollbackShortcut: 'Option+Space'
    }
  )
})

test('resolveShortcutUpdateFlowResolution keeps attempt planning and rollback resolution aligned', () => {
  assert.deepEqual(
    resolveShortcutUpdateFlowResolution({
      requestedShortcut: 'Option+[',
      previousShortcut: 'Option+Space',
      swapped: false,
      restored: true,
      registeredShortcutAfterRestore: 'Option+Space'
    }),
    {
      attemptPlan: {
        shouldAttemptShortcutSwap: true,
        requestedShortcut: 'Option+[',
        rollbackShortcut: 'Option+Space'
      },
      resolution: {
        shouldAttemptShortcutSwap: true,
        shouldRollbackSettings: true,
        shouldReturnEarly: false
      }
    }
  )

  assert.deepEqual(
    resolveShortcutUpdateFlowResolution({
      requestedShortcut: 'Option+Space',
      previousShortcut: 'Option+Space',
      swapped: false,
      restored: false,
      registeredShortcutAfterRestore: 'Option+Space'
    }),
    {
      attemptPlan: {
        shouldAttemptShortcutSwap: false,
        requestedShortcut: null,
        rollbackShortcut: null
      },
      resolution: {
        shouldAttemptShortcutSwap: false,
        shouldRollbackSettings: false,
        shouldReturnEarly: false
      }
    }
  )
})

test('contextFromFallbackParams derives primary source from the strongest visible signal', () => {
  const context = contextFromFallbackParams({
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: null,
    accessibilityText: 'Visible pricing text',
    screenText: null,
    contextKind: 'browser',
    timestamp: '2026-07-07T00:00:00.000Z'
  })

  assert.equal(context.windowTitle, 'Pricing')
  assert.equal(context.primaryContentSource, 'accessibility-text')
  assert.equal(context.accessibilityCaptureMethod, 'ax-tree')
  assert.equal(context.screenCaptureMethod, 'none')
})

test('contentAwareSocialFallback keeps the visible social context in the short response', () => {
  const output = contentAwareSocialFallback(
    baseContext({
      activeApp: 'Slack',
      contextKind: 'social',
      primaryContentSource: 'accessibility-text',
      pageTitle: null,
      pageUrl: null,
      pageText: null,
      accessibilityText: 'AIツールの良し悪しは画面文脈で決まる'
    })
  )

  assert.match(output, /AIツールの良し悪し/)
  assert.match(output, /気になります|詳しく見てみたい/)
})

test('contentAwareCodingFallback shifts tone when the visible context contains an error', () => {
  const output = contentAwareCodingFallback(
    baseContext({
      activeApp: 'Cursor',
      contextKind: 'coding',
      primaryContentSource: 'screen-ocr',
      pageTitle: null,
      pageUrl: null,
      pageText: null,
      accessibilityText: null,
      screenText: 'TypeError: Cannot read properties of undefined in ipc.ts'
    })
  )

  assert.match(output, /TypeError/)
  assert.match(output, /変更点と再現条件|原因を絞る/)
})

test('buildInlineFallbackChatResult returns a renderer-ready chat payload without sources', () => {
  const currentContext = baseContext({
    activeApp: 'Slack',
    contextKind: 'social',
    pageText: null,
    pageUrl: null,
    accessibilityText: 'AIツールの良し悪しは画面文脈で決まる'
  })
  const result = buildInlineFallbackChatResult({
    currentContext,
    latestUserMessage: '貼り付けて使えるおすすめ文をください'
  })

  assert.equal(result.message.role, 'assistant')
  assert.equal(result.sources.length, 0)
  assert.equal(result.contextSource, 'none')
  assert.equal(result.currentContext, currentContext)
  assert.match(result.message.content, /AIツールの良し悪し/)
})

test('normalizeGBrainLookup collapses null lookups to empty results and none source', () => {
  assert.deepEqual(normalizeGBrainLookup(null), {
    results: [],
    contextSource: 'none'
  })

  assert.deepEqual(
    normalizeGBrainLookup({
      contextSource: 'gbrain-cli',
      results: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }]
    }),
    {
      contextSource: 'gbrain-cli',
      results: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }]
    }
  )
})

test('resolveGBrainLookup separates usable retrieval from provider readiness', () => {
  assert.deepEqual(
    resolveGBrainLookup(null),
    {
      results: [],
      contextSource: 'none',
      hasUsableContext: false,
      providerReady: false
    }
  )

  assert.deepEqual(
    resolveGBrainLookup({
      contextSource: 'local-fallback',
      results: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }]
    }),
    {
      results: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }],
      contextSource: 'local-fallback',
      hasUsableContext: true,
      providerReady: true
    }
  )
})

test('hasUsableRetrievedContext and isReadyGBrainContextSource encode retrieval semantics explicitly', () => {
  assert.equal(hasUsableRetrievedContext({ contextSource: 'none', results: [] }), false)
  assert.equal(
    hasUsableRetrievedContext({
      contextSource: 'local-fallback',
      results: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }]
    }),
    true
  )

  assert.equal(isReadyGBrainContextSource('gbrain-cli'), true)
  assert.equal(isReadyGBrainContextSource('gbrain-http'), true)
  assert.equal(isReadyGBrainContextSource('local-fallback'), true)
  assert.equal(isReadyGBrainContextSource('none'), false)
})

test('canFuseRetrievedContextSource stays aligned with every retrieval source we consider ready', () => {
  assert.equal(canFuseRetrievedContextSource('gbrain-cli'), true)
  assert.equal(canFuseRetrievedContextSource('gbrain-http'), true)
  assert.equal(canFuseRetrievedContextSource('local-fallback'), true)
  assert.equal(canFuseRetrievedContextSource('none'), false)
})

test('buildRetrievalOnlyAnswer returns a short inline social fallback without sources', () => {
  const output = buildRetrievalOnlyAnswer({
    latestUserMessage: '貼り付けて使えるおすすめ文をください',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    accessibilityText: '比較のために12日文金はおじので行こうかなと考えています！',
    screenText: null,
    contextKind: 'social',
    sources: [],
    timestamp: '2026-07-07T00:00:00.000Z'
  })

  assert.match(output, /行こうかなと考えています/)
  assert.doesNotMatch(output, /LLM API key is not configured/)
})

test('resolveRetrievalOnlyInlineAnswerPlan prioritizes visible context for social/coding and only references GBrain on general surfaces', () => {
  assert.deepEqual(
    resolveRetrievalOnlyInlineAnswerPlan({
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing page body',
      accessibilityText: 'Visible pricing text',
      screenText: null,
      contextKind: 'social',
      topSourceTitle: 'Pricing FAQ'
    }),
    {
      pageLabel: 'Pricing',
      visibleHint: 'Visible pricing text',
      shouldUseSocialFallback: true,
      shouldUseCodingFallback: false,
      shouldReferenceTopSource: false,
      gbrainHint: 'GBrainの「Pricing FAQ」'
    }
  )

  assert.deepEqual(
    resolveRetrievalOnlyInlineAnswerPlan({
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Pricing page body',
      accessibilityText: null,
      screenText: null,
      contextKind: 'browser',
      topSourceTitle: 'Pricing FAQ'
    }),
    {
      pageLabel: 'Pricing',
      visibleHint: 'Pricing page body',
      shouldUseSocialFallback: false,
      shouldUseCodingFallback: false,
      shouldReferenceTopSource: true,
      gbrainHint: 'GBrainの「Pricing FAQ」'
    }
  )
})

test('buildRetrievalOnlyAnswer references GBrain when a non-social recommendation has retrieval context', () => {
  const output = buildRetrievalOnlyAnswer({
    latestUserMessage: 'おすすめ文を作って',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    accessibilityText: 'Visible pricing text',
    screenText: null,
    contextKind: 'browser',
    sources: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }],
    timestamp: '2026-07-07T00:00:00.000Z'
  })

  assert.match(output, /Pricing/)
  assert.match(output, /GBrainの「Pricing FAQ」/)
})

test('buildRetrievalOnlyAnswer falls back to the retrieval-only diagnostic block for normal chat', () => {
  const output = buildRetrievalOnlyAnswer({
    latestUserMessage: 'この画面を要約して',
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    accessibilityText: 'Visible pricing text',
    screenText: null,
    contextKind: 'browser',
    sources: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }],
    timestamp: '2026-07-07T00:00:00.000Z'
  })

  assert.match(output, /LLM API key is not configured/)
  assert.match(output, /Pricing FAQ/)
  assert.match(output, /Open page context:/)
})

test('buildRetrievalOnlyAnswerParams maps currentContext into retrieval-only answer input', () => {
  const currentContext = baseContext({
    pageTitle: 'Pricing',
    pageUrl: 'https://example.com/pricing',
    pageText: 'Pricing page body',
    accessibilityText: 'Visible pricing text',
    screenText: 'OCR pricing text',
    contextKind: 'browser'
  })

  assert.deepEqual(
    buildRetrievalOnlyAnswerParams({
      currentContext,
      latestUserMessage: 'このページを要約して',
      sources: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }],
      timestamp: '2026-07-07T00:00:00.000Z'
    }),
    {
      latestUserMessage: 'このページを要約して',
      pageUrl: 'https://example.com/pricing',
      pageTitle: 'Pricing',
      pageText: 'Pricing page body',
      accessibilityText: 'Visible pricing text',
      screenText: 'OCR pricing text',
      contextKind: 'browser',
      sources: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }],
      timestamp: '2026-07-07T00:00:00.000Z'
    }
  )
})

test('buildFusionInputs summarizes whether retrieval and live context can actually fuse', () => {
  const fused = buildFusionInputs(
    baseContext({
      pageText: 'Pricing page body',
      accessibilityText: null,
      screenText: null,
      selectedText: null
    }),
    'gbrain-cli',
    2
  )
  assert.equal(fused.canFuseContext, true)
  assert.equal(fused.fusionInputs.hasGBrainContext, true)
  assert.equal(fused.fusionInputs.hasPageContext, true)
  assert.equal(fused.fusionInputs.hasAccessibilityContext, false)
  assert.equal(fused.fusionInputs.hasScreenContext, false)

  const notFused = buildFusionInputs(
    baseContext({
      pageText: null,
      pageUrl: null,
      accessibilityText: null,
      screenText: null,
      selectedText: null
    }),
    'none',
    0
  )
  assert.equal(notFused.canFuseContext, false)
  assert.equal(notFused.fusionInputs.hasGBrainContext, false)
  assert.equal(notFused.fusionInputs.hasAccessibilityContext, false)
  assert.equal(notFused.fusionInputs.hasScreenContext, false)

  const clipboardOnly = buildFusionInputs(
    baseContext({
      selectedText: null,
      clipboardText: 'copied fallback',
      pageText: null,
      pageUrl: null,
      accessibilityText: null,
      screenText: null
    }),
    'gbrain-cli',
    1
  )
  assert.equal(clipboardOnly.canFuseContext, false)
  assert.equal(clipboardOnly.fusionInputs.hasClipboardFallback, true)
  assert.equal(clipboardOnly.fusionInputs.hasAccessibilityContext, false)
  assert.equal(clipboardOnly.fusionInputs.hasScreenContext, false)

  const localFallbackFused = buildFusionInputs(
    baseContext({
      pageText: 'Visible page body from live context',
      accessibilityText: null,
      screenText: null,
      selectedText: null
    }),
    'local-fallback',
    1
  )
  assert.equal(localFallbackFused.canFuseContext, true)
  assert.equal(localFallbackFused.fusionInputs.hasGBrainContext, true)
  assert.equal(localFallbackFused.fusionInputs.hasPageContext, true)
  assert.equal(localFallbackFused.fusionInputs.hasAccessibilityContext, false)
  assert.equal(localFallbackFused.fusionInputs.hasScreenContext, false)

  const accessibilityOnly = buildFusionInputs(
    baseContext({
      pageText: null,
      pageUrl: null,
      accessibilityText: 'Visible accessibility-only text',
      screenshotPath: null,
      screenText: null,
      selectedText: null
    }),
    'gbrain-cli',
    1
  )
  assert.equal(accessibilityOnly.canFuseContext, true)
  assert.equal(accessibilityOnly.fusionInputs.hasAccessibilityContext, true)
  assert.equal(accessibilityOnly.fusionInputs.hasScreenContext, false)

  const screenOnly = buildFusionInputs(
    baseContext({
      pageText: null,
      pageUrl: null,
      accessibilityText: null,
      screenshotPath: '/tmp/capture.png',
      screenText: 'OCR snippet',
      selectedText: null
    }),
    'gbrain-cli',
    1
  )
  assert.equal(screenOnly.canFuseContext, true)
  assert.equal(screenOnly.fusionInputs.hasAccessibilityContext, false)
  assert.equal(screenOnly.fusionInputs.hasScreenContext, true)
})

test('resolveBrowserCaptureSummaryPath maps final capture state to a stable diagnostics path', () => {
  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'accessibility',
        primaryContentSource: 'accessibility-text'
      }),
      skippedBrowserCapture: true
    }),
    'accessibility-short-circuit'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'accessibility',
        primaryContentSource: 'page-text'
      }),
      skippedBrowserCapture: false
    }),
    'accessibility-retained'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'accessibility',
        primaryContentSource: 'selected-text',
        pageTitle: 'Slack',
        pageUrl: null,
        pageText: null,
        accessibilityText: 'Discuss launch timing in Slack thread',
        selectedText: 'Discuss launch timing'
      }),
      skippedBrowserCapture: false
    }),
    'no-page-context'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'accessibility',
        primaryContentSource: 'none',
        pageTitle: 'Only title',
        pageUrl: null,
        pageText: null,
        accessibilityText: null,
        selectedText: null
      }),
      skippedBrowserCapture: false
    }),
    'no-page-context'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'browser-automation',
        primaryContentSource: 'page-text'
      }),
      skippedBrowserCapture: false
    }),
    'browser-automation'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'keyboard-copy',
        primaryContentSource: 'page-text'
      }),
      skippedBrowserCapture: false
    }),
    'keyboard-copy'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'chrome-session',
        primaryContentSource: 'page-text'
      }),
      skippedBrowserCapture: false
    }),
    'chrome-session'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'none',
        primaryContentSource: 'screen-ocr'
      }),
      skippedBrowserCapture: false
    }),
    'screen-ocr-fallback'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'none',
        primaryContentSource: 'none',
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenText: null
      }),
      skippedBrowserCapture: false
    }),
    'no-page-context'
  )
})

test('resolveBrowserCaptureSummaryStepState interprets attempted browser fallback steps consistently', () => {
  assert.deepEqual(
    resolveBrowserCaptureSummaryStepState({
      currentContext: baseContext({
        pageCaptureMethod: 'accessibility'
      }),
      skippedBrowserCapture: true,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Current page',
        canSkipBrowserCapture: true,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'none',
          afterBrowserNextStep: 'none',
          afterKeyboardNextStep: 'none',
          attemptedSteps: [],
          browserCaptureMethod: null,
          keyboardCaptureMethod: null,
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'accessibility'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none'
        }
      }
    }),
    {
      lastAttemptedStep: null,
      nextPlannedStep: 'none',
      stalledAtStep: null
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureSummaryStepState({
      currentContext: baseContext({
        pageCaptureMethod: 'none'
      }),
      skippedBrowserCapture: false,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Current page',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'session',
          attemptedSteps: ['browser'],
          browserCaptureMethod: 'none',
          keyboardCaptureMethod: null,
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'none'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-ocr'
        }
      }
    }),
    {
      lastAttemptedStep: 'browser',
      nextPlannedStep: 'keyboard',
      stalledAtStep: 'browser'
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureSummaryStepState({
      currentContext: baseContext({
        pageCaptureMethod: 'none'
      }),
      skippedBrowserCapture: false,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Current page',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'session',
          attemptedSteps: ['browser', 'keyboard'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'none'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-ocr'
        }
      }
    }),
    {
      lastAttemptedStep: 'keyboard',
      nextPlannedStep: 'session',
      stalledAtStep: 'keyboard'
    }
  )

  assert.deepEqual(
    resolveBrowserCaptureSummaryStepState({
      currentContext: baseContext({
        pageCaptureMethod: 'chrome-session'
      }),
      skippedBrowserCapture: false,
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Current page',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'session',
          attemptedSteps: ['browser', 'keyboard', 'session'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: 'chrome-session',
          finalPageCaptureMethod: 'chrome-session'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-ocr'
        }
      }
    }),
    {
      lastAttemptedStep: 'session',
      nextPlannedStep: 'session',
      stalledAtStep: null
    }
  )
})

test('deriveSkippedBrowserCapture prefers trace evidence and otherwise infers an accessibility short-circuit', () => {
  assert.equal(
    deriveSkippedBrowserCapture({
      currentContext: baseContext({
        pageCaptureMethod: 'accessibility',
        pageText: 'Strong accessibility page context'
      }),
      captureTrace: {
        resolvedActiveApp: 'Safari',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: true,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'none',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser'],
          browserCaptureMethod: 'none',
          keyboardCaptureMethod: null,
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'accessibility'
        },
        screen: {
          shouldCaptureScreen: false,
          reason: 'strong-accessibility-context',
          finalScreenCaptureMethod: 'none'
        }
      }
    }),
    false
  )

  assert.equal(
    deriveSkippedBrowserCapture({
      currentContext: baseContext({
        activeApp: 'Mail',
        contextKind: 'document',
        pageCaptureMethod: 'accessibility',
        pageUrl: null,
        pageText: 'Strong accessibility page context'
      })
    }),
    true
  )

  assert.equal(
    deriveSkippedBrowserCapture({
      currentContext: baseContext({
        activeApp: 'Safari',
        contextKind: 'browser',
        pageCaptureMethod: 'accessibility',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Strong accessibility page context from a browser tab'
      })
    }),
    false
  )
})

test('deriveBrowserCaptureUsageFlags treats attempted steps and capture methods as equivalent evidence', () => {
  assert.deepEqual(
    deriveBrowserCaptureUsageFlags({
      currentContext: baseContext({
        pageCaptureMethod: 'keyboard-copy',
        pageText: 'Recovered by keyboard'
      }),
      captureTrace: {
        resolvedActiveApp: 'Firefox',
        resolvedWindowTitle: 'Pricing',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'none',
          attemptedSteps: ['browser'],
          browserCaptureMethod: 'browser-automation',
          keyboardCaptureMethod: 'keyboard-copy',
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'keyboard-copy'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'window-ocr'
        }
      }
    }),
    {
      usedBrowserAutomation: true,
      usedKeyboardFallback: true,
      usedSessionFallback: false
    }
  )
})

test('buildBackendDiagnostics assembles gbrain status, fusion flags, and current context for the renderer', () => {
  const currentContext = baseContext({
    selectedText: 'Current selection',
    pageText: null,
    pageUrl: null,
    accessibilityText: 'Visible fallback text',
    screenCaptureMethod: 'window-ocr',
    screenText: 'OCR fallback text'
  })

  const diagnostics = buildBackendDiagnostics({
    accessibilityGranted: true,
    screenCaptureStatus: 'granted',
    currentContext,
    gbrain: {
      contextSource: 'gbrain-http',
      results: [
        { source: 'company/faq', title: 'Pricing FAQ', content: 'answer' },
        { source: 'project/notes', title: 'Launch Notes', content: 'notes' }
      ],
      trace: {
        requestedMode: 'http',
        attemptedSources: ['gbrain-http'],
        finalContextSource: 'gbrain-http',
        fallbackReason: 'none'
      }
    },
    accessibilityDiagnostics: {
      appName: 'Dia',
      rawAppName: 'Dia',
      workspaceAppName: 'Dia',
      topWindowOwnerName: 'Dia',
      windowTitle: 'Current page',
      rawWindowTitle: 'Current page',
      topWindowTitle: 'Current page',
      appResolutionSource: 'helper-frontmost',
      windowTitleResolutionSource: 'window-title',
      focusedRole: 'AXWebArea',
      pageUrlCandidate: 'https://example.com/pricing',
      selectedTextPresent: true,
      selectedTextSource: 'top-level-selected-text',
      valueTextPresent: true,
      focusChainNodeCount: 3,
      rankedLines: [{ line: 'Visible fallback text', score: 14 }],
      lowSignal: true,
      lowSignalReason: 'weak-content'
    },
    captureTrace: {
      resolvedActiveApp: 'Dia',
      resolvedWindowTitle: 'Current page',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'session',
        attemptedSteps: ['browser', 'keyboard'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: 'keyboard-copy',
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'browser-automation'
      },
      screen: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal',
        finalScreenCaptureMethod: 'window-ocr'
      }
    }
  })

  assert.equal(diagnostics.accessibilityGranted, true)
  assert.equal(diagnostics.screenCaptureStatus, 'granted')
  assert.equal(diagnostics.screenCaptureDecisionReason, 'needs-screen-signal')
  assert.equal(diagnostics.canFuseContext, true)
  assert.equal(diagnostics.gbrain.ok, true)
  assert.equal(diagnostics.gbrain.contextSource, 'gbrain-http')
  assert.equal(diagnostics.gbrain.resultCount, 2)
  assert.deepEqual(diagnostics.gbrain.sampleSources, ['company/faq', 'project/notes'])
  assert.equal(diagnostics.gbrain.trace?.requestedMode, 'http')
  assert.deepEqual(diagnostics.gbrain.trace?.attemptedSources, ['gbrain-http'])
  assert.equal(diagnostics.browserCaptureSummary?.path, 'browser-automation')
  assert.equal(diagnostics.browserCaptureSummary?.usedBrowserAutomation, true)
  assert.equal(diagnostics.browserCaptureSummary?.usedKeyboardFallback, true)
  assert.equal(diagnostics.browserCaptureSummary?.usedSessionFallback, false)
  assert.equal(diagnostics.browserCaptureSummary?.lastAttemptedStep, 'keyboard')
  assert.equal(diagnostics.browserCaptureSummary?.nextPlannedStep, 'session')
  assert.equal(diagnostics.browserCaptureSummary?.stalledAtStep, null)
  assert.equal(diagnostics.browserCaptureSummary?.pageTextLength, 0)
  assert.equal(diagnostics.browserCaptureSummary?.accessibilityTextLength, 'Visible fallback text'.length)
  assert.equal(diagnostics.accessibilityDiagnostics?.lowSignalReason, 'weak-content')
  assert.equal(diagnostics.accessibilityDiagnostics?.selectedTextSource, 'top-level-selected-text')
  assert.equal(diagnostics.fusionInputs.hasGBrainContext, true)
  assert.equal(diagnostics.fusionInputs.hasSelectedText, true)
  assert.equal(diagnostics.fusionInputs.hasAccessibilityContext, true)
  assert.equal(diagnostics.fusionInputs.hasScreenContext, true)
  assert.equal(diagnostics.currentContext, currentContext)
  assert.deepEqual(diagnostics.captureTrace?.browser.attemptedSteps, ['browser', 'keyboard'])
  assert.equal(diagnostics.captureTrace?.screen.finalScreenCaptureMethod, 'window-ocr')
})

test('buildBackendDiagnostics surfaces when screen capture was skipped because accessibility context was already strong', () => {
  const strongPageText =
    'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(3).trim()
  const currentContext = baseContext({
    activeApp: 'Mail',
    contextKind: 'document',
    pageText: strongPageText,
    pageUrl: null,
    pageCaptureMethod: 'accessibility',
    accessibilityText: strongPageText,
    screenCaptureMethod: 'none',
    screenText: null,
    screenshotPath: null
  })

  const diagnostics = buildBackendDiagnostics({
    accessibilityGranted: true,
    screenCaptureStatus: 'granted',
    currentContext,
    gbrain: {
      contextSource: 'gbrain-cli',
      results: []
    },
    accessibilityDiagnostics: {
      appName: 'Mail',
      rawAppName: 'Mail',
      workspaceAppName: 'Mail',
      topWindowOwnerName: 'Mail',
      windowTitle: 'Draft',
      rawWindowTitle: 'Draft',
      topWindowTitle: 'Draft',
      appResolutionSource: 'helper-frontmost',
      windowTitleResolutionSource: 'window-title',
      focusedRole: 'AXTextArea',
      pageUrlCandidate: null,
      selectedTextPresent: false,
      selectedTextSource: 'none',
      valueTextPresent: true,
      focusChainNodeCount: 2,
      rankedLines: [{ line: strongPageText.slice(0, 40), score: 28 }],
      lowSignal: false,
      lowSignalReason: null
    }
  })

  assert.equal(diagnostics.screenCaptureDecisionReason, 'strong-accessibility-context')
  assert.equal(diagnostics.browserCaptureSummary?.path, 'accessibility-short-circuit')
  assert.equal(diagnostics.browserCaptureSummary?.skippedBrowserCapture, true)
  assert.equal(diagnostics.browserCaptureSummary?.lastAttemptedStep, null)
  assert.equal(diagnostics.browserCaptureSummary?.nextPlannedStep, 'none')
  assert.equal(diagnostics.browserCaptureSummary?.stalledAtStep, null)
  assert.equal(diagnostics.accessibilityDiagnostics?.appName, 'Mail')
  assert.equal(diagnostics.accessibilityDiagnostics?.lowSignal, false)
})

test('resolveDiagnosticsScreenDecisionReason prefers trace evidence and otherwise infers from actual visible context strength', () => {
  const strongPageText =
    'Pricing plans help teams standardize AI workflows across support and sales. '.repeat(3).trim()
  assert.equal(
    resolveDiagnosticsScreenDecisionReason({
      currentContext: baseContext({
        pageText: null,
        pageUrl: null,
        accessibilityText: null,
        screenCaptureMethod: 'none',
        screenText: null
      }),
      captureTrace: {
        resolvedActiveApp: 'Dia',
        resolvedWindowTitle: 'Current page',
        canSkipBrowserCapture: false,
        canSkipOcr: false,
        browser: {
          initialNextStep: 'browser',
          afterBrowserNextStep: 'keyboard',
          afterKeyboardNextStep: 'session',
          attemptedSteps: ['browser'],
          browserCaptureMethod: 'none',
          keyboardCaptureMethod: null,
          sessionCaptureMethod: null,
          finalPageCaptureMethod: 'none'
        },
        screen: {
          shouldCaptureScreen: true,
          reason: 'needs-screen-signal',
          finalScreenCaptureMethod: 'none'
        }
      }
    }),
    'needs-screen-signal'
  )

  assert.equal(
    resolveDiagnosticsScreenDecisionReason({
      currentContext: baseContext({
        pageText: strongPageText,
        pageCaptureMethod: 'accessibility',
        accessibilityText: strongPageText,
        screenCaptureMethod: 'none',
        screenText: null
      })
    }),
    'strong-accessibility-context'
  )

  assert.equal(
    resolveDiagnosticsScreenDecisionReason({
      currentContext: baseContext({
        pageText: null,
        pageUrl: 'https://example.com/pricing',
        accessibilityText: 'short note',
        screenCaptureMethod: 'none',
        screenText: null
      })
    }),
    'needs-screen-signal'
  )
})

test('resolveDiagnosticsRuntimeState packages retrieval readiness, fusion state, and capture summaries in one pure helper', () => {
  const currentContext = baseContext({
    activeApp: 'Dia',
    pageText: null,
    pageUrl: 'https://example.com/pricing',
    accessibilityText: 'Visible fallback text',
    screenCaptureMethod: 'window-ocr',
    screenText: 'OCR fallback text'
  })

  const result = resolveDiagnosticsRuntimeState({
    currentContext,
    gbrain: {
      contextSource: 'gbrain-http',
      results: [
        { source: 'company/faq', title: 'Pricing FAQ', content: 'answer' },
        { source: 'project/notes', title: 'Launch Notes', content: 'notes' }
      ]
    },
    captureTrace: {
      resolvedActiveApp: 'Dia',
      resolvedWindowTitle: 'Current page',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'session',
        attemptedSteps: ['browser', 'keyboard'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: 'keyboard-copy',
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'browser-automation'
      },
      screen: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal',
        finalScreenCaptureMethod: 'window-ocr'
      }
    }
  })

  assert.equal(result.gbrainState.providerReady, true)
  assert.equal(result.gbrainState.hasUsableContext, true)
  assert.equal(result.gbrainState.results.length, 2)
  assert.equal(result.fusionState.canFuseContext, true)
  assert.equal(result.fusionState.fusionInputs.hasGBrainContext, true)
  assert.equal(result.fusionState.fusionInputs.hasPageContext, true)
  assert.equal(result.fusionState.fusionInputs.hasAccessibilityContext, true)
  assert.equal(result.fusionState.fusionInputs.hasScreenContext, true)
  assert.equal(result.screenCaptureDecisionReason, 'needs-screen-signal')
  assert.equal(result.browserCaptureSummary?.path, 'browser-automation')
  assert.equal(result.browserCaptureSummary?.usedKeyboardFallback, true)
})

test('buildBrowserCaptureSummary distinguishes session and screen-driven fallbacks', () => {
  const sessionSummary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      pageCaptureMethod: 'chrome-session',
      primaryContentSource: 'page-text',
      pageText: 'Recovered from session fallback'
    }),
    captureTrace: {
      resolvedActiveApp: 'Google Chrome',
      resolvedWindowTitle: 'Pricing',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'session',
        attemptedSteps: ['browser', 'keyboard', 'session'],
        browserCaptureMethod: 'none',
        keyboardCaptureMethod: 'none',
        sessionCaptureMethod: 'chrome-session',
        finalPageCaptureMethod: 'chrome-session'
      },
      screen: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal',
        finalScreenCaptureMethod: 'window-ocr'
      }
    }
  })

  const screenSummary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      pageCaptureMethod: 'none',
      primaryContentSource: 'screen-ocr',
      pageText: null,
      pageUrl: null,
      screenText: 'Recovered from OCR'
    })
  })

  assert.equal(sessionSummary.path, 'chrome-session')
  assert.equal(sessionSummary.usedSessionFallback, true)
  assert.equal(sessionSummary.lastAttemptedStep, 'session')
  assert.equal(sessionSummary.nextPlannedStep, 'session')
  assert.equal(sessionSummary.stalledAtStep, null)
  assert.equal(screenSummary.path, 'screen-ocr-fallback')
  assert.equal(screenSummary.usedBrowserAutomation, false)
  assert.equal(screenSummary.skippedBrowserCapture, false)
  assert.equal(screenSummary.lastAttemptedStep, null)
  assert.equal(screenSummary.nextPlannedStep, 'none')
  assert.equal(screenSummary.stalledAtStep, null)
})

test('buildBrowserCaptureSummary distinguishes retained accessibility from a true short-circuit', () => {
  const retainedSummary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      activeApp: 'LINE',
      windowTitle: 'ログイン',
      contextKind: 'general',
      primaryContentSource: 'none',
      pageTitle: 'ログイン',
      pageUrl: null,
      pageText: 'loginwindow',
      pageCaptureMethod: 'accessibility',
      accessibilityText: 'ログイン loginwindow'
    }),
    captureTrace: {
      resolvedActiveApp: 'LINE',
      resolvedWindowTitle: 'ログイン',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser'],
        browserCaptureMethod: 'none',
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'accessibility'
      },
      screen: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal',
        finalScreenCaptureMethod: 'none'
      }
    }
  })

  assert.equal(retainedSummary.path, 'accessibility-retained')
  assert.equal(retainedSummary.usedBrowserAutomation, true)
  assert.equal(retainedSummary.skippedBrowserCapture, false)
  assert.equal(retainedSummary.lastAttemptedStep, 'browser')
  assert.equal(retainedSummary.nextPlannedStep, 'none')
  assert.equal(retainedSummary.stalledAtStep, 'browser')

  const shortCircuitSummary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      pageCaptureMethod: 'accessibility',
      primaryContentSource: 'page-text',
      pageText: 'Strong accessibility page context'
    }),
    captureTrace: {
      resolvedActiveApp: 'Safari',
      resolvedWindowTitle: 'Pricing',
      canSkipBrowserCapture: true,
      canSkipOcr: true,
      browser: {
        initialNextStep: 'none',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: [],
        browserCaptureMethod: null,
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'accessibility'
      },
      screen: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context',
        finalScreenCaptureMethod: 'none'
      }
    }
  })

  assert.equal(shortCircuitSummary.path, 'accessibility-short-circuit')
  assert.equal(shortCircuitSummary.lastAttemptedStep, null)
  assert.equal(shortCircuitSummary.nextPlannedStep, 'none')
  assert.equal(shortCircuitSummary.stalledAtStep, null)
  assert.equal(shortCircuitSummary.usedBrowserAutomation, false)
  assert.equal(shortCircuitSummary.skippedBrowserCapture, true)

  const emptyRetainedSummary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      activeApp: 'Google Chrome',
      windowTitle: 'Only title',
      contextKind: 'browser',
      primaryContentSource: 'none',
      pageTitle: 'Only title',
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'accessibility',
      accessibilityText: null,
      selectedText: null
    }),
    captureTrace: {
      resolvedActiveApp: 'Google Chrome',
      resolvedWindowTitle: 'Only title',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser'],
        browserCaptureMethod: 'none',
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'accessibility'
      },
      screen: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal',
        finalScreenCaptureMethod: 'none'
      }
    }
  })

  assert.equal(emptyRetainedSummary.path, 'no-page-context')
  assert.equal(emptyRetainedSummary.stalledAtStep, 'browser')

  const selectedOnlySummary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      activeApp: 'Slack',
      windowTitle: 'mk-biz (Channel) - aisaac - Slack',
      contextKind: 'social',
      primaryContentSource: 'selected-text',
      pageTitle: 'mk-biz (Channel) - aisaac - Slack',
      pageUrl: null,
      pageText: null,
      pageCaptureMethod: 'accessibility',
      accessibilityText: 'Discuss launch timing in Slack thread',
      selectedText: 'Discuss launch timing'
    }),
    captureTrace: {
      resolvedActiveApp: 'Slack',
      resolvedWindowTitle: 'mk-biz (Channel) - aisaac - Slack',
      canSkipBrowserCapture: false,
      canSkipOcr: false,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser'],
        browserCaptureMethod: 'none',
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'accessibility'
      },
      screen: {
        shouldCaptureScreen: true,
        reason: 'needs-screen-signal',
        finalScreenCaptureMethod: 'none'
      }
    }
  })

  assert.equal(selectedOnlySummary.path, 'no-page-context')
  assert.equal(selectedOnlySummary.selectedTextLength, 'Discuss launch timing'.length)
  assert.equal(selectedOnlySummary.accessibilityTextLength, 'Discuss launch timing in Slack thread'.length)
  assert.equal(selectedOnlySummary.stalledAtStep, 'browser')
})

test('buildBrowserCaptureSummary reports browser-automation once weak accessibility is upgraded by recovered browser text', () => {
  const summary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      pageCaptureMethod: 'browser-automation',
      primaryContentSource: 'page-text',
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered browser automation body with the actual pricing details.',
      accessibilityText: 'Pricing https://example.com/pricing'
    }),
    captureTrace: {
      resolvedActiveApp: 'Google Chrome',
      resolvedWindowTitle: 'Pricing',
      canSkipBrowserCapture: false,
      canSkipOcr: true,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'none',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: null,
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'browser-automation'
      },
      screen: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context',
        finalScreenCaptureMethod: 'none'
      }
    }
  })

  assert.equal(summary.path, 'browser-automation')
  assert.equal(summary.usedBrowserAutomation, true)
  assert.equal(summary.usedKeyboardFallback, false)
  assert.equal(summary.usedSessionFallback, false)
  assert.equal(summary.skippedBrowserCapture, false)
  assert.equal(summary.lastAttemptedStep, 'browser')
  assert.equal(summary.nextPlannedStep, 'none')
  assert.equal(summary.stalledAtStep, null)
})

test('buildBrowserCaptureSummary treats browser-like accessibility page signals without trace as retained instead of short-circuit', () => {
  const summary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      activeApp: 'Safari',
      contextKind: 'browser',
      primaryContentSource: 'page-text',
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Strong accessibility page context from a browser tab',
      pageCaptureMethod: 'accessibility',
      accessibilityText: 'Pricing https://example.com/pricing'
    })
  })

  assert.equal(summary.path, 'accessibility-retained')
  assert.equal(summary.skippedBrowserCapture, false)
  assert.equal(summary.lastAttemptedStep, null)
  assert.equal(summary.nextPlannedStep, 'none')
  assert.equal(summary.stalledAtStep, null)
})

test('buildBrowserCaptureSummary reports keyboard-copy when browser automation was attempted first but public-page recovery made keyboard fallback win', () => {
  const summary = buildBrowserCaptureSummary({
    currentContext: baseContext({
      pageCaptureMethod: 'keyboard-copy',
      primaryContentSource: 'page-text',
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: 'Recovered from fetched public page text after keyboard-copy URL capture.',
      accessibilityText: 'Pricing https://example.com/pricing'
    }),
    captureTrace: {
      resolvedActiveApp: 'Safari',
      resolvedWindowTitle: 'Pricing',
      canSkipBrowserCapture: false,
      canSkipOcr: true,
      browser: {
        initialNextStep: 'browser',
        afterBrowserNextStep: 'keyboard',
        afterKeyboardNextStep: 'none',
        attemptedSteps: ['browser', 'keyboard'],
        browserCaptureMethod: 'browser-automation',
        keyboardCaptureMethod: 'keyboard-copy',
        sessionCaptureMethod: null,
        finalPageCaptureMethod: 'keyboard-copy'
      },
      screen: {
        shouldCaptureScreen: false,
        reason: 'strong-accessibility-context',
        finalScreenCaptureMethod: 'none'
      }
    }
  })

  assert.equal(summary.path, 'keyboard-copy')
  assert.equal(summary.usedBrowserAutomation, true)
  assert.equal(summary.usedKeyboardFallback, true)
  assert.equal(summary.usedSessionFallback, false)
  assert.equal(summary.skippedBrowserCapture, false)
  assert.equal(summary.lastAttemptedStep, 'keyboard')
  assert.equal(summary.nextPlannedStep, 'none')
  assert.equal(summary.stalledAtStep, null)
  assert.equal(
    summary.pageTextLength,
    'Recovered from fetched public page text after keyboard-copy URL capture.'.length
  )
})

test('buildBackendDiagnostics treats local fallback retrieval as ready when it returned usable context', () => {
  const diagnostics = buildBackendDiagnostics({
    accessibilityGranted: true,
    screenCaptureStatus: 'granted',
    currentContext: baseContext(),
    gbrain: {
      contextSource: 'local-fallback',
      results: [{ source: 'company/faq', title: 'Pricing FAQ', content: 'answer' }],
      trace: {
        requestedMode: 'cli',
        attemptedSources: ['gbrain-cli', 'local-fallback'],
        finalContextSource: 'local-fallback',
        fallbackReason: 'cli-failed'
      }
    }
  })

  assert.equal(diagnostics.gbrain.ok, true)
  assert.equal(diagnostics.gbrain.contextSource, 'local-fallback')
  assert.equal(diagnostics.gbrain.resultCount, 1)
  assert.equal(diagnostics.gbrain.trace?.fallbackReason, 'cli-failed')
})

test('getScreenCaptureStatusForPlatform returns granted off macOS and raw status on macOS', () => {
  assert.equal(getScreenCaptureStatusForPlatform({ platform: 'linux', mediaAccessStatus: 'denied' }), 'granted')
  assert.equal(getScreenCaptureStatusForPlatform({ platform: 'darwin', mediaAccessStatus: 'denied' }), 'denied')
})
