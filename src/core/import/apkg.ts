import initSqlJs, { type Database } from 'sql.js'
import { unzipSync } from 'fflate'

export interface AnkiImportDeck {
  readonly deckName: string | null
  readonly noteCount: number
  readonly kanji: readonly string[]
  readonly values: readonly string[]
  readonly taggedValues: readonly AnkiImportValue[]
}

export interface AnkiImportValue {
  readonly value: string
  readonly tags: readonly string[]
}

function getDeckName(database: Database): string | null {
  try {
    const statement = database.prepare('SELECT decks FROM col LIMIT 1')
    if (!statement.step()) {
      statement.free()
      return null
    }
    const row = statement.getAsObject() as { decks?: unknown }
    statement.free()
    if (typeof row.decks !== 'string') return null
    const decks = JSON.parse(row.decks) as unknown
    if (!decks || typeof decks !== 'object' || Array.isArray(decks)) return null
    const names = Object.values(decks).flatMap((deck) => {
      if (!deck || typeof deck !== 'object' || !('name' in deck)) return []
      return typeof deck.name === 'string' ? [deck.name] : []
    })
    return names.find((name) => name !== 'Default') ?? names[0] ?? null
  } catch {
    return null
  }
}

function isKanjiLiteral(value: string): boolean {
  const codePoint = value.codePointAt(0)
  return (
    [...value].length === 1 &&
    codePoint !== undefined &&
    ((codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2fa1f))
  )
}

function extractKanji(input: string): readonly string[] {
  return [
    ...new Set([...input].filter((character) => isKanjiLiteral(character))),
  ]
}

function isJapaneseCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0)
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x3040 && codePoint <= 0x30ff) ||
      (codePoint >= 0x31f0 && codePoint <= 0x31ff) ||
      (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2fa1f) ||
      codePoint === 0x3005 ||
      codePoint === 0x30a0 ||
      codePoint === 0xff5e)
  )
}

/**
 * Keeps Japanese runs from Anki fields so exact dictionary words can be
 * enriched during the normal import preview. Single kana runs are omitted;
 * the kanji fallback still preserves individual ideographs from every field.
 */
function extractJapaneseValues(input: string): readonly string[] {
  const values: string[] = []
  let run = ''

  function flush(): void {
    if (run.length > 1 || isKanjiLiteral(run)) values.push(run)
    run = ''
  }

  for (const character of input.replace(/<[^>]*>/gu, ' ')) {
    if (isJapaneseCharacter(character)) run += character
    else flush()
  }
  flush()

  return [...new Set(values)]
}

function extractAnkiTags(input: string): readonly string[] {
  return [...new Set(input.trim().split(/\s+/u).filter(Boolean))]
}

/**
 * Reads the portable SQLite collection inside an Anki package.
 *
 * Anki notes store their fields in a unit-separator-delimited `flds` column.
 * We intentionally extract only CJK ideographs from every field: that makes
 * imports useful across arbitrary Anki note models while keeping this MVP
 * best-effort and safe to preview before anything is written locally.
 */
export async function parseAnkiApkg(
  input: ArrayBuffer,
): Promise<AnkiImportDeck> {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(input))
  } catch {
    throw new Error('Anki import is not a valid .apkg archive.')
  }

  const collection = files['collection.anki21'] ?? files['collection.anki2']
  if (!collection) {
    throw new Error('Anki import does not contain collection.anki2.')
  }

  const SQL = await initSqlJs()
  const database = new SQL.Database(collection)
  try {
    let statement: ReturnType<Database['prepare']>
    try {
      statement = database.prepare('SELECT flds, tags FROM notes ORDER BY id')
    } catch {
      // A few older/synthetic collections omit the optional tags column.
      statement = database.prepare('SELECT flds FROM notes ORDER BY id')
    }
    const fields: string[] = []
    const taggedValues = new Map<string, Set<string>>()
    while (statement.step()) {
      const row = statement.getAsObject() as {
        flds?: unknown
        tags?: unknown
      }
      if (typeof row.flds !== 'string') continue
      const noteFields = row.flds.replace(/\u001f/gu, '\n')
      fields.push(noteFields)
      const tags = typeof row.tags === 'string' ? extractAnkiTags(row.tags) : []
      if (tags.length === 0) continue
      for (const value of extractJapaneseValues(noteFields)) {
        const current = taggedValues.get(value) ?? new Set<string>()
        for (const tag of tags) current.add(tag)
        taggedValues.set(value, current)
      }
    }
    statement.free()
    const values = extractJapaneseValues(fields.join('\n'))
    return {
      deckName: getDeckName(database),
      noteCount: fields.length,
      kanji: extractKanji(fields.join('\n')),
      values,
      taggedValues: values.map((value) => ({
        value,
        tags: [...(taggedValues.get(value) ?? [])],
      })),
    }
  } catch {
    throw new Error('Anki import has no readable notes table.')
  } finally {
    database.close()
  }
}
