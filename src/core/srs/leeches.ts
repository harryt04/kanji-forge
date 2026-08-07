import type { CardLevel, CardState } from './types'

export const LEECH_LAPSE_THRESHOLD = 6

export interface Leech {
  readonly stickyId: string
  readonly level: CardLevel
  readonly lapses: number
  readonly dueAt: number | null
  readonly lastReviewedAt: number | null
}

/** Identifies cards whose repeated lapses warrant deliberate manual attention. */
export function identifyLeeches(
  states: readonly CardState[],
): readonly Leech[] {
  return states
    .filter((state) => state.lapses >= LEECH_LAPSE_THRESHOLD)
    .map(({ stickyId, level, lapses, dueAt, lastReviewedAt }) => ({
      stickyId,
      level,
      lapses,
      dueAt,
      lastReviewedAt,
    }))
    .sort(
      (left, right) =>
        right.lapses - left.lapses ||
        right.level - left.level ||
        left.stickyId.localeCompare(right.stickyId),
    )
}
