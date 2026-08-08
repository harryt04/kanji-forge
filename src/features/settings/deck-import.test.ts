import initSqlJs from 'sql.js'
import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseAnkiApkg } from '@/core/import/apkg'
import {
  guessKanjiColumn,
  parseImportColumn,
  parseImportValues,
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

  it('preserves one-per-line dictionary words for offline enrichment', () => {
    expect(parseImportValues('日\nお金\n日本語\nお金')).toEqual([
      '日',
      'お金',
      '日本語',
    ])
  })

  it('reads words from a selected CSV column without splitting them', () => {
    const table = parseCsvImport('term,note\nお金,money\n日本語,Japanese')
    expect(parseImportColumn(table, 0)).toEqual(['お金', '日本語'])
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
      { literal: '本', status: 'already-in-target' },
      { literal: '𠮷', status: 'not-found' },
    ])
  })
})

describe('Anki package import', () => {
  it('extracts unique kanji from note fields and reads the deck name', async () => {
    const SQL = await initSqlJs()
    const database = new SQL.Database()
    database.run('CREATE TABLE col (decks TEXT)')
    database.run('CREATE TABLE notes (id INTEGER, flds TEXT)')
    database.run('INSERT INTO col VALUES (?)', [
      JSON.stringify({
        '1': { name: 'N5 vocabulary' },
        '2': { name: 'Default' },
      }),
    ])
    database.run('INSERT INTO notes VALUES (?, ?), (?, ?)', [
      2,
      '日本\u001fにほん\u001fJapan',
      1,
      '本\u001fほん\u001fbook',
    ])

    const result = await parseAnkiApkg(
      zipSync({ 'collection.anki2': database.export() }).buffer,
    )

    expect(result).toEqual({
      deckName: 'N5 vocabulary',
      noteCount: 2,
      kanji: ['本', '日'],
    })
    database.close()
  })

  it('rejects malformed packages and packages without a collection', async () => {
    await expect(
      parseAnkiApkg(new Uint8Array([1, 2, 3]).buffer),
    ).rejects.toThrow('not a valid .apkg archive')
    await expect(
      parseAnkiApkg(zipSync({ README: new Uint8Array() }).buffer),
    ).rejects.toThrow('does not contain collection.anki2')
  })
})
