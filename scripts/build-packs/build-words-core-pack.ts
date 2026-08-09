#!/usr/bin/env node
/**
 * Build words-core pack from JMdict_e
 *
 * Filters to entries with *_pri tags (news1/news2/ichi1/ichi2/spec1/spec2/gai1/gai2)
 * Creates SQLite database with:
 *   - entries table: id, common_score, data (JSON blob)
 *   - forms table: entry_id, form, kind ('kanji' | 'kana'), is_common
 *   - glosses_fts virtual table (FTS5) for ranked full-text search
 *
 * Uses better-sqlite3 (supports FTS5). Matches ARCHITECTURE.md §4.1 schema.
 *
 * Usage:
 *   pnpm exec tsx scripts/build-packs/build-words-core-pack.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'
import * as crypto from 'crypto'
import { createReadStream } from 'fs'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3'

// Minimal XML parser using streaming/regex
interface JmdictEntry {
  ent_seq: number
  kEle: Array<{ keb: string; keInf?: string[]; kePri?: string[] }>
  rEle: Array<{
    reb: string
    reNokanji?: boolean
    reRestr?: string[]
    rePri?: string[]
  }>
  sense: Array<{
    stagk?: string[]
    stagr?: string[]
    pos?: string[]
    xref?: string[]
    ant?: string[]
    field?: string[]
    misc?: string[]
    dial?: string[]
    gloss: Array<{ text: string; lang?: string }>
  }>
}

const OUTPUT_DIR = path.join(process.cwd(), 'packs')
const OUTPUT_DB = path.join(OUTPUT_DIR, 'words-core-v1.sqlite')
const OUTPUT_MANIFEST = path.join(OUTPUT_DIR, 'words-core-v1.manifest.json')
const LOCK_FILE = path.join(
  process.cwd(),
  'scripts/build-packs/sources.lock.json',
)

// Priority scoring for *_pri tags
const PRI_SCORE: Record<string, number> = {
  news1: 100,
  ichi1: 90,
  spec1: 80,
  news2: 70,
  ichi2: 60,
  spec2: 50,
  gai1: 40,
  gai2: 30,
}

/**
 * Decode JMdict DTD entities and XML predefined entities.
 * JMdict uses &n; &uk; &ateji; etc which the DTD expands to the short code itself (n, uk, ateji).
 * Also handles &amp; etc and numeric refs.
 */
function decodeJmdictEntities(s: string): string {
  if (!s) return s
  // numeric first
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
    String.fromCodePoint(parseInt(h, 16)),
  )
  s = s.replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  // named: predefined + JMdict (identity for &foo; -> foo)
  const ENTITY_MAP: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
  }
  s = s.replace(/&([a-zA-Z0-9.-]+);/g, (_, name) => {
    if (name in ENTITY_MAP) return ENTITY_MAP[name]
    return name // e.g. &n; -> "n", &uk; -> "uk", &ateji; -> "ateji"
  })
  return s
}

export function resolveAndVerifyJmdictPath(): string {
  if (!fs.existsSync(LOCK_FILE)) {
    throw new Error(`sources.lock.json not found at ${LOCK_FILE}`)
  }
  const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'))
  const jmdictEntry = lock.sources && lock.sources.jmdict
  if (!jmdictEntry || !jmdictEntry.sha256) {
    throw new Error('No valid jmdict entry with sha256 in sources.lock.json')
  }
  // filename from id-pinned + ext (do not hardcode date)
  const urlExt = path.extname(new URL(jmdictEntry.url).pathname) || '.gz'
  const fileName = `${jmdictEntry.id}-${jmdictEntry.pinned}${urlExt}`
  const filePath = path.join(
    process.cwd(),
    'scripts/build-packs/.cache',
    fileName,
  )
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `JMdict source not found at ${filePath} (from lock pinned=${jmdictEntry.pinned})`,
    )
  }
  // verify sha256 fail closed
  const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
  if (hash !== jmdictEntry.sha256) {
    throw new Error(
      `Input gz sha256 mismatch for jmdict (fail closed): expected ${jmdictEntry.sha256} got ${hash}`,
    )
  }
  console.log(`✓ Verified jmdict input ${fileName} against sources.lock.json`)
  return filePath
}

interface ParseState {
  inEntry: boolean
  inKEle: boolean
  inREle: boolean
  inSense: boolean
  currentEntry: JmdictEntry | null
  currentKEle: JmdictEntry['kEle'][0] | null
  currentREle: JmdictEntry['rEle'][0] | null
  currentSense: JmdictEntry['sense'][0] | null
}

function parseJmdictLine(line: string, state: ParseState): JmdictEntry | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  // Opening tags
  if (trimmed.startsWith('<entry>')) {
    state.inEntry = true
    state.currentEntry = {
      ent_seq: 0,
      kEle: [],
      rEle: [],
      sense: [],
    }
  } else if (trimmed.startsWith('</entry>')) {
    state.inEntry = false
    const result = state.currentEntry
    state.currentEntry = null
    return result
  } else if (state.inEntry && trimmed.startsWith('<ent_seq>')) {
    const match = trimmed.match(/<ent_seq>(\d+)<\/ent_seq>/)
    if (match && state.currentEntry) {
      state.currentEntry.ent_seq = parseInt(match[1], 10)
    }
  } else if (state.inEntry && trimmed.startsWith('<k_ele>')) {
    state.inKEle = true
    state.currentKEle = { keb: '', keInf: [], kePri: [] }
  } else if (state.inKEle && trimmed.startsWith('</k_ele>')) {
    state.inKEle = false
    if (state.currentKEle && state.currentEntry) {
      state.currentEntry.kEle.push(state.currentKEle)
    }
    state.currentKEle = null
  } else if (state.inKEle && trimmed.startsWith('<keb>')) {
    const match = trimmed.match(/<keb>(.*?)<\/keb>/)
    if (match && state.currentKEle) {
      state.currentKEle.keb = decodeJmdictEntities(match[1])
    }
  } else if (state.inKEle && trimmed.startsWith('<ke_inf>')) {
    const match = trimmed.match(/<ke_inf>(.*?)<\/ke_inf>/)
    if (match && state.currentKEle) {
      state.currentKEle.keInf!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inKEle && trimmed.startsWith('<ke_pri>')) {
    const match = trimmed.match(/<ke_pri>(.*?)<\/ke_pri>/)
    if (match && state.currentKEle) {
      state.currentKEle.kePri!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inEntry && trimmed.startsWith('<r_ele>')) {
    state.inREle = true
    state.currentREle = { reb: '', reNokanji: false, reRestr: [], rePri: [] }
  } else if (state.inREle && trimmed.startsWith('</r_ele>')) {
    state.inREle = false
    if (state.currentREle && state.currentEntry) {
      state.currentEntry.rEle.push(state.currentREle)
    }
    state.currentREle = null
  } else if (state.inREle && trimmed.startsWith('<reb>')) {
    const match = trimmed.match(/<reb>(.*?)<\/reb>/)
    if (match && state.currentREle) {
      state.currentREle.reb = decodeJmdictEntities(match[1])
    }
  } else if (state.inREle && trimmed.includes('<re_nokanji/>')) {
    if (state.currentREle) {
      state.currentREle.reNokanji = true
    }
  } else if (state.inREle && trimmed.startsWith('<re_restr>')) {
    const match = trimmed.match(/<re_restr>(.*?)<\/re_restr>/)
    if (match && state.currentREle) {
      state.currentREle.reRestr!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inREle && trimmed.startsWith('<re_pri>')) {
    const match = trimmed.match(/<re_pri>(.*?)<\/re_pri>/)
    if (match && state.currentREle) {
      state.currentREle.rePri!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inEntry && trimmed.startsWith('<sense>')) {
    state.inSense = true
    state.currentSense = {
      stagk: [],
      stagr: [],
      pos: [],
      xref: [],
      ant: [],
      field: [],
      misc: [],
      dial: [],
      gloss: [],
    }
  } else if (state.inSense && trimmed.startsWith('</sense>')) {
    state.inSense = false
    if (state.currentSense && state.currentEntry) {
      state.currentEntry.sense.push(state.currentSense)
    }
    state.currentSense = null
  } else if (state.inSense && trimmed.startsWith('<pos>')) {
    const match = trimmed.match(/<pos>(.*?)<\/pos>/)
    if (match && state.currentSense) {
      state.currentSense.pos!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inSense && trimmed.startsWith('<misc>')) {
    const match = trimmed.match(/<misc>(.*?)<\/misc>/)
    if (match && state.currentSense) {
      state.currentSense.misc!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inSense && trimmed.startsWith('<field>')) {
    const match = trimmed.match(/<field>(.*?)<\/field>/)
    if (match && state.currentSense) {
      state.currentSense.field!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inSense && trimmed.startsWith('<dial>')) {
    const match = trimmed.match(/<dial>(.*?)<\/dial>/)
    if (match && state.currentSense) {
      state.currentSense.dial!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inSense && trimmed.startsWith('<stagk>')) {
    const match = trimmed.match(/<stagk>(.*?)<\/stagk>/)
    if (match && state.currentSense) {
      state.currentSense.stagk!.push(decodeJmdictEntities(match[1]))
    }
  } else if (state.inSense && trimmed.startsWith('<stagr>')) {
    const match = trimmed.match(/<stagr>(.*?)<\/stagr>/)
    if (match && state.currentSense) {
      state.currentSense.stagr!.push(decodeJmdictEntities(match[1]))
    }
  } else if (
    state.inSense &&
    (trimmed.startsWith('<gloss') || trimmed.startsWith('<gloss>'))
  ) {
    // Extract gloss with optional xml:lang attribute
    const langMatch = trimmed.match(/xml:lang="([^"]*)"/)
    const textMatch = trimmed.match(/>([^<]*)</)
    if (state.currentSense) {
      const rawText = textMatch ? textMatch[1] : ''
      state.currentSense.gloss.push({
        text: decodeJmdictEntities(rawText),
        lang: langMatch ? langMatch[1] : 'eng', // Default to English
      })
    }
  }

  return null
}

export async function* parseJmdictStream(
  inputPath: string,
): AsyncGenerator<JmdictEntry> {
  const state: ParseState = {
    inEntry: false,
    inKEle: false,
    inREle: false,
    inSense: false,
    currentEntry: null,
    currentKEle: null,
    currentREle: null,
    currentSense: null,
  }

  // Read gzip file and parse line by line
  const gunzip = zlib.createGunzip()
  const readStream = createReadStream(inputPath).pipe(gunzip)
  let lineBuffer = ''

  for await (const chunk of readStream) {
    const str = chunk.toString('utf8')
    lineBuffer += str

    const lines = lineBuffer.split('\n')
    lineBuffer = lines[lines.length - 1] // Keep incomplete line

    for (let i = 0; i < lines.length - 1; i++) {
      const entry = parseJmdictLine(lines[i], state)
      if (entry) {
        yield entry
      }
    }
  }

  // Process any remaining data
  if (lineBuffer) {
    const entry = parseJmdictLine(lineBuffer, state)
    if (entry) {
      yield entry
    }
  }
}

function hasCommonScore(entry: JmdictEntry): number {
  let maxScore = 0

  // Check k_ele pri tags
  for (const kEle of entry.kEle) {
    if (kEle.kePri) {
      for (const pri of kEle.kePri) {
        if (pri in PRI_SCORE) {
          maxScore = Math.max(maxScore, PRI_SCORE[pri])
        }
      }
    }
  }

  // Check r_ele pri tags
  for (const rEle of entry.rEle) {
    if (rEle.rePri) {
      for (const pri of rEle.rePri) {
        if (pri in PRI_SCORE) {
          maxScore = Math.max(maxScore, PRI_SCORE[pri])
        }
      }
    }
  }

  return maxScore
}

export interface WordsPackBuildOptions {
  readonly outputDb: string
  readonly packId: 'words-core' | 'words-full'
  readonly includeEntry: (entry: JmdictEntry, commonScore: number) => boolean
}

export async function buildWordsPack(
  jmdictPath: string,
  options: WordsPackBuildOptions,
): Promise<{
  entryCount: number
  formCount: number
  glossCount: number
}> {
  const outputDbTmp = options.outputDb + '.tmp'
  // Ensure output dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  // do not delete final here; use tmp for atomic
  if (fs.existsSync(outputDbTmp)) {
    fs.unlinkSync(outputDbTmp)
  }

  const db = new Database(outputDbTmp)

  // Create schema per ARCHITECTURE.md §4.1 (with FTS5)
  db.exec(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY,
      common_score INTEGER NOT NULL,
      data BLOB NOT NULL
    );
    CREATE TABLE forms (
      entry_id INTEGER NOT NULL,
      form TEXT NOT NULL,
      kind TEXT NOT NULL,
      is_common INTEGER NOT NULL,
      FOREIGN KEY (entry_id) REFERENCES entries(id)
    );
    CREATE INDEX idx_forms_form ON forms(form);
    CREATE VIRTUAL TABLE glosses_fts USING fts5(entry_id UNINDEXED, gloss);
  `)

  let entryCount = 0
  let formCount = 0
  let glossCount = 0
  let filteredCount = 0

  const insertEntry = db.prepare(
    'INSERT INTO entries (id, common_score, data) VALUES (?, ?, ?)',
  )
  const insertForm = db.prepare(
    'INSERT INTO forms (entry_id, form, kind, is_common) VALUES (?, ?, ?, ?)',
  )
  const insertGlossFts = db.prepare(
    'INSERT INTO glosses_fts (entry_id, gloss) VALUES (?, ?)',
  )

  // Parse and insert entries
  for await (const entry of parseJmdictStream(jmdictPath)) {
    const score = hasCommonScore(entry)

    if (!options.includeEntry(entry, score)) continue

    filteredCount++

    const entryId = entry.ent_seq

    const entryData = JSON.stringify({
      seq: entry.ent_seq,
      kanji: entry.kEle.map((k) => ({
        text: k.keb,
        info: k.keInf || [],
        pri: k.kePri || [],
      })),
      kana: entry.rEle.map((r) => ({
        text: r.reb,
        nokanji: r.reNokanji || false,
        restr: r.reRestr || [],
        pri: r.rePri || [],
      })),
      senses: entry.sense,
    })

    insertEntry.run(entryId, score, Buffer.from(entryData))
    entryCount++

    // Insert kanji forms
    for (const kEle of entry.kEle) {
      const isCommon = kEle.kePri && kEle.kePri.length > 0 ? 1 : 0
      insertForm.run(entryId, kEle.keb, 'kanji', isCommon)
      formCount++
    }

    // Insert kana forms
    for (const rEle of entry.rEle) {
      const isCommon = rEle.rePri && rEle.rePri.length > 0 ? 1 : 0
      insertForm.run(entryId, rEle.reb, 'kana', isCommon)
      formCount++
    }

    // Insert to FTS5 for offline ranked search
    for (const sense of entry.sense) {
      for (const gloss of sense.gloss) {
        if (!gloss.lang || gloss.lang === 'eng') {
          insertGlossFts.run(entryId, gloss.text)
          glossCount++
        }
      }
    }

    if (filteredCount % 1000 === 0) {
      console.log(`Processed ${filteredCount} entries...`)
    }
  }

  db.close()

  // atomic rename after success (before manifest)
  fs.renameSync(outputDbTmp, options.outputDb)

  console.log(
    `Built ${options.packId}: ${entryCount} entries, ${formCount} forms, ${glossCount} glosses`,
  )

  return { entryCount, formCount, glossCount }
}

export async function writeWordsManifest(
  stats: {
    entryCount: number
    formCount: number
    glossCount: number
  },
  options: {
    readonly outputDb: string
    readonly outputManifest: string
    readonly packId: 'words-core' | 'words-full'
    readonly filterDescription: string
  },
): Promise<string> {
  const dbStats = fs.statSync(options.outputDb)
  const dbContent = fs.readFileSync(options.outputDb)
  const sha256 = crypto.createHash('sha256').update(dbContent).digest('hex')

  // compute gzip compressed size (for done-check budget note; brotli may be smaller in future)
  const gzipped = zlib.gzipSync(dbContent)
  const compressedSizeBytes = gzipped.length
  const compressedMB = (compressedSizeBytes / 1024 / 1024).toFixed(2)

  const manifest = {
    id: options.packId,
    version: 'v1',
    schemaVersion: 1,
    sha256,
    sizeBytes: dbStats.size,
    compressedSizeBytes,
    compressedSizeMB: compressedMB,
    license: 'CC BY-SA 4.0',
    attribution: `JMdict — © Electronic Dictionary Research and Development Group, Monash University. Used under CC BY-SA 4.0. Modified: converted to a database format, some fields omitted, ${options.filterDescription}.`,
    sources: [
      {
        id: 'jmdict',
        name: 'JMdict_e (English only)',
        license: 'CC BY-SA 4.0',
        url: 'http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz',
      },
    ],
    stats,
  }

  const manifestTmp = options.outputManifest + '.tmp'
  fs.writeFileSync(manifestTmp, JSON.stringify(manifest, null, 2))
  fs.renameSync(manifestTmp, options.outputManifest)

  console.log(
    `✓ Gzip compressed size: ${compressedMB} MB (note: spec budget ~6 MB compressed; brotli in later T0.x)`,
  )

  return sha256
}

async function main() {
  console.log('Building words-core pack from JMdict...')

  let jmdictPath: string
  try {
    jmdictPath = resolveAndVerifyJmdictPath()
  } catch (e) {
    console.error(String(e))
    console.error('Run: pnpm exec tsx scripts/build-packs/fetch-sources.ts')
    process.exit(1)
  }

  try {
    const stats = await buildWordsPack(jmdictPath, {
      outputDb: OUTPUT_DB,
      packId: 'words-core',
      includeEntry: (_entry, commonScore) => commonScore > 0,
    })
    const sha256 = await writeWordsManifest(stats, {
      outputDb: OUTPUT_DB,
      outputManifest: OUTPUT_MANIFEST,
      packId: 'words-core',
      filterDescription: 'filtered to common-tagged entries',
    })

    console.log(`✓ Created ${OUTPUT_DB}`)
    console.log(`✓ SHA256: ${sha256}`)
    console.log(
      `✓ Size: ${(fs.statSync(OUTPUT_DB).size / 1024 / 1024).toFixed(2)} MB`,
    )
    console.log(`✓ Manifest: ${OUTPUT_MANIFEST}`)
  } catch (error) {
    // cleanup temp on failure; do not leave partial db or write manifest
    try {
      if (fs.existsSync(OUTPUT_DB + '.tmp')) fs.unlinkSync(OUTPUT_DB + '.tmp')
    } catch {}
    console.error('Build failed:', error)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
