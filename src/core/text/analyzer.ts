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
  readonly type: 'word' | 'kanji' | 'unknown'
  readonly contentRef?: string
  readonly hasNonN5Kanji?: boolean
}

interface WordCandidate {
  readonly text: string
  readonly word: AnalyzerWord
}

interface Plan {
  readonly score: number
  readonly tokens: readonly TextAnalysisToken[]
}

function candidateIndex(
  words: readonly AnalyzerWord[],
): ReadonlyMap<string, readonly WordCandidate[]> {
  const index = new Map<string, WordCandidate[]>()
  for (const word of words) {
    const values = new Set([...word.forms, ...word.readings])
    for (const text of values) {
      if ([...text].length < 2) continue
      const first = [...text][0]
      if (!first) continue
      const candidates = index.get(first) ?? []
      candidates.push({ text, word })
      index.set(first, candidates)
    }
  }
  return index
}

function wordToken(
  text: string,
  word: AnalyzerWord,
  kanjiByLiteral: ReadonlyMap<string, AnalyzerKanji>,
): TextAnalysisToken {
  const hasNonN5Kanji = [...text].some((literal) => {
    const record = kanjiByLiteral.get(literal)
    return record !== undefined && record.jlptLegacy !== 5
  })
  return {
    text,
    reading: word.readings[0] ?? null,
    meanings: word.meanings.slice(0, 3),
    type: 'word',
    contentRef: `word:${word.id}`,
    ...(hasNonN5Kanji ? { hasNonN5Kanji: true } : {}),
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

/**
 * Segments supplied Japanese using the installed dictionary without network or
 * tokenizer dependencies. Written forms and kana readings are indexed once,
 * then a small dynamic-programming pass prefers covered, common, longer words.
 * Unknown runs remain visible instead of being silently discarded.
 */
export function analyzeText(
  text: string,
  words: readonly AnalyzerWord[],
  kanji: readonly AnalyzerKanji[],
  maxTokens = 500,
): readonly TextAnalysisToken[] {
  const normalizedText = text.normalize('NFC')
  if (!normalizedText.trim() || maxTokens <= 0) return []

  const characters = [...normalizedText]
  const wordsByFirstCharacter = candidateIndex(words)
  const kanjiByLiteral = new Map(
    kanji.map((record) => [record.literal, record]),
  )
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
      const candidatePlan = {
        // Coverage dominates; common score and length break realistic ties.
        score:
          tail.score + 1_000_000 + length * 1_000 + candidate.word.commonScore,
        tokens: [
          wordToken(candidate.text, candidate.word, kanjiByLiteral),
          ...tail.tokens,
        ],
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

  const tokens = plans[0]?.tokens ?? []
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
