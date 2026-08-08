export const WRITING_VALIDATION_SETTING = 'writing.correct-strokes'

export function isWritingValidationEnabled(value: string | undefined): boolean {
  return value !== 'false'
}
