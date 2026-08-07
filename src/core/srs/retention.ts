import type { CardLevel, Review } from './types'

export interface RetentionLevel {
  readonly level: CardLevel
  readonly reviews: number
  readonly retained: number
  readonly retentionPercent: number | null
}

/**
 * Summarizes answer retention by the level a review started at.
 * Manual corrections and imported/transferred history are not answers, so they
 * are intentionally excluded from this diagnostic.
 */
export function retentionByLevel(
  reviews: readonly Pick<Review, 'levelBefore' | 'grade' | 'source'>[],
): readonly RetentionLevel[] {
  const totals: Array<{ reviews: number; retained: number }> = Array.from(
    { length: 5 },
    () => ({ reviews: 0, retained: 0 }),
  )

  for (const review of reviews) {
    if (review.source !== 'study') continue
    const total = totals[review.levelBefore]!
    total.reviews += 1
    if (review.grade !== 'again') total.retained += 1
  }

  return totals.map((total, level) => ({
    level: level as CardLevel,
    reviews: total.reviews,
    retained: total.retained,
    retentionPercent:
      total.reviews === 0
        ? null
        : Math.round((total.retained / total.reviews) * 100),
  }))
}
