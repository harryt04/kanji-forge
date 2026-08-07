import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Database from 'better-sqlite3'

const root = path.dirname(new URL(import.meta.url).pathname)
const fail = (message) => {
  throw new Error(message)
}
const sha256 = (file) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const json = (file) =>
  JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
const checkManifest = (
  file,
  database,
  id,
  schemaVersion,
  expectedLicense = 'CC BY-SA 4.0',
) => {
  const manifest = json(file)
  const db = path.join(root, database)
  if (
    manifest.id !== id ||
    manifest.version !== 'v1' ||
    manifest.schemaVersion !== schemaVersion
  )
    fail(`${file}: invalid identity/schema`)
  if (
    manifest.license !== expectedLicense ||
    typeof manifest.attribution !== 'string' ||
    !manifest.attribution
  )
    fail(`${file}: missing license/attribution`)
  if (
    manifest.sha256 !== sha256(db) ||
    manifest.sizeBytes !== fs.statSync(db).size
  )
    fail(`${file}: checksum or size mismatch`)
  return manifest
}
const kanjiManifest = checkManifest(
  'kanji-v1.manifest.json',
  'kanji-v1.sqlite',
  'kanji',
  1,
)
const wordsManifest = checkManifest(
  'words-core-v1.manifest.json',
  'words-core-v1.sqlite',
  'words-core',
  1,
)
const sentencesManifest = checkManifest(
  'sentences-v1.manifest.json',
  'sentences-v1.sqlite',
  'sentences',
  2,
  'CC BY 2.0 FR and CC BY-SA 4.0 (component-wise)',
)
const open = (file) => new Database(path.join(root, file), { readonly: true })
const kanjiDb = open('kanji-v1.sqlite')
const wordsDb = open('words-core-v1.sqlite')
const sentencesDb = open('sentences-v1.sqlite')
try {
  const kanjiCount = kanjiDb.prepare('SELECT COUNT(*) AS n FROM kanji').get().n
  const wordCount = wordsDb.prepare('SELECT COUNT(*) AS n FROM entries').get().n
  const sentenceCount = sentencesDb
    .prepare('SELECT COUNT(*) AS n FROM sentences')
    .get().n
  if (kanjiCount !== 200 || wordCount !== 500 || sentenceCount !== 100)
    fail(
      `counts: kanji=${kanjiCount}, words=${wordCount}, sentences=${sentenceCount}`,
    )
  for (const row of wordsDb.prepare('SELECT id FROM entries').all())
    if (!wordsDb.prepare('SELECT 1 FROM forms WHERE entry_id = ?').get(row.id))
      fail(`word ${row.id} has no form`)
  const decks = json('decks.json')
  if (
    decks.schemaVersion !== 1 ||
    decks.license !== 'CC BY-SA 4.0' ||
    decks.decks?.length !== 2
  )
    fail('deck catalog is invalid')
  const kanjiSet = new Set(
    kanjiDb
      .prepare('SELECT literal FROM kanji')
      .all()
      .map((row) => row.literal),
  )
  const wordSet = new Set(
    wordsDb
      .prepare('SELECT id FROM entries')
      .all()
      .map((row) => String(row.id)),
  )
  for (const deck of decks.decks)
    for (const ref of deck.contentRefs) {
      const [kind, value] = ref.split(':')
      if (kind === 'kanji' && !kanjiSet.has(value)) fail(`unresolved ${ref}`)
      if (kind === 'word' && !wordSet.has(value)) fail(`unresolved ${ref}`)
    }
  console.log(
    `PASS packs-dev: ${kanjiManifest.stats.kanjiCount} kanji, ${wordsManifest.stats.entryCount} words, ${sentencesManifest.stats.sentenceCount} sentences, ${decks.decks.length} decks; no network required`,
  )
} finally {
  kanjiDb.close()
  wordsDb.close()
  sentencesDb.close()
}
