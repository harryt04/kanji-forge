import type { CardInDeck, CardState } from '@/data/repo'

export interface ProgressTransfer {
  readonly state: CardState
  readonly sourceDeckId: string
}

function hasStudyProgress(state: CardState): boolean {
  return (
    state.level > 0 ||
    state.totalReviews > 0 ||
    state.totalCorrect > 0 ||
    state.lapses > 0 ||
    state.lastReviewedAt !== null
  )
}

function sameStudyProgress(left: CardState, right: CardState): boolean {
  return (
    left.level === right.level &&
    left.dueAt === right.dueAt &&
    left.lastReviewedAt === right.lastReviewedAt &&
    left.correctStreak === right.correctStreak &&
    left.totalReviews === right.totalReviews &&
    left.totalCorrect === right.totalCorrect &&
    left.lapses === right.lapses &&
    left.manualOverride === right.manualOverride
  )
}

/**
 * Plans a non-destructive copy of studied SRS progress between decks that
 * share content refs. Flags remain owned by the destination deck. Untouched
 * source cards are omitted so creating a Saved membership never creates rows
 * just because a transfer was requested.
 */
export function planProgressTransfer(
  sourceCards: readonly CardInDeck[],
  targetCards: readonly CardInDeck[],
  targetDeckId: string,
  now: number,
  updatedBy: string,
): readonly ProgressTransfer[] {
  const sourceByRef = new Map(
    sourceCards.map((card) => [card.contentRef, card] as const),
  )

  return targetCards.flatMap((targetCard) => {
    const sourceCard = sourceByRef.get(targetCard.contentRef)
    const sourceState = sourceCard?.state
    if (!sourceState || !hasStudyProgress(sourceState)) return []

    const nextState: CardState = {
      ...sourceState,
      deckId: targetDeckId,
      contentRef: targetCard.contentRef,
      flagged: targetCard.state?.flagged ?? false,
      updatedAt: now,
      updatedBy,
    }
    if (targetCard.state && sameStudyProgress(targetCard.state, nextState))
      return []

    return [{ state: nextState, sourceDeckId: sourceState.deckId }]
  })
}
