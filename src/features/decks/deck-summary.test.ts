import { describe, expect, it } from 'vitest'
import { progress } from '@/core/srs/goal'
import { emptyCardState } from '@/core/srs/types'
import type { CardState } from '@/data/repo'
import { toCoreState } from '@/features/study/adapters'
import { countCardsByLevel, summarizeDeckCards } from './deck-summary'

function cardState(contentRef: string, level: CardState['level']): CardState {
  return {
    deckId: 'test-deck',
    contentRef,
    level,
    dueAt: null,
    lastReviewedAt: null,
    correctStreak: 0,
    totalReviews: 0,
    totalCorrect: 0,
    lapses: 0,
    flagged: false,
    manualOverride: false,
    updatedAt: 0,
    updatedBy: 'test',
  }
}

describe('countCardsByLevel', () => {
  it('counts an untouched card (no saved state) as level 0', () => {
    const counts = countCardsByLevel([
      { state: undefined },
      { state: cardState('a', 2) },
      { state: cardState('b', 2) },
    ])
    expect(counts).toEqual([1, 0, 2, 0, 0])
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(3)
  })

  it('sums to the input length regardless of level distribution', () => {
    const cards = [
      { state: undefined },
      { state: cardState('a', 0) },
      { state: cardState('b', 1) },
      { state: cardState('c', 4) },
    ]
    const counts = countCardsByLevel(cards)
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(cards.length)
  })
})

describe('summarizeDeckCards', () => {
  const baseInput = {
    deck: {
      id: 'dev-kanji',
      name: 'Development Kanji',
      kind: 'derived' as const,
    },
    userId: 'user-1',
  }

  it('buckets cards by level and computes progress from the same states', () => {
    const contentRefs = ['kanji:a', 'kanji:b', 'kanji:c', 'kanji:d']
    const states = [
      cardState('kanji:a', 0),
      cardState('kanji:b', 2),
      cardState('kanji:c', 4),
      // kanji:d has no state row — untouched, counts as level 0
    ]

    const summary = summarizeDeckCards({ ...baseInput, contentRefs, states })

    expect(summary.levelCounts).toEqual([2, 0, 1, 0, 1])
    expect(summary.cardCount).toBe(4)

    const coreStates = contentRefs.map((contentRef) => {
      const state = states.find((s) => s.contentRef === contentRef)
      return state
        ? toCoreState(state)
        : emptyCardState('dev-kanji', contentRef, 'user-1')
    })
    expect(summary.progressPercent).toBe(
      Math.round(progress(contentRefs.length, coreStates) * 100),
    )
  })

  it('ignores a state row whose contentRef the deck no longer references', () => {
    const contentRefs = ['kanji:a', 'kanji:b']
    const states = [
      cardState('kanji:a', 3),
      cardState('kanji:stale-removed-from-deck', 4),
    ]

    const summary = summarizeDeckCards({ ...baseInput, contentRefs, states })

    expect(summary.cardCount).toBe(2)
    expect(summary.levelCounts).toEqual([1, 0, 0, 1, 0])
  })

  it('takes the later of last review and last session as lastStudiedAt', () => {
    const contentRefs = ['kanji:a']
    const states = [{ ...cardState('kanji:a', 1), lastReviewedAt: 1000 }]

    expect(
      summarizeDeckCards({
        ...baseInput,
        contentRefs,
        states,
        lastSessionAt: 2000,
      }).lastStudiedAt,
    ).toBe(2000)
    expect(
      summarizeDeckCards({
        ...baseInput,
        contentRefs,
        states,
        lastSessionAt: 500,
      }).lastStudiedAt,
    ).toBe(1000)
    expect(
      summarizeDeckCards({ ...baseInput, contentRefs, states }).lastStudiedAt,
    ).toBe(1000)
  })

  it('defaults folder to an empty string when not provided', () => {
    const summary = summarizeDeckCards({
      ...baseInput,
      contentRefs: [],
      states: [],
    })
    expect(summary.folder).toBe('')
  })
})
