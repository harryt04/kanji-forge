import { describe, expect, it } from 'vitest'
import { romajiToHiragana } from './romaji'

describe('romajiToHiragana', () => {
  it.each([
    ['konnichiha', 'こんにちは'],
    ['nihongo', 'にほんご'],
    ['shinjuku', 'しんじゅく'],
    ['gakkou', 'がっこう'],
    ['ryokou', 'りょこう'],
  ])('converts %s', (input, expected) => {
    expect(romajiToHiragana(input)).toBe(expected)
  })

  it('supports alternate Hepburn spellings and uppercase input', () => {
    expect(romajiToHiragana('SHiNKaNSeN')).toBe('しんかんせん')
    expect(romajiToHiragana('tudya')).toBe('つぢゃ')
    expect(romajiToHiragana("n'ya")).toBe('んや')
  })

  it('handles standalone and doubled n without swallowing the next syllable', () => {
    expect(romajiToHiragana('n')).toBe('ん')
    expect(romajiToHiragana('nn')).toBe('ん')
    expect(romajiToHiragana('nna')).toBe('んな')
    expect(romajiToHiragana('kanpai')).toBe('かんぱい')
  })

  it('preserves kana, punctuation, spaces, and unknown letters', () => {
    expect(romajiToHiragana('日本 go!')).toBe('日本 ご!')
    expect(romajiToHiragana('x')).toBe('x')
  })
})
