/** SQLite-WASM content access layer for pre-built decks (dev fixture for now; see T2.2 for the
 * full download/update/delete pack manager). Packs are read-only and shared across users, so a
 * pack handle is cached process-wide once opened. */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { romajiToHiragana } from '@/core/text/romaji'

export interface DeckDefinition {
  readonly id: string
  readonly schemaVersion: number
  readonly name: string
  readonly description: string
  readonly contentType: 'kanji' | 'word' | 'sentence'
  readonly contentRefs: readonly string[]
}

export interface KanjiRecord {
  readonly literal: string
  readonly radicalClassical: number | null
  readonly radicalNelson: number | null
  readonly strokeCount: number
  readonly grade: number | null
  readonly freq: number | null
  readonly jlptLegacy: number | null
  readonly nanori: readonly string[]
  readonly onReadings: readonly string[]
  readonly kunReadings: readonly string[]
  readonly meanings: readonly string[]
}

export interface WordRecord {
  readonly id: number
  readonly commonScore: number
  readonly forms: readonly string[]
  readonly readings: readonly string[]
  readonly partsOfSpeech: readonly string[]
  readonly meanings: readonly string[]
}

export interface SentenceToken {
  readonly text: string
  readonly furigana: string
}

export interface SentenceRecord {
  readonly id: number
  readonly japanese: string
  readonly japaneseAuthor: string
  readonly englishSentenceId: number
  readonly english: string
  readonly englishAuthor: string
  readonly furigana: readonly SentenceToken[]
  readonly readabilityScore: number
}

export type DictionaryResult =
  | {
      readonly type: 'kanji'
      readonly record: KanjiRecord
    }
  | {
      readonly type: 'word'
      readonly record: WordRecord
    }

let sqlJsPromise: ReturnType<typeof initSqlJs> | undefined
function loadSqlJs(): ReturnType<typeof initSqlJs> {
  sqlJsPromise ??= initSqlJs()
  return sqlJsPromise
}

let deckDefinitionsPromise: Promise<readonly DeckDefinition[]> | undefined
export function loadDeckDefinitions(): Promise<readonly DeckDefinition[]> {
  deckDefinitionsPromise ??= fetch('/packs-dev/decks.json')
    .then((response) => {
      if (!response.ok)
        throw new Error(`Failed to load deck definitions (${response.status}).`)
      return response.json() as Promise<{ decks: readonly DeckDefinition[] }>
    })
    .then((body) => body.decks)
  return deckDefinitionsPromise
}

let similarKanjiPromise:
  Promise<Readonly<Record<string, readonly string[]>>> | undefined

function loadSimilarKanji(): Promise<
  Readonly<Record<string, readonly string[]>>
> {
  similarKanjiPromise ??= fetch('/packs-dev/similar.json')
    .then((response) => {
      if (!response.ok)
        throw new Error(
          `Failed to load similar-kanji pack (${response.status}).`,
        )
      return response.json() as Promise<Record<string, unknown>>
    })
    .then((body) => {
      const result: Record<string, readonly string[]> = {}
      for (const [literal, candidates] of Object.entries(body)) {
        if (!Array.isArray(candidates)) continue
        result[literal] = candidates.filter(
          (candidate): candidate is string => typeof candidate === 'string',
        )
      }
      return result
    })
  return similarKanjiPromise
}

/** Returns generated, offline similar-looking kanji in pack ranking order. */
export async function getSimilarKanji(
  literal: string,
): Promise<readonly string[]> {
  const similar = await loadSimilarKanji()
  return similar[literal] ?? []
}

/** Returns ranked dictionary words whose kanji form contains the supplied literal. */
export async function getExampleWords(
  literal: string,
  limit = 12,
): Promise<readonly WordRecord[]> {
  if (!literal || limit <= 0) return []
  const words = await loadDictionaryWords()
  return words
    .filter((word) => word.forms.some((form) => form.includes(literal)))
    .sort(
      (left, right) =>
        right.commonScore - left.commonScore || left.id - right.id,
    )
    .slice(0, limit)
}

export function parseSentenceTokens(
  raw: unknown,
  japanese: string,
): readonly SentenceToken[] {
  try {
    const parsed = JSON.parse(String(raw)) as unknown
    if (Array.isArray(parsed)) {
      const tokens = parsed.flatMap((token): SentenceToken[] => {
        if (!token || typeof token !== 'object' || !('text' in token)) return []
        const text = token.text
        if (typeof text !== 'string' || !text) return []
        const furigana = 'furigana' in token ? token.furigana : ''
        return [
          {
            text,
            furigana: typeof furigana === 'string' ? furigana : '',
          },
        ]
      })
      if (tokens.length > 0) return tokens
    }
  } catch {
    // Fall through to a plain sentence when a future pack has malformed alignment data.
  }
  return [{ text: japanese, furigana: '' }]
}

/** Returns ranked offline Tatoeba sentences containing the supplied kanji. */
export async function getExampleSentences(
  literal: string,
  limit = 6,
): Promise<readonly SentenceRecord[]> {
  if (!literal || limit <= 0) return []
  const database = await openPack('sentences-v1.sqlite')
  const statement = database.prepare(
    `SELECT id, ja, ja_author, en_sentence_id, en, en_author,
      furigana_json, readability_score
     FROM sentences
     WHERE instr(ja, ?) > 0
     ORDER BY readability_score DESC, id ASC
     LIMIT ?`,
    [literal, limit],
  )
  const records: SentenceRecord[] = []
  while (statement.step()) {
    const row = statement.getAsObject()
    const japanese = String(row.ja)
    records.push({
      id: Number(row.id),
      japanese,
      japaneseAuthor: String(row.ja_author),
      englishSentenceId: Number(row.en_sentence_id),
      english: String(row.en),
      englishAuthor: String(row.en_author),
      furigana: parseSentenceTokens(row.furigana_json, japanese),
      readabilityScore: Number(row.readability_score),
    })
  }
  statement.free()
  return records
}

const packHandles = new Map<string, Promise<SqlJsDatabase>>()
function openPack(fileName: string): Promise<SqlJsDatabase> {
  let handle = packHandles.get(fileName)
  if (!handle) {
    handle = Promise.all([
      loadSqlJs(),
      fetch(`/packs-dev/${fileName}`).then((response) => {
        if (!response.ok)
          throw new Error(
            `Failed to load content pack ${fileName} (${response.status}).`,
          )
        return response.arrayBuffer()
      }),
    ]).then(([SQL, buffer]) => new SQL.Database(new Uint8Array(buffer)))
    packHandles.set(fileName, handle)
  }
  return handle
}

function jsonArray(raw: unknown): readonly string[] {
  // Pack schemas guarantee JSON arrays for these columns.
  return JSON.parse(String(raw)) as readonly string[]
}

function jsonBlob(raw: unknown): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(raw as Uint8Array)) as Record<
    string,
    unknown
  >
}

function stringArray(value: unknown): readonly string[] {
  return (value as readonly unknown[]).flatMap((item) =>
    typeof item === 'string'
      ? [item]
      : item && typeof item === 'object' && 'text' in item
        ? [String(item.text)]
        : [],
  )
}

function normalizeQuery(query: string): string {
  return romajiToHiragana(query.trim().normalize('NFC'))
}

function lower(value: string): string {
  return value.toLocaleLowerCase()
}

/** Looks up kanji by their bare literal (a `contentRef` of the form `kanji:<literal>`). */
export async function getKanjiByLiterals(
  literals: readonly string[],
): Promise<ReadonlyMap<string, KanjiRecord>> {
  const database = await openPack('kanji-v1.sqlite')
  const result = new Map<string, KanjiRecord>()
  for (const literal of literals) {
    const statement = database.prepare(
      'SELECT literal, stroke_count, grade, freq, jlpt_legacy, on_readings, kun_readings, meanings, nanori FROM kanji WHERE literal = ?',
      [literal],
    )
    if (statement.step()) {
      const row = statement.getAsObject()
      result.set(literal, {
        literal: String(row.literal),
        radicalClassical:
          row.radical_classical === null ? null : Number(row.radical_classical),
        radicalNelson:
          row.radical_nelson === null ? null : Number(row.radical_nelson),
        strokeCount: Number(row.stroke_count),
        grade: row.grade === null ? null : Number(row.grade),
        freq: row.freq === null ? null : Number(row.freq),
        jlptLegacy: row.jlpt_legacy === null ? null : Number(row.jlpt_legacy),
        nanori: jsonArray(row.nanori),
        onReadings: jsonArray(row.on_readings),
        kunReadings: jsonArray(row.kun_readings),
        meanings: jsonArray(row.meanings),
      })
    }
    statement.free()
  }
  return result
}

let dictionaryKanjiPromise: Promise<readonly KanjiRecord[]> | undefined
function loadDictionaryKanji(): Promise<readonly KanjiRecord[]> {
  dictionaryKanjiPromise ??= openPack('kanji-v1.sqlite').then((database) => {
    const statement = database.prepare(
      'SELECT literal, radical_classical, radical_nelson, stroke_count, grade, freq, jlpt_legacy, on_readings, kun_readings, meanings, nanori FROM kanji',
    )
    const records: KanjiRecord[] = []
    while (statement.step()) {
      const row = statement.getAsObject()
      records.push({
        literal: String(row.literal),
        radicalClassical:
          row.radical_classical === null ? null : Number(row.radical_classical),
        radicalNelson:
          row.radical_nelson === null ? null : Number(row.radical_nelson),
        strokeCount: Number(row.stroke_count),
        grade: row.grade === null ? null : Number(row.grade),
        freq: row.freq === null ? null : Number(row.freq),
        jlptLegacy: row.jlpt_legacy === null ? null : Number(row.jlpt_legacy),
        nanori: jsonArray(row.nanori),
        onReadings: jsonArray(row.on_readings),
        kunReadings: jsonArray(row.kun_readings),
        meanings: jsonArray(row.meanings),
      })
    }
    statement.free()
    return records
  })
  return dictionaryKanjiPromise
}

/** Searches kanji by the KANJIDIC2 classical radical number. */
export async function searchDictionaryByRadical(
  radical: number,
  limit = 30,
): Promise<readonly DictionaryResult[]> {
  if (!Number.isInteger(radical) || radical < 1 || limit <= 0) return []

  const database = await openPack('kanji-v1.sqlite')
  const statement = database.prepare(
    `SELECT literal, radical_classical, radical_nelson, stroke_count, grade,
      freq, jlpt_legacy, on_readings, kun_readings, meanings, nanori
     FROM kanji
     WHERE radical_classical = ?
     ORDER BY CASE WHEN freq IS NULL THEN 1 ELSE 0 END, freq ASC, literal ASC
     LIMIT ?`,
    [radical, limit],
  )
  const results: DictionaryResult[] = []
  while (statement.step()) {
    const row = statement.getAsObject()
    results.push({
      type: 'kanji',
      record: {
        literal: String(row.literal),
        radicalClassical:
          row.radical_classical === null ? null : Number(row.radical_classical),
        radicalNelson:
          row.radical_nelson === null ? null : Number(row.radical_nelson),
        strokeCount: Number(row.stroke_count),
        grade: row.grade === null ? null : Number(row.grade),
        freq: row.freq === null ? null : Number(row.freq),
        jlptLegacy: row.jlpt_legacy === null ? null : Number(row.jlpt_legacy),
        nanori: jsonArray(row.nanori),
        onReadings: jsonArray(row.on_readings),
        kunReadings: jsonArray(row.kun_readings),
        meanings: jsonArray(row.meanings),
      },
    })
  }
  statement.free()
  return results
}

/** Searches kanji by their exact stroke count. */
export async function searchDictionaryByStrokeCount(
  strokeCount: number,
  limit = 30,
): Promise<readonly DictionaryResult[]> {
  if (!Number.isInteger(strokeCount) || strokeCount < 1 || limit <= 0) return []

  const database = await openPack('kanji-v1.sqlite')
  const statement = database.prepare(
    `SELECT literal, radical_classical, radical_nelson, stroke_count, grade,
      freq, jlpt_legacy, on_readings, kun_readings, meanings, nanori
     FROM kanji
     WHERE stroke_count = ?
     ORDER BY CASE WHEN freq IS NULL THEN 1 ELSE 0 END, freq ASC, literal ASC
     LIMIT ?`,
    [strokeCount, limit],
  )
  const results: DictionaryResult[] = []
  while (statement.step()) {
    const row = statement.getAsObject()
    results.push({
      type: 'kanji',
      record: {
        literal: String(row.literal),
        radicalClassical:
          row.radical_classical === null ? null : Number(row.radical_classical),
        radicalNelson:
          row.radical_nelson === null ? null : Number(row.radical_nelson),
        strokeCount: Number(row.stroke_count),
        grade: row.grade === null ? null : Number(row.grade),
        freq: row.freq === null ? null : Number(row.freq),
        jlptLegacy: row.jlpt_legacy === null ? null : Number(row.jlpt_legacy),
        nanori: jsonArray(row.nanori),
        onReadings: jsonArray(row.on_readings),
        kunReadings: jsonArray(row.kun_readings),
        meanings: jsonArray(row.meanings),
      },
    })
  }
  statement.free()
  return results
}

let dictionaryWordsPromise: Promise<readonly WordRecord[]> | undefined
function loadDictionaryWords(): Promise<readonly WordRecord[]> {
  dictionaryWordsPromise ??= openPack('words-core-v1.sqlite').then(
    (database) => {
      const statement = database.prepare(
        'SELECT id, common_score, data FROM entries ORDER BY common_score DESC, id ASC',
      )
      const records: WordRecord[] = []
      while (statement.step()) {
        const row = statement.getAsObject()
        const data = jsonBlob(row.data)
        const kanji = Array.isArray(data.kanji) ? data.kanji : []
        const kana = Array.isArray(data.kana) ? data.kana : []
        const senses = Array.isArray(data.senses) ? data.senses : []
        const forms = stringArray(kanji)
        const readings = stringArray(kana)
        const meanings = senses.flatMap((sense) => {
          if (!sense || typeof sense !== 'object' || !('gloss' in sense))
            return []
          return stringArray(sense.gloss)
        })
        const partsOfSpeech = senses.flatMap((sense) => {
          if (!sense || typeof sense !== 'object' || !('pos' in sense))
            return []
          return stringArray(sense.pos)
        })
        records.push({
          id: Number(row.id),
          commonScore: Number(row.common_score),
          forms,
          readings,
          partsOfSpeech,
          meanings,
        })
      }
      statement.free()
      return records
    },
  )
  return dictionaryWordsPromise
}

function matchScore(
  query: string,
  values: readonly string[],
  english = false,
): number {
  const normalizedQuery = english ? lower(query) : normalizeQuery(query)
  let best = 0
  for (const value of values) {
    const normalizedValue = english ? lower(value) : normalizeQuery(value)
    if (normalizedValue === normalizedQuery) best = Math.max(best, 3)
    else if (normalizedValue.startsWith(normalizedQuery))
      best = Math.max(best, 2)
    else if (normalizedValue.includes(normalizedQuery)) best = Math.max(best, 1)
  }
  return best
}

/** Searches the installed dictionary packs without network access. */
export async function searchDictionary(
  query: string,
  limit = 30,
): Promise<readonly DictionaryResult[]> {
  const trimmed = query.trim()
  if (!trimmed || limit <= 0) return []

  const [kanji, words] = await Promise.all([
    loadDictionaryKanji(),
    loadDictionaryWords(),
  ])
  const results: Array<{ result: DictionaryResult; score: number }> = []
  const normalized = normalizeQuery(trimmed)

  for (const record of kanji) {
    const score = Math.max(
      matchScore(normalized, [
        record.literal,
        ...record.onReadings,
        ...record.kunReadings,
      ]),
      matchScore(trimmed, record.meanings, true),
    )
    if (score > 0) results.push({ result: { type: 'kanji', record }, score })
  }

  for (const record of words) {
    const score = Math.max(
      matchScore(normalized, [...record.forms, ...record.readings]),
      matchScore(trimmed, record.meanings, true),
    )
    if (score > 0) {
      results.push({
        result: { type: 'word', record },
        score: score * 1000 + record.commonScore,
      })
    }
  }

  return results
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ result }) => result)
}

/** Splits a `kanji:日` style contentRef into its pack type and lookup key. */
export function parseContentRef(contentRef: string): {
  readonly type: string
  readonly key: string
} {
  const separatorIndex = contentRef.indexOf(':')
  if (separatorIndex < 0) throw new Error(`Malformed contentRef: ${contentRef}`)
  return {
    type: contentRef.slice(0, separatorIndex),
    key: contentRef.slice(separatorIndex + 1),
  }
}
