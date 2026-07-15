import { spawn } from 'node:child_process'
import path from 'node:path'
import { buildNextContextFixtureRecommendation } from '../src/shared/context-fixture-recommendations.ts'

function runCoverage() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(process.cwd(), 'scripts/check-context-fixture-coverage.mjs')], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `check-context-fixture-coverage failed with code ${code}`))
        return
      }
      resolve(stdout)
    })
  })
}

async function main() {
  const raw = await runCoverage()
  const coverage = JSON.parse(raw)
  const recommendation = buildNextContextFixtureRecommendation(coverage)

  console.log(
    JSON.stringify(recommendation, null, 2)
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
