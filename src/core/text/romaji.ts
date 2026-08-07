/**
 * Normalizes romaji dictionary queries to hiragana.
 *
 * This is deliberately a pure function so dictionary search can use the same
 * normalization in the browser, a worker, or a future native client. It does
 * not attempt to romanize Japanese text; it only converts common Hepburn
 * input into the kana form stored by the content packs.
 */

const ROMAJI_TO_HIRAGANA: ReadonlyMap<string, string> = new Map([
  ['a', 'あ'],
  ['i', 'い'],
  ['u', 'う'],
  ['e', 'え'],
  ['o', 'お'],
  ['ka', 'か'],
  ['ki', 'き'],
  ['ku', 'く'],
  ['ke', 'け'],
  ['ko', 'こ'],
  ['ga', 'が'],
  ['gi', 'ぎ'],
  ['gu', 'ぐ'],
  ['ge', 'げ'],
  ['go', 'ご'],
  ['sa', 'さ'],
  ['shi', 'し'],
  ['si', 'し'],
  ['su', 'す'],
  ['se', 'せ'],
  ['so', 'そ'],
  ['za', 'ざ'],
  ['ji', 'じ'],
  ['zi', 'じ'],
  ['zu', 'ず'],
  ['ze', 'ぜ'],
  ['zo', 'ぞ'],
  ['ta', 'た'],
  ['chi', 'ち'],
  ['ti', 'ち'],
  ['tsu', 'つ'],
  ['tu', 'つ'],
  ['te', 'て'],
  ['to', 'と'],
  ['da', 'だ'],
  ['di', 'ぢ'],
  ['du', 'づ'],
  ['de', 'で'],
  ['do', 'ど'],
  ['dya', 'ぢゃ'],
  ['dyu', 'ぢゅ'],
  ['dyo', 'ぢょ'],
  ['na', 'な'],
  ['ni', 'に'],
  ['nu', 'ぬ'],
  ['ne', 'ね'],
  ['no', 'の'],
  ['ha', 'は'],
  ['hi', 'ひ'],
  ['fu', 'ふ'],
  ['hu', 'ふ'],
  ['he', 'へ'],
  ['ho', 'ほ'],
  ['ba', 'ば'],
  ['bi', 'び'],
  ['bu', 'ぶ'],
  ['be', 'べ'],
  ['bo', 'ぼ'],
  ['pa', 'ぱ'],
  ['pi', 'ぴ'],
  ['pu', 'ぷ'],
  ['pe', 'ぺ'],
  ['po', 'ぽ'],
  ['ma', 'ま'],
  ['mi', 'み'],
  ['mu', 'む'],
  ['me', 'め'],
  ['mo', 'も'],
  ['ya', 'や'],
  ['yu', 'ゆ'],
  ['yo', 'よ'],
  ['ra', 'ら'],
  ['ri', 'り'],
  ['ru', 'る'],
  ['re', 'れ'],
  ['ro', 'ろ'],
  ['wa', 'わ'],
  ['wi', 'ゐ'],
  ['we', 'ゑ'],
  ['wo', 'を'],
  ['n', 'ん'],
  ['kya', 'きゃ'],
  ['kyu', 'きゅ'],
  ['kyo', 'きょ'],
  ['gya', 'ぎゃ'],
  ['gyu', 'ぎゅ'],
  ['gyo', 'ぎょ'],
  ['sha', 'しゃ'],
  ['shu', 'しゅ'],
  ['sho', 'しょ'],
  ['sya', 'しゃ'],
  ['syu', 'しゅ'],
  ['syo', 'しょ'],
  ['ja', 'じゃ'],
  ['ju', 'じゅ'],
  ['jo', 'じょ'],
  ['jya', 'じゃ'],
  ['jyu', 'じゅ'],
  ['jyo', 'じょ'],
  ['cha', 'ちゃ'],
  ['chu', 'ちゅ'],
  ['cho', 'ちょ'],
  ['cya', 'ちゃ'],
  ['cyu', 'ちゅ'],
  ['cyo', 'ちょ'],
  ['nya', 'にゃ'],
  ['nyu', 'にゅ'],
  ['nyo', 'にょ'],
  ['hya', 'ひゃ'],
  ['hyu', 'ひゅ'],
  ['hyo', 'ひょ'],
  ['bya', 'びゃ'],
  ['byu', 'びゅ'],
  ['byo', 'びょ'],
  ['pya', 'ぴゃ'],
  ['pyu', 'ぴゅ'],
  ['pyo', 'ぴょ'],
  ['mya', 'みゃ'],
  ['myu', 'みゅ'],
  ['myo', 'みょ'],
  ['rya', 'りゃ'],
  ['ryu', 'りゅ'],
  ['ryo', 'りょ'],
  ['kwa', 'くぁ'],
  ['kwi', 'くぃ'],
  ['kwe', 'くぇ'],
  ['kwo', 'くぉ'],
  ['gwa', 'ぐぁ'],
  ['gwi', 'ぐぃ'],
  ['gwe', 'ぐぇ'],
  ['gwo', 'ぐぉ'],
  ['she', 'しぇ'],
  ['je', 'じぇ'],
  ['che', 'ちぇ'],
  ['tsa', 'つぁ'],
  ['tsi', 'つぃ'],
  ['tse', 'つぇ'],
  ['tso', 'つぉ'],
  ['fa', 'ふぁ'],
  ['fi', 'ふぃ'],
  ['fe', 'ふぇ'],
  ['fo', 'ふぉ'],
  ['va', 'ゔぁ'],
  ['vi', 'ゔぃ'],
  ['ve', 'ゔぇ'],
  ['vo', 'ゔぉ'],
  ['xya', 'ゃ'],
  ['xyu', 'ゅ'],
  ['xyo', 'ょ'],
  ['xa', 'ぁ'],
  ['xi', 'ぃ'],
  ['xu', 'ぅ'],
  ['xe', 'ぇ'],
  ['xo', 'ぉ'],
  ['xtsu', 'っ'],
  ['xtu', 'っ'],
])

const ROMAJI_KEYS = [...ROMAJI_TO_HIRAGANA.keys()].sort(
  (left, right) => right.length - left.length,
)

function isAsciiLetter(value: string | undefined): boolean {
  return value !== undefined && /^[a-z]$/u.test(value)
}

function isVowel(value: string | undefined): boolean {
  return value !== undefined && 'aeiou'.includes(value)
}

function isKana(value: string): boolean {
  return /[\u3040-\u30ff]/u.test(value)
}

function matchRomaji(input: string, position: number): string | undefined {
  for (const key of ROMAJI_KEYS) {
    if (input.startsWith(key, position)) return key
  }
  return undefined
}

/** Converts common lowercase or uppercase romaji input to hiragana. */
export function romajiToHiragana(value: string): string {
  const input = value.toLocaleLowerCase('en-US')
  let result = ''
  let position = 0

  while (position < input.length) {
    const current = input[position]
    const next = input[position + 1]
    const afterNext = input[position + 2]
    if (current === undefined) break

    if (current === "'" && next !== undefined) {
      result += current
      position += 1
      continue
    }

    if (!isAsciiLetter(current) || isKana(current)) {
      result += current
      position += 1
      continue
    }

    if (current === 'n') {
      if (next === "'") {
        result += 'ん'
        position += 2
        continue
      }
      if (next === 'n') {
        result += 'ん'
        position +=
          afterNext === undefined || (!isVowel(afterNext) && afterNext !== 'y')
            ? 2
            : 1
        continue
      }
      if (next === undefined || (!isVowel(next) && next !== 'y')) {
        result += 'ん'
        position += 1
        continue
      }
    }

    if (
      next === current &&
      current !== 'a' &&
      current !== 'i' &&
      current !== 'u' &&
      current !== 'e' &&
      current !== 'o' &&
      matchRomaji(input, position + 1) !== undefined
    ) {
      result += 'っ'
      position += 1
      continue
    }

    const key = matchRomaji(input, position)
    if (key) {
      result += ROMAJI_TO_HIRAGANA.get(key)
      position += key.length
      continue
    }

    // Keep unknown ASCII input visible instead of silently dropping part of a
    // search query (for example, an English gloss or an unfinished keystroke).
    result += current
    position += 1
  }

  return result
}
