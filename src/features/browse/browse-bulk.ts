import { nextDue } from '@/core/srs/schedule'
import { DEFAULT_SRS_CONFIG } from '@/core/srs/types'
import type { CardState, OutboxMutation, Review } from '@/data/repo'

export interface BulkBrowseCard {
  readonly contentRef: string
  readonly state: CardState | undefined
}

export interface BulkCardStateMutation {
  readonly state: CardState
  readonly mutation: OutboxMutation
}

export interface BulkManualOverride {
  readonly review: Review
  readonly nextState: CardState
  readonly mutation: OutboxMutation
}

interface BulkOptions {
  readonly deckId: string
  readonly now: number
  readonly deviceId: string
  readonly idFactory: () => string
}

function baseState(card: BulkBrowseCard, options: BulkOptions): CardState {
  return (
    card.state ?? {
      deckId: options.deckId,
      contentRef: card.contentRef,
      level: 0,
      dueAt: null,
      lastReviewedAt: null,
      correctStreak: 0,
      totalReviews: 0,
      totalCorrect: 0,
      lapses: 0,
      flagged: false,
      manualOverride: false,
      updatedAt: 0,
      updatedBy: options.deviceId,
    }
  )
}

export function buildBulkFlagUpdates(
  cards: readonly BulkBrowseCard[],
  flagged: boolean,
  options: BulkOptions,
): readonly BulkCardStateMutation[] {
  return cards.map((card) => {
    const state = baseState(card, options)
    const nextState: CardState = {
      ...state,
      flagged,
      updatedAt: options.now,
      updatedBy: options.deviceId,
    }
    const id = options.idFactory()
    return {
      state: nextState,
      mutation: {
        id,
        mutType: 'cardState.upsert',
        payload: JSON.stringify({
          deckId: options.deckId,
          contentRef: card.contentRef,
          flagged,
        }),
        createdAt: options.now,
        attempts: 0,
      },
    }
  })
}

export function buildBulkLevelOverrides(
  cards: readonly BulkBrowseCard[],
  level: CardState['level'],
  options: BulkOptions,
): readonly BulkManualOverride[] {
  return cards.map((card) => {
    const before = baseState(card, options)
    const id = options.idFactory()
    const nextState: CardState = {
      ...before,
      level,
      dueAt: nextDue(level, DEFAULT_SRS_CONFIG, options.now),
      lastReviewedAt: options.now,
      manualOverride: true,
      updatedAt: options.now,
      updatedBy: options.deviceId,
    }
    const review: Review = {
      id,
      deckId: options.deckId,
      contentRef: card.contentRef,
      at: options.now,
      grade: 'good',
      levelBefore: before.level,
      levelAfter: level,
      intervalBefore: before.dueAt
        ? Math.max(0, before.dueAt - options.now)
        : 0,
      elapsedDays: before.lastReviewedAt
        ? Math.max(0, (options.now - before.lastReviewedAt) / 86_400_000)
        : 0,
      responseMs: 0,
      source: 'manual',
      deviceId: options.deviceId,
    }
    return {
      review,
      nextState,
      mutation: {
        id,
        mutType: 'review.append',
        payload: JSON.stringify({
          deckId: options.deckId,
          contentRef: card.contentRef,
          source: 'manual',
          levelBefore: before.level,
          levelAfter: level,
          at: options.now,
        }),
        createdAt: options.now,
        attempts: 0,
      },
    }
  })
}
