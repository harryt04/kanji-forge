import { describe, expect, it } from 'vitest'
import { combineDeckContent } from './deck-combine'

describe('combineDeckContent', () => {
  it('preserves source order and removes duplicate cards', () => {
    expect(
      combineDeckContent([
        { deckId: 'a', contentRefs: ['kanji:日', 'kanji:一'] },
        { deckId: 'b', contentRefs: ['kanji:一', 'kanji:国'] },
      ]),
    ).toEqual(['kanji:日', 'kanji:一', 'kanji:国'])
  })

  it('limits the combined result after de-duplication', () => {
    expect(
      combineDeckContent(
        [
          { deckId: 'a', contentRefs: ['kanji:日', 'kanji:一'] },
          { deckId: 'b', contentRefs: ['kanji:一', 'kanji:国'] },
        ],
        2,
      ),
    ).toEqual(['kanji:日', 'kanji:一'])
  })

  it('rejects a non-positive or fractional limit', () => {
    expect(() => combineDeckContent([], 0)).toThrow(
      'The first-card limit must be a positive whole number.',
    )
    expect(() => combineDeckContent([], 1.5)).toThrow(
      'The first-card limit must be a positive whole number.',
    )
  })
})
