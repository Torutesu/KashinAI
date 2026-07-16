import test from 'node:test'
import assert from 'node:assert/strict'
import { electronMockState, resetState } from './__mocks__/electron.ts'
import {
  captureCurrentContextCalls,
  createAssistantWindowCalls,
  getFrontmostAppInfoCalls,
  hideAssistantWindowCalls,
  initAutoUpdaterCalls,
  initTelemetryCalls,
  shutdownTelemetryCalls,
  registerIpcHandlersCalls,
  registerShortcutCalls,
  resetAllMocks,
  sentEvents,
  showAssistantWindowCalls,
  startOptionListenerCalls,
  stopOptionListenerCalls,
  warmContextHelpersCalls
} from './__mocks__/mock-modules.ts'

async function importMainIndex() {
  return import(`../../src/main/index.ts?test=${Date.now()}-${Math.random()}`)
}

async function bootApp() {
  await importMainIndex()
  assert.ok(electronMockState.whenReadyResolve, 'whenReady resolver should be registered')
  electronMockState.whenReadyResolve()
  await Promise.resolve()
  await Promise.resolve()
}

test.beforeEach(() => {
  resetState()
  resetAllMocks()
})

test('quits immediately when single instance lock is not acquired', async () => {
  electronMockState.gotLock = false

  await importMainIndex()

  assert.equal(electronMockState.quitCalled, true)
  assert.equal(registerIpcHandlersCalls.length, 0)
})

test('registers app services when Electron becomes ready', async () => {
  await bootApp()

  assert.equal(registerIpcHandlersCalls.length, 1)
  assert.equal(createAssistantWindowCalls.length, 1)
  assert.equal(registerShortcutCalls.length, 1)
  assert.equal(registerShortcutCalls[0]?.accelerator, 'Option+Space')
  assert.equal(startOptionListenerCalls.length, 1)
  assert.equal(warmContextHelpersCalls.length, 1)
  assert.equal(initAutoUpdaterCalls.length, 1)
  assert.equal(initTelemetryCalls.length, 1)
  assert.equal(showAssistantWindowCalls.length, 1)
  assert.equal(electronMockState.trayCreated, true)
  assert.equal(electronMockState.trayTitle, 'CA')
  assert.equal(electronMockState.trayToolTip, 'TestApp')
})

test('global shortcut captures context and pushes it to the assistant window', async () => {
  await bootApp()

  const shortcutHandler = registerShortcutCalls[0]?.handler
  assert.ok(shortcutHandler, 'shortcut handler should be registered')

  shortcutHandler()
  await Promise.resolve()
  await Promise.resolve()

  assert.equal(getFrontmostAppInfoCalls.length, 1)
  assert.equal(captureCurrentContextCalls.length, 1)
  assert.equal(showAssistantWindowCalls.length, 2)
  assert.deepEqual(sentEvents.at(-1), {
    channel: 'context:pushed',
    data: {
      context: {
        activeApp: 'Safari',
        windowTitle: 'Test Page',
        primaryContentSource: 'none',
        selectedText: 'selected text',
        selectedTextSource: 'clipboard-selection',
        clipboardText: null,
        timestamp: '2025-01-01T00:00:00.000Z'
      },
      autoInsert: false
    }
  })
})

test('option tap captures context and pushes it with autoInsert enabled', async () => {
  await bootApp()

  const optionTap = startOptionListenerCalls[0]?.onOptionTap
  assert.ok(optionTap, 'option tap listener should be registered')

  optionTap()
  // The autoInsert path hides the window and waits ~90ms before capturing, so allow real time.
  await new Promise((resolve) => setTimeout(resolve, 160))

  assert.equal(getFrontmostAppInfoCalls.length, 1)
  assert.equal(captureCurrentContextCalls.length, 1)

  const last = sentEvents.at(-1)
  assert.equal(last?.channel, 'context:pushed')
  assert.equal((last?.data as { autoInsert?: boolean } | undefined)?.autoInsert, true)
})

test('before-quit stops the option listener', async () => {
  await bootApp()

  const beforeQuit = electronMockState.eventHandlers['before-quit']
  assert.ok(beforeQuit, 'before-quit handler should be registered')

  beforeQuit()

  assert.equal(stopOptionListenerCalls.length, 1)
  assert.equal(shutdownTelemetryCalls.length, 1)
})

test('second-instance shows the assistant window again', async () => {
  await bootApp()

  const secondInstance = electronMockState.eventHandlers['second-instance']
  assert.ok(secondInstance, 'second-instance handler should be registered')

  secondInstance()

  assert.equal(showAssistantWindowCalls.length, 2)
})

test('option tap hides the assistant window before capturing context', async () => {
  await bootApp()

  const optionTap = startOptionListenerCalls[0]?.onOptionTap
  assert.ok(optionTap, 'option tap listener should be registered')

  optionTap()
  await new Promise((resolve) => setTimeout(resolve, 160))

  // autoInsert captures the previous frontmost app, so our own window is hidden first.
  assert.equal(hideAssistantWindowCalls.length, 1)
})
