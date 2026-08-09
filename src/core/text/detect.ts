import { romajiToHiragana } from './romaji'

export type InputType =
  'empty' | 'kanji' | 'kana' | 'romaji' | 'english' | 'mixed' | 'other'

export const INPUT_TYPE_LABELS: Readonly<Record<InputType, string>> = {
  empty: 'No input',
  kanji: 'Kanji',
  kana: 'Kana',
  romaji: 'Romaji',
  english: 'English',
  mixed: 'Mixed script',
  other: 'Other text',
}

function isKanji(character: string): boolean {
  const codePoint = character.codePointAt(0)
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2ffff))
  )
}

function isKana(character: string): boolean {
  return /[\u3040-\u30ff\uff66-\uff9f]/u.test(character)
}

/** Detects the dominant input form without changing or discarding the query. */
export function detectInputType(input: string): InputType {
  const value = input.trim()
  if (!value) return 'empty'

  const characters = [...value]
  const hasKanji = characters.some(isKanji)
  const hasKana = characters.some(isKana)
  const latin = value.match(/[A-Za-z]+/gu)?.join('') ?? ''
  const hasLatin = latin.length > 0

  if (hasLatin && (hasKanji || hasKana)) return 'mixed'
  if (hasKanji && hasKana) return 'mixed'
  if (hasKanji) return 'kanji'
  if (hasKana) return 'kana'

  if (hasLatin) {
    // A romaji query converts completely to kana. English words leave their
    // non-romaji letters intact, so they remain distinguishable from search
    // input such as "okane" or "nihongo".
    return /^[^A-Za-z]*$/u.test(romajiToHiragana(value)) ? 'romaji' : 'english'
  }

  return 'other'
}
