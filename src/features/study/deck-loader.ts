import type { LocalUserDatabase } from '@/data/db'
import { createUserRepositories, type CardInDeck, type Deck } from '@/data/repo'
import {
  getKanjiByLiterals,
  loadDeckDefinitions,
  parseContentRef,
} from '@/data/packs'

export interface StudyCard {
  readonly contentRef: string
  readonly literal: string
  readonly radicalClassical?: number | null
  readonly radicalNelson?: number | null
  readonly strokeCount: number
  readonly frequency: number | null
  readonly jlptLegacy: number | null
  readonly grade: number | null
  readonly nanori: readonly string[]
  readonly meanings: readonly string[]
  readonly onReadings: readonly string[]
  readonly kunReadings: readonly string[]
}

export interface LoadedDeck {
  readonly deckId: string
  readonly name: string
  readonly cards: readonly CardInDeck[]
  readonly content: ReadonlyMap<string, StudyCard>
}

/** Loads a built-in or user-owned deck from the local pack/database projection. */
export async function loadDeck(
  database: LocalUserDatabase,
  deckId = 'dev-kanji',
): Promise<LoadedDeck> {
  const definitions = await loadDeckDefinitions()
  const repo = createUserRepositories(database)
  let deck = await repo.decks.get(deckId)
  if (!deck) {
    const definition = definitions.find((candidate) => candidate.id === deckId)
    if (!definition) throw new Error(`Unknown deck definition: ${deckId}`)
    deck = {
      id: definition.id,
      name: definition.name,
      kind: 'derived',
      definitionId: definition.id,
      updatedAt: Date.now(),
    }
    await repo.decks.upsert(deck)
  }

  const definition =
    deck.kind === 'derived'
      ? definitions.find((candidate) => candidate.id === deck.definitionId)
      : undefined
  if (deck.kind === 'derived' && !definition) {
    throw new Error(`Unknown deck definition: ${deck.definitionId}`)
  }
  const source = {
    contentRefsFor: (candidate: Deck): readonly string[] =>
      candidate.kind === 'derived' ? (definition?.contentRefs ?? []) : [],
  }
  const cards = await repo.decks.listCards(deck.id, source)

  const kanjiLiterals = cards
    .map((card) => card.contentRef)
    .map((ref) => parseContentRef(ref))
    .filter((parsed) => parsed.type === 'kanji')
    .map((parsed) => parsed.key)
  const kanjiByLiteral = await getKanjiByLiterals(kanjiLiterals)

  const content = new Map<string, StudyCard>()
  for (const ref of cards.map((card) => card.contentRef)) {
    const parsed = parseContentRef(ref)
    if (parsed.type !== 'kanji') continue // words/sentences arrive with a future starter deck
    const record = kanjiByLiteral.get(parsed.key)
    if (!record) continue
    content.set(ref, {
      contentRef: ref,
      literal: record.literal,
      radicalClassical: record.radicalClassical,
      radicalNelson: record.radicalNelson,
      strokeCount: record.strokeCount,
      frequency: record.freq,
      jlptLegacy: record.jlptLegacy,
      grade: record.grade,
      nanori: record.nanori,
      meanings: record.meanings,
      onReadings: record.onReadings,
      kunReadings: record.kunReadings,
    })
  }

  return {
    deckId: deck.id,
    name: deck.name,
    // Unsupported future content types must not produce blank study cards.
    cards: cards.filter((card) => content.has(card.contentRef)),
    content,
  }
}

/** Loads (and lazily registers) one built-in deck by its packs-dev definition id. */
export async function loadStarterDeck(
  database: LocalUserDatabase,
  definitionId = 'dev-kanji',
): Promise<LoadedDeck> {
  return loadDeck(database, definitionId)
}
