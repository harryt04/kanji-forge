import { describe, expect, it } from 'vitest'
import {
  isKanjiLiteral,
  parseCsvImport,
  parseImportValues,
  parseKanjiImportText,
  parseTsvImport,
} from './parse'
import {
  deduplicateImportEntries,
  previewImport,
  type ImportEntry,
} from './enrich'

describe('core import parsing', () => {
  it('parses CSV and TSV with quoted cells and padded rows', () => {
    expect(parseCsvImport('\uFEFFterm,note\n日,"day, sun"\n本')).toEqual({
      headers: ['term', 'note'],
      rows: [
        ['日', 'day, sun'],
        ['本', ''],
      ],
    })
    expect(parseTsvImport('term\tnote\n"お金"\tmoney')).toEqual({
      headers: ['term', 'note'],
      rows: [['お金', 'money']],
    })
  })

  it('rejects unterminated quoted fields', () => {
    expect(() => parseCsvImport('term,note\n"日')).toThrow(
      'unterminated quoted field',
    )
  })

  it('parses stable line values and compact kanji lists', () => {
    expect(parseImportValues('# comment\n 日\n日本\n日')).toEqual([
      '日',
      '日本',
    ])
    expect(parseKanjiImportText('日\n日本\nかな')).toEqual(['日', '本'])
    expect(isKanjiLiteral('日')).toBe(true)
    expect(isKanjiLiteral('日本')).toBe(false)
  })
})

describe('core import enrichment', () => {
  const entries: readonly ImportEntry[] = [
    { label: '日', contentRef: 'kanji:日', kind: 'kanji' },
    { label: '日', contentRef: 'kanji:日', kind: 'kanji' },
    { label: 'missing', contentRef: null, kind: 'unknown' },
    { label: 'missing', contentRef: null, kind: 'unknown' },
  ]

  it('deduplicates resolved and unresolved entries by stable identity', () => {
    expect(deduplicateImportEntries(entries)).toEqual([entries[0], entries[2]])
  })

  it('classifies matched, existing, and unresolved content', () => {
    expect(
      previewImport(deduplicateImportEntries(entries), new Set(['kanji:日'])),
    ).toEqual([
      { ...entries[0], status: 'already-in-target' },
      { ...entries[2], status: 'not-found' },
    ])
  })
})
