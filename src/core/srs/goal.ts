import { DAY_MS } from './schedule'
import type { CardLevel, CardState } from './types'

export const GOAL_WARNING_THRESHOLD = 200

export interface GoalResult {
  remainingSteps: number
  daysLeft: number
  dailyBase: number
  accuracy: number
  lapseLoad: number
  dailyTarget: number
  warns: boolean
}

export function goalTarget(
  states: readonly CardState[],
  goalDate: number,
  now: number,
  correctReviews14d: number,
  totalReviews14d: number,
  averageLevelLossPerLapse: number,
): GoalResult {
  const remainingSteps = states.reduce((sum, state) => sum + 4 - state.level, 0)
  const daysLeft = Math.max(1, Math.ceil((goalDate - now) / DAY_MS))
  const dailyBase = Math.ceil(remainingSteps / daysLeft)
  const accuracy =
    totalReviews14d < 20 ? 0.85 : correctReviews14d / totalReviews14d
  const lapseLoad = (1 - accuracy) * averageLevelLossPerLapse
  const dailyTarget = Math.max(5, Math.ceil(dailyBase * (1 + lapseLoad)))
  return {
    remainingSteps,
    daysLeft,
    dailyBase,
    accuracy,
    lapseLoad,
    dailyTarget,
    warns: dailyTarget > GOAL_WARNING_THRESHOLD,
  }
}

/** Returns the earliest date that brings a warned goal back to 200 answers/day. */
export function suggestedGoalDate(
  goal: Pick<GoalResult, 'remainingSteps' | 'lapseLoad'>,
  now: number,
): number {
  const adjustedSteps = goal.remainingSteps * (1 + goal.lapseLoad)
  let days = Math.max(1, Math.ceil(adjustedSteps / GOAL_WARNING_THRESHOLD))
  while (
    Math.ceil(Math.ceil(goal.remainingSteps / days) * (1 + goal.lapseLoad)) >
    GOAL_WARNING_THRESHOLD
  ) {
    days += 1
  }
  return now + days * DAY_MS
}

export function projectedCompletion(
  now: number,
  states: readonly CardState[],
  correctReviews14d: number,
  activeDays14d: number,
): number | null {
  if (activeDays14d <= 0 || correctReviews14d <= 0) return null
  const remainingSteps = states.reduce((sum, state) => sum + 4 - state.level, 0)
  return now + (remainingSteps / (correctReviews14d / activeDays14d)) * DAY_MS
}

export function progress(
  cardCount: number,
  states: readonly CardState[],
): number {
  if (cardCount <= 0) return 0
  return states.reduce((sum, state) => sum + state.level, 0) / (4 * cardCount)
}

/** Maps the level-weighted deck progress ratio to its current belt-rank color. */
export function progressLevel(value: number): CardLevel {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(4, Math.floor(value * 4)) as CardLevel
}
