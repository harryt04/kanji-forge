import { describe, expect, it } from 'vitest'
import { detectInputType } from './detect'

describe('detectInputType', () => {
  it.each([
    ['', 'empty'],
    ['日本', 'kanji'],
    ['おかね', 'kana'],
    ['okane', 'romaji'],
    ['money', 'english'],
    ['日本 money', 'mixed'],
    ['日本ご', 'mixed'],
    ['123', 'other'],
  ])('classifies %s as %s', (input, expected) => {
    expect(detectInputType(input)).toBe(expected)
  })

  it('ignores surrounding whitespace', () => {
    expect(detectInputType('  nihongo  ')).toBe('romaji')
  })
})
