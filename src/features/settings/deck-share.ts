import type { LoadedDeck } from '@/features/study/deck-loader'

export const DECK_SHARE_FORMAT = 'kanjiforge-deck-share'
export const DECK_SHARE_VERSION = 1

export interface DeckSharePayload {
  readonly format: typeof DECK_SHARE_FORMAT
  readonly version: typeof DECK_SHARE_VERSION
  readonly name: string
  readonly kanji: readonly string[]
}

/** Creates a small content-only payload suitable for putting in a URL. */
export function formatDeckSharePayload(deck: LoadedDeck): string {
  const kanji = [
    ...new Set(
      deck.cards.flatMap((card) => {
        const literal = deck.content.get(card.contentRef)?.literal
        return literal ? [literal] : []
      }),
    ),
  ]
  return JSON.stringify({
    format: DECK_SHARE_FORMAT,
    version: DECK_SHARE_VERSION,
    name: deck.name,
    kanji,
  } satisfies DeckSharePayload)
}

/** Creates a readable content-only JSON file for sharing outside a URL. */
export function formatDeckShareFile(deck: LoadedDeck): string {
  return JSON.stringify(JSON.parse(formatDeckSharePayload(deck)), null, 2)
}

/** Makes a shareable link without including private SRS progress or user data. */
export function createDeckShareUrl(origin: string, deck: LoadedDeck): string {
  const url = new URL('/analyze', origin)
  url.searchParams.set('deck', formatDeckSharePayload(deck))
  return url.toString()
}

/** Parses and validates a deck payload received from a URL. */
export function parseDeckSharePayload(input: string): DeckSharePayload {
  let value: unknown
  try {
    value = JSON.parse(input) as unknown
  } catch {
    throw new Error('This deck share link is not valid JSON.')
  }

  if (!isRecord(value)) throw new Error('This deck share link is malformed.')
  if (
    value.format !== DECK_SHARE_FORMAT ||
    value.version !== DECK_SHARE_VERSION
  )
    throw new Error('This deck share link uses an unsupported version.')
  if (typeof value.name !== 'string' || !Array.isArray(value.kanji))
    throw new Error('This deck share link is missing its card list.')

  const kanji = [
    ...new Set(
      value.kanji.filter(
        (literal): literal is string =>
          typeof literal === 'string' && isKanjiLiteral(literal),
      ),
    ),
  ]
  if (kanji.length === 0) throw new Error('This deck share link has no kanji.')
  return {
    format: DECK_SHARE_FORMAT,
    version: DECK_SHARE_VERSION,
    name: value.name.trim() || 'Shared deck',
    kanji,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isKanjiLiteral(value: string): boolean {
  if ([...value].length !== 1) return false
  const codePoint = value.codePointAt(0)
  return (
    codePoint !== undefined &&
    ((codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
      (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0x20000 && codePoint <= 0x2fa1f))
  )
}
