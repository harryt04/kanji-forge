import { describe, expect, it } from 'vitest'
import {
  MutationValidationError,
  parseMutationBatch,
  validateMutation,
} from './mutations.js'

const review = {
  id: 'review-1',
  deckId: 'starter',
  contentRef: 'kanji:日',
  at: 1_725_000_000_000,
  grade: 'good',
  levelBefore: 1,
  levelAfter: 2,
  intervalBefore: 3,
  elapsedDays: 3,
  responseMs: 800,
  source: 'study',
  deviceId: 'device-1',
}

describe('mutation validation', () => {
  it('accepts the complete review payload and preserves only sync fields', () => {
    expect(
      validateMutation({
        id: 'review-1',
        mutType: 'review.append',
        payload: { ...review, userId: 'attacker-controlled-value' },
      }),
    ).toEqual({
      id: 'review-1',
      mutType: 'review.append',
      payload: review,
    })
  })

  it('accepts every supported metadata mutation type in one batch', () => {
    expect(
      parseMutationBatch({
        mutations: [
          {
            id: 'deck-1',
            mutType: 'deck.upsert',
            payload: {
              id: 'saved',
              name: 'Saved',
              kind: 'saved',
              definitionId: null,
              updatedAt: 1,
            },
          },
          {
            id: 'setting-1',
            mutType: 'settings.upsert',
            payload: { key: 'theme', value: 'dark', updatedAt: 1 },
          },
          {
            id: 'membership-1',
            mutType: 'deckMembership.upsert',
            payload: {
              deckId: 'saved',
              contentRef: 'kanji:日',
              sortOrder: 0,
              addedAt: 1,
              updatedAt: 1,
            },
          },
        ],
      }),
    ).toHaveLength(3)
  })

  it('rejects a review whose mutation id does not match the review id', () => {
    expect(() =>
      validateMutation({
        id: 'mutation-1',
        mutType: 'review.append',
        payload: review,
      }),
    ).toThrowError(
      new MutationValidationError('Review mutation id must equal review id.'),
    )
  })

  it('rejects unknown mutation types and oversized batches', () => {
    expect(() =>
      validateMutation({ id: 'x', mutType: 'cardState.upsert', payload: {} }),
    ).toThrowError(/Mutation type is not supported/)
    expect(() =>
      parseMutationBatch({
        mutations: Array.from({ length: 101 }, () => review),
      }),
    ).toThrowError(/at most 100/)
  })
})
