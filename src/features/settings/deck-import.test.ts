import { describe, expect, it } from 'vitest'
import {
  isKanjiLiteral,
  parseKanjiImportText,
  previewKanjiImport,
} from './deck-import'

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
