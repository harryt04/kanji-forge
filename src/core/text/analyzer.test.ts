import { describe, expect, it } from 'vitest'
import { analyzeText, type AnalyzerKanji, type AnalyzerWord } from './analyzer'

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
})
