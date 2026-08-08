import { describe, expect, it } from 'vitest'
import {
  analyzeText,
  analyzeTextWithSegments,
  type AnalyzerKanji,
  type AnalyzerWord,
} from './analyzer'

const kanji: readonly AnalyzerKanji[] = [
  {
    literal: '日',
    jlptLegacy: 5,
    onReadings: ['ニチ'],
    kunReadings: ['ひ'],
    meanings: ['day'],
  },
  {
    literal: '本',
    jlptLegacy: 5,
    onReadings: ['ホン'],
    kunReadings: ['もと'],
    meanings: ['book'],
  },
]

const words: readonly AnalyzerWord[] = [
  {
    id: 1,
    commonScore: 10,
    forms: ['日本'],
    readings: ['にほん'],
    meanings: ['Japan'],
  },
  {
    id: 2,
    commonScore: 100,
    forms: ['本'],
    readings: ['ほん'],
    meanings: ['book'],
  },
  {
    id: 3,
    commonScore: 50,
    forms: [],
    readings: ['です'],
    meanings: ['be'],
  },
  {
    id: 4,
    commonScore: 80,
    forms: ['食べる'],
    readings: ['たべる'],
    meanings: ['to eat'],
  },
  {
    id: 5,
    commonScore: 70,
    forms: ['読む'],
    readings: ['よむ'],
    meanings: ['to read'],
  },
]

describe('analyzeText', () => {
  it('prefers a covered longer word and recognizes its kana reading', () => {
    expect(analyzeText('日本です', words, kanji)).toEqual([
      expect.objectContaining({
        text: '日本',
        type: 'word',
        contentRef: 'word:1',
      }),
      expect.objectContaining({
        text: 'です',
        type: 'word',
        contentRef: 'word:3',
      }),
    ])
    expect(analyzeText('にほん', words, kanji)[0]).toEqual(
      expect.objectContaining({ text: 'にほん', contentRef: 'word:1' }),
    )
  })

  it('keeps unknown punctuation and text visible while grouping adjacent runs', () => {
    expect(analyzeText('???ABC日', words, kanji)).toEqual([
      expect.objectContaining({ text: '???ABC', type: 'unknown' }),
      expect.objectContaining({ text: '日', type: 'kanji' }),
    ])
  })

  it('honors the token limit without dropping earlier matches', () => {
    expect(analyzeText('日本です', words, kanji, 1)).toHaveLength(1)
    expect(analyzeText('日本です', words, kanji, 1)[0]).toEqual(
      expect.objectContaining({ text: '日本', contentRef: 'word:1' }),
    )
  })

  it('resolves common inflected forms to dictionary lemmas with surface readings', () => {
    expect(analyzeText('食べました。読んで', words, kanji)).toEqual([
      expect.objectContaining({
        text: '食べました',
        contentRef: 'word:4',
        reading: 'たべました',
      }),
      expect.objectContaining({
        text: '。',
        type: 'unknown',
      }),
      expect.objectContaining({
        text: '読んで',
        contentRef: 'word:5',
        reading: 'よんで',
      }),
    ])
  })

  it('resolves negative, conditional, and volitional forms', () => {
    expect(analyzeText('読まなかった。読めば読もう', words, kanji)).toEqual([
      expect.objectContaining({
        text: '読まなかった',
        contentRef: 'word:5',
        reading: 'よまなかった',
      }),
      expect.objectContaining({ text: '。', type: 'unknown' }),
      expect.objectContaining({
        text: '読めば',
        contentRef: 'word:5',
        reading: 'よめば',
      }),
      expect.objectContaining({
        text: '読もう',
        contentRef: 'word:5',
        reading: 'よもう',
      }),
    ])
  })

  it('resolves progressive and progressive-negative forms', () => {
    expect(analyzeText('読んでいます。食べていなかった', words, kanji)).toEqual(
      [
        expect.objectContaining({
          text: '読んでいます',
          contentRef: 'word:5',
          reading: 'よんでいます',
        }),
        expect.objectContaining({ text: '。', type: 'unknown' }),
        expect.objectContaining({
          text: '食べていなかった',
          contentRef: 'word:4',
          reading: 'たべていなかった',
        }),
      ],
    )
  })

  it('resolves imperative and prohibitive forms to their dictionary lemmas', () => {
    expect(analyzeText('読め。食べるな', words, kanji)).toEqual([
      expect.objectContaining({
        text: '読め',
        contentRef: 'word:5',
        reading: 'よめ',
      }),
      expect.objectContaining({ text: '。', type: 'unknown' }),
      expect.objectContaining({
        text: '食べるな',
        contentRef: 'word:4',
        reading: 'たべるな',
      }),
    ])
  })

  it('resolves potential forms to their dictionary lemmas', () => {
    expect(analyzeText('読める。食べられない', words, kanji)).toEqual([
      expect.objectContaining({
        text: '読める',
        contentRef: 'word:5',
        reading: 'よめる',
      }),
      expect.objectContaining({ text: '。', type: 'unknown' }),
      expect.objectContaining({
        text: '食べられない',
        contentRef: 'word:4',
        reading: 'たべられない',
      }),
    ])
  })

  it('resolves passive and causative forms to their dictionary lemmas', () => {
    expect(analyzeText('読まれました。食べさせている', words, kanji)).toEqual([
      expect.objectContaining({
        text: '読まれました',
        contentRef: 'word:5',
        reading: 'よまれました',
      }),
      expect.objectContaining({ text: '。', type: 'unknown' }),
      expect.objectContaining({
        text: '食べさせている',
        contentRef: 'word:4',
        reading: 'たべさせている',
      }),
    ])
  })

  it('annotates common particles and longer functional phrases offline', () => {
    expect(analyzeText('日本ではない。日を読む', words, kanji)).toEqual([
      expect.objectContaining({ text: '日本', type: 'word' }),
      expect.objectContaining({
        text: 'ではない',
        type: 'grammar',
        reading: 'ではない',
        meanings: ['is not'],
      }),
      expect.objectContaining({ text: '。', type: 'unknown' }),
      expect.objectContaining({ text: '日', type: 'kanji' }),
      expect.objectContaining({
        text: 'を',
        type: 'grammar',
        reading: 'を',
        meanings: ['object marker'],
      }),
      expect.objectContaining({ text: '読む', type: 'word' }),
    ])
  })

  it('keeps dictionary words ahead of overlapping grammar fragments', () => {
    expect(analyzeText('です', words, kanji)).toEqual([
      expect.objectContaining({
        text: 'です',
        type: 'word',
        contentRef: 'word:3',
      }),
    ])
  })

  it('honors morphological boundaries while retaining dictionary and grammar mapping', () => {
    const overlappingWords: readonly AnalyzerWord[] = [
      ...words,
      {
        id: 6,
        commonScore: 1000,
        forms: ['日本ではない'],
        readings: ['にほんではない'],
        meanings: ['an intentionally overlapping fixture entry'],
      },
    ]

    expect(
      analyzeTextWithSegments(
        '日本ではない',
        ['日本', 'ではない'],
        overlappingWords,
        kanji,
      ),
    ).toEqual([
      expect.objectContaining({ text: '日本', contentRef: 'word:1' }),
      expect.objectContaining({ text: 'ではない', type: 'grammar' }),
    ])
  })
})
