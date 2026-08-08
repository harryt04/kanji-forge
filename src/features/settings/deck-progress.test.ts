import { describe, expect, it } from 'vitest'
import { planProgressTransfer } from './deck-progress'
import type { CardInDeck } from '@/data/repo'
import { repoCardState } from '../../../test/factories'

function card(
  contentRef: string,
  state?: Partial<ReturnType<typeof repoCardState>>,
): CardInDeck {
  return {
    contentRef,
    deckId: state?.deckId ?? 'source',
    state: state ? repoCardState({ contentRef, ...state }) : undefined,
  }
}

describe('planProgressTransfer', () => {
  it('copies studied SRS fields for shared cards while keeping destination flags', () => {
    const transfers = planProgressTransfer(
      [
        card('kanji:日', {
          deckId: 'dev-kanji',
          level: 3,
          flagged: false,
          totalReviews: 8,
          totalCorrect: 7,
          lapses: 1,
          manualOverride: false,
        }),
      ],
      [
        card('kanji:日', {
          deckId: 'saved',
          level: 1,
          flagged: true,
          totalReviews: 2,
          totalCorrect: 2,
        }),
      ],
      'saved',
      1_700_000_000_123,
      'device-b',
    )

    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({
      sourceDeckId: 'dev-kanji',
      state: {
        deckId: 'saved',
        contentRef: 'kanji:日',
        level: 3,
        totalReviews: 8,
        totalCorrect: 7,
        lapses: 1,
        flagged: true,
        updatedAt: 1_700_000_000_123,
        updatedBy: 'device-b',
      },
    })
  })

  it('does not create work for untouched or already-matching cards', () => {
    const source = card('kanji:日', {
      deckId: 'dev-kanji',
      level: 2,
      totalReviews: 3,
      totalCorrect: 3,
    })
    const matchingTarget = card('kanji:日', {
      deckId: 'saved',
      level: 2,
      totalReviews: 3,
      totalCorrect: 3,
      flagged: true,
    })

    expect(
      planProgressTransfer(
        [source, card('kanji:本')],
        [matchingTarget, card('kanji:語')],
        'saved',
        1_700_000_000_123,
        'device-b',
      ),
    ).toEqual([])
  })
})
