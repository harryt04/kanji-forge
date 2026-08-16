export const STUDY_QUESTION_SETTING = 'study.question'
export const STUDY_ANSWER_SETTING = 'study.answer'
export const STUDY_TWO_TAP_SETTING = 'study.twoTap'
export const SRS_MODE_SETTING = 'study.srsMode'

export const SRS_MODE_OPTIONS = [
  {
    value: 'sticky',
    label: 'StickyStudy levels',
    description: 'Use the visible five-level belt-rank intervals.',
  },
  {
    value: 'adaptive',
    label: 'Adaptive intervals',
    description:
      'Keep the belt-rank levels, but let review history shape the next interval.',
  },
] as const

export type SrsMode = (typeof SRS_MODE_OPTIONS)[number]['value']

export const DEFAULT_SRS_MODE: SrsMode = 'sticky'

export function isSrsMode(value: string): value is SrsMode {
  return SRS_MODE_OPTIONS.some((option) => option.value === value)
}

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

export const DEFAULT_STUDY_QUESTION: StudyQuestion = 'kanji'

export function isStudyQuestion(value: string): value is StudyQuestion {
  return STUDY_QUESTION_OPTIONS.some((option) => option.value === value)
}

export const STUDY_ANSWER_OPTIONS = [
  {
    value: 'kanji',
    label: 'Kanji',
    description: 'Show the character after reveal.',
  },
  {
    value: 'reading',
    label: 'Reading',
    description: 'Show the Japanese readings after reveal.',
  },
  {
    value: 'meaning',
    label: 'Meaning',
    description: 'Show the English meanings after reveal.',
  },
  {
    value: 'writing',
    label: 'Writing pad',
    description: 'Practice stroke order for the kanji after reveal.',
  },
] as const

export type StudyAnswer = (typeof STUDY_ANSWER_OPTIONS)[number]['value']

export const DEFAULT_STUDY_ANSWER: readonly StudyAnswer[] = [
  'kanji',
  'reading',
  'meaning',
]

export function isStudyAnswer(value: string): value is StudyAnswer {
  return STUDY_ANSWER_OPTIONS.some((option) => option.value === value)
}

export function parseStudyAnswer(value: string | undefined): StudyAnswer[] {
  const selected: StudyAnswer[] = []
  for (const item of (value ?? '').split(',')) {
    if (isStudyAnswer(item) && !selected.includes(item)) selected.push(item)
  }

  return selected.length > 0 ? selected : [...DEFAULT_STUDY_ANSWER]
}

export function serializeStudyAnswer(values: readonly StudyAnswer[]): string {
  return STUDY_ANSWER_OPTIONS.filter(({ value }) => values.includes(value))
    .map(({ value }) => value)
    .join(',')
}

export function parseStudyTwoTap(value: string | undefined): boolean {
  return value === 'true'
}
