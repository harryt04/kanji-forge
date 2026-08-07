import { DAY_MS } from './schedule'
import type { CardState } from './types'

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
    warns: dailyTarget > 200,
  }
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
