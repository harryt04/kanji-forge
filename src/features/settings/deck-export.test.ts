import { describe, expect, it } from 'vitest'
import { formatDeckAsText } from './deck-export'
import type { LoadedDeck } from '@/features/study/deck-loader'

describe('formatDeckAsText', () => {
  it('exports cards as deterministic tab-separated rows', () => {
    const deck = {
      deckId: 'dev-kanji',
      name: 'Development Kanji',
      cards: [
        { deckId: 'dev-kanji', contentRef: 'kanji:日', state: undefined },
        { deckId: 'dev-kanji', contentRef: 'kanji:一', state: undefined },
      ],
      content: new Map([
        [
          'kanji:日',
          {
            contentRef: 'kanji:日',
            literal: '日',
            strokeCount: 4,
            frequency: 1,
            jlptLegacy: 5,
            grade: 1,
            nanori: [],
            onReadings: ['ニチ', 'ジツ'],
            kunReadings: ['ひ', 'か'],
            meanings: ['day', 'sun'],
          },
        ],
        [
          'kanji:一',
          {
            contentRef: 'kanji:一',
            literal: '一',
            strokeCount: 1,
            frequency: 2,
            jlptLegacy: 5,
            grade: 1,
            nanori: [],
            onReadings: ['イチ'],
            kunReadings: ['ひと'],
            meanings: ['one'],
          },
        ],
      ]),
    } satisfies LoadedDeck

    expect(formatDeckAsText(deck)).toBe(
      '日\tニチ、ジツ、ひ、か\tday; sun\n一\tイチ、ひと\tone',
    )
  })

  it('omits cards that are unavailable in the installed pack', () => {
    const deck = {
      deckId: 'dev-kanji',
      name: 'Development Kanji',
      cards: [
        { deckId: 'dev-kanji', contentRef: 'kanji:missing', state: undefined },
      ],
      content: new Map(),
    } satisfies LoadedDeck

    expect(formatDeckAsText(deck)).toBe('')
  })
})
