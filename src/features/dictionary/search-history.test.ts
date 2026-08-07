import { describe, expect, it } from 'vitest'
import {
  isPinnedSearch,
  parsePinnedSearches,
  parseSearchHistory,
  recordSearch,
  serializeSearchHistory,
  togglePinnedSearch,
} from './search-history'

describe('dictionary search history', () => {
  it('normalizes, deduplicates, and limits persisted history', () => {
    const queries = Array.from({ length: 12 }, (_, index) => ` q${index} `)
    expect(
      parseSearchHistory(JSON.stringify([' 日本 ', '日本', ...queries])),
    ).toEqual(['日本', 'q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'])
    expect(parseSearchHistory('not json')).toEqual([])
    expect(serializeSearchHistory([' 日本 ', '日本'])).toBe('["日本"]')
  })

  it('moves a repeated query to the front and ignores blank searches', () => {
    expect(recordSearch(['日本', 'okane'], ' 日本 ')).toEqual(['日本', 'okane'])
    expect(recordSearch(['日本'], '   ')).toEqual(['日本'])
  })

  it('toggles pinned queries case-insensitively', () => {
    const pinned = togglePinnedSearch([], 'Nihongo')
    expect(pinned).toEqual(['Nihongo'])
    expect(isPinnedSearch(pinned, 'nihongo')).toBe(true)
    expect(togglePinnedSearch(pinned, ' nihongo ')).toEqual([])
    expect(parsePinnedSearches(undefined)).toEqual([])
  })
})
