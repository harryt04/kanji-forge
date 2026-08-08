import { describe, expect, it } from 'vitest'
import { adaptiveDueAt } from './adaptive'
import { buildQueue } from './queue'
import { emptyCardState, type CardState } from './types'

const NOW = Date.UTC(2026, 0, 1)

function state(overrides: Partial<CardState> = {}): CardState {
  return {
    ...emptyCardState('deck', 'kanji:日'),
    ...overrides,
  }
}

describe('adaptive scheduler', () => {
  it('gives a failed answer a short relearning interval', () => {
    expect(adaptiveDueAt(state(), 'again', NOW)).toBe(NOW + 10 * 60_000)
  })

  it('uses the default recall estimate for a first successful answer', () => {
    expect(adaptiveDueAt(state(), 'good', NOW)).toBeGreaterThan(NOW)
    expect(adaptiveDueAt(state(), 'easy', NOW)).toBeGreaterThan(NOW)
  })

  it('grows successful intervals more slowly for difficult cards', () => {
    const easy = state({
      dueAt: NOW + 10 * 86_400_000,
      lastReviewedAt: NOW,
      totalReviews: 10,
      totalCorrect: 10,
    })
    const difficult = state({
      dueAt: NOW + 10 * 86_400_000,
      lastReviewedAt: NOW,
      totalReviews: 10,
      totalCorrect: 5,
      lapses: 2,
    })
    expect(adaptiveDueAt(easy, 'good', NOW)).toBeGreaterThan(
      adaptiveDueAt(difficult, 'good', NOW),
    )
  })

  it('allows touched level-zero cards to return when adaptive mode is enabled', () => {
    const card = {
      deckId: 'deck',
      stickyId: 'kanji:日',
      state: state({ level: 0, totalReviews: 1, dueAt: NOW - 1 }),
      order: 0,
    }
    expect(
      buildQueue([card], {
        now: NOW,
        config: {
          stageDays: [0, 3, 9, 30, 90],
          newPerSession: 0,
          maxNewInCirculation: 0,
          passIsMinusOne: false,
          fuzzPercent: 0,
          learningStepMinutes: [1, 10],
          relearnToLevel: 0,
        },
        dayOfYear: 1,
        schedulerMode: 'adaptive',
      }),
    ).toHaveLength(1)

    expect(
      buildQueue(
        [
          { ...card, state: undefined, stickyId: 'kanji:本' },
          {
            ...card,
            stickyId: 'kanji:語',
            state: state({ level: 0, dueAt: NOW - 1 }),
          },
        ],
        {
          now: NOW,
          config: {
            stageDays: [0, 3, 9, 30, 90],
            newPerSession: 0,
            maxNewInCirculation: 0,
            passIsMinusOne: false,
            fuzzPercent: 0,
            learningStepMinutes: [1, 10],
            relearnToLevel: 0,
          },
          dayOfYear: 1,
          schedulerMode: 'adaptive',
        },
      ),
    ).toHaveLength(0)
  })
})
