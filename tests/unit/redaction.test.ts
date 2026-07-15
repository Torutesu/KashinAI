import test from 'node:test'
import assert from 'node:assert/strict'
import { redactSensitive, redactNullable, redactCurrentContext } from '../../src/shared/redaction.ts'
import type { CurrentContext } from '../../src/shared/types.ts'

test('redactSensitive masks email addresses', () => {
  assert.equal(redactSensitive('contact toru@example.co.jp today'), 'contact [redacted-email] today')
})

test('redactSensitive masks API-key-like tokens', () => {
  assert.equal(redactSensitive('key sk-ABCDEF0123456789 here'), 'key [redacted-key] here')
  assert.equal(redactSensitive('ghp_ABCDEFGHIJKLMNOP'), '[redacted-key]')
})

test('redactSensitive masks long digit runs (card/account numbers)', () => {
  assert.equal(redactSensitive('card 4111 1111 1111 1111 end'), 'card [redacted-number] end')
})

test('redactSensitive leaves short numbers and ordinary text alone', () => {
  assert.equal(redactSensitive('meet at 3pm on floor 12'), 'meet at 3pm on floor 12')
})

test('redactSensitive passes empty/undefined-ish input through', () => {
  assert.equal(redactSensitive(''), '')
})

test('redactNullable passes null through unchanged', () => {
  assert.equal(redactNullable(null), null)
  assert.equal(redactNullable('mail a@b.com'), 'mail [redacted-email]')
})

test('redactCurrentContext redacts free-text fields but keeps structural fields', () => {
  const context: CurrentContext = {
    activeApp: 'Slack',
    windowTitle: 'DM with a@b.com',
    contextKind: 'social',
    primaryContentSource: 'accessibility-text',
    pageTitle: null,
    pageUrl: 'https://example.com/x',
    pageText: 'Reach me at toru@example.com or 4111 1111 1111 1111',
    pageCaptureMethod: 'none',
    accessibilityText: 'token sk-ABCDEF0123456789',
    accessibilityCaptureMethod: 'ax-tree',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    selectedTextSource: 'none',
    clipboardText: null,
    timestamp: '2026-07-15T00:00:00.000Z'
  }

  const redacted = redactCurrentContext(context)

  assert.equal(redacted.windowTitle, 'DM with [redacted-email]')
  assert.equal(redacted.pageText, 'Reach me at [redacted-email] or [redacted-number]')
  assert.equal(redacted.accessibilityText, 'token [redacted-key]')
  // Structural fields are untouched, and the original object is not mutated.
  assert.equal(redacted.activeApp, 'Slack')
  assert.equal(redacted.pageUrl, 'https://example.com/x')
  assert.equal(redacted.contextKind, 'social')
  assert.equal(context.pageText, 'Reach me at toru@example.com or 4111 1111 1111 1111')
})
