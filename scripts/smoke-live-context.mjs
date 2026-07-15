#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, message, ...details }, null, 2))
  process.exit(1)
}

async function importLiveContextModule() {
  const sourcePath = path.join(process.cwd(), 'src/shared/live-context.ts')
  const source = await readFile(sourcePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    },
    fileName: sourcePath
  }).outputText

  const tmpDir = path.join(os.tmpdir(), 'kashin-live-context-smoke')
  await mkdir(tmpDir, { recursive: true })
  const modulePath = path.join(tmpDir, `live-context-${Date.now()}.mjs`)
  await writeFile(modulePath, output)
  return import(modulePath)
}

function baseContext(overrides) {
  return {
    activeApp: 'Google Chrome',
    windowTitle: 'Home / X',
    contextKind: 'general',
    primaryContentSource: 'none',
    pageTitle: null,
    pageUrl: null,
    pageText: null,
    pageCaptureMethod: 'none',
    accessibilityText: null,
    accessibilityCaptureMethod: 'none',
    screenshotPath: null,
    screenText: null,
    screenCaptureMethod: 'none',
    selectedText: null,
    clipboardText: null,
    timestamp: new Date().toISOString(),
    ...overrides
  }
}

const { buildLiveContextDigest, compactLiveContext } = await importLiveContextModule()

const socialContext = baseContext({
  contextKind: 'social',
  accessibilityText: [
    'Home',
    'Search',
    'Notifications',
    'For you',
    'Reply',
    'AIツールの良し悪しは、モデル性能よりも今見ている画面の文脈をどれだけ正確に読めるかで決まると思う。',
    '12',
    'Repost',
    'Like',
    'Share'
  ].join('\n')
})

const socialDigest = buildLiveContextDigest(socialContext)
if (!socialDigest.includes('画面の文脈')) {
  fail('Social digest did not retain the visible post body', { socialDigest })
}
if (/Home|Notifications|Repost|Like|Share/.test(socialDigest)) {
  fail('Social digest retained navigation noise', { socialDigest })
}

const codeContext = baseContext({
  activeApp: 'Cursor',
  windowTitle: 'context-reader.ts - KashinAI',
  contextKind: 'coding',
  accessibilityText: [
    'Explorer',
    'src/main/context-reader.ts',
    'TypeError: Cannot read properties of undefined (reading accessibilityText)',
    'const canSkipOcr = Boolean(accessibilityContext.accessibilityText.length > 240)',
    'Terminal'
  ].join('\n')
})

const codeDigest = buildLiveContextDigest(codeContext)
if (!/TypeError|canSkipOcr|accessibilityText/.test(codeDigest)) {
  fail('Coding digest did not retain error/code lines', { codeDigest })
}

const shortcutOnlyContext = baseContext({
  activeApp: 'Cursor',
  windowTitle: 'Command menu - Cursor',
  contextKind: 'coding',
  accessibilityText:
    'Show or hide the sidebar (⌘B) Show notifications (⌘I) New workspace (⌘N) Focus Back (⌘[) Focus Forward (⌘])'
})
const shortcutDigest = buildLiveContextDigest(shortcutOnlyContext)
if (shortcutDigest.trim()) {
  fail('Shortcut/menu-only UI chrome should not become live context', { shortcutDigest })
}

const compact = compactLiveContext(socialContext, 80)
if (compact.length > 80 || !compact.includes('画面の文脈')) {
  fail('Compact social context is not usable for inline recommendation', { compact })
}

const ipcSource = await readFile(path.join(process.cwd(), 'src/main/ipc.ts'), 'utf8')
const chatStart = ipcSource.indexOf('async function handleChat')
const fastPath = ipcSource.indexOf('if (suppressMemory)', chatStart)
const gbrainSearch = ipcSource.indexOf('searchGBrain(searchQuery', chatStart)
if (chatStart < 0 || fastPath < 0 || gbrainSearch < 0 || fastPath > gbrainSearch) {
  fail('Chat inline recommendation fast path must run before GBrain search', {
    chatStart,
    fastPath,
    gbrainSearch
  })
}

const contextReaderSource = await readFile(path.join(process.cwd(), 'src/main/context-reader.ts'), 'utf8')
const captureStart = contextReaderSource.indexOf('export async function captureCurrentContext')
const axCapture = contextReaderSource.indexOf('const accessibilityContext = await captureAccessibilityContext()', captureStart)
const browserCapture =
  contextReaderSource.indexOf('captureBrowserPageContext(resolvedActiveApp)', captureStart) >= 0
    ? contextReaderSource.indexOf('captureBrowserPageContext(resolvedActiveApp)', captureStart)
    : contextReaderSource.indexOf('captureBrowserPageContext(frontmost.activeApp)', captureStart)
const skipBrowser = contextReaderSource.indexOf('const canSkipBrowserCapture', captureStart)
if (captureStart < 0 || axCapture < 0 || browserCapture < 0 || axCapture > browserCapture || skipBrowser < 0) {
  fail('Current context capture must read AX before expensive browser capture and expose a skip path', {
    captureStart,
    axCapture,
    browserCapture,
    skipBrowser
  })
}

const axHelperSource = await readFile(path.join(process.cwd(), 'scripts/ax-context.swift'), 'utf8')
for (const required of ['AXVisibleChildren', 'AXSelectedText', 'AXDocument', 'AXURL']) {
  if (!axHelperSource.includes(required)) {
    fail('AX helper must inspect web/content accessibility attributes before scenario fallback is needed', { required })
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      socialDigest,
      codeDigest,
      fastPathBeforeGBrain: true,
      axBeforeBrowserCapture: true,
      axContentAttributes: true
    },
    null,
    2
  )
)
