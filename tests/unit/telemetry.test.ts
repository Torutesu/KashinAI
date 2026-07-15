import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeTelemetry, isKnownTelemetryEvent } from '../../src/shared/telemetry.ts'

test('sanitizeTelemetry rejects unknown events', () => {
  assert.equal(sanitizeTelemetry('screen_captured', { text: 'secret' }), null)
  assert.equal(isKnownTelemetryEvent('screen_captured'), false)
  assert.equal(isKnownTelemetryEvent('generation_completed'), true)
})

test('sanitizeTelemetry keeps only allow-listed properties for the event', () => {
  const result = sanitizeTelemetry('generation_completed', {
    kind: 'generate',
    context_kind: 'social',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    success: true,
    latency_ms: 1234,
    gbrain_ms: 200,
    llm_ms: 1000,
    // The following must all be dropped:
    output: 'the generated reply text that must never leave the device',
    apiKey: 'sk-secret',
    screenText: 'private screen contents'
  })
  assert.ok(result)
  assert.deepEqual(result.properties, {
    kind: 'generate',
    context_kind: 'social',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    success: true,
    latency_ms: 1234,
    gbrain_ms: 200,
    llm_ms: 1000
  })
  assert.ok(!('output' in result.properties))
  assert.ok(!('apiKey' in result.properties))
  assert.ok(!('screenText' in result.properties))
})

test('sanitizeTelemetry drops non-primitive and over-long values even on allow-listed keys', () => {
  const longModel = 'x'.repeat(500)
  const result = sanitizeTelemetry('generation_completed', {
    model: longModel,
    provider: { nested: 'object' },
    latency_ms: Number.NaN
  })
  assert.ok(result)
  // long string, object, and NaN are all rejected.
  assert.deepEqual(result.properties, {})
})

test('sanitizeTelemetry returns empty properties for a no-property event', () => {
  const result = sanitizeTelemetry('first_paste', { anything: 'ignored' })
  assert.ok(result)
  assert.deepEqual(result.properties, {})
})

test('sanitizeTelemetry handles missing properties', () => {
  const result = sanitizeTelemetry('option_tap', undefined)
  assert.ok(result)
  assert.deepEqual(result.properties, {})
})
