import { parseDeckSharePayload } from './deck-share'
import {
  parseCsvImport as parseCoreCsvImport,
  parseImportValues as parseCoreImportValues,
  parseKanjiImportText as parseCoreKanjiImportText,
  isKanjiLiteral as isCoreKanjiLiteral,
  type ParsedImportTable,
} from '@/core/import/parse'
import {
  previewImport as previewCoreImport,
  type ImportEntry,
  type ImportPreviewItem,
} from '@/core/import/enrich'

export type { ImportEntry, ImportPreviewItem }

/** A parsed CSV table used by the Settings import mapping UI. */
export type CsvImportTable = ParsedImportTable

/**
 * Parses a CSV file with RFC 4180-style quoted cells. A UTF-8 BOM is ignored,
 * and embedded commas, quotes, and newlines are preserved inside quoted cells.
 */
export function parseCsvImport(input: string): CsvImportTable {
  return parseCoreCsvImport(input)
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
  return parseCoreKanjiImportText(input)
}

/**
 * Parses one import value per line while preserving multi-character words.
 * Compact kanji lists continue to use parseKanjiImportText; this parser is
 * used by the richer importer so dictionary-backed Japanese words can be
 * resolved before falling back to individual kanji.
 */
export function parseImportValues(input: string): readonly string[] {
  return parseCoreImportValues(input)
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

export const isKanjiLiteral = isCoreKanjiLiteral

export type KanjiImportPreviewStatus =
  'matched' | 'already-in-target' | 'not-found'

export interface KanjiImportPreviewItem {
  readonly literal: string
  readonly status: KanjiImportPreviewStatus
}

/** Classifies resolved dictionary entries and unresolved values uniformly. */
export function previewImport(
  entries: readonly ImportEntry[],
  existingContentRefs: ReadonlySet<string>,
): readonly ImportPreviewItem[] {
  return previewCoreImport(entries, existingContentRefs)
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
