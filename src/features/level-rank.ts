import type { CardLevel } from '@/data/repo'

export const BELT_NAMES = [
  'white (Shiro)',
  'yellow (Ki)',
  'green (Midori)',
  'blue (Ao)',
  'black (Kuro)',
] as const

export const LEVEL_NAMES = [
  'New',
  'Seen',
  'Learning',
  'Known',
  'Mastered',
] as const

/** Maps persisted or imported level values outside the belt ramp to New. */
export function normalizeLevel(level: number): CardLevel {
  if (!Number.isInteger(level) || level < 0 || level > 4) return 0
  return level as CardLevel
}

export function beltName(level: number): string {
  return BELT_NAMES[level] ?? BELT_NAMES[0]
}

export function beltLevelLabel(level: number): string {
  return `Level ${level}, ${beltName(level)}`
}
