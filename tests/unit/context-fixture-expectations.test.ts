import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { buildSearchQuery } from '../../src/main/search-query.ts'
import {
  assertBrowserCaptureSummaryIntegrity,
  assertContextFixtureTraceIntegrity,
  type CaptureTraceFixture
} from '../../src/shared/context-fixture.ts'
import { buildBrowserCaptureSummary } from '../../src/shared/browser-capture-summary.ts'
import { buildLiveContextDigest } from '../../src/shared/live-context.ts'
import type { ActionType, CurrentContext } from '../../src/shared/types'

type ContextFixtureExpectation = {
  userInstruction: string
  actionType: ActionType
  linkedAccessibilityFixture?: string | null
  expectContext?: Partial<
    Pick<
      CurrentContext,
      | 'contextKind'
      | 'primaryContentSource'
      | 'pageCaptureMethod'
      | 'screenCaptureMethod'
      | 'selectedTextSource'
      | 'selectedText'
    >
  >
  digestIncludes?: string[]
  digestExcludes?: string[]
  searchQueryIncludes?: string[]
  searchQueryExcludes?: string[]
}

const fixturesDir = path.join(process.cwd(), 'tests/fixtures/context')

function readJson<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(fixturesDir, filename), 'utf8')) as T
}

const expectationFiles = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.expected.json'))
  .sort()

for (const expectationFile of expectationFiles) {
  test(`context fixture expectation: ${expectationFile}`, () => {
    const baseName = expectationFile.replace(/\.expected\.json$/, '')
    const context = readJson<CurrentContext>(`${baseName}.json`)
    const expectation = readJson<ContextFixtureExpectation>(expectationFile)
    const tracePath = path.join(fixturesDir, `${baseName}.trace.json`)
    const summaryPath = path.join(fixturesDir, `${baseName}.summary.json`)
    let captureTrace: CaptureTraceFixture | null = null
    let browserCaptureSummary: ReturnType<typeof buildBrowserCaptureSummary> | null = null

    try {
      captureTrace = JSON.parse(readFileSync(tracePath, 'utf8')) as CaptureTraceFixture
    } catch {
      captureTrace = null
    }

    try {
      browserCaptureSummary = JSON.parse(readFileSync(summaryPath, 'utf8')) as ReturnType<typeof buildBrowserCaptureSummary>
    } catch {
      browserCaptureSummary = captureTrace
        ? buildBrowserCaptureSummary({
            currentContext: context,
            captureTrace
          })
        : null
    }

    assertContextFixtureTraceIntegrity({
      context,
      captureTrace
    })
    assertBrowserCaptureSummaryIntegrity({
      context,
      captureTrace,
      browserCaptureSummary
    })

    const digest = buildLiveContextDigest(context)
    const query = buildSearchQuery(context, expectation.actionType, expectation.userInstruction)

    if (expectation.expectContext?.contextKind) {
      assert.equal(context.contextKind, expectation.expectContext.contextKind)
    }
    if (expectation.expectContext?.primaryContentSource) {
      assert.equal(context.primaryContentSource, expectation.expectContext.primaryContentSource)
    }
    if (expectation.expectContext?.pageCaptureMethod) {
      assert.equal(context.pageCaptureMethod, expectation.expectContext.pageCaptureMethod)
    }
    if (expectation.expectContext?.screenCaptureMethod) {
      assert.equal(context.screenCaptureMethod, expectation.expectContext.screenCaptureMethod)
    }
    if (expectation.expectContext?.selectedTextSource) {
      assert.equal(context.selectedTextSource, expectation.expectContext.selectedTextSource)
    }
    if ('selectedText' in (expectation.expectContext ?? {})) {
      assert.equal(context.selectedText, expectation.expectContext?.selectedText ?? null)
    }

    for (const include of expectation.digestIncludes ?? []) {
      assert.match(digest, new RegExp(include.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    for (const exclude of expectation.digestExcludes ?? []) {
      assert.doesNotMatch(digest, new RegExp(exclude.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    for (const include of expectation.searchQueryIncludes ?? []) {
      assert.match(query.searchQuery, new RegExp(include.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
    for (const exclude of expectation.searchQueryExcludes ?? []) {
      assert.doesNotMatch(query.searchQuery, new RegExp(exclude.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  })
}
