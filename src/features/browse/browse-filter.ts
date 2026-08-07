import type { CardState } from '@/data/repo'

export interface BrowseFilters {
  readonly level: CardState['level'] | null
  readonly flagged: boolean
  readonly minStrokeCount: number | null
  readonly maxStrokeCount: number | null
  readonly jlptLegacy: number | null
}

export const DEFAULT_BROWSE_FILTERS: BrowseFilters = {
  level: null,
  flagged: false,
  minStrokeCount: null,
  maxStrokeCount: null,
  jlptLegacy: null,
}

export interface FilterableBrowseCard {
  readonly state: Pick<CardState, 'level' | 'flagged'> | undefined
  readonly strokeCount: number
  readonly jlptLegacy: number | null
}

/** Applies the shipped Browse filter set without mutating the deck projection. */
export function filterBrowseCards<T extends FilterableBrowseCard>(
  cards: readonly T[],
  filters: BrowseFilters,
): readonly T[] {
  return cards.filter((card) => {
    const level = card.state?.level ?? 0
    const flagged = card.state?.flagged ?? false

    if (filters.level !== null && level !== filters.level) return false
    if (filters.flagged && !flagged) return false
    if (
      filters.minStrokeCount !== null &&
      card.strokeCount < filters.minStrokeCount
    )
      return false
    if (
      filters.maxStrokeCount !== null &&
      card.strokeCount > filters.maxStrokeCount
    )
      return false
    if (filters.jlptLegacy !== null && card.jlptLegacy !== filters.jlptLegacy)
      return false

    return true
  })
}
