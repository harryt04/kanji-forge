import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANALYZER_DISPLAY_SETTINGS,
  parseAnalyzerDisplaySettings,
  readingToRomaji,
  serializeAnalyzerDisplaySettings,
} from './analyzer-settings'

describe('analyzer display settings', () => {
  it('round-trips supported display choices', () => {
    const settings = {
      furigana: 'non-n5' as const,
      romaji: true,
      gloss: 'tap' as const,
    }
    expect(
      parseAnalyzerDisplaySettings(serializeAnalyzerDisplaySettings(settings)),
    ).toEqual(settings)
  })

  it('falls back field-by-field for malformed values', () => {
    expect(
      parseAnalyzerDisplaySettings('{"furigana":"bad","romaji":true}'),
    ).toEqual({
      ...DEFAULT_ANALYZER_DISPLAY_SETTINGS,
      romaji: true,
    })
    expect(parseAnalyzerDisplaySettings('not-json')).toEqual(
      DEFAULT_ANALYZER_DISPLAY_SETTINGS,
    )
  })

  it('converts optional readings for the rōmaji display', () => {
    expect(readingToRomaji('おかね')).toBe('okane')
    expect(readingToRomaji(null)).toBeNull()
  })
})
