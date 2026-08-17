import { describe, expect, it } from 'vitest'
import {
  browseBadgeLabel,
  countBrowseBadgeCards,
  isBrowseBadgePreference,
} from './browse-badge'

const NOW = Date.now()

describe('countBrowseBadgeCards', () => {
  const cards = [
    { state: undefined }, // never seen counts as due
    { state: { level: 1, dueAt: NOW - 1000 } }, // due
    { state: { level: 1, dueAt: NOW + 1000 } }, // not yet due
    { state: { level: 0, dueAt: null } }, // unstudied
  ]

  it('counts due cards, including unseen ones', () => {
    expect(countBrowseBadgeCards(cards, 'due', NOW)).toBe(2)
  })

  it('counts every card for total', () => {
    expect(countBrowseBadgeCards(cards, 'total', NOW)).toBe(4)
  })

  it('counts cards at level 0 for unstudied, including unseen ones', () => {
    expect(countBrowseBadgeCards(cards, 'unstudied', NOW)).toBe(2)
  })

  it('is zero when off', () => {
    expect(countBrowseBadgeCards(cards, 'off', NOW)).toBe(0)
  })

  it('is zero for an empty deck regardless of preference', () => {
    expect(countBrowseBadgeCards([], 'due', NOW)).toBe(0)
    expect(countBrowseBadgeCards([], 'total', NOW)).toBe(0)
    expect(countBrowseBadgeCards([], 'unstudied', NOW)).toBe(0)
  })
})

describe('browseBadgeLabel', () => {
  it('describes due cards', () => {
    expect(browseBadgeLabel(8, 'due', 'JLPT N5')).toBe('8 cards due in JLPT N5')
  })

  it('describes total cards', () => {
    expect(browseBadgeLabel(52, 'total', 'JLPT N5')).toBe('52 cards in JLPT N5')
  })

  it('describes unstudied cards', () => {
    expect(browseBadgeLabel(31, 'unstudied', 'JLPT N5')).toBe(
      '31 cards not started in JLPT N5',
    )
  })

  it('uses singular card for a count of one', () => {
    expect(browseBadgeLabel(1, 'due', 'JLPT N5')).toBe('1 card due in JLPT N5')
  })
})

describe('isBrowseBadgePreference', () => {
  it('accepts known preferences', () => {
    expect(isBrowseBadgePreference('due')).toBe(true)
    expect(isBrowseBadgePreference('total')).toBe(true)
    expect(isBrowseBadgePreference('unstudied')).toBe(true)
    expect(isBrowseBadgePreference('off')).toBe(true)
  })

  it('rejects unknown values', () => {
    expect(isBrowseBadgePreference('')).toBe(false)
    expect(isBrowseBadgePreference('due-soon')).toBe(false)
  })
})
