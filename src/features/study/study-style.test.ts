import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDY_ANSWER,
  parseStudyAnswer,
  serializeStudyAnswer,
} from './study-style'

describe('study answer settings', () => {
  it('defaults to all available answer fields', () => {
    expect(parseStudyAnswer(undefined)).toEqual([...DEFAULT_STUDY_ANSWER])
  })

  it('ignores unknown and duplicate fields while preserving stored order', () => {
    expect(parseStudyAnswer('meaning,unknown,reading,meaning')).toEqual([
      'meaning',
      'reading',
    ])
  })

  it('serializes fields in the stable option order', () => {
    expect(serializeStudyAnswer(['meaning', 'kanji'])).toBe('kanji,meaning')
  })
})
