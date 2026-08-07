import type { CardLevel, CardState, Grade, SrsConfig } from './types'

export interface GradeInput {
  state: CardState
  grade: Grade
  config: SrsConfig
  redCount: number
  at: number
  deviceId: string
}

/** Applies only the state transition; scheduling is deliberately kept in schedule.ts. */
export function applyGrade({
  state,
  grade,
  config,
  redCount,
  at,
  deviceId,
}: GradeInput): CardState {
  let level: CardLevel = state.level
  let correctStreak = state.correctStreak
  let lapses = state.lapses
  if (grade === 'good') {
    level = Math.min(state.level + 1, 4) as CardLevel
    correctStreak += 1
  } else if (grade === 'easy') {
    level = 4
    correctStreak += 1
  } else {
    // StickyStudy forces the gentler one-level demotion for small red pools.
    level = (
      config.passIsMinusOne || redCount < 10
        ? Math.max(state.level - 1, 0)
        : config.relearnToLevel
    ) as CardLevel
    lapses += state.level >= 1 ? 1 : 0
    correctStreak = 0
  }
  return {
    ...state,
    level,
    lastReviewedAt: at,
    correctStreak,
    totalReviews: state.totalReviews + 1,
    totalCorrect: state.totalCorrect + (grade === 'again' ? 0 : 1),
    lapses,
    updatedAt: at,
    updatedBy: deviceId,
  }
}
