import { app, clipboard, desktopCapturer, ipcMain, shell, systemPreferences } from 'electron'
import path from 'node:path'
import type {
  BackendDiagnostics,
  ChatIpcResult,
  ChatRequest,
  ContextPack,
  GenerateIpcResult,
  GenerateRequest,
  SettingsUpdate
} from '../shared/types'
import { buildChatPrompt, buildPrompt } from '../shared/prompts'
import { getFrontmostAppInfo, captureCurrentContext, captureCurrentContextDetailed } from './context-reader'
import {
  buildBackendDiagnostics,
  buildInlineFallbackChatResult,
  buildRetrievalOnlyAnswer,
  buildRetrievalOnlyAnswerParams,
  getScreenCaptureStatusForPlatform,
  normalizeGBrainLookup,
  resolveChatExecutionPlan,
  resolveDiagnosticsRequestPlan,
  resolveDiagnosticsSearchExecutionPlan,
  resolveChatRequestPlan,
  resolveGenerateExecutionPlan,
  resolveGenerateRequestPlan,
  resolveScreenCapturePermissionRequest,
  resolveShortcutUpdateFlowResolution,
  resolveShortcutUpdateResolution
} from './ipc-utils'
import { buildSearchQuery } from './search-query'
import { searchGBrain } from './gbrain'
import { generate, LlmError } from './llm'
import { getPublicSettings, getSettings, updateSettings } from './settings'
import { expandAssistantWindow, hideAssistantWindow, isAssistantCollapsed, openAssistantSettings } from './windows'
import { insertText } from './insert'
import { getRegisteredShortcut, updateRegisteredShortcut } from './shortcut'
import { saveMarkdownMemory } from './memory'
import { clearHistory, listHistory, recordHistoryEntry, summarizeHistorySources } from './history'

/** Uses the caller-provided query when they edited it in the UI, otherwise the auto-built one. */
function resolveSearchQuery(builtQuery: string, override: string | null | undefined): string {
  const trimmed = override?.trim()
  return trimmed ? trimmed : builtQuery
}

function brainDir(): string {
  return path.join(app.getAppPath(), 'brain')
}

function getScreenCaptureStatus(): BackendDiagnostics['screenCaptureStatus'] {
  return getScreenCaptureStatusForPlatform({
    platform: process.platform,
    mediaAccessStatus: systemPreferences.getMediaAccessStatus('screen') as BackendDiagnostics['screenCaptureStatus']
  })
}

/**
 * Full assistant:generate flow: build search query -> GBrain search (with fallback chain) ->
 * build prompt -> LLM call -> GenerateResult. Never throws: failures are returned as a
 * structured AppError with a distinct code so the renderer can render an actionable message.
 */
async function handleGenerate(request: GenerateRequest): Promise<GenerateIpcResult> {
  try {
    const requestPlan = resolveGenerateRequestPlan(request)
    if (!requestPlan.canProceed) {
      return {
        ok: false,
        error: requestPlan.error!
      }
    }

    const settings = getSettings()
    const executionPlan = resolveGenerateExecutionPlan({
      requestPlan,
      hasApiKey: Boolean(settings.llm.apiKey)
    })
    const { searchQuery: builtSearchQuery, detectedEntities } = buildSearchQuery(
      request.currentContext,
      request.actionType,
      request.userInstruction
    )
    const searchQuery = resolveSearchQuery(builtSearchQuery, request.searchQueryOverride)

    const gbrain = executionPlan.shouldSearchGBrain ? await searchGBrain(searchQuery, settings, brainDir()) : null
    const { results, contextSource } = normalizeGBrainLookup(gbrain)

    const pack: ContextPack = {
      currentContext: request.currentContext,
      userInstruction: request.userInstruction,
      actionType: request.actionType,
      detectedEntities,
      searchQuery,
      retrievedContext: results,
      outputPreferences: {
        language: settings.defaults.language,
        tone: settings.defaults.tone,
        length: settings.defaults.length
      }
    }

    const { system, user } = buildPrompt(pack, request.modifier)

    const output = executionPlan.executionMode === 'llm'
      ? await generate({
          provider: settings.llm.provider,
          apiKey: settings.llm.apiKey,
          model: settings.llm.defaultModel,
          temperature: settings.llm.temperature,
          system,
          user
        })
      : buildRetrievalOnlyAnswer(
          buildRetrievalOnlyAnswerParams({
            currentContext: request.currentContext,
            latestUserMessage: request.userInstruction,
            sources: results
          })
        )

    recordHistoryEntry({
      kind: 'generate',
      actionType: request.actionType,
      activeApp: request.currentContext.activeApp,
      contextKind: request.currentContext.contextKind,
      output,
      searchQuery,
      contextSource,
      sources: summarizeHistorySources(results)
    })

    return {
      ok: true,
      data: { output, sources: results, searchQuery, contextSource }
    }
  } catch (err) {
    if (err instanceof LlmError) {
      return { ok: false, error: { code: err.code, message: err.message } }
    }
    return {
      ok: false,
      error: { code: 'unknown', message: err instanceof Error ? err.message : 'Unknown error' }
    }
  }
}

async function handleChat(request: ChatRequest): Promise<ChatIpcResult> {
  try {
    const requestPlan = resolveChatRequestPlan(request)
    if (!requestPlan.canProceed) {
      return {
        ok: false,
        error: requestPlan.error!
      }
    }
    const latestMessage = requestPlan.latestMessage

    const settings = getSettings()
    const executionPlan = resolveChatExecutionPlan({
      requestPlan,
      hasApiKey: Boolean(settings.llm.apiKey)
    })
    const { searchQuery: builtSearchQuery } = buildSearchQuery(request.currentContext, 'custom', latestMessage)
    const searchQuery = resolveSearchQuery(builtSearchQuery, request.searchQueryOverride)
    if (executionPlan.executionMode === 'inline-fallback') {
      return {
        ok: true,
        data: buildInlineFallbackChatResult({
          currentContext: request.currentContext,
          latestUserMessage: latestMessage
        })
      }
    }

    const gbrain = executionPlan.shouldSearchGBrain ? await searchGBrain(searchQuery, settings, brainDir()) : null
    const { results, contextSource } = normalizeGBrainLookup(gbrain)
    const { system, user } = buildChatPrompt({
      currentContext: request.currentContext,
      messages: request.messages,
      retrievedContext: results,
      searchQuery,
      outputPreferences: {
        language: settings.defaults.language,
        tone: settings.defaults.tone,
        length: settings.defaults.length
      }
    })

    const output = executionPlan.executionMode === 'llm'
      ? await generate({
          provider: settings.llm.provider,
          apiKey: settings.llm.apiKey,
          model: settings.llm.defaultModel,
          temperature: settings.llm.temperature,
          system,
          user
        })
      : buildRetrievalOnlyAnswer(
          buildRetrievalOnlyAnswerParams({
            currentContext: request.currentContext,
            latestUserMessage: latestMessage,
            sources: results
          })
        )

    recordHistoryEntry({
      kind: 'chat',
      actionType: null,
      activeApp: request.currentContext.activeApp,
      contextKind: request.currentContext.contextKind,
      output,
      searchQuery,
      contextSource,
      sources: summarizeHistorySources(results)
    })

    return {
      ok: true,
      data: {
        message: { role: 'assistant', content: output },
        sources: results,
        searchQuery,
        contextSource,
        currentContext: request.currentContext
      }
    }
  } catch (err) {
    if (err instanceof LlmError) {
      return { ok: false, error: { code: err.code, message: err.message } }
    }
    return {
      ok: false,
      error: { code: 'unknown', message: err instanceof Error ? err.message : 'Unknown error' }
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('context:capture', async () => {
    const frontmost = await getFrontmostAppInfo()
    return captureCurrentContext(frontmost)
  })

  ipcMain.handle('assistant:generate', async (_event, request: GenerateRequest) => {
    return handleGenerate(request)
  })

  ipcMain.handle('assistant:chat', async (_event, request: ChatRequest) => {
    return handleChat(request)
  })

  ipcMain.handle('output:copy', async (_event, text: string) => {
    clipboard.writeText(text)
    return true
  })

  ipcMain.handle('output:insert', async (_event, payload: { text: string; activeApp: string | null }) => {
    await insertText(payload.text, payload.activeApp)
    return true
  })

  ipcMain.handle('settings:get', async () => {
    return getPublicSettings()
  })

  ipcMain.handle('settings:set', async (_event, update: SettingsUpdate) => {
    const previousSettings = getSettings()
    const updated = updateSettings(update)
    const initialShortcutFlow = resolveShortcutUpdateFlowResolution({
      requestedShortcut: update.shortcut,
      previousShortcut: previousSettings.shortcut,
      swapped: false,
      restored: false,
      registeredShortcutAfterRestore: null
    })

    if (initialShortcutFlow.attemptPlan.shouldAttemptShortcutSwap && initialShortcutFlow.attemptPlan.requestedShortcut) {
      const swapped = updateRegisteredShortcut(initialShortcutFlow.attemptPlan.requestedShortcut)
      const shortcutResolution = resolveShortcutUpdateResolution({
        requestedShortcut: initialShortcutFlow.attemptPlan.requestedShortcut,
        previousShortcut: previousSettings.shortcut,
        swapped,
        restored: false,
        registeredShortcutAfterRestore: null
      })

      if (shortcutResolution.shouldRollbackSettings && initialShortcutFlow.attemptPlan.rollbackShortcut) {
        updateSettings({ shortcut: initialShortcutFlow.attemptPlan.rollbackShortcut })
        const restored = updateRegisteredShortcut(initialShortcutFlow.attemptPlan.rollbackShortcut)
        const rollbackFlow = resolveShortcutUpdateFlowResolution({
          requestedShortcut: update.shortcut,
          previousShortcut: previousSettings.shortcut,
          swapped,
          restored,
          registeredShortcutAfterRestore: getRegisteredShortcut()
        })

        if (rollbackFlow.resolution.shouldReturnEarly) {
          return getPublicSettings()
        }
        return getPublicSettings()
      }
    }

    return updated
  })

  ipcMain.handle('memory:save', async (_event, payload: { currentContext: ChatRequest['currentContext']; note?: string }) => {
    try {
      const filePath = await saveMarkdownMemory({
        settings: getSettings(),
        currentContext: payload.currentContext,
        note: payload.note
      })
      return { ok: true, path: filePath }
    } catch (err) {
      return {
        ok: false,
        error: { code: 'unknown', message: err instanceof Error ? err.message : 'Failed to save memory.' }
      }
    }
  })

  ipcMain.handle('history:list', async () => {
    return listHistory()
  })

  ipcMain.handle('history:clear', async () => {
    clearHistory()
    return true
  })

  ipcMain.handle('window:hide', async () => {
    hideAssistantWindow()
  })

  ipcMain.handle('window:getState', async () => {
    return { collapsed: isAssistantCollapsed(), registeredShortcut: getRegisteredShortcut() }
  })

  ipcMain.handle('window:expand', async () => {
    expandAssistantWindow()
  })

  ipcMain.handle('window:openSettings', async () => {
    openAssistantSettings()
  })

  ipcMain.handle('system:checkAccessibility', async () => {
    return systemPreferences.isTrustedAccessibilityClient(false)
  })

  ipcMain.handle('system:requestAccessibility', async () => {
    return systemPreferences.isTrustedAccessibilityClient(true)
  })

  ipcMain.handle('system:openAccessibilitySettings', async () => {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    return true
  })

  ipcMain.handle('system:checkScreenCapture', async () => {
    return getScreenCaptureStatus()
  })

  ipcMain.handle('system:requestScreenCapture', async () => {
    try {
      await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
    } catch {
      // macOS may reject before permission is granted; opening Settings below is the recovery path.
    }
    const status = getScreenCaptureStatus()
    const resolution = resolveScreenCapturePermissionRequest(status)
    if (resolution.shouldOpenSystemSettings) {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    }
    return status
  })

  ipcMain.handle('system:openScreenCaptureSettings', async () => {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    return true
  })

  ipcMain.handle('system:runDiagnostics', async () => {
    try {
      const settings = getSettings()
      const frontmost = await getFrontmostAppInfo()
      const { context: currentContext, captureTrace, accessibilityDiagnostics } = await captureCurrentContextDetailed(frontmost)
      const diagnosticsRequestPlan = resolveDiagnosticsRequestPlan(currentContext)
      const rawSearchQuery = diagnosticsRequestPlan.searchQueryPlan.shouldBuildSearchQuery
        ? buildSearchQuery(
            currentContext,
            diagnosticsRequestPlan.searchQueryPlan.actionType,
            diagnosticsRequestPlan.searchQueryPlan.userInstruction
          ).searchQuery
        : ''
      const diagnosticsSearchPlan = resolveDiagnosticsSearchExecutionPlan({
        currentContext,
        searchQuery: rawSearchQuery
      })
      const gbrain =
        diagnosticsSearchPlan.shouldLookupGBrain
          ? await searchGBrain(diagnosticsSearchPlan.normalizedSearchQuery, settings, brainDir())
          : null
      const diagnostics = buildBackendDiagnostics({
        accessibilityGranted: systemPreferences.isTrustedAccessibilityClient(false),
        screenCaptureStatus: getScreenCaptureStatus(),
        currentContext,
        gbrain,
        captureTrace,
        accessibilityDiagnostics
      })

      return {
        ok: true,
        data: diagnostics
      }
    } catch (err) {
      return {
        ok: false,
        error: { code: 'unknown', message: err instanceof Error ? err.message : 'Unknown diagnostics error' }
      }
    }
  })
}
