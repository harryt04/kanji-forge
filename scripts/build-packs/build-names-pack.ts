#!/usr/bin/env node
/**
 * Build the optional proper-names dictionary pack from JMnedict.
 *
 * The pack deliberately uses the same compact SQLite shape as words-core so
 * the browser can opt into it without adding a second query model. Unlike
 * words-core, every JMnedict entry is retained and translations are limited
 * to English name descriptions.
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { createReadStream } from 'node:fs'
import Database from 'better-sqlite3'

export interface JmnedictEntry {
  readonly entSeq: number
  readonly kanji: readonly {
    text: string
    info: readonly string[]
    pri: readonly string[]
  }[]
  readonly kana: readonly {
    text: string
    restrictions: readonly string[]
    pri: readonly string[]
  }[]
  readonly translations: readonly {
    nameTypes: readonly string[]
    details: readonly string[]
  }[]
}

const OUTPUT_DIR = path.join(process.cwd(), 'packs')
const OUTPUT_DB = path.join(OUTPUT_DIR, 'names-v1.sqlite')
const OUTPUT_DB_TMP = `${OUTPUT_DB}.tmp`
const OUTPUT_MANIFEST = path.join(OUTPUT_DIR, 'names-v1.manifest.json')
const LOCK_FILE = path.join(
  process.cwd(),
  'scripts/build-packs/sources.lock.json',
)

const PRIORITY_SCORE: Record<string, number> = {
  news1: 100,
  ichi1: 90,
  spec1: 80,
  news2: 70,
  ichi2: 60,
  spec2: 50,
  gai1: 40,
  gai2: 30,
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_, decimal: string) =>
      String.fromCodePoint(parseInt(decimal, 10)),
    )
    .replace(/&([a-z0-9.-]+);/giu, (_, name: string) => {
      const predefined: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
      }
      return predefined[name] ?? name
    })
}

function tagText(line: string, tag: string): string | null {
  const match = line.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(.*?)</${tag}>`))
  return match ? decodeEntities(match[1] ?? '') : null
}

interface ParseState {
  inEntry: boolean
  inKanji: boolean
  inKana: boolean
  inTranslation: boolean
  entry: {
    entSeq: number
    kanji: Array<{ text: string; info: string[]; pri: string[] }>
    kana: Array<{ text: string; restrictions: string[]; pri: string[] }>
    translations: Array<{ nameTypes: string[]; details: string[] }>
  } | null
  currentKanji: { text: string; info: string[]; pri: string[] } | null
  currentKana: { text: string; restrictions: string[]; pri: string[] } | null
  currentTranslation: { nameTypes: string[]; details: string[] } | null
}

export function createJmnedictParseState(): ParseState {
  return {
    inEntry: false,
    inKanji: false,
    inKana: false,
    inTranslation: false,
    entry: null,
    currentKanji: null,
    currentKana: null,
    currentTranslation: null,
  }
}

/** Parses one JMnedict XML line; exported for deterministic parser tests. */
export function parseJmnedictLine(
  line: string,
  state: ParseState,
): JmnedictEntry | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('<!')) return null

  if (trimmed.startsWith('<entry>')) {
    state.inEntry = true
    state.entry = { entSeq: 0, kanji: [], kana: [], translations: [] }
    return null
  }
  if (trimmed.startsWith('</entry>')) {
    const entry = state.entry
    state.inEntry = false
    state.entry = null
    return entry
      ? {
          entSeq: entry.entSeq,
          kanji: entry.kanji,
          kana: entry.kana,
          translations: entry.translations,
        }
      : null
  }
  if (!state.inEntry || !state.entry) return null

  const entSeq = tagText(trimmed, 'ent_seq')
  if (entSeq) {
    state.entry.entSeq = Number(entSeq)
    return null
  }
  if (trimmed.startsWith('<k_ele>')) {
    state.inKanji = true
    state.currentKanji = { text: '', info: [], pri: [] }
    return null
  }
  if (trimmed.startsWith('</k_ele>')) {
    if (state.currentKanji) state.entry.kanji.push(state.currentKanji)
    state.currentKanji = null
    state.inKanji = false
    return null
  }
  if (trimmed.startsWith('<r_ele>')) {
    state.inKana = true
    state.currentKana = { text: '', restrictions: [], pri: [] }
    return null
  }
  if (trimmed.startsWith('</r_ele>')) {
    if (state.currentKana) state.entry.kana.push(state.currentKana)
    state.currentKana = null
    state.inKana = false
    return null
  }
  if (trimmed.startsWith('<trans>')) {
    state.inTranslation = true
    state.currentTranslation = { nameTypes: [], details: [] }
    return null
  }
  if (trimmed.startsWith('</trans>')) {
    if (state.currentTranslation)
      state.entry.translations.push(state.currentTranslation)
    state.currentTranslation = null
    state.inTranslation = false
    return null
  }

  const currentKanji = state.currentKanji
  const currentKana = state.currentKana
  const currentTranslation = state.currentTranslation
  const keb = state.inKanji ? tagText(trimmed, 'keb') : null
  const reb = state.inKana ? tagText(trimmed, 'reb') : null
  const keInfo = state.inKanji ? tagText(trimmed, 'ke_inf') : null
  const kePri = state.inKanji ? tagText(trimmed, 'ke_pri') : null
  const reRestriction = state.inKana ? tagText(trimmed, 're_restr') : null
  const rePri = state.inKana ? tagText(trimmed, 're_pri') : null
  const nameType = state.inTranslation ? tagText(trimmed, 'name_type') : null
  const translation = state.inTranslation ? tagText(trimmed, 'trans_det') : null

  if (keb && currentKanji) currentKanji.text = keb
  if (reb && currentKana) currentKana.text = reb
  if (keInfo && currentKanji) currentKanji.info.push(keInfo)
  if (kePri && currentKanji) currentKanji.pri.push(kePri)
  if (reRestriction && currentKana) currentKana.restrictions.push(reRestriction)
  if (rePri && currentKana) currentKana.pri.push(rePri)
  if (nameType && currentTranslation)
    currentTranslation.nameTypes.push(nameType)
  if (translation && currentTranslation)
    currentTranslation.details.push(translation)
  return null
}

export async function* parseJmnedictStream(
  inputPath: string,
): AsyncGenerator<JmnedictEntry> {
  const stream = createReadStream(inputPath).pipe(zlib.createGunzip())
  const state = createJmnedictParseState()
  let buffer = ''
  for await (const chunk of stream) {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const entry = parseJmnedictLine(line, state)
      if (entry) yield entry
    }
  }
  if (buffer) {
    const entry = parseJmnedictLine(buffer, state)
    if (entry) yield entry
  }
}

function commonScore(entry: JmnedictEntry): number {
  return Math.max(
    0,
    ...entry.kanji.flatMap((element) =>
      element.pri.map((priority) => PRIORITY_SCORE[priority] ?? 0),
    ),
    ...entry.kana.flatMap((element) =>
      element.pri.map((priority) => PRIORITY_SCORE[priority] ?? 0),
    ),
  )
}

function sourcePath(): string {
  const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8')) as {
    sources?: Record<string, { file?: string; sha256?: string }>
  }
  const source = lock.sources?.jmnedict
  if (!source?.file || !source.sha256)
    throw new Error('sources.lock.json has no complete jmnedict source.')
  const filePath = path.join(
    process.cwd(),
    'scripts/build-packs/.cache',
    source.file,
  )
  if (!fs.existsSync(filePath))
    throw new Error(`JMnedict source not found: ${filePath}`)
  const actual = crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
  if (actual !== source.sha256)
    throw new Error(
      `JMnedict source hash mismatch: expected ${source.sha256}, got ${actual}`,
    )
  return filePath
}

export async function buildNamesDatabase(inputPath: string): Promise<{
  readonly entryCount: number
  readonly formCount: number
  readonly translationCount: number
}> {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  if (fs.existsSync(OUTPUT_DB_TMP)) fs.unlinkSync(OUTPUT_DB_TMP)
  const database = new Database(OUTPUT_DB_TMP)
  database.exec(`
    CREATE TABLE entries (id INTEGER PRIMARY KEY, common_score INTEGER NOT NULL, data BLOB NOT NULL);
    CREATE TABLE forms (entry_id INTEGER NOT NULL, form TEXT NOT NULL, kind TEXT NOT NULL, is_common INTEGER NOT NULL);
    CREATE INDEX idx_names_forms_form ON forms(form);
    CREATE VIRTUAL TABLE glosses_fts USING fts5(entry_id UNINDEXED, gloss);
  `)
  const insertEntry = database.prepare('INSERT INTO entries VALUES (?, ?, ?)')
  const insertForm = database.prepare('INSERT INTO forms VALUES (?, ?, ?, ?)')
  const insertGloss = database.prepare('INSERT INTO glosses_fts VALUES (?, ?)')
  database.exec('BEGIN')
  let entryCount = 0
  let formCount = 0
  let translationCount = 0
  for await (const entry of parseJmnedictStream(inputPath)) {
    if (!entry.entSeq || entry.kana.length === 0) continue
    const score = commonScore(entry)
    const data = {
      seq: entry.entSeq,
      kanji: entry.kanji,
      kana: entry.kana.map(({ text, restrictions, pri }) => ({
        text,
        restr: restrictions,
        pri,
      })),
      translations: entry.translations,
    }
    insertEntry.run(entry.entSeq, score, Buffer.from(JSON.stringify(data)))
    for (const element of entry.kanji) {
      insertForm.run(
        entry.entSeq,
        element.text,
        'kanji',
        element.pri.length > 0 ? 1 : 0,
      )
      formCount++
    }
    for (const element of entry.kana) {
      insertForm.run(
        entry.entSeq,
        element.text,
        'kana',
        element.pri.length > 0 ? 1 : 0,
      )
      formCount++
    }
    for (const translation of entry.translations) {
      for (const detail of translation.details) {
        insertGloss.run(entry.entSeq, detail)
        translationCount++
      }
    }
    entryCount++
    if (entryCount % 10000 === 0)
      console.log(`Processed ${entryCount} names...`)
  }
  database.exec('COMMIT')
  database.close()
  fs.renameSync(OUTPUT_DB_TMP, OUTPUT_DB)
  return { entryCount, formCount, translationCount }
}

function writeManifest(stats: {
  readonly entryCount: number
  readonly formCount: number
  readonly translationCount: number
}): void {
  const bytes = fs.readFileSync(OUTPUT_DB)
  const manifest = {
    id: 'names',
    version: 'v1',
    schemaVersion: 1,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    compressedSizeBytes: zlib.gzipSync(bytes).length,
    license: 'CC BY-SA 4.0',
    attribution:
      'JMnedict — © Electronic Dictionary Research and Development Group, Monash University. Used under CC BY-SA 4.0. Modified: converted to a SQLite database with English name descriptions.',
    sources: [
      {
        id: 'jmnedict',
        name: 'JMnedict',
        license: 'CC BY-SA 4.0',
        url: 'http://ftp.edrdg.org/pub/Nihongo/JMnedict.xml.gz',
      },
    ],
    stats,
  }
  fs.writeFileSync(OUTPUT_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function main(): Promise<void> {
  const stats = await buildNamesDatabase(sourcePath())
  writeManifest(stats)
  console.log(`✓ Built names pack: ${stats.entryCount} entries`)
}

if (process.argv[1]?.endsWith('build-names-pack.ts')) await main()
