import { hiraganaToRomaji } from '@/core/text/romaji'

export const ANALYZER_DISPLAY_SETTING = 'analyzer-display'

export const FURIGANA_MODES = ['all', 'non-n5', 'off'] as const
export type FuriganaMode = (typeof FURIGANA_MODES)[number]

export const GLOSS_MODES = ['inline', 'tap'] as const
export type GlossMode = (typeof GLOSS_MODES)[number]

export interface AnalyzerDisplaySettings {
  readonly furigana: FuriganaMode
  readonly romaji: boolean
  readonly gloss: GlossMode
}

export const DEFAULT_ANALYZER_DISPLAY_SETTINGS: AnalyzerDisplaySettings = {
  furigana: 'all',
  romaji: false,
  gloss: 'inline',
}

function isFuriganaMode(value: unknown): value is FuriganaMode {
  return (
    typeof value === 'string' && FURIGANA_MODES.includes(value as FuriganaMode)
  )
}

function isGlossMode(value: unknown): value is GlossMode {
  return typeof value === 'string' && GLOSS_MODES.includes(value as GlossMode)
}

/** Parses the compact JSON setting while treating malformed values as defaults. */
export function parseAnalyzerDisplaySettings(
  value: string | undefined,
): AnalyzerDisplaySettings {
  if (!value) return DEFAULT_ANALYZER_DISPLAY_SETTINGS
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object')
      return DEFAULT_ANALYZER_DISPLAY_SETTINGS
    const candidate = parsed as Record<string, unknown>
    return {
      furigana: isFuriganaMode(candidate.furigana)
        ? candidate.furigana
        : DEFAULT_ANALYZER_DISPLAY_SETTINGS.furigana,
      romaji:
        typeof candidate.romaji === 'boolean'
          ? candidate.romaji
          : DEFAULT_ANALYZER_DISPLAY_SETTINGS.romaji,
      gloss: isGlossMode(candidate.gloss)
        ? candidate.gloss
        : DEFAULT_ANALYZER_DISPLAY_SETTINGS.gloss,
    }
  } catch {
    return DEFAULT_ANALYZER_DISPLAY_SETTINGS
  }
}

export function serializeAnalyzerDisplaySettings(
  settings: AnalyzerDisplaySettings,
): string {
  return JSON.stringify(settings)
}

/** Converts a dictionary reading to the compact Hepburn form shown by the analyzer. */
export function readingToRomaji(reading: string | null): string | null {
  return reading ? hiraganaToRomaji(reading) : null
}
