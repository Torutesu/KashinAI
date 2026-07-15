import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTargetAppUrlOpenScript,
  isCapturedTargetAppMatch,
  matchesTargetApp,
  resolveUrlOpenTargetFamily
} from '../../scripts/target-app-focus.mjs'

test('matchesTargetApp accepts exact app-name matches', () => {
  assert.equal(
    matchesTargetApp({
      targetApp: 'Dia',
      targetBundleId: null,
      observedApp: 'Dia',
      observedBundleId: null
    }),
    true
  )
})

test('matchesTargetApp accepts localized aliases when bundle ids are unavailable', () => {
  assert.equal(
    matchesTargetApp({
      targetApp: 'Calendar',
      targetBundleId: null,
      observedApp: 'カレンダー',
      observedBundleId: null
    }),
    true
  )
  assert.equal(
    matchesTargetApp({
      targetApp: 'メール',
      targetBundleId: null,
      observedApp: 'Mail',
      observedBundleId: null
    }),
    true
  )
})

test('matchesTargetApp prefers bundle id equivalence over localized name differences', () => {
  assert.equal(
    matchesTargetApp({
      targetApp: 'Calendar',
      targetBundleId: 'com.apple.iCal',
      observedApp: 'カレンダー',
      observedBundleId: 'com.apple.iCal'
    }),
    true
  )
  assert.equal(
    matchesTargetApp({
      targetApp: 'Calendar',
      targetBundleId: 'com.apple.iCal',
      observedApp: 'カレンダー',
      observedBundleId: 'com.apple.mail'
    }),
    false
  )
})

test('matchesTargetApp rejects unrelated apps', () => {
  assert.equal(
    matchesTargetApp({
      targetApp: 'Calendar',
      targetBundleId: null,
      observedApp: 'LINE',
      observedBundleId: null
    }),
    false
  )
})

test('resolveUrlOpenTargetFamily identifies Safari and Chromium-style browser targets', () => {
  assert.equal(resolveUrlOpenTargetFamily('Safari'), 'safari')
  assert.equal(resolveUrlOpenTargetFamily('Google Chrome'), 'chromium')
  assert.equal(resolveUrlOpenTargetFamily('Chromium'), 'chromium')
  assert.equal(resolveUrlOpenTargetFamily('Arc'), 'chromium')
  assert.equal(resolveUrlOpenTargetFamily('Vivaldi'), 'chromium')
  assert.equal(resolveUrlOpenTargetFamily('Opera'), 'chromium')
  assert.equal(resolveUrlOpenTargetFamily('Dia'), 'chromium')
  assert.equal(resolveUrlOpenTargetFamily('Preview'), 'generic')
})

test('buildTargetAppUrlOpenScript builds in-app URL loading scripts for supported browser families', () => {
  assert.match(buildTargetAppUrlOpenScript('Safari', 'https://example.com/') ?? '', /make new document/)
  assert.match(buildTargetAppUrlOpenScript('Safari', 'https://example.com/') ?? '', /set URL of front document/)
  assert.match(buildTargetAppUrlOpenScript('Google Chrome', 'https://example.com/') ?? '', /set URL of active tab/)
  assert.match(buildTargetAppUrlOpenScript('Dia', 'https://example.com/') ?? '', /set URL of active tab/)
  assert.equal(buildTargetAppUrlOpenScript('Preview', 'https://example.com/'), null)
})

test('isCapturedTargetAppMatch accepts context-reader or captured-app confirmation when AppleScript frontmost is weak', () => {
  assert.equal(
    isCapturedTargetAppMatch({
      targetApp: 'Google Chrome',
      targetBundleId: null,
      observedByAppleScript: null,
      observedBundleIdByAppleScript: null,
      observedByContextReader: 'Google Chrome',
      observedBundleIdByContextReader: null,
      capturedActiveApp: 'Google Chrome'
    }),
    true
  )
})

test('isCapturedTargetAppMatch still rejects unrelated captured apps', () => {
  assert.equal(
    isCapturedTargetAppMatch({
      targetApp: 'Google Chrome',
      targetBundleId: null,
      observedByAppleScript: 'Finder',
      observedBundleIdByAppleScript: null,
      observedByContextReader: 'LINE',
      observedBundleIdByContextReader: null,
      capturedActiveApp: 'LINE'
    }),
    false
  )
})
