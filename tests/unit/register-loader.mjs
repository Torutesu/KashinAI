/**
 * Registers the custom ESM loader for unit tests.
 * Usage: node --import ./tests/unit/register-loader.mjs --experimental-strip-types ...
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const loaderPath = resolve(__dirname, 'test-loader.mjs')

register(pathToFileURL(loaderPath).href, pathToFileURL(import.meta.url).href)
