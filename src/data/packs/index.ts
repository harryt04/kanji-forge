/** SQLite-WASM content access layer for pre-built decks (dev fixture for now; see T2.2 for the
 * full download/update/delete pack manager). Packs are read-only and shared across users, so a
 * pack handle is cached process-wide once opened. */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { romajiToHiragana } from '@/core/text/romaji'
import { analyzeText, type TextAnalysisToken } from '@/core/text/analyzer'

export type { TextAnalysisToken } from '@/core/text/analyzer'

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

export interface ComponentNode {
  readonly element: string
  readonly children: readonly ComponentNode[]
}

export interface StrokeRecord {
  readonly paths: readonly string[]
  readonly components: ComponentNode | null
}

export interface WordRecord {
  readonly id: number
  readonly commonScore: number
  readonly forms: readonly string[]
  readonly readings: readonly string[]
  readonly partsOfSpeech: readonly string[]
  readonly meanings: readonly string[]
}

export interface NameRecord {
  readonly id: number
  readonly commonScore: number
  readonly forms: readonly string[]
  readonly readings: readonly string[]
  readonly nameTypes: readonly string[]
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
  | {
      readonly type: 'name'
      readonly record: NameRecord
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

const strokeChunkPromises = new Map<
  string,
  Promise<Readonly<Record<string, StrokeRecord>>>
>()

function strokeChunkFor(literal: string): string | null {
  if ([...literal].length !== 1) return null
  const codePoint = literal.codePointAt(0)
  if (codePoint === undefined) return null
  if (codePoint >= 0x4e00 && codePoint <= 0x4fff) return '4E00-4FFF'
  if (codePoint >= 0x5000 && codePoint <= 0x5fff) return '5000-5FFF'
  if (codePoint >= 0x6000 && codePoint <= 0x6fff) return '6000-6FFF'
  if (codePoint >= 0x7000 && codePoint <= 0x7fff) return '7000-7FFF'
  if (codePoint >= 0x8000 && codePoint <= 0x9fff) return '8000-9FFF'
  if (codePoint > 0x20000 && codePoint <= 0x2ffff) return 'CJK_Extended'
  return null
}

function parseComponentNode(value: unknown): ComponentNode | null {
  if (!value || typeof value !== 'object' || !('element' in value)) return null
  const element = value.element
  if (typeof element !== 'string' || element.length === 0) return null
  const children =
    'children' in value && Array.isArray(value.children)
      ? value.children.flatMap((child): ComponentNode[] => {
          const parsed = parseComponentNode(child)
          return parsed ? [parsed] : []
        })
      : []
  return { element, children }
}

function loadStrokeChunk(
  chunk: string,
): Promise<Readonly<Record<string, StrokeRecord>>> {
  let promise = strokeChunkPromises.get(chunk)
  if (!promise) {
    promise = fetch(`/packs-dev/strokes/strokes-${chunk}.json`)
      .then((response) => {
        if (!response.ok)
          throw new Error(
            `Failed to load stroke component pack (${response.status}).`,
          )
        return response.json() as Promise<Record<string, unknown>>
      })
      .then((body) => {
        const result: Record<string, StrokeRecord> = {}
        for (const [codePoint, value] of Object.entries(body)) {
          if (!value || typeof value !== 'object') continue
          const paths =
            'paths' in value && Array.isArray(value.paths)
              ? value.paths.filter(
                  (path): path is string => typeof path === 'string',
                )
              : []
          const components =
            'components' in value ? parseComponentNode(value.components) : null
          if (paths.length > 0 || components) {
            result[codePoint] = { paths, components }
          }
        }
        return result
      })
    strokeChunkPromises.set(chunk, promise)
  }
  return promise
}

/** Returns an offline KanjiVG component tree for a kanji when the stroke pack includes it. */
export async function getKanjiComponents(
  literal: string,
): Promise<ComponentNode | null> {
  const chunk = strokeChunkFor(literal)
  if (!chunk) return null
  const codePoint = literal.codePointAt(0)
  if (codePoint === undefined) return null
  const key = codePoint.toString(16).padStart(5, '0').toLowerCase()
  const records = await loadStrokeChunk(chunk)
  return records[key]?.components ?? null
}

/** Returns offline KanjiVG stroke paths for a kanji when the stroke pack includes it. */
export async function getKanjiStrokes(
  literal: string,
): Promise<readonly string[] | null> {
  const chunk = strokeChunkFor(literal)
  if (!chunk) return null
  const codePoint = literal.codePointAt(0)
  if (codePoint === undefined) return null
  const key = codePoint.toString(16).padStart(5, '0').toLowerCase()
  const records = await loadStrokeChunk(chunk)
  const paths = records[key]?.paths
  return paths && paths.length > 0 ? paths : null
}

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

function wildcardRegex(pattern: string): RegExp {
  const escaped = [...pattern]
    .map((character) => {
      if (character === '*') return '.*'
      if (character === '?') return '.'
      return character.replace(/[\\^$.*+()[\]{}|]/gu, '\\$&')
    })
    .join('')
  return new RegExp(`^${escaped}$`, 'u')
}

/** Looks up kanji by their bare literal (a `contentRef` of the form `kanji:<literal>`). */
export async function getKanjiByLiterals(
  literals: readonly string[],
): Promise<ReadonlyMap<string, KanjiRecord>> {
  const database = await openPack('kanji-v1.sqlite')
  const result = new Map<string, KanjiRecord>()
  for (const literal of literals) {
    const statement = database.prepare(
      'SELECT literal, radical_classical, radical_nelson, stroke_count, grade, freq, jlpt_legacy, on_readings, kun_readings, meanings, nanori FROM kanji WHERE literal = ?',
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

function nameRecordFromRow(row: Record<string, unknown>): NameRecord {
  const data = jsonBlob(row.data)
  const kanji = Array.isArray(data.kanji) ? data.kanji : []
  const kana = Array.isArray(data.kana) ? data.kana : []
  const translations = Array.isArray(data.translations) ? data.translations : []
  const textValues = (values: unknown): readonly string[] =>
    Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string')
      : []
  return {
    id: Number(row.id),
    commonScore: Number(row.common_score),
    forms: kanji.flatMap((value) =>
      value && typeof value === 'object' && 'text' in value
        ? textValues([value.text])
        : [],
    ),
    readings: kana.flatMap((value) =>
      value && typeof value === 'object' && 'text' in value
        ? textValues([value.text])
        : [],
    ),
    nameTypes: translations.flatMap((value) =>
      value && typeof value === 'object' && 'nameTypes' in value
        ? textValues(value.nameTypes)
        : [],
    ),
    partsOfSpeech: [],
    meanings: translations.flatMap((value) =>
      value && typeof value === 'object' && 'details' in value
        ? textValues(value.details)
        : [],
    ),
  }
}

async function queryNameRecords(
  query: string,
  limit = 100,
): Promise<readonly NameRecord[]> {
  try {
    const database = await openPack('names-v1.sqlite')
    const normalized = normalizeQuery(query)
    const escaped = normalized.replace(/[\\%_]/gu, '\\$&')
    const statement = database.prepare(
      `SELECT DISTINCT e.id, e.common_score, e.data
       FROM entries e
       LEFT JOIN forms f ON f.entry_id = e.id
       WHERE f.form = ? OR f.form LIKE ? ESCAPE '\\'
          OR EXISTS (SELECT 1 FROM glosses_fts g WHERE g.entry_id = e.id AND g.gloss LIKE ?)
       ORDER BY e.common_score DESC, e.id ASC
       LIMIT ?`,
      [normalized, `${escaped}%`, `%${query}%`, limit],
    )
    const records: NameRecord[] = []
    while (statement.step())
      records.push(nameRecordFromRow(statement.getAsObject()))
    statement.free()
    return records
  } catch {
    return []
  }
}

/** Looks up one optional JMnedict proper-name entry by its stable pack id. */
export async function getNameById(id: number): Promise<NameRecord | null> {
  if (!Number.isInteger(id) || id < 0) return null
  try {
    const database = await openPack('names-v1.sqlite')
    const statement = database.prepare(
      'SELECT id, common_score, data FROM entries WHERE id = ?',
      [id],
    )
    const result = statement.step()
      ? nameRecordFromRow(statement.getAsObject())
      : null
    statement.free()
    return result
  } catch {
    return null
  }
}

/** Looks up one offline dictionary word by its stable pack id. */
export async function getWordById(id: number): Promise<WordRecord | null> {
  if (!Number.isInteger(id) || id < 0) return null
  const words = await loadDictionaryWords()
  return words.find((word) => word.id === id) ?? null
}

/** Finds one exact kanji or dictionary-word entry for offline import. */
export async function findDictionaryEntry(
  query: string,
): Promise<DictionaryResult | null> {
  const trimmed = query.trim().normalize('NFC')
  if (!trimmed) return null

  const kanji = await loadDictionaryKanji()
  if ([...trimmed].length === 1) {
    const kanjiRecord = kanji.find((record) => record.literal === trimmed)
    if (kanjiRecord) return { type: 'kanji', record: kanjiRecord }
  }

  const normalized = normalizeQuery(trimmed)
  const words = await loadDictionaryWords()
  const word = words.find(
    (record) =>
      record.forms.some((form) => normalizeQuery(form) === normalized) ||
      record.readings.some(
        (reading) => normalizeQuery(reading) === normalized,
      ) ||
      record.meanings.some((meaning) => lower(meaning) === lower(trimmed)),
  )
  if (word) return { type: 'word', record: word }
  const name = (await queryNameRecords(trimmed, 20)).find(
    (record) =>
      record.forms.some((form) => normalizeQuery(form) === normalized) ||
      record.readings.some(
        (reading) => normalizeQuery(reading) === normalized,
      ) ||
      record.meanings.some((meaning) => lower(meaning) === lower(trimmed)),
  )
  return name ? { type: 'name', record: name } : null
}

/**
 * Performs a small, fully offline text analysis pass over the installed packs.
 *
 * The optional tokenizer pack will eventually improve segmentation, but a
 * longest dictionary-form match is already useful for pasted study material
 * and keeps this route functional without a network request or a large new
 * dependency. Unmatched characters remain visible as unknown tokens rather
 * than being silently discarded.
 */
export async function analyzeJapaneseText(
  text: string,
  maxTokens = 500,
): Promise<readonly TextAnalysisToken[]> {
  const [words, kanji] = await Promise.all([
    loadDictionaryWords(),
    loadDictionaryKanji(),
  ])
  return analyzeText(text, words, kanji, maxTokens)
}

function matchScore(
  query: string,
  values: readonly string[],
  english = false,
): number {
  const normalizedQuery = english ? lower(query) : normalizeQuery(query)
  const hasWildcard = /[*?]/u.test(normalizedQuery)
  const wildcard = hasWildcard ? wildcardRegex(normalizedQuery) : null
  let best = 0
  for (const value of values) {
    const normalizedValue = english ? lower(value) : normalizeQuery(value)
    if (wildcard?.test(normalizedValue)) best = Math.max(best, 3)
    else if (hasWildcard) continue
    else if (normalizedValue === normalizedQuery) best = Math.max(best, 3)
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
    if (score > 0)
      results.push({
        result: { type: 'kanji', record },
        // A literal kanji hit should remain visible even when the optional
        // names pack contains hundreds of matching surnames.
        score: score * 1_000_000,
      })
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

  const names = await queryNameRecords(trimmed, 100)
  for (const record of names) {
    const score = Math.max(
      matchScore(normalized, [...record.forms, ...record.readings]),
      matchScore(trimmed, record.meanings, true),
    )
    if (score > 0)
      results.push({
        result: { type: 'name', record },
        score: score * 1000 + record.commonScore,
      })
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
