// sql.js resolves its wasm binary relative to the app's origin at runtime (no bundler-aware
// locateFile is configured), so the file must be served as a static asset from `public/`.
// This keeps that copy in sync with the installed sql.js version on every install.
import { copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const sqlJsMain = require.resolve('sql.js')
const distDir = path.dirname(sqlJsMain)
const publicDir = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'public',
)

const wasmFile = 'sql-wasm-browser.wasm'
const source = path.join(distDir, wasmFile)
const destination = path.join(publicDir, wasmFile)

if (!existsSync(source)) {
  throw new Error(
    `Expected sql.js wasm asset at ${source} — did the sql.js package layout change?`,
  )
}

copyFileSync(source, destination)
console.info(`Copied ${wasmFile} to public/`)
