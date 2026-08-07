/** Pure SRS domain types. */
export type CardLevel = 0 | 1 | 2 | 3 | 4
export type Grade = 'again' | 'good' | 'easy'
export type ReviewSource = 'study' | 'manual' | 'import' | 'transfer'

export interface CardState {
  deckId: string
  stickyId: string
  level: CardLevel
  dueAt: number | null
  lastReviewedAt: number | null
  correctStreak: number
  totalReviews: number
  totalCorrect: number
  lapses: number
  flagged: boolean
  manualOverride: boolean
  updatedAt: number
  updatedBy: string
}

export interface Review {
  id: string
  deckId: string
  stickyId: string
  at: number
  grade: Grade
  levelBefore: CardLevel
  levelAfter: CardLevel
  intervalBefore: number
  elapsedDays: number
  responseMs: number
  source: ReviewSource
  deviceId: string
}

export interface SrsConfig {
  stageDays: readonly [number, number, number, number, number]
  newPerSession: number
  maxNewInCirculation: number
  passIsMinusOne: boolean
  fuzzPercent: number
  learningStepMinutes: readonly number[]
  relearnToLevel: 0 | 1
}

export const DEFAULT_SRS_CONFIG: SrsConfig = {
  stageDays: [0, 3, 9, 30, 90],
  newPerSession: 10,
  maxNewInCirculation: 30,
  passIsMinusOne: false,
  fuzzPercent: 10,
  learningStepMinutes: [1, 10],
  relearnToLevel: 0,
}

export const SRS_SPEC_VERSION = '1.0'

export function isCardLevel(value: number): value is CardLevel {
  return Number.isInteger(value) && value >= 0 && value <= 4
}

export function emptyCardState(
  deckId: string,
  stickyId: string,
  updatedBy = '',
): CardState {
  return {
    deckId,
    stickyId,
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
    updatedBy,
  }
}
