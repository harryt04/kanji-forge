import { describe, expect, it } from 'vitest'
import {
  guessKanjiColumn,
  isKanjiLiteral,
  parseJsonKanjiImport,
  parseCsvImport,
  parseCsvKanjiColumn,
  parseKanjiImportText,
  previewKanjiImport,
} from './deck-import'

describe('parseCsvImport', () => {
  it('parses quoted commas, escaped quotes, multiline cells, and a BOM', () => {
    expect(
      parseCsvImport(
        '\uFEFFkanji,meaning\r\n日,"day, sun"\r\n本,"book ""volume"""',
      ),
    ).toEqual({
      headers: ['kanji', 'meaning'],
      rows: [
        ['日', 'day, sun'],
        ['本', 'book "volume"'],
      ],
    })
  })

  it('preserves newlines inside quoted cells and pads short rows', () => {
    expect(parseCsvImport('literal,note\n日,"line one\nline two"\n本')).toEqual(
      {
        headers: ['literal', 'note'],
        rows: [
          ['日', 'line one\nline two'],
          ['本', ''],
        ],
      },
    )
  })
})

describe('CSV kanji mapping', () => {
  it('guesses a conventional kanji header and extracts compact values', () => {
    const table = parseCsvImport('meaning,character\nday,日本\nbook,本')
    expect(guessKanjiColumn(table.headers)).toBe(1)
    expect(parseCsvKanjiColumn(table, 1)).toEqual(['日', '本'])
  })
})

describe('parseKanjiImportText', () => {
  it('parses one-per-line and compact kanji lists in stable order', () => {
    expect(parseKanjiImportText('日\n日本\n本\n日')).toEqual(['日', '本'])
  })

  it('accepts the kanji column from the text export and ignores comments', () => {
    expect(
      parseKanjiImportText('# copied deck\n日\tひ\tday\n本\tほん'),
    ).toEqual(['日', '本'])
  })

  it('ignores whitespace, punctuation, and non-kanji fields', () => {
    expect(parseKanjiImportText('  日  \nかな\nEnglish\n、')).toEqual(['日'])
  })
})

describe('parseJsonKanjiImport', () => {
  it('extracts stable, unique kanji from the versioned deck export', () => {
    expect(
      parseJsonKanjiImport(
        JSON.stringify({
          format: 'kanjiforge-deck-export',
          version: 1,
          cards: [
            { kanji: '日', level: 3 },
            { kanji: '日本' },
            { literal: '本' },
          ],
        }),
      ),
    ).toEqual(['日', '本'])
  })

  it('rejects malformed and unsupported deck JSON', () => {
    expect(() => parseJsonKanjiImport('{')).toThrow('not valid JSON')
    expect(() => parseJsonKanjiImport('{}')).toThrow('must be a KanjiForge')
    expect(() =>
      parseJsonKanjiImport(
        JSON.stringify({
          format: 'kanjiforge-deck-export',
          version: 2,
          cards: [],
        }),
      ),
    ).toThrow('unsupported deck export version')
  })
})

describe('isKanjiLiteral', () => {
  it('recognizes CJK ideographs but not kana or multi-character strings', () => {
    expect(isKanjiLiteral('日')).toBe(true)
    expect(isKanjiLiteral('あ')).toBe(false)
    expect(isKanjiLiteral('日本')).toBe(false)
  })
})

describe('previewKanjiImport', () => {
  it('classifies new, existing, and missing kanji without changing input order', () => {
    expect(
      previewKanjiImport(
        ['日', '本', '𠮷'],
        new Map([
          ['日', {}],
          ['本', {}],
        ]),
        new Set(['kanji:本']),
      ),
    ).toEqual([
      { literal: '日', status: 'matched' },
      { literal: '本', status: 'already-saved' },
      { literal: '𠮷', status: 'not-found' },
    ])
  })
})
