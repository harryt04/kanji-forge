import type { CardState } from '@/data/repo'
import {
  DEFAULT_BROWSE_FILTERS,
  filterBrowseCards,
  type BrowseFilters,
} from './browse-filter'

import { describe, expect, it } from 'vitest'

interface TestCard {
  readonly id: string
  readonly state: Pick<CardState, 'level' | 'flagged'> | undefined
  readonly strokeCount: number
  readonly jlptLegacy: number | null
}

const cards: readonly TestCard[] = [
  {
    id: 'new-flagged-n5',
    state: { level: 0, flagged: true },
    strokeCount: 4,
    jlptLegacy: 5,
  },
  {
    id: 'learning-n3',
    state: { level: 2, flagged: false },
    strokeCount: 12,
    jlptLegacy: 3,
  },
  {
    id: 'untouched-no-jlpt',
    state: undefined,
    strokeCount: 20,
    jlptLegacy: null,
  },
]

function ids(filters: Partial<BrowseFilters>): readonly string[] {
  return filterBrowseCards(cards, {
    ...DEFAULT_BROWSE_FILTERS,
    ...filters,
  }).map((card) => card.id)
}

describe('filterBrowseCards', () => {
  it('treats untouched cards as level zero and keeps all cards by default', () => {
    expect(ids({})).toEqual([
      'new-flagged-n5',
      'learning-n3',
      'untouched-no-jlpt',
    ])
    expect(ids({ level: 0 })).toEqual(['new-flagged-n5', 'untouched-no-jlpt'])
  })

  it('filters flagged cards and combines the level and flag filters', () => {
    expect(ids({ flagged: true })).toEqual(['new-flagged-n5'])
    expect(ids({ level: 0, flagged: true })).toEqual(['new-flagged-n5'])
  })

  it('filters an inclusive stroke-count range', () => {
    expect(ids({ minStrokeCount: 4, maxStrokeCount: 12 })).toEqual([
      'new-flagged-n5',
      'learning-n3',
    ])
    expect(ids({ minStrokeCount: 13 })).toEqual(['untouched-no-jlpt'])
  })

  it('filters by the pack JLPT legacy value', () => {
    expect(ids({ jlptLegacy: 3 })).toEqual(['learning-n3'])
    expect(ids({ jlptLegacy: 1 })).toEqual([])
  })
})
