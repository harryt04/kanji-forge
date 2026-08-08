import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STUDY_ANSWER,
  DEFAULT_STUDY_QUESTION,
  parseStudyAnswer,
  parseStudyTwoTap,
  serializeStudyAnswer,
} from './study-style'

describe('study answer settings', () => {
  it('uses kanji with all answer fields as the study-style default', () => {
    expect(DEFAULT_STUDY_QUESTION).toBe('kanji')
    expect(DEFAULT_STUDY_ANSWER).toEqual(['kanji', 'reading', 'meaning'])
  })

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

  it('only enables two-tap study for the explicit persisted value', () => {
    expect(parseStudyTwoTap(undefined)).toBe(false)
    expect(parseStudyTwoTap('false')).toBe(false)
    expect(parseStudyTwoTap('true')).toBe(true)
  })
})
