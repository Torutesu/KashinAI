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
import { getFrontmostAppInfo, captureCurrentContext } from './context-reader'
import { buildSearchQuery } from './search-query'
import { searchGBrain } from './gbrain'
import { generate, LlmError } from './llm'
import { getPublicSettings, getSettings, updateSettings } from './settings'
import { expandAssistantWindow, hideAssistantWindow, isAssistantCollapsed, openAssistantSettings } from './windows'
import { insertText } from './insert'
import { getRegisteredShortcut, updateRegisteredShortcut } from './shortcut'

function brainDir(): string {
  return path.join(app.getAppPath(), 'brain')
}

function getScreenCaptureStatus(): BackendDiagnostics['screenCaptureStatus'] {
  if (process.platform !== 'darwin') return 'granted'
  return systemPreferences.getMediaAccessStatus('screen') as BackendDiagnostics['screenCaptureStatus']
}

function buildRetrievalOnlyAnswer(params: {
  latestUserMessage: string
  pageUrl: string | null
  pageTitle: string | null
  pageText: string | null
  sources: { source: string; title: string; content: string }[]
}): string {
  const sourceLines = params.sources
    .slice(0, 5)
    .map((source) => `- ${source.source}: ${source.title}`)
    .join('\n')
  const pageSummary = params.pageText
    ? params.pageText.replace(/\s+/g, ' ').trim().slice(0, 600)
    : '(page body not captured)'
  const wantsRecommendation = /おすすめ文|recommended|ready-to-send/i.test(params.latestUserMessage)

  if (wantsRecommendation) {
    const topSource = params.sources[0]
    const pageLabel = params.pageTitle || params.pageUrl || 'いま開いている画面'
    const gbrainHint = topSource ? `GBrainの「${topSource.title}」` : 'GBrainの会社文脈'

    return `${pageLabel}の内容を確認しました。${gbrainHint}に合わせて、相手に伝えるべき要点と次のアクションをこちらで整理します。`
  }

  return `LLM API key is not configured, so this is a retrieval-only backend check.

User message:
${params.latestUserMessage || '(none)'}

Open page context:
- Title: ${params.pageTitle || '(unknown)'}
- URL: ${params.pageUrl || '(not captured)'}
- Text preview: ${pageSummary}

GBrain context used:
${sourceLines || '- none'}

The backend successfully fused the current page context with GBrain context. Add an LLM API key in Settings to generate the final natural-language response.`
}

/**
 * Full assistant:generate flow: build search query -> GBrain search (with fallback chain) ->
 * build prompt -> LLM call -> GenerateResult. Never throws: failures are returned as a
 * structured AppError with a distinct code so the renderer can render an actionable message.
 */
async function handleGenerate(request: GenerateRequest): Promise<GenerateIpcResult> {
  try {
    const hasAnyInput = Boolean(
      request.currentContext.selectedText || request.currentContext.clipboardText || request.userInstruction
    )
    if (!hasAnyInput) {
      return {
        ok: false,
        error: {
          code: 'no_selection',
          message: 'No text selected and clipboard is empty. Select some text and try again, or type a custom instruction.'
        }
      }
    }

    const settings = getSettings()
    const { searchQuery, detectedEntities } = buildSearchQuery(
      request.currentContext,
      request.actionType,
      request.userInstruction
    )

    const { results, contextSource } = await searchGBrain(searchQuery, settings, brainDir())

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

    const output = settings.llm.apiKey
      ? await generate({
          provider: settings.llm.provider,
          apiKey: settings.llm.apiKey,
          model: settings.llm.defaultModel,
          temperature: settings.llm.temperature,
          system,
          user
        })
      : buildRetrievalOnlyAnswer({
          latestUserMessage: request.userInstruction,
          pageUrl: request.currentContext.pageUrl,
          pageTitle: request.currentContext.pageTitle,
          pageText: request.currentContext.pageText,
          sources: results
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
    const latestUserMessage = [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? ''
    const hasAnyInput = Boolean(
      latestUserMessage ||
        request.currentContext.selectedText ||
        request.currentContext.pageText ||
        request.currentContext.clipboardText
    )

    if (!hasAnyInput) {
      return {
        ok: false,
        error: {
          code: 'no_selection',
          message: 'No chat message or page context was captured. Open a page, select text, or type a message.'
        }
      }
    }

    const settings = getSettings()
    const { searchQuery } = buildSearchQuery(request.currentContext, 'custom', latestUserMessage)
    const { results, contextSource } = await searchGBrain(searchQuery, settings, brainDir())
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

    const output = settings.llm.apiKey
      ? await generate({
          provider: settings.llm.provider,
          apiKey: settings.llm.apiKey,
          model: settings.llm.defaultModel,
          temperature: settings.llm.temperature,
          system,
          user
        })
      : buildRetrievalOnlyAnswer({
          latestUserMessage,
          pageUrl: request.currentContext.pageUrl,
          pageTitle: request.currentContext.pageTitle,
          pageText: request.currentContext.pageText,
          sources: results
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

    if (update.shortcut && update.shortcut !== previousSettings.shortcut) {
      const swapped = updateRegisteredShortcut(update.shortcut)
      if (!swapped) {
        updateSettings({ shortcut: previousSettings.shortcut })
        const restored = updateRegisteredShortcut(previousSettings.shortcut)
        if (!restored && getRegisteredShortcut() !== previousSettings.shortcut) {
          return getPublicSettings()
        }
        return getPublicSettings()
      }
    }

    return updated
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
    if (status !== 'granted') {
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
      const currentContext = await captureCurrentContext(frontmost)
      const gbrain = await searchGBrain('価格', settings, brainDir())

      return {
        ok: true,
        data: {
          accessibilityGranted: systemPreferences.isTrustedAccessibilityClient(false),
          screenCaptureStatus: getScreenCaptureStatus(),
          canFuseContext:
            (gbrain.contextSource === 'gbrain-cli' || gbrain.contextSource === 'gbrain-http') &&
            Boolean(currentContext.pageUrl || currentContext.pageText || currentContext.selectedText),
          gbrain: {
            ok: gbrain.contextSource === 'gbrain-cli' || gbrain.contextSource === 'gbrain-http',
            contextSource: gbrain.contextSource,
            resultCount: gbrain.results.length,
            sampleSources: gbrain.results.slice(0, 5).map((result) => result.source)
          },
          fusionInputs: {
            hasGBrainContext: gbrain.results.length > 0,
            hasPageContext: Boolean(currentContext.pageUrl || currentContext.pageText),
            hasSelectedText: Boolean(currentContext.selectedText),
            hasClipboardFallback: Boolean(currentContext.clipboardText)
          },
          currentContext
        }
      }
    } catch (err) {
      return {
        ok: false,
        error: { code: 'unknown', message: err instanceof Error ? err.message : 'Unknown diagnostics error' }
      }
    }
  })
}
