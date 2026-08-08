/** A rectangular table parsed from a delimited import. */
export interface ParsedImportTable {
  readonly headers: readonly string[]
  readonly rows: readonly (readonly string[])[]
}

/**
 * Parses RFC 4180-style delimited text. The same parser handles CSV and TSV,
 * including quoted delimiters, escaped quotes, multiline cells, BOMs, and
 * short rows. Blank records are ignored so pasted files remain convenient.
 */
export function parseDelimitedImport(
  input: string,
  delimiter: ',' | '\t' = ',',
): ParsedImportTable {
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
    } else if (character === delimiter) {
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

  if (quoted) throw new Error('Import contains an unterminated quoted field.')
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

export function parseCsvImport(input: string): ParsedImportTable {
  return parseDelimitedImport(input, ',')
}

export function parseTsvImport(input: string): ParsedImportTable {
  return parseDelimitedImport(input, '\t')
}

/** Parses one import value per line, preserving words and stable order. */
export function parseImportValues(input: string): readonly string[] {
  const values = input
    .split(/\r?\n/u)
    .map((line) => line.trim().split('\t', 1)[0]?.trim() ?? '')
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  return [...new Set(values)]
}

/** Returns true for exactly one Unicode CJK ideograph. */
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

/** Parses compact kanji lists and the first column of a text deck export. */
export function parseKanjiImportText(input: string): readonly string[] {
  const values = input
    .split(/\r?\n/u)
    .map((line) => line.trim().split('\t', 1)[0]?.trim() ?? '')
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .flatMap((line) => [...line])

  return [...new Set(values.filter(isKanjiLiteral))]
}
