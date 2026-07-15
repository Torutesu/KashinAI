import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBrowserCaptureSummary,
  deriveBrowserCaptureUsageFlags,
  deriveSkippedBrowserCapture,
  hasRetainedPageContextSignal,
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

test('hasRetainedPageContextSignal requires page text or page url, not title alone', () => {
  assert.equal(
    hasRetainedPageContextSignal({
      pageTitle: 'Only title',
      pageUrl: null,
      pageText: null
    }),
    false
  )

  assert.equal(
    hasRetainedPageContextSignal({
      pageTitle: 'Pricing',
      pageUrl: 'https://example.com/pricing',
      pageText: null
    }),
    true
  )
})

test('deriveSkippedBrowserCapture keeps browser-like accessibility captures out of short-circuit mode when they retain page signal', () => {
  assert.equal(
    deriveSkippedBrowserCapture({
      currentContext: baseContext({
        activeApp: 'Safari',
        pageCaptureMethod: 'accessibility',
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Strong accessibility page context from a browser tab'
      })
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
})

test('resolveBrowserCaptureSummaryPath distinguishes retained accessibility, OCR fallback, and no-page-context end states', () => {
  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        activeApp: 'Safari',
        pageCaptureMethod: 'accessibility',
        primaryContentSource: 'page-text',
        pageTitle: 'Pricing',
        pageUrl: 'https://example.com/pricing',
        pageText: 'Strong accessibility page context from a browser tab'
      }),
      skippedBrowserCapture: false
    }),
    'accessibility-retained'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        pageCaptureMethod: 'none',
        primaryContentSource: 'screen-ocr',
        pageTitle: null,
        pageUrl: null,
        pageText: null,
        screenText: 'Recovered from OCR'
      }),
      skippedBrowserCapture: false
    }),
    'screen-ocr-fallback'
  )

  assert.equal(
    resolveBrowserCaptureSummaryPath({
      currentContext: baseContext({
        activeApp: 'Slack',
        contextKind: 'social',
        pageCaptureMethod: 'accessibility',
        primaryContentSource: 'selected-text',
        pageTitle: 'mk-biz (Channel) - aisaac - Slack',
        pageUrl: null,
        pageText: null,
        accessibilityText: 'Discuss launch timing in Slack thread',
        selectedText: 'Discuss launch timing'
      }),
      skippedBrowserCapture: false
    }),
    'no-page-context'
  )
})

test('resolveBrowserCaptureSummaryStepState marks a weak browser attempt as stalled until a later fallback wins', () => {
  assert.deepEqual(
    resolveBrowserCaptureSummaryStepState({
      currentContext: baseContext({
        pageCaptureMethod: 'none',
        pageTitle: 'Only title',
        pageUrl: null,
        pageText: null
      }),
      skippedBrowserCapture: false,
      captureTrace: {
        resolvedActiveApp: 'Google Chrome',
        resolvedWindowTitle: 'Only title',
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
})

test('deriveBrowserCaptureUsageFlags treats attempted steps and winning methods as equivalent proof', () => {
  assert.deepEqual(
    deriveBrowserCaptureUsageFlags({
      currentContext: baseContext({
        pageCaptureMethod: 'keyboard-copy',
        pageText: 'Recovered by keyboard fallback'
      }),
      captureTrace: {
        resolvedActiveApp: 'Safari',
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

test('buildBrowserCaptureSummary keeps selected-text-only accessibility surfaces in no-page-context instead of pretending page capture succeeded', () => {
  const summary = buildBrowserCaptureSummary({
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

  assert.equal(summary.path, 'no-page-context')
  assert.equal(summary.usedBrowserAutomation, true)
  assert.equal(summary.stalledAtStep, 'browser')
  assert.equal(summary.selectedTextLength, 'Discuss launch timing'.length)
})
