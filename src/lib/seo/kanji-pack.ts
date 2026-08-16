// Server-only, build-time reader for the committed kanji pack. Used to
// prerender the public /kanji/* pages — distinct from `src/data/packs/index.ts`,
// which is the client-side sql.js reader the authenticated app uses at
// runtime in the browser. Only import this from server components/route
// handlers — better-sqlite3 is a native module and must never reach a
// client bundle.
import Database from 'better-sqlite3'
import path from 'node:path'

export interface SeoKanjiRecord {
  readonly literal: string
  readonly codepoint: string
  readonly radicalClassical: number | null
  readonly radicalNelson: number | null
  readonly grade: number | null
  readonly strokeCount: number
  readonly freq: number | null
  readonly jlptLegacy: number | null
  readonly onReadings: readonly string[]
  readonly kunReadings: readonly string[]
  readonly meanings: readonly string[]
  readonly nanori: readonly string[]
}

interface KanjiRow {
  literal: string
  codepoint: string
  radical_classical: number | null
  radical_nelson: number | null
  grade: number | null
  stroke_count: number
  freq: number | null
  jlpt_legacy: number | null
  on_readings: string
  kun_readings: string
  meanings: string
  nanori: string
}

function parseJsonArray(value: string): readonly string[] {
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function toRecord(row: KanjiRow): SeoKanjiRecord {
  return {
    literal: row.literal,
    codepoint: row.codepoint,
    radicalClassical: row.radical_classical,
    radicalNelson: row.radical_nelson,
    grade: row.grade,
    strokeCount: row.stroke_count,
    freq: row.freq,
    jlptLegacy: row.jlpt_legacy,
    onReadings: parseJsonArray(row.on_readings),
    kunReadings: parseJsonArray(row.kun_readings),
    meanings: parseJsonArray(row.meanings),
    nanori: parseJsonArray(row.nanori),
  }
}

let db: Database.Database | undefined
function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), 'packs', 'kanji-v1.sqlite')
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
  }
  return db
}

/** Looks up one kanji by its literal character. Returns null if absent from the pack. */
export function getKanji(literal: string): SeoKanjiRecord | null {
  const row = getDb()
    .prepare<[string], KanjiRow>('SELECT * FROM kanji WHERE literal = ?')
    .get(literal)
  return row ? toRecord(row) : null
}

let allLiteralsCache: readonly string[] | undefined

/** Every literal in the pack (13k+). Used only to validate dynamic params. */
export function getAllLiterals(): readonly string[] {
  allLiteralsCache ??= getDb()
    .prepare<[], { literal: string }>('SELECT literal FROM kanji')
    .all()
    .map((row) => row.literal)
  return allLiteralsCache
}

let frequencyLiteralsCache: readonly string[] | undefined

/** Every literal carrying a KANJIDIC frequency rank (freq IS NOT NULL). */
export function getFrequencyRankedLiterals(): readonly string[] {
  frequencyLiteralsCache ??= getDb()
    .prepare<
      [],
      { literal: string }
    >('SELECT literal FROM kanji WHERE freq IS NOT NULL')
    .all()
    .map((row) => row.literal)
  return frequencyLiteralsCache
}
