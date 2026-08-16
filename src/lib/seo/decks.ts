// Server-only, build-time reader for the committed deck catalog. Powers the
// public /kanji/lists/* pages. `packs/decks/catalog.json` is self-contained —
// each deck entry embeds its own `contentRefs`, so no per-deck file reads
// are needed.
import { readFileSync } from 'node:fs'
import path from 'node:path'

export interface SeoDeck {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly contentType: 'kanji' | 'word' | 'sentence'
  readonly category: string
  readonly sortOrder: number
  readonly contentRefs: readonly string[]
}

interface DeckCatalog {
  readonly categories: readonly string[]
  readonly decks: readonly SeoDeck[]
}

let catalogCache: DeckCatalog | undefined

function loadCatalog(): DeckCatalog {
  if (!catalogCache) {
    const catalogPath = path.join(
      process.cwd(),
      'packs',
      'decks',
      'catalog.json',
    )
    catalogCache = JSON.parse(readFileSync(catalogPath, 'utf-8')) as DeckCatalog
  }
  return catalogCache
}

/** Splits a `kanji:日` style contentRef into its type and lookup key, mirroring
 * `parseContentRef` in `src/data/packs/index.ts`. */
export function parseContentRef(contentRef: string): {
  readonly type: string
  readonly key: string
} {
  const separatorIndex = contentRef.indexOf(':')
  if (separatorIndex < 0) throw new Error(`Malformed contentRef: ${contentRef}`)
  return {
    type: contentRef.slice(0, separatorIndex),
    key: contentRef.slice(separatorIndex + 1),
  }
}

/** All kanji decks in the catalog, in catalog order. */
export function getKanjiDecks(): readonly SeoDeck[] {
  return loadCatalog().decks.filter((deck) => deck.contentType === 'kanji')
}

export function getDeck(deckId: string): SeoDeck | null {
  return (
    loadCatalog().decks.find(
      (deck) => deck.id === deckId && deck.contentType === 'kanji',
    ) ?? null
  )
}

export function getKanjiDeckCategories(): readonly string[] {
  return loadCatalog().categories
}

let membershipCache: Map<string, readonly SeoDeck[]> | undefined

/** Every kanji deck that contains a given literal, in catalog order. */
export function getDeckMembership(literal: string): readonly SeoDeck[] {
  if (!membershipCache) {
    membershipCache = new Map()
    for (const deck of getKanjiDecks()) {
      for (const ref of deck.contentRefs) {
        const { type, key } = parseContentRef(ref)
        if (type !== 'kanji') continue
        const existing = membershipCache.get(key) ?? []
        membershipCache.set(key, [...existing, deck])
      }
    }
  }
  return membershipCache.get(literal) ?? []
}

let curatedLiteralsCache: ReadonlySet<string> | undefined

/** The union of every kanji that appears in a deck (jōyō/JLPT/school/Kanken/
 * top-500) plus every kanji carrying a KANJIDIC frequency rank. This is the
 * set that gets a prerendered, indexable /kanji/[literal] page — see
 * `getKanji`/`getAllLiterals` in `kanji-pack.ts` for the frequency half. */
export function getCuratedLiteralsFromDecks(): ReadonlySet<string> {
  if (!curatedLiteralsCache) {
    const literals = new Set<string>()
    for (const deck of getKanjiDecks()) {
      for (const ref of deck.contentRefs) {
        const { type, key } = parseContentRef(ref)
        if (type === 'kanji') literals.add(key)
      }
    }
    curatedLiteralsCache = literals
  }
  return curatedLiteralsCache
}
