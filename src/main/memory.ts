import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AppSettings, CurrentContext } from '../shared/types'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ぁ-んァ-ン一-龯]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'memory'
}

function yamlString(value: string | null): string {
  return JSON.stringify(value ?? '')
}

export async function saveMarkdownMemory(params: {
  settings: AppSettings
  currentContext: CurrentContext
  note?: string
}): Promise<string> {
  const dir = params.settings.memory.dir
  await mkdir(dir, { recursive: true })

  const now = new Date()
  const title =
    params.currentContext.pageTitle ||
    params.currentContext.windowTitle ||
    params.currentContext.activeApp ||
    'KashinAI memory'
  const filename = `${now.toISOString().replace(/[:.]/g, '-')}-${slugify(title)}.md`
  const filePath = path.join(dir, filename)

  const body = `---
created: ${now.toISOString()}
activeApp: ${yamlString(params.currentContext.activeApp)}
windowTitle: ${yamlString(params.currentContext.windowTitle)}
primaryContentSource: ${yamlString(params.currentContext.primaryContentSource)}
pageTitle: ${yamlString(params.currentContext.pageTitle)}
pageUrl: ${yamlString(params.currentContext.pageUrl)}
pageCaptureMethod: ${yamlString(params.currentContext.pageCaptureMethod)}
screenCaptureMethod: ${yamlString(params.currentContext.screenCaptureMethod)}
accessibilityCaptureMethod: ${yamlString(params.currentContext.accessibilityCaptureMethod)}
---

# ${title}

${params.note ? `## Note\n\n${params.note.trim()}\n\n` : ''}## Selected Text

${params.currentContext.selectedText || '(none)'}

## Page Text

${params.currentContext.pageText || '(none)'}

## Accessibility Text

${params.currentContext.accessibilityText || '(none)'}

## Screen OCR

${params.currentContext.screenText || '(none)'}

## Clipboard

${params.currentContext.clipboardText || '(none)'}
`

  await writeFile(filePath, body, 'utf-8')
  return filePath
}
