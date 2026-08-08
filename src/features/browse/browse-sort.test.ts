import type { CardState } from '@/data/repo'
import { describe, expect, it } from 'vitest'
import { sortBrowseCards, type SortableBrowseCard } from './browse-sort'

function card(
  contentRef: string,
  deckIndex: number,
  values: Partial<SortableBrowseCard> = {},
): SortableBrowseCard {
  return {
    contentRef,
    deckIndex,
    state: values.state,
    literal: values.literal ?? contentRef,
    strokeCount: values.strokeCount ?? 1,
    frequency: values.frequency ?? null,
    jlptLegacy: values.jlptLegacy ?? null,
    grade: values.grade ?? null,
    kana: values.kana ?? '',
  }
}

function state(totalReviews: number, lastReviewedAt: number | null): CardState {
  return {
    deckId: 'dev-kanji',
    contentRef: 'kanji:test',
    level: totalReviews > 1 ? 2 : 1,
    dueAt: null,
    lastReviewedAt,
    correctStreak: 0,
    totalReviews,
    totalCorrect: 0,
    lapses: 0,
    flagged: false,
    manualOverride: false,
    updatedAt: 0,
    updatedBy: 'test',
  }
}

describe('sortBrowseCards', () => {
  const cards = [
    card('kanji:a', 0, {
      literal: 'あ',
      strokeCount: 8,
      frequency: 20,
      jlptLegacy: 3,
      grade: 2,
      kana: 'か',
      state: state(2, 200),
    }),
    card('kanji:b', 1, {
      literal: 'い',
      strokeCount: 2,
      frequency: 5,
      jlptLegacy: 5,
      grade: 1,
      kana: 'あ',
      state: state(1, 100),
    }),
    card('kanji:c', 2, {
      literal: 'う',
      strokeCount: 2,
      frequency: null,
      jlptLegacy: null,
      grade: null,
      kana: 'さ',
    }),
  ]

  it.each([
    ['stroke-count', ['kanji:b', 'kanji:c', 'kanji:a']],
    ['frequency', ['kanji:b', 'kanji:a', 'kanji:c']],
    ['jlpt', ['kanji:b', 'kanji:a', 'kanji:c']],
    ['grade', ['kanji:b', 'kanji:a', 'kanji:c']],
    ['times-reviewed', ['kanji:c', 'kanji:b', 'kanji:a']],
    ['last-reviewed', ['kanji:b', 'kanji:a', 'kanji:c']],
    ['kana', ['kanji:b', 'kanji:a', 'kanji:c']],
  ] as const)('sorts by %s and puts missing values last', (sort, expected) => {
    expect(sortBrowseCards(cards, sort).map((item) => item.contentRef)).toEqual(
      expected,
    )
  })

  it('sorts levels from new to mastered and keeps deck order for ties', () => {
    const sorted = sortBrowseCards(
      [
        card('kanji:mastered', 0, { state: state(2, 200) }),
        card('kanji:new-a', 1),
        card('kanji:new-b', 2),
      ],
      'level',
    )
    expect(sorted.map((item) => item.contentRef)).toEqual([
      'kanji:new-a',
      'kanji:new-b',
      'kanji:mastered',
    ])
  })

  it('returns a new deck-order array for the default sort', () => {
    expect(sortBrowseCards(cards, 'deck-order')).not.toBe(cards)
    expect(sortBrowseCards(cards, 'deck-order')).toEqual(cards)
  })
})
