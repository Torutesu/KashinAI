import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {
  diagnoseAccessibilitySnapshot,
  extractAccessibilityContext,
  parseAccessibilityHelperOutput
} from '../../src/main/accessibility-context.ts'

type AccessibilityFixtureExpectation = {
  expectDiagnostics?: {
    lowSignal?: boolean
    lowSignalReason?: string | null
    pageUrlCandidate?: string | null
    appResolutionSource?: 'helper-frontmost' | 'top-window-owner' | 'workspace-app' | 'none'
    windowTitleResolutionSource?: 'window-title' | 'top-window-title' | 'snapshot-title' | 'none'
    selectedTextSource?: 'top-level-selected-text' | 'focus-chain-selected-text' | 'focus-chain-selected-marker-text' | 'none'
  }
  expectSelectedText?: string | null
  rankedLineIncludes?: string[]
  rankedLineExcludes?: string[]
  extractionIncludes?: string[]
  extractionExcludes?: string[]
}

const fixturesDir = path.join(process.cwd(), 'tests/fixtures/accessibility')

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(fixturesDir, filename), 'utf8')) as T
}

const expectationFiles = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.expected.json'))
  .sort()

for (const expectationFile of expectationFiles) {
  test(`accessibility fixture expectation: ${expectationFile}`, () => {
    const baseName = expectationFile.replace(/\.expected\.json$/, '')
    const snapshot = parseAccessibilityHelperOutput(
      JSON.stringify(readJson<Record<string, unknown>>(`${baseName}.json`))
    )
    const expectation = readJson<AccessibilityFixtureExpectation>(expectationFile)
    const diagnostics = diagnoseAccessibilitySnapshot(snapshot)
    const extraction = extractAccessibilityContext(snapshot)
    const rankedLines = diagnostics.rankedLines.map((item) => item.line).join('\n')
    const extractionText = [extraction.pageText, extraction.accessibilityText].filter(Boolean).join('\n')

    if (expectation.expectDiagnostics && 'lowSignal' in expectation.expectDiagnostics) {
      assert.equal(diagnostics.lowSignal, expectation.expectDiagnostics.lowSignal)
    }
    if (expectation.expectDiagnostics && 'lowSignalReason' in expectation.expectDiagnostics) {
      assert.equal(diagnostics.lowSignalReason, expectation.expectDiagnostics.lowSignalReason)
    }
    if (expectation.expectDiagnostics && 'pageUrlCandidate' in expectation.expectDiagnostics) {
      assert.equal(diagnostics.pageUrlCandidate, expectation.expectDiagnostics.pageUrlCandidate)
    }
    if (expectation.expectDiagnostics && 'appResolutionSource' in expectation.expectDiagnostics) {
      assert.equal(diagnostics.appResolutionSource, expectation.expectDiagnostics.appResolutionSource)
    }
    if (expectation.expectDiagnostics && 'windowTitleResolutionSource' in expectation.expectDiagnostics) {
      assert.equal(diagnostics.windowTitleResolutionSource, expectation.expectDiagnostics.windowTitleResolutionSource)
    }
    if (expectation.expectDiagnostics && 'selectedTextSource' in expectation.expectDiagnostics) {
      assert.equal(diagnostics.selectedTextSource, expectation.expectDiagnostics.selectedTextSource)
    }
    if ('expectSelectedText' in expectation) {
      assert.equal(extraction.selectedText, expectation.expectSelectedText ?? null)
    }

    for (const include of expectation.rankedLineIncludes ?? []) {
      assert.match(rankedLines, new RegExp(include.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    for (const exclude of expectation.rankedLineExcludes ?? []) {
      assert.doesNotMatch(rankedLines, new RegExp(exclude.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    for (const include of expectation.extractionIncludes ?? []) {
      assert.match(extractionText, new RegExp(include.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    for (const exclude of expectation.extractionExcludes ?? []) {
      assert.doesNotMatch(extractionText, new RegExp(exclude.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  })
}
