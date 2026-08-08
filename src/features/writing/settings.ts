import type { StrokeLeniency } from '@/core/stroke/match'

export const WRITING_VALIDATION_SETTING = 'writing.correct-strokes'
export const WRITING_LENIENCY_SETTING = 'writing.leniency'

export const WRITING_LENIENCY_OPTIONS: ReadonlyArray<{
  readonly value: StrokeLeniency
  readonly label: string
  readonly description: string
}> = [
  {
    value: 'strict',
    label: 'Strict',
    description: 'Requires a close match to the guide.',
  },
  {
    value: 'normal',
    label: 'Normal',
    description: 'Balanced tolerance for everyday practice.',
  },
  {
    value: 'forgiving',
    label: 'Forgiving',
    description: 'Allows more variation in position and shape.',
  },
]

export const DEFAULT_WRITING_LENIENCY: StrokeLeniency = 'normal'

export function isWritingLeniency(
  value: string | undefined,
): value is StrokeLeniency {
  return WRITING_LENIENCY_OPTIONS.some((option) => option.value === value)
}

export function parseWritingLeniency(
  value: string | undefined,
): StrokeLeniency {
  return isWritingLeniency(value) ? value : DEFAULT_WRITING_LENIENCY
}

export function isWritingValidationEnabled(value: string | undefined): boolean {
  return value !== 'false'
}
