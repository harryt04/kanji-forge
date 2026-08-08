export const STUDY_QUESTION_SETTING = 'study.question'

export const STUDY_QUESTION_OPTIONS = [
  {
    value: 'kanji',
    label: 'Kanji',
    description: 'Show the character before reveal.',
  },
  {
    value: 'reading',
    label: 'Reading',
    description: 'Show a Japanese reading before reveal.',
  },
  {
    value: 'meaning',
    label: 'Meaning',
    description: 'Show the first English meaning before reveal.',
  },
] as const

export type StudyQuestion = (typeof STUDY_QUESTION_OPTIONS)[number]['value']

export function isStudyQuestion(value: string): value is StudyQuestion {
  return STUDY_QUESTION_OPTIONS.some((option) => option.value === value)
}
