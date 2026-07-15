import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { isSavedContextFixtureJsonFile } from '../../src/shared/context-fixture.ts'

const testsRoot = path.resolve(process.cwd(), 'tests')
const contextFixturesRoot = path.join(testsRoot, 'fixtures', 'context')
const accessibilityFixturesRoot = path.join(testsRoot, 'fixtures', 'accessibility')
const forbiddenNameRe = /(?:^|\/)(?:\.DS_Store|Thumbs\.db)$/i
const forbiddenSuffixRe = /\.(?:tmp|temp|orig|rej|bak|old|disabled|swp|swo)$/i
const experimentalNameRe = /(?:^|\/)(?:draft-|wip-|tmp-|copy-|experiment-|playground-)|(?:-draft|-wip|-copy|-tmp|-experiment)(?:\.[^/]+)?$/i
const forbiddenDerivedFixtureSidecarRe = /(?:^|\/)fixtures\/context\/.+\.summary\.json$/i
const fixturePathRe = /(?:^|\/)fixtures\/.+$/i
const fixtureFileRe = /(?:^|\/)fixtures\/.+\.(?:json)$/i
const allowedFixtureFileRe = /(?:\.expected|\.trace|\.diagnostics)?\.json$/i
const forbiddenAccessibilityTraceSidecarRe = /(?:^|\/)fixtures\/accessibility\/.+\.trace\.json$/i
const unitTestFileRe = /(?:^|\/)unit\/.+$/i
const allowedUnitSupportFileRe = /(?:^|\/)unit\/(?:(?:__mocks__\/.+\.ts)|(?:register-loader|test-loader)\.mjs)$/i
const allowedUnitTestFileRe = /(?:^|\/)unit\/.+\.test\.ts$/i
const allowedUnitDirectories = new Set([path.join('unit', '__mocks__')])
const allowedTestsTopLevelEntries = new Set(['fixtures', 'unit'])
const allowedFixtureDirectories = new Set([
  path.join('fixtures', 'accessibility'),
  path.join('fixtures', 'context')
])

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        return listFiles(fullPath)
      }
      return [fullPath]
    })
  )

  return files.flat()
}

test('tests tree contains no experimental or temporary files', async () => {
  const files = await listFiles(testsRoot)
  const suspicious = files
    .map((filePath) => path.relative(testsRoot, filePath))
    .filter(
      (relativePath) =>
        forbiddenNameRe.test(relativePath) ||
        forbiddenSuffixRe.test(relativePath) ||
        experimentalNameRe.test(relativePath) ||
        forbiddenDerivedFixtureSidecarRe.test(relativePath) ||
        forbiddenAccessibilityTraceSidecarRe.test(relativePath) ||
        (fixturePathRe.test(relativePath) && !fixtureFileRe.test(relativePath)) ||
        (fixtureFileRe.test(relativePath) && !allowedFixtureFileRe.test(relativePath)) ||
        (unitTestFileRe.test(relativePath) &&
          !allowedUnitSupportFileRe.test(relativePath) &&
          !allowedUnitTestFileRe.test(relativePath))
    )

  assert.deepEqual(suspicious, [])
})

test('tests tree stays limited to formal fixture and unit-test directories', async () => {
  const topLevelEntries = (await readdir(testsRoot, { withFileTypes: true })).map((entry) => entry.name).sort()
  assert.deepEqual(topLevelEntries, [...allowedTestsTopLevelEntries].sort())

  const fixtureDirectories = (await readdir(path.join(testsRoot, 'fixtures'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join('fixtures', entry.name))
    .sort()
  assert.deepEqual(fixtureDirectories, [...allowedFixtureDirectories].sort())

  const unitDirectories = (await readdir(path.join(testsRoot, 'unit'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join('unit', entry.name))
    .sort()
  assert.deepEqual(unitDirectories, [...allowedUnitDirectories].sort())
})

test('context fixture sidecars stay aligned with a real primary fixture file', async () => {
  const fixtureEntries = (await readdir(contextFixturesRoot)).sort()
  const primaryFixtures = new Set(fixtureEntries.filter((name) => isSavedContextFixtureJsonFile(name)))
  const orphanedSidecars = fixtureEntries.filter((name) => {
    const expectedMatch = name.match(/^(.*)\.expected\.json$/)
    if (expectedMatch) {
      return !primaryFixtures.has(`${expectedMatch[1]}.json`)
    }

    const traceMatch = name.match(/^(.*)\.trace\.json$/)
    if (traceMatch) {
      return !primaryFixtures.has(`${traceMatch[1]}.json`)
    }

    const diagnosticsMatch = name.match(/^(.*)\.diagnostics\.json$/)
    if (diagnosticsMatch) {
      return !primaryFixtures.has(`${diagnosticsMatch[1]}.json`)
    }

    return false
  })

  assert.deepEqual(orphanedSidecars, [])
})

test('every primary context fixture has a checked-in expectation file', async () => {
  const fixtureEntries = (await readdir(contextFixturesRoot)).sort()
  const missingExpectations = fixtureEntries
    .filter((name) => isSavedContextFixtureJsonFile(name))
    .filter((name) => !fixtureEntries.includes(name.replace(/\.json$/, '.expected.json')))

  assert.deepEqual(missingExpectations, [])
})

test('every primary accessibility fixture has a checked-in expectation file', async () => {
  const fixtureEntries = (await readdir(accessibilityFixturesRoot)).sort()
  const missingExpectations = fixtureEntries
    .filter((name) => name.endsWith('.json') && !name.endsWith('.expected.json'))
    .filter((name) => !fixtureEntries.includes(name.replace(/\.json$/, '.expected.json')))

  assert.deepEqual(missingExpectations, [])
})
