import { app, clipboard, ipcMain, systemPreferences } from 'electron'
import path from 'node:path'
import type { ContextPack, GenerateIpcResult, GenerateRequest, SettingsUpdate } from '../shared/types'
import { buildPrompt } from '../shared/prompts'
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

    const output = await generate({
      provider: settings.llm.provider,
      apiKey: settings.llm.apiKey,
      model: settings.llm.defaultModel,
      temperature: settings.llm.temperature,
      system,
      user
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

export function registerIpcHandlers(): void {
  ipcMain.handle('context:capture', async () => {
    const frontmost = await getFrontmostAppInfo()
    return captureCurrentContext(frontmost)
  })

  ipcMain.handle('assistant:generate', async (_event, request: GenerateRequest) => {
    return handleGenerate(request)
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
    return { collapsed: isAssistantCollapsed() }
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
}
