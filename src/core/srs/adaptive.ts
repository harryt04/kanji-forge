import type { CardState, Grade } from './types'
import { DAY_MS } from './schedule'

/**
 * Calculates an adaptive interval from the same append-only state used by the
 * belt-rank scheduler. It deliberately keeps the visual level model intact:
 * only the due date changes, so switching modes never rewrites study history.
 *
 * The factors mirror the useful FSRS ideas (stability grows after successful
 * recall and difficulty grows after lapses) without requiring a second state
 * projection or a server schema. This makes the mode safe to enable on an
 * existing offline deck.
 */
export function adaptiveDueAt(
  state: CardState,
  grade: Grade,
  at: number,
): number {
  if (grade === 'again') return at + 10 * 60_000

  const previousDays =
    state.dueAt !== null && state.lastReviewedAt !== null
      ? Math.max(0.25, (state.dueAt - state.lastReviewedAt) / DAY_MS)
      : 0
  const accuracy = state.totalReviews
    ? state.totalCorrect / state.totalReviews
    : 0.75
  const difficulty = Math.min(
    1.35,
    Math.max(0.65, 1.15 - (accuracy - 0.75) + state.lapses * 0.08),
  )
  const stability = previousDays || (grade === 'easy' ? 4 : 1)
  const growth = grade === 'easy' ? 2.15 : 1.65
  const intervalDays = Math.min(
    3650,
    Math.max(1, stability * (growth / difficulty)),
  )
  return at + intervalDays * DAY_MS
}
