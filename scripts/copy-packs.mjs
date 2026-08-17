// packs/decks/catalog.json is the built-in deck catalog produced by
// `pnpm build:decks` (see scripts/build-packs/build-decks.ts). It lives under
// packs/ so the pipeline can write it directly, but the static Next export
// only serves files under public/. Mirror it into public/packs/decks/ so the
// client can fetch it at runtime.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const source = path.join(root, 'packs', 'decks', 'catalog.json')
const destinationDir = path.join(root, 'public', 'packs', 'decks')

if (!existsSync(source)) {
  throw new Error(`Expected packs/decks/catalog.json at ${source}.`)
}

mkdirSync(destinationDir, { recursive: true })
cpSync(source, path.join(destinationDir, 'catalog.json'))
console.info('Mirrored packs/decks/catalog.json into public/packs/decks/')
