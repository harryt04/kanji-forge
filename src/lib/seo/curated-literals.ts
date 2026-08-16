import { getFrequencyRankedLiterals } from './kanji-pack'
import { getCuratedLiteralsFromDecks } from './decks'

let setCache: ReadonlySet<string> | undefined

function getCuratedLiteralSet(): ReadonlySet<string> {
  if (!setCache) {
    const literals = new Set(getCuratedLiteralsFromDecks())
    for (const literal of getFrequencyRankedLiterals()) literals.add(literal)
    setCache = literals
  }
  return setCache
}

/** The ~2,500 kanji that get a prerendered, indexable /kanji/[literal] page:
 * the union of every kanji in a jōyō/JLPT/school/Kanken/top-500 deck, plus
 * every kanji with a KANJIDIC frequency rank. Both `generateStaticParams` and
 * `sitemap.ts` consume this so the two never drift apart. */
export function getCuratedLiterals(): readonly string[] {
  return [...getCuratedLiteralSet()]
}

export function isCuratedLiteral(literal: string): boolean {
  return getCuratedLiteralSet().has(literal)
}
