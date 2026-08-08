// Kuromoji's IPADIC files are an optional, lazy-loaded analyzer asset. Keep
// them out of the initial app bundle while making them available to the
// browser in static exports.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const kuromojiEntry = require.resolve('kuromoji')
const source = path.join(path.dirname(kuromojiEntry), '..', 'dict')
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..')
const destination = path.join(root, 'public', 'packs', 'tokenizer', 'dict')

if (!existsSync(source)) {
  throw new Error(`Expected Kuromoji dictionary files at ${source}.`)
}

mkdirSync(destination, { recursive: true })
cpSync(source, destination, { recursive: true })
console.info('Mirrored the optional Kuromoji dictionary into public/packs/')
