import { describe, expect, it } from 'vitest'
import {
  DECK_EXPORT_FORMAT,
  DECK_EXPORT_VERSION,
  formatDeckAsCsv,
  formatDeckAsJson,
  formatDeckAsText,
} from './deck-export'
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

describe('file deck exports', () => {
  const deck = {
    deckId: 'dev-kanji',
    name: 'Development Kanji',
    cards: [
      {
        deckId: 'dev-kanji',
        contentRef: 'kanji:日',
        state: {
          deckId: 'dev-kanji',
          contentRef: 'kanji:日',
          level: 2,
          dueAt: 123,
          lastReviewedAt: 100,
          correctStreak: 2,
          totalReviews: 4,
          totalCorrect: 3,
          lapses: 1,
          flagged: true,
          manualOverride: false,
          updatedAt: 123,
          updatedBy: 'test',
        },
      },
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
          nanori: ['あきら'],
          onReadings: ['ニチ'],
          kunReadings: ['ひ'],
          meanings: ['day, sun', 'line\nbreak'],
        },
      ],
    ]),
  } satisfies LoadedDeck

  it('exports content and progress as escaped CSV with a header', () => {
    expect(formatDeckAsCsv(deck)).toBe(
      'content_ref,kanji,readings,meanings,nanori,stroke_count,frequency,jlpt,grade,level,due_at,last_reviewed_at,total_reviews,total_correct,lapses,flagged\nkanji:日,日,ニチ、ひ,"day, sun; line\nbreak",あきら,4,1,5,1,2,123,100,4,3,1,true',
    )
  })

  it('exports a versioned JSON document with stable card fields', () => {
    expect(JSON.parse(formatDeckAsJson(deck))).toEqual({
      format: DECK_EXPORT_FORMAT,
      version: DECK_EXPORT_VERSION,
      deck: { id: 'dev-kanji', name: 'Development Kanji' },
      cards: [
        {
          contentRef: 'kanji:日',
          kanji: '日',
          readings: 'ニチ、ひ',
          meanings: 'day, sun; line\nbreak',
          nanori: 'あきら',
          strokeCount: 4,
          frequency: 1,
          jlpt: 5,
          grade: 1,
          level: 2,
          dueAt: 123,
          lastReviewedAt: 100,
          totalReviews: 4,
          totalCorrect: 3,
          lapses: 1,
          flagged: true,
        },
      ],
    })
  })
})
