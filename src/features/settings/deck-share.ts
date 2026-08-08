import type { LoadedDeck } from '@/features/study/deck-loader'

export const DECK_SHARE_FORMAT = 'kanjiforge-deck-share'
export const DECK_SHARE_VERSION = 2

export interface DeckShareCard {
  readonly contentRef: string
  readonly kind: 'kanji' | 'word'
  readonly label: string
  readonly readings?: readonly string[]
  readonly meanings?: readonly string[]
}

export interface DeckSharePayload {
  readonly format: typeof DECK_SHARE_FORMAT
  readonly version: 1 | typeof DECK_SHARE_VERSION
  readonly name: string
  /** Retained as a normalized convenience field for legacy callers. */
  readonly kanji: readonly string[]
  /** Present for version 2; version 1 payloads remain readable. */
  readonly cards?: readonly DeckShareCard[]
}

/** Creates a content-only payload suitable for putting in a URL. */
export function formatDeckSharePayload(deck: LoadedDeck): string {
  const cards = [
    ...new Map(
      deck.cards.flatMap((card): [string, DeckShareCard][] => {
        const content = deck.content.get(card.contentRef)
        if (!content) return []
        const kind =
          content.contentType ??
          (card.contentRef.startsWith('word:') ? 'word' : 'kanji')
        if (kind !== 'kanji' && kind !== 'word') return []
        return [
          [
            card.contentRef,
            {
              contentRef: card.contentRef,
              kind,
              label: content.literal,
            },
          ],
        ]
      }),
    ).values(),
  ]
  const kanji = cards
    .filter((card) => card.kind === 'kanji')
    .map((card) => card.label)
  // Keep the compact legacy representation for kanji-only decks so the
  // starter deck remains shareable as a URL. Mixed decks use version 2 below.
  if (!cards.some((card) => card.kind === 'word')) {
    return JSON.stringify({
      format: DECK_SHARE_FORMAT,
      version: 1,
      name: deck.name,
      kanji,
    } satisfies DeckSharePayload)
  }
  return JSON.stringify({
    format: DECK_SHARE_FORMAT,
    version: DECK_SHARE_VERSION,
    name: deck.name,
    cards,
  } satisfies Omit<DeckSharePayload, 'kanji'>)
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
    (value.version !== 1 && value.version !== DECK_SHARE_VERSION)
  )
    throw new Error('This deck share link uses an unsupported version.')
  if (typeof value.name !== 'string')
    throw new Error('This deck share link is missing its card list.')

  if (value.version === 1) {
    if (!Array.isArray(value.kanji))
      throw new Error('This deck share link is missing its card list.')
    const kanji = [
      ...new Set(
        value.kanji.filter(
          (literal): literal is string =>
            typeof literal === 'string' && isKanjiLiteral(literal),
        ),
      ),
    ]
    if (kanji.length === 0)
      throw new Error('This deck share link has no kanji.')
    return {
      format: DECK_SHARE_FORMAT,
      version: 1,
      name: value.name.trim() || 'Shared deck',
      kanji,
    }
  }

  if (!Array.isArray(value.cards))
    throw new Error('This deck share link is missing its card list.')
  const cards = [
    ...new Map(
      value.cards.flatMap((card): [string, DeckShareCard][] => {
        if (!isRecord(card)) return []
        if (
          (card.kind !== 'kanji' && card.kind !== 'word') ||
          typeof card.contentRef !== 'string' ||
          typeof card.label !== 'string' ||
          (card.readings !== undefined && !Array.isArray(card.readings)) ||
          (card.meanings !== undefined && !Array.isArray(card.meanings))
        )
          return []
        if (
          card.kind === 'kanji' &&
          (!card.contentRef.startsWith('kanji:') || !isKanjiLiteral(card.label))
        )
          return []
        if (card.kind === 'word' && !/^word:\d+$/u.test(card.contentRef))
          return []
        return [
          [
            card.contentRef,
            {
              contentRef: card.contentRef,
              kind: card.kind,
              label: card.label,
              readings: Array.isArray(card.readings)
                ? card.readings.filter(
                    (reading): reading is string => typeof reading === 'string',
                  )
                : [],
              meanings: Array.isArray(card.meanings)
                ? card.meanings.filter(
                    (meaning): meaning is string => typeof meaning === 'string',
                  )
                : [],
            },
          ],
        ]
      }),
    ).values(),
  ]
  if (cards.length === 0) throw new Error('This deck share link has no cards.')
  return {
    format: DECK_SHARE_FORMAT,
    version: DECK_SHARE_VERSION,
    name: value.name.trim() || 'Shared deck',
    kanji: cards
      .filter((card) => card.kind === 'kanji')
      .map((card) => card.label),
    cards,
  }
}

/** Normalizes both the legacy kanji-only and current mixed-card formats. */
export function cardsFromDeckSharePayload(
  payload: DeckSharePayload,
): readonly DeckShareCard[] {
  return (
    payload.cards ??
    payload.kanji.map((literal) => ({
      contentRef: `kanji:${literal}`,
      kind: 'kanji' as const,
      label: literal,
      readings: [],
      meanings: [],
    }))
  )
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
