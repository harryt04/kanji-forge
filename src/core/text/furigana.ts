/** A sentence segment and its optional kana reading. */
export interface FuriganaToken {
  readonly text: string
  readonly furigana: string
}

function fallback(japanese: string): readonly FuriganaToken[] {
  return [{ text: japanese, furigana: '' }]
}

/**
 * Parses the small alignment format emitted by the sentence content pack.
 *
 * The pack stores JSON because it is read from SQLite, while callers and tests
 * sometimes already have the decoded array. Accept both forms so malformed or
 * future pack data can safely fall back to showing the original sentence.
 */
export function parseFuriganaTokens(
  raw: unknown,
  japanese: string,
): readonly FuriganaToken[] {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw.replace(/^\uFEFF/u, '')) as unknown
    } catch {
      return fallback(japanese)
    }
  }

  if (!Array.isArray(parsed)) return fallback(japanese)

  const tokens = parsed.flatMap((value): FuriganaToken[] => {
    if (!value || typeof value !== 'object' || !('text' in value)) return []
    const text = value.text
    if (typeof text !== 'string' || text.length === 0) return []

    const furigana = 'furigana' in value ? value.furigana : ''
    return [
      {
        text,
        furigana: typeof furigana === 'string' ? furigana : '',
      },
    ]
  })

  return tokens.length > 0 ? tokens : fallback(japanese)
}
