/**
 * Deck progress math shared between Home's deck shelf and Browse's deck rail.
 * Pure functions live here so both screens compute identical numbers from the
 * same inputs; only `loadDeckSummaries` (added alongside Browse's rail) does I/O.
 */
import {
  progress as computeProgress,
  progressLevel as computeProgressLevel,
} from '@/core/srs/goal'
import { emptyCardState } from '@/core/srs/types'
import type { CardState } from '@/data/repo'
import { toCoreState } from '@/features/study/adapters'

export type LevelCounts = readonly [number, number, number, number, number]

export interface DeckSummary {
  readonly id: string
  readonly name: string
  readonly kind: 'derived' | 'custom'
  readonly cardCount: number
  readonly levelCounts: LevelCounts
  readonly progressPercent: number
  readonly progressLevel: 0 | 1 | 2 | 3 | 4
  readonly lastStudiedAt: number | null
  readonly folder: string
}

/** Untouched cards (no saved state) count as level 0. */
export function countCardsByLevel(
  cards: readonly { readonly state: CardState | undefined }[],
): LevelCounts {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const card of cards) {
    const level = card.state?.level ?? 0
    counts[level] = counts[level]! + 1
  }
  return counts
}

/**
 * Pure — no DB access. Walks `contentRefs`, not `states`: a `card_states` row
 * for a contentRef the deck no longer references (e.g. after a pack update)
 * must not be counted.
 */
export function summarizeDeckCards(input: {
  readonly deck: {
    readonly id: string
    readonly name: string
    readonly kind: 'derived' | 'custom'
  }
  readonly contentRefs: readonly string[]
  readonly states: readonly CardState[]
  readonly userId: string
  readonly folder?: string
  readonly lastSessionAt?: number | null
}): DeckSummary {
  const stateByRef = new Map(
    input.states.map((state) => [state.contentRef, state]),
  )
  const cards = input.contentRefs.map((contentRef) => ({
    contentRef,
    state: stateByRef.get(contentRef),
  }))

  const levelCounts = countCardsByLevel(cards)
  const coreStates = cards.map(({ contentRef, state }) =>
    state
      ? toCoreState(state)
      : emptyCardState(input.deck.id, contentRef, input.userId),
  )
  const progressValue = computeProgress(cards.length, coreStates)

  const lastReviewedAt = cards.reduce<number | null>(
    (latest, card) =>
      card.state?.lastReviewedAt &&
      (latest === null || card.state.lastReviewedAt > latest)
        ? card.state.lastReviewedAt
        : latest,
    null,
  )
  const lastSessionAt = input.lastSessionAt ?? null
  const lastStudiedAt =
    lastReviewedAt === null
      ? lastSessionAt
      : lastSessionAt === null
        ? lastReviewedAt
        : Math.max(lastReviewedAt, lastSessionAt)

  return {
    id: input.deck.id,
    name: input.deck.name,
    kind: input.deck.kind,
    cardCount: cards.length,
    levelCounts,
    progressPercent: Math.round(progressValue * 100),
    progressLevel: computeProgressLevel(progressValue),
    lastStudiedAt,
    folder: input.folder ?? '',
  }
}
