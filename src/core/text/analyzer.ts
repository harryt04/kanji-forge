import { inflectedSurfaces } from './inflect'

export interface AnalyzerWord {
  readonly id: number
  readonly commonScore: number
  readonly forms: readonly string[]
  readonly readings: readonly string[]
  readonly meanings: readonly string[]
}

export interface AnalyzerKanji {
  readonly literal: string
  readonly jlptLegacy: number | null
  readonly onReadings: readonly string[]
  readonly kunReadings: readonly string[]
  readonly meanings: readonly string[]
}

export interface TextAnalysisToken {
  readonly text: string
  readonly reading: string | null
  readonly meanings: readonly string[]
  readonly type: 'word' | 'grammar' | 'kanji' | 'unknown'
  readonly contentRef?: string
  readonly hasNonN5Kanji?: boolean
}

interface WordCandidate {
  readonly kind: 'word'
  readonly text: string
  readonly word: AnalyzerWord
  readonly reading?: string
}

interface GrammarCandidate {
  readonly kind: 'grammar'
  readonly text: string
  readonly reading: string
  readonly meanings: readonly string[]
}

type SurfaceCandidate = WordCandidate | GrammarCandidate

/**
 * A deliberately small grammar lexicon keeps common function words readable
 * without pretending to be a full morphological tokenizer. Dictionary words
 * still win whenever they cover the same surface.
 */
const GRAMMAR_CANDIDATES: readonly GrammarCandidate[] = [
  {
    kind: 'grammar',
    text: 'ではない',
    reading: 'ではない',
    meanings: ['is not'],
  },
  {
    kind: 'grammar',
    text: 'じゃない',
    reading: 'じゃない',
    meanings: ['is not'],
  },
  {
    kind: 'grammar',
    text: 'でしょう',
    reading: 'でしょう',
    meanings: ['probably; it seems'],
  },
  {
    kind: 'grammar',
    text: 'だろう',
    reading: 'だろう',
    meanings: ['probably; I suppose'],
  },
  {
    kind: 'grammar',
    text: 'だった',
    reading: 'だった',
    meanings: ['was; were'],
  },
  {
    kind: 'grammar',
    text: 'ながら',
    reading: 'ながら',
    meanings: ['while; although'],
  },
  {
    kind: 'grammar',
    text: 'ばかり',
    reading: 'ばかり',
    meanings: ['just; only'],
  },
  { kind: 'grammar', text: 'ので', reading: 'ので', meanings: ['because'] },
  {
    kind: 'grammar',
    text: 'のに',
    reading: 'のに',
    meanings: ['although; despite'],
  },
  { kind: 'grammar', text: 'まで', reading: 'まで', meanings: ['until; even'] },
  {
    kind: 'grammar',
    text: 'から',
    reading: 'から',
    meanings: ['from; because'],
  },
  { kind: 'grammar', text: 'より', reading: 'より', meanings: ['than; from'] },
  { kind: 'grammar', text: 'だけ', reading: 'だけ', meanings: ['only; just'] },
  {
    kind: 'grammar',
    text: 'ほど',
    reading: 'ほど',
    meanings: ['to the extent; about'],
  },
  { kind: 'grammar', text: 'さえ', reading: 'さえ', meanings: ['even'] },
  {
    kind: 'grammar',
    text: 'こそ',
    reading: 'こそ',
    meanings: ['indeed; precisely'],
  },
  {
    kind: 'grammar',
    text: 'では',
    reading: 'では',
    meanings: ['as for; then'],
  },
  { kind: 'grammar', text: 'です', reading: 'です', meanings: ['be; is'] },
  {
    kind: 'grammar',
    text: 'ます',
    reading: 'ます',
    meanings: ['polite auxiliary'],
  },
  { kind: 'grammar', text: 'ない', reading: 'ない', meanings: ['not; do not'] },
  { kind: 'grammar', text: 'だ', reading: 'だ', meanings: ['be; is'] },
  { kind: 'grammar', text: 'は', reading: 'は', meanings: ['topic marker'] },
  { kind: 'grammar', text: 'が', reading: 'が', meanings: ['subject marker'] },
  { kind: 'grammar', text: 'を', reading: 'を', meanings: ['object marker'] },
  { kind: 'grammar', text: 'に', reading: 'に', meanings: ['in; at; to'] },
  { kind: 'grammar', text: 'へ', reading: 'へ', meanings: ['toward'] },
  { kind: 'grammar', text: 'で', reading: 'で', meanings: ['at; by; with'] },
  { kind: 'grammar', text: 'と', reading: 'と', meanings: ['and; with'] },
  { kind: 'grammar', text: 'も', reading: 'も', meanings: ['also; too'] },
  { kind: 'grammar', text: 'の', reading: 'の', meanings: ['of; possessive'] },
  { kind: 'grammar', text: 'や', reading: 'や', meanings: ['and; among'] },
  {
    kind: 'grammar',
    text: 'ね',
    reading: 'ね',
    meanings: ['right?; isn’t it?'],
  },
  { kind: 'grammar', text: 'よ', reading: 'よ', meanings: ['emphasis'] },
  { kind: 'grammar', text: 'か', reading: 'か', meanings: ['question marker'] },
  { kind: 'grammar', text: 'な', reading: 'な', meanings: ['don’t; emphasis'] },
  { kind: 'grammar', text: 'ぞ', reading: 'ぞ', meanings: ['emphasis'] },
  { kind: 'grammar', text: 'ぜ', reading: 'ぜ', meanings: ['emphasis'] },
]

interface Plan {
  readonly score: number
  readonly tokens: readonly TextAnalysisToken[]
}

function candidateIndex(
  words: readonly AnalyzerWord[],
): ReadonlyMap<string, readonly SurfaceCandidate[]> {
  const index = new Map<string, SurfaceCandidate[]>()
  for (const candidate of GRAMMAR_CANDIDATES) {
    const first = [...candidate.text][0]
    if (!first) continue
    const candidates = index.get(first) ?? []
    candidates.push(candidate)
    index.set(first, candidates)
  }
  for (const word of words) {
    const values = new Set([...word.forms, ...word.readings])
    for (const text of values) {
      if ([...text].length < 2) continue
      const first = [...text][0]
      if (!first) continue
      const candidates = index.get(first) ?? []
      candidates.push({ kind: 'word', text, word })
      index.set(first, candidates)
    }
    const reading = word.readings[0]
    for (const form of word.forms) {
      if (!reading || form === reading) continue
      for (const surface of inflectedSurfaces(form, reading)) {
        const first = [...surface.text][0]
        if (!first) continue
        const candidates = index.get(first) ?? []
        candidates.push({
          kind: 'word',
          text: surface.text,
          word,
          reading: surface.reading,
        })
        index.set(first, candidates)
      }
    }
  }
  return index
}

function wordToken(
  text: string,
  word: AnalyzerWord,
  kanjiByLiteral: ReadonlyMap<string, AnalyzerKanji>,
  reading = word.readings[0] ?? null,
): TextAnalysisToken {
  const hasNonN5Kanji = [...text].some((literal) => {
    const record = kanjiByLiteral.get(literal)
    return record !== undefined && record.jlptLegacy !== 5
  })
  return {
    text,
    reading,
    meanings: word.meanings.slice(0, 3),
    type: 'word',
    contentRef: `word:${word.id}`,
    ...(hasNonN5Kanji ? { hasNonN5Kanji: true } : {}),
  }
}

function grammarToken(candidate: GrammarCandidate): TextAnalysisToken {
  return {
    text: candidate.text,
    reading: candidate.reading,
    meanings: candidate.meanings,
    type: 'grammar',
  }
}

function kanjiToken(record: AnalyzerKanji): TextAnalysisToken {
  return {
    text: record.literal,
    reading: record.onReadings[0] ?? record.kunReadings[0] ?? null,
    meanings: record.meanings.slice(0, 3),
    type: 'kanji',
    contentRef: `kanji:${record.literal}`,
    ...(record.jlptLegacy !== 5 ? { hasNonN5Kanji: true } : {}),
  }
}

function unknownToken(text: string): TextAnalysisToken {
  return { text, reading: null, meanings: [], type: 'unknown' }
}

function unknownClass(text: string): 'kana' | 'cjk' | 'other' {
  const first = [...text][0] ?? ''
  if (/^[\u3040-\u30ff]$/u.test(first)) return 'kana'
  const codePoint = first.codePointAt(0) ?? 0
  if (
    (codePoint >= 0x3400 && codePoint <= 0x9fff) ||
    (codePoint >= 0x20000 && codePoint <= 0x2ffff)
  )
    return 'cjk'
  return 'other'
}

function canJoinUnknown(left: string, right: string): boolean {
  const leftClass = unknownClass(left)
  const rightClass = unknownClass(right)
  return (
    leftClass === rightClass ||
    (leftClass === 'other' && rightClass === 'other')
  )
}

function isBetterPlan(next: Plan, current: Plan | undefined): boolean {
  if (!current) return true
  if (next.score !== current.score) return next.score > current.score
  return next.tokens.length < current.tokens.length
}

function compactUnknownTokens(
  tokens: readonly TextAnalysisToken[],
  maxTokens: number,
): readonly TextAnalysisToken[] {
  const compacted: TextAnalysisToken[] = []
  for (const token of tokens) {
    const previous = compacted.at(-1)
    if (
      token.type === 'unknown' &&
      previous?.type === 'unknown' &&
      canJoinUnknown(previous.text, token.text)
    ) {
      compacted[compacted.length - 1] = unknownToken(previous.text + token.text)
    } else {
      compacted.push(token)
    }
    if (compacted.length >= maxTokens) break
  }
  return compacted
}

function analyzeTextWithIndex(
  normalizedText: string,
  wordsByFirstCharacter: ReadonlyMap<string, readonly SurfaceCandidate[]>,
  kanjiByLiteral: ReadonlyMap<string, AnalyzerKanji>,
): readonly TextAnalysisToken[] {
  if (!normalizedText) return []
  const characters = [...normalizedText]
  const plans: Array<Plan | undefined> = Array(characters.length + 1)
  plans[characters.length] = { score: 0, tokens: [] }

  for (let index = characters.length - 1; index >= 0; index -= 1) {
    const character = characters[index] ?? ''
    let best = plans[index + 1]
      ? {
          score: plans[index + 1]!.score,
          tokens: [unknownToken(character), ...plans[index + 1]!.tokens],
        }
      : undefined

    const candidates = wordsByFirstCharacter.get(character) ?? []
    for (const candidate of candidates) {
      const length = [...candidate.text].length
      const end = index + length
      if (end > characters.length) continue
      if (characters.slice(index, end).join('') !== candidate.text) continue
      const tail = plans[end]
      if (!tail) continue
      const candidatePlan =
        candidate.kind === 'word'
          ? {
              // Coverage dominates; common score and length break realistic ties.
              score:
                tail.score +
                1_000_000 +
                length * 1_000 +
                candidate.word.commonScore,
              tokens: [
                wordToken(
                  candidate.text,
                  candidate.word,
                  kanjiByLiteral,
                  candidate.reading ?? candidate.word.readings[0] ?? null,
                ),
                ...tail.tokens,
              ],
            }
          : {
              // Grammar is a fallback below dictionary words but above an
              // unannotated character, so real entries always win ties. The
              // small per-token cost prefers one longer construction such as
              // ではない over three shorter grammar fragments.
              score: tail.score + length * 100 - 10,
              tokens: [grammarToken(candidate), ...tail.tokens],
            }
      if (isBetterPlan(candidatePlan, best)) best = candidatePlan
    }

    const kanjiRecord = kanjiByLiteral.get(character)
    const tail = plans[index + 1]
    if (kanjiRecord && tail) {
      const candidatePlan = {
        score: tail.score + 100_000,
        tokens: [kanjiToken(kanjiRecord), ...tail.tokens],
      }
      if (isBetterPlan(candidatePlan, best)) best = candidatePlan
    }
    plans[index] = best
  }

  return plans[0]?.tokens ?? []
}

/**
 * Segments supplied Japanese using the installed dictionary without network
 * or tokenizer dependencies. Written forms and kana readings are indexed
 * once, then a small dynamic-programming pass prefers covered, common,
 * longer words. Unknown runs remain visible instead of being silently
 * discarded.
 */
export function analyzeText(
  text: string,
  words: readonly AnalyzerWord[],
  kanji: readonly AnalyzerKanji[],
  maxTokens = 500,
): readonly TextAnalysisToken[] {
  const normalizedText = text.normalize('NFC')
  if (!normalizedText.trim() || maxTokens <= 0) return []
  const tokens = analyzeTextWithIndex(
    normalizedText,
    candidateIndex(words),
    new Map(kanji.map((record) => [record.literal, record])),
  )
  return compactUnknownTokens(tokens, maxTokens)
}

/**
 * Re-runs the same dictionary analysis inside boundaries supplied by the
 * optional offline IPADIC tokenizer. This preserves the existing safe
 * dictionary/grammar mapping while allowing a real morphological tokenizer
 * to prevent implausible cross-word longest matches.
 */
export function analyzeTextWithSegments(
  text: string,
  segments: readonly string[],
  words: readonly AnalyzerWord[],
  kanji: readonly AnalyzerKanji[],
  maxTokens = 500,
): readonly TextAnalysisToken[] {
  const normalizedText = text.normalize('NFC')
  if (!normalizedText.trim() || maxTokens <= 0) return []
  if (segments.join('') !== normalizedText)
    return analyzeText(normalizedText, words, kanji, maxTokens)

  const wordsByFirstCharacter = candidateIndex(words)
  const kanjiByLiteral = new Map(
    kanji.map((record) => [record.literal, record]),
  )
  const tokens = segments.flatMap((segment) =>
    analyzeTextWithIndex(segment, wordsByFirstCharacter, kanjiByLiteral),
  )
  return compactUnknownTokens(tokens, maxTokens)
}
