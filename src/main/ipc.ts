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
import { redactCurrentContext } from '../shared/redaction'
import { nowMs, type GenerationTimings } from '../shared/timing'
import { captureTelemetry } from './telemetry'
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
import { assertWithinFreeQuota, recordGeneration } from './license'
import { getDeviceCredentials } from './device-identity'
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

type SettingsForGeneration = ReturnType<typeof getSettings>

/** Generation is always BYOK: it needs the user's own provider API key. */
function hasGenerationCredentials(settings: SettingsForGeneration): boolean {
  return Boolean(settings.llm.apiKey)
}

/**
 * Runs one BYOK generation with the user's own API key. Enforces the client-side free daily cap
 * first (Pro is unlimited) and records the generation on success, so the operator's key is never
 * involved — only the user's key ever performs inference.
 */
async function runLlm(
  settings: SettingsForGeneration,
  system: string,
  user: string,
  hooks: StreamHooks
): Promise<string> {
  await assertWithinFreeQuota(settings.account.licenseUrl)
  const output = await generate({
    provider: settings.llm.provider,
    apiKey: settings.llm.apiKey,
    model: settings.llm.defaultModel,
    temperature: settings.llm.temperature,
    system,
    user,
    onDelta: hooks.onDelta,
    signal: hooks.signal
  })
  recordGeneration()
  return output
}

function brainDir(): string {
  return path.join(app.getAppPath(), 'brain')
}

/** In-flight streaming generations, keyed by the renderer-supplied streamId, so they can be aborted. */
const activeGenerations = new Map<string, AbortController>()

type StreamHooks = { onDelta?: (delta: string) => void; signal?: AbortSignal }

/**
 * Builds the streaming hooks for a request: forwards deltas to the renderer and registers an
 * AbortController so `generation:cancel` can stop the in-flight LLM call. Returns a cleanup fn.
 */
function beginStream(
  streamId: string | undefined,
  sender: Electron.WebContents | undefined
): { hooks: StreamHooks; done: () => void } {
  if (!streamId) return { hooks: {}, done: () => {} }
  const controller = new AbortController()
  activeGenerations.set(streamId, controller)
  const onDelta = sender
    ? (delta: string) => {
        if (!sender.isDestroyed()) sender.send('generation:chunk', { streamId, delta })
      }
    : undefined
  return {
    hooks: { onDelta, signal: controller.signal },
    done: () => {
      activeGenerations.delete(streamId)
    }
  }
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
async function handleGenerate(
  request: GenerateRequest,
  sender?: Electron.WebContents
): Promise<GenerateIpcResult> {
  const startedAt = nowMs()
  const { hooks, done } = beginStream(request.streamId, sender)
  try {
    const requestPlan = resolveGenerateRequestPlan(request)
    if (!requestPlan.canProceed) {
      return {
        ok: false,
        error: requestPlan.error!
      }
    }

    const settings = getSettings()
    const currentContext = settings.privacy.redactSensitive
      ? redactCurrentContext(request.currentContext)
      : request.currentContext
    const executionPlan = resolveGenerateExecutionPlan({
      requestPlan,
      hasApiKey: hasGenerationCredentials(settings)
    })
    const { searchQuery: builtSearchQuery, detectedEntities } = buildSearchQuery(
      currentContext,
      request.actionType,
      request.userInstruction
    )
    const searchQuery = resolveSearchQuery(builtSearchQuery, request.searchQueryOverride)

    const gbrainStartedAt = nowMs()
    const gbrain = executionPlan.shouldSearchGBrain ? await searchGBrain(searchQuery, settings, brainDir()) : null
    const gbrainMs = executionPlan.shouldSearchGBrain ? nowMs() - gbrainStartedAt : null
    const { results, contextSource } = normalizeGBrainLookup(gbrain)

    const pack: ContextPack = {
      currentContext,
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

    const llmStartedAt = nowMs()
    const output = executionPlan.executionMode === 'llm'
      ? await runLlm(settings, system, user, hooks)
      : buildRetrievalOnlyAnswer(
          buildRetrievalOnlyAnswerParams({
            currentContext,
            latestUserMessage: request.userInstruction,
            sources: results
          })
        )
    const timings: GenerationTimings = { gbrainMs, llmMs: nowMs() - llmStartedAt, totalMs: nowMs() - startedAt }

    captureTelemetry('generation_completed', {
      kind: 'generate',
      context_kind: currentContext.contextKind,
      provider: settings.llm.provider,
      model: settings.llm.defaultModel,
      success: true,
      latency_ms: timings.totalMs,
      gbrain_ms: timings.gbrainMs ?? undefined,
      llm_ms: timings.llmMs
    })

    recordHistoryEntry({
      kind: 'generate',
      actionType: request.actionType,
      activeApp: currentContext.activeApp,
      contextKind: currentContext.contextKind,
      output,
      searchQuery,
      contextSource,
      sources: summarizeHistorySources(results)
    })

    return {
      ok: true,
      data: { output, sources: results, searchQuery, contextSource, timings }
    }
  } catch (err) {
    if (err instanceof LlmError) {
      return { ok: false, error: { code: err.code, message: err.message } }
    }
    return {
      ok: false,
      error: { code: 'unknown', message: err instanceof Error ? err.message : 'Unknown error' }
    }
  } finally {
    done()
  }
}

async function handleChat(request: ChatRequest, sender?: Electron.WebContents): Promise<ChatIpcResult> {
  const startedAt = nowMs()
  const { hooks, done } = beginStream(request.streamId, sender)
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
    const currentContext = settings.privacy.redactSensitive
      ? redactCurrentContext(request.currentContext)
      : request.currentContext
    const executionPlan = resolveChatExecutionPlan({
      requestPlan,
      hasApiKey: hasGenerationCredentials(settings)
    })
    const { searchQuery: builtSearchQuery } = buildSearchQuery(currentContext, 'custom', latestMessage)
    const searchQuery = resolveSearchQuery(builtSearchQuery, request.searchQueryOverride)
    if (executionPlan.executionMode === 'inline-fallback') {
      return {
        ok: true,
        data: {
          ...buildInlineFallbackChatResult({
            currentContext,
            latestUserMessage: latestMessage
          }),
          timings: { gbrainMs: null, llmMs: 0, totalMs: nowMs() - startedAt }
        }
      }
    }

    const gbrainStartedAt = nowMs()
    const gbrain = executionPlan.shouldSearchGBrain ? await searchGBrain(searchQuery, settings, brainDir()) : null
    const gbrainMs = executionPlan.shouldSearchGBrain ? nowMs() - gbrainStartedAt : null
    const { results, contextSource } = normalizeGBrainLookup(gbrain)
    const { system, user } = buildChatPrompt({
      currentContext,
      messages: request.messages,
      retrievedContext: results,
      searchQuery,
      outputPreferences: {
        language: settings.defaults.language,
        tone: settings.defaults.tone,
        length: settings.defaults.length
      }
    })

    const llmStartedAt = nowMs()
    const output = executionPlan.executionMode === 'llm'
      ? await runLlm(settings, system, user, hooks)
      : buildRetrievalOnlyAnswer(
          buildRetrievalOnlyAnswerParams({
            currentContext,
            latestUserMessage: latestMessage,
            sources: results
          })
        )
    const timings: GenerationTimings = { gbrainMs, llmMs: nowMs() - llmStartedAt, totalMs: nowMs() - startedAt }

    captureTelemetry('generation_completed', {
      kind: 'chat',
      context_kind: currentContext.contextKind,
      provider: settings.llm.provider,
      model: settings.llm.defaultModel,
      success: true,
      latency_ms: timings.totalMs,
      gbrain_ms: timings.gbrainMs ?? undefined,
      llm_ms: timings.llmMs
    })

    recordHistoryEntry({
      kind: 'chat',
      actionType: null,
      activeApp: currentContext.activeApp,
      contextKind: currentContext.contextKind,
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
        currentContext,
        timings
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
  } finally {
    done()
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('context:capture', async () => {
    const frontmost = await getFrontmostAppInfo()
    return captureCurrentContext(frontmost)
  })

  ipcMain.handle('assistant:generate', async (event, request: GenerateRequest) => {
    return handleGenerate(request, event?.sender)
  })

  ipcMain.handle('assistant:chat', async (event, request: ChatRequest) => {
    return handleChat(request, event?.sender)
  })

  ipcMain.handle('generation:cancel', async (_event, streamId: string) => {
    activeGenerations.get(streamId)?.abort()
    activeGenerations.delete(streamId)
    return true
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

  ipcMain.handle('telemetry:capture', async (_event, payload: { event: string; properties?: Record<string, unknown> }) => {
    captureTelemetry(payload.event, payload.properties)
    return true
  })

  ipcMain.handle('billing:checkout', async () => {
    const settings = getSettings()
    if (!settings.account.licenseUrl) {
      return { ok: false as const, error: { code: 'unknown' as const, message: 'Set your KashinAI license server URL in Settings first.' } }
    }
    try {
      const { deviceId, deviceSecret } = getDeviceCredentials()
      const base = settings.account.licenseUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/v1/billing/checkout`, {
        method: 'POST',
        headers: { 'x-device-id': deviceId, 'x-device-secret': deviceSecret }
      })
      if (!res.ok) {
        return { ok: false as const, error: { code: 'unknown' as const, message: `Could not start checkout (status ${res.status}).` } }
      }
      const data = (await res.json()) as { url?: string }
      if (!data.url) {
        return { ok: false as const, error: { code: 'unknown' as const, message: 'Checkout did not return a URL.' } }
      }
      await shell.openExternal(data.url)
      return { ok: true as const, url: data.url }
    } catch (err) {
      return { ok: false as const, error: { code: 'unknown' as const, message: err instanceof Error ? err.message : 'Checkout failed.' } }
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
