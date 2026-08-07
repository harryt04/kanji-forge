import type { CardState } from '@/data/repo'

export type BrowseSort =
  | 'deck-order'
  | 'level'
  | 'stroke-count'
  | 'frequency'
  | 'jlpt'
  | 'grade'
  | 'times-reviewed'
  | 'last-reviewed'
  | 'kana'

export interface SortableBrowseCard {
  readonly contentRef: string
  readonly deckIndex: number
  readonly state: CardState | undefined
  readonly literal: string
  readonly strokeCount: number
  readonly frequency: number | null
  readonly jlptLegacy: number | null
  readonly grade: number | null
  readonly kana: string
}

function compareNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  if (left === right) return 0
  if (left === null || left === undefined) return 1
  if (right === null || right === undefined) return -1
  return left - right
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, 'ja', { sensitivity: 'base' })
}

function compareDescending(
  left: number | null | undefined,
  right: number | null | undefined,
): number {
  if (left === right) return 0
  if (left === null || left === undefined) return 1
  if (right === null || right === undefined) return -1
  return right - left
}

function compareCards(
  left: SortableBrowseCard,
  right: SortableBrowseCard,
  sort: BrowseSort,
): number {
  switch (sort) {
    case 'level':
      return compareNumbers(left.state?.level ?? 0, right.state?.level ?? 0)
    case 'stroke-count':
      return compareNumbers(left.strokeCount, right.strokeCount)
    case 'frequency':
      return compareNumbers(left.frequency, right.frequency)
    case 'jlpt':
      // KANJIDIC2's legacy values are N5=5 through N1=1; N5 is the
      // natural learning order, so sort this one descending.
      return compareDescending(left.jlptLegacy, right.jlptLegacy)
    case 'grade':
      return compareNumbers(left.grade, right.grade)
    case 'times-reviewed':
      return compareNumbers(
        left.state?.totalReviews ?? 0,
        right.state?.totalReviews ?? 0,
      )
    case 'last-reviewed':
      return compareNumbers(
        left.state?.lastReviewedAt,
        right.state?.lastReviewedAt,
      )
    case 'kana':
      return compareStrings(left.kana, right.kana)
    case 'deck-order':
      return 0
  }
}

/** Sorts without mutating the deck projection; ties always retain deck order. */
export function sortBrowseCards<T extends SortableBrowseCard>(
  cards: readonly T[],
  sort: BrowseSort,
): readonly T[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      const comparison = compareCards(left.card, right.card, sort)
      if (comparison !== 0) return comparison
      return (
        left.card.deckIndex - right.card.deckIndex || left.index - right.index
      )
    })
    .map(({ card }) => card)
}
