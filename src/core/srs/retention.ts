import { DEFAULT_SRS_CONFIG, type CardLevel, type Review } from './types'

export interface RetentionLevel {
  readonly level: CardLevel
  readonly reviews: number
  readonly retained: number
  readonly retentionPercent: number | null
}

/**
 * Summarizes answer retention by the level a review started at.
 * Manual corrections and imported/transferred history are not answers, so they
 * are intentionally excluded from this diagnostic. Reviews that happen before
 * 80% of their stage interval has elapsed are also excluded: they measure
 * immediate recall rather than whether the scheduled interval is working.
 */
export function retentionByLevel(
  reviews: readonly Pick<
    Review,
    'levelBefore' | 'grade' | 'source' | 'elapsedDays'
  >[],
  stageDays: readonly [
    number,
    number,
    number,
    number,
    number,
  ] = DEFAULT_SRS_CONFIG.stageDays,
): readonly RetentionLevel[] {
  const totals: Array<{ reviews: number; retained: number }> = Array.from(
    { length: 5 },
    () => ({ reviews: 0, retained: 0 }),
  )

  for (const review of reviews) {
    if (review.source !== 'study') continue
    if (review.elapsedDays < stageDays[review.levelBefore]! * 0.8) continue
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
