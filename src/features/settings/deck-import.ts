import { parseDeckSharePayload } from './deck-share'

/** A parsed CSV table used by the Settings import mapping UI. */
export interface CsvImportTable {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

/**
 * Parses a CSV file with RFC 4180-style quoted cells. A UTF-8 BOM is ignored,
 * and embedded commas, quotes, and newlines are preserved inside quoted cells.
 */
export function parseCsvImport(input: string): CsvImportTable {
  const source = input.replace(/^\uFEFF/u, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        cell += character
      }
      continue
    }

    if (character === '"' && cell.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(cell)
      cell = ''
    } else if (character === '\n' || character === '\r') {
      row.push(cell)
      cell = ''
      if (character === '\r' && source[index + 1] === '\n') index += 1
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
    } else {
      cell += character
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field.')
  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    if (row.some((value) => value.length > 0)) rows.push(row)
  }

  if (rows.length === 0) return { headers: [], rows: [] }

  const width = Math.max(...rows.map((candidate) => candidate.length))
  const headers = Array.from({ length: width }, (_, index) => {
    const value = rows[0]?.[index]?.trim() ?? ''
    return value || `Column ${index + 1}`
  })
  const dataRows = rows
    .slice(1)
    .map((candidate) => headers.map((_, index) => candidate[index] ?? ''))
  return { headers, rows: dataRows }
}

/** Selects the most likely kanji column while leaving the user in control. */
export function guessKanjiColumn(headers: readonly string[]): number {
  const aliases = new Set([
    'kanji',
    'character',
    'characters',
    'literal',
    'content_ref',
    'content ref',
  ])
  const index = headers.findIndex((header) =>
    aliases.has(header.trim().toLocaleLowerCase()),
  )
  return index >= 0 ? index : 0
}

/**
 * Parses the selected CSV column using the same bare-kanji rules as the text
 * importer. This deliberately keeps CSV import focused on dictionary-backed
 * kanji; word enrichment remains a separate future import slice.
 */
export function parseCsvKanjiColumn(
  table: CsvImportTable,
  columnIndex: number,
): readonly string[] {
  return parseKanjiImportText(
    table.rows.map((row) => row[columnIndex] ?? '').join('\n'),
  )
}

/**
 * Parses the intentionally small v2 import surface: one kanji per line, or
 * KanjiForge's tab-separated text export. A line containing several kanji is
 * treated as a compact kanji list, which makes textbook lists convenient to
 * paste without a column-mapping step.
 */
export function parseKanjiImportText(input: string): readonly string[] {
  const values = input
    .split(/\r?\n/u)
    .map((line) => line.trim().split('\t', 1)[0]?.trim() ?? '')
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .flatMap((line) => [...line])

  return [...new Set(values.filter(isKanjiLiteral))]
}

/**
 * Parses one import value per line while preserving multi-character words.
 * Compact kanji lists continue to use parseKanjiImportText; this parser is
 * used by the richer importer so dictionary-backed Japanese words can be
 * resolved before falling back to individual kanji.
 */
export function parseImportValues(input: string): readonly string[] {
  const values = input
    .split(/\r?\n/u)
    .map((line) => line.trim().split('\t', 1)[0]?.trim() ?? '')
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  return [...new Set(values)]
}

/** Reads the selected CSV column as one import value per data row. */
export function parseImportColumn(
  table: CsvImportTable,
  columnIndex: number,
): readonly string[] {
  return parseImportValues(
    table.rows.map((row) => row[columnIndex] ?? '').join('\n'),
  )
}

/**
 * Parses a versioned KanjiForge JSON deck export into dictionary-backed
 * literals. Card progress is intentionally ignored; imports add content to
 * Saved and do not overwrite local SRS state.
 */
export function parseJsonKanjiImport(input: string): readonly string[] {
  let value: unknown
  try {
    value = JSON.parse(input) as unknown
  } catch {
    throw new Error('JSON import is not valid JSON.')
  }

  if (!isRecord(value)) {
    throw new Error('JSON import must be a KanjiForge deck export.')
  }
  if (value.format === 'kanjiforge-deck-share') {
    const payload = parseDeckSharePayload(input)
    return payload.cards
      ? payload.cards.map((card) => card.label)
      : payload.kanji
  }
  if (value.format !== 'kanjiforge-deck-export') {
    throw new Error('JSON import must be a KanjiForge deck export.')
  }
  if (value.version !== 1 || !Array.isArray(value.cards)) {
    throw new Error('JSON import uses an unsupported deck export version.')
  }

  const values = value.cards.flatMap((card) => {
    if (!isRecord(card)) return []
    const literal = card.kanji ?? card.literal
    return typeof literal === 'string' ? [literal] : []
  })
  return parseKanjiImportText(values.join('\n'))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isKanjiLiteral(value: string): boolean {
  if ([...value].length !== 1) return false
  const codePoint = value.codePointAt(0)
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2fa1f))
  )
}

export type KanjiImportPreviewStatus =
  'matched' | 'already-in-target' | 'not-found'

export interface KanjiImportPreviewItem {
  readonly literal: string
  readonly status: KanjiImportPreviewStatus
}

export interface ImportEntry {
  readonly label: string
  readonly contentRef: string | null
  readonly kind: 'kanji' | 'word' | 'name' | 'unknown'
}

export interface ImportPreviewItem extends ImportEntry {
  readonly status: KanjiImportPreviewStatus
}

/** Classifies resolved dictionary entries and unresolved values uniformly. */
export function previewImport(
  entries: readonly ImportEntry[],
  existingContentRefs: ReadonlySet<string>,
): readonly ImportPreviewItem[] {
  return entries.map((entry) => ({
    ...entry,
    status:
      entry.contentRef === null
        ? 'not-found'
        : existingContentRefs.has(entry.contentRef)
          ? 'already-in-target'
          : 'matched',
  }))
}

/** Classifies a parsed import without changing local deck membership. */
export function previewKanjiImport(
  literals: readonly string[],
  records: ReadonlyMap<string, unknown>,
  existingContentRefs: ReadonlySet<string>,
): readonly KanjiImportPreviewItem[] {
  return literals.map((literal) => {
    const contentRef = `kanji:${literal}`
    const status: KanjiImportPreviewStatus = !records.has(literal)
      ? 'not-found'
      : existingContentRefs.has(contentRef)
        ? 'already-in-target'
        : 'matched'
    return { literal, status }
  })
}
