export const BELT_NAMES = [
  'white (Shiro)',
  'yellow (Ki)',
  'green (Midori)',
  'blue (Ao)',
  'black (Kuro)',
] as const

export function beltName(level: number): string {
  return BELT_NAMES[level] ?? BELT_NAMES[0]
}

export function beltLevelLabel(level: number): string {
  return `Level ${level}, ${beltName(level)}`
}
