/**
 * ESM loader for unit tests.
 * - Redirects 'electron' to a mock
 * - Redirects sibling module imports from src/main/index.ts to mocks
 * - Rewrites import.meta.env in src/main/index.ts source
 */
import { pathToFileURL } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const mockDir = pathResolve(__dirname, '__mocks__')

const electronMockUrl = pathToFileURL(pathResolve(mockDir, 'electron.ts')).href
const mockModulesUrl = pathToFileURL(pathResolve(mockDir, 'mock-modules.ts')).href

// Sibling modules that src/main/index.ts imports
const mainIndexSiblingSpecifiers = ['./ipc', './shortcut', './windows', './context-reader', './settings', './option-listener', './insert', './updater']
const ipcSiblingSpecifiers = [
  '../shared/prompts',
  '../shared/live-context',
  './context-reader',
  './search-query',
  './gbrain',
  './llm',
  './settings',
  './windows',
  './insert',
  './shortcut',
  './memory',
  './history'
]

export async function resolve(specifier, context, next) {
  // Redirect bare 'electron' import
  if (specifier === 'electron') {
    return {
      url: electronMockUrl,
      shortCircuit: true
    }
  }

  // For relative imports from src/main/index.ts, redirect to mock-modules
  const importerPath = context.parentURL ? fileURLToPath(context.parentURL) : ''
  const isFromMainIndex = importerPath.includes('/src/main/index.ts')
  const isFromIpc = importerPath.includes('/src/main/ipc.ts')

  if (isFromMainIndex && mainIndexSiblingSpecifiers.includes(specifier)) {
    return {
      url: mockModulesUrl,
      shortCircuit: true
    }
  }

  if (isFromIpc && ipcSiblingSpecifiers.includes(specifier)) {
    return {
      url: mockModulesUrl,
      shortCircuit: true
    }
  }

  if (specifier === '../shared/live-context') {
    return next('../shared/live-context.ts', context)
  }

  if (specifier === '../shared/redaction') {
    return next('../shared/redaction.ts', context)
  }

  if (specifier === './ipc-utils') {
    return next('./ipc-utils.ts', context)
  }

  if (specifier === './context-reader-utils') {
    return next('./context-reader-utils.ts', context)
  }

  // General fallback: source uses extensionless relative .ts imports (bundler resolution), which
  // Node's default resolver does not add. Map extensionless relative specifiers to `.ts` so real
  // modules (e.g. prompts.ts importing './live-context') can be loaded directly in tests.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z0-9]+$/i.test(specifier)) {
    return next(`${specifier}.ts`, context)
  }

  return next(specifier, context)
}

export async function load(url, context, next) {
  // Only handle file: URLs
  if (!url.startsWith('file:')) {
    return next(url, context)
  }

  let filePath
  try {
    filePath = fileURLToPath(url)
  } catch {
    return next(url, context)
  }

  // Only modify src/main/index.ts
  if (!filePath.includes('/src/main/index.ts')) {
    return next(url, context)
  }

  // Let the default loader handle it first (reads the file)
  const result = await next(url, context)
  
  // Convert source to string if it's a Buffer/TypedArray
  let source
  if (typeof result.source === 'string') {
    source = result.source
  } else if (result.source) {
    source = Buffer.from(result.source).toString('utf-8')
  } else {
    return result
  }
  
  // Replace import.meta.env references
  source = source.replace(/import\.meta\.env\.DEV/g, 'false')
  source = source.replace(/import\.meta\.env\b/g, '({ DEV: false })')
  
  return { ...result, source }
}
