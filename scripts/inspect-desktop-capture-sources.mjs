import { app, desktopCapturer } from 'electron'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { activateTargetApp } from './target-app-focus.mjs'

async function main() {
  await app.whenReady()

  const { build } = await import(
    pathToFileURL(
      path.join(process.cwd(), 'node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/lib/main.js')
    ).href
  )

  const stamp = Date.now()
  const contextReaderOutfile = path.join(os.tmpdir(), `kashin-context-reader-${stamp}.cjs`)
  const utilsOutfile = path.join(os.tmpdir(), `kashin-context-reader-utils-${stamp}.cjs`)
  const sharedBuildOptions = {
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: false,
    logLevel: 'silent'
  }

  await build({
    entryPoints: [path.join(process.cwd(), 'src/main/context-reader.ts')],
    outfile: contextReaderOutfile,
    ...sharedBuildOptions
  })
  await build({
    entryPoints: [path.join(process.cwd(), 'src/main/context-reader-utils.ts')],
    outfile: utilsOutfile,
    ...sharedBuildOptions
  })

  const { getFrontmostAppInfo } = await import(pathToFileURL(contextReaderOutfile).href)
  const { analyzeDesktopCaptureSourceSelection, sourceScore } = await import(pathToFileURL(utilsOutfile).href)

  const targetApp = process.env.TARGET_APP
  const targetAppFocus = await activateTargetApp(targetApp)
  const frontmost = await getFrontmostAppInfo()
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1600, height: 1000 }
  })

  const simplified = sources.map((source) => ({
    id: source.id,
    name: source.name,
    hasThumbnail: !source.thumbnail.isEmpty(),
    score: source.id.startsWith('window:') ? sourceScore(source.name, frontmost) : null
  }))
  const picked = analyzeDesktopCaptureSourceSelection(
    simplified.map((entry) => ({
      id: entry.id,
      name: entry.name,
      hasThumbnail: entry.hasThumbnail
    })),
    frontmost
  )

  console.log(
    JSON.stringify(
      {
        targetApp: targetApp ?? null,
        targetAppFocus,
        frontmost,
        picked,
        sourceSelection: picked,
        rankedWindowSources: simplified
          .filter((entry) => entry.id.startsWith('window:'))
          .sort((a, b) => (b.score ?? -999) - (a.score ?? -999))
          .slice(0, 20),
        screenSources: simplified.filter((entry) => entry.id.startsWith('screen:'))
      },
      null,
      2
    )
  )

  app.quit()
}

main().catch((error) => {
  console.error(error)
  app.quit()
  process.exitCode = 1
})
