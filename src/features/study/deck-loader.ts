import type { LocalUserDatabase } from '@/data/db'
import { createUserRepositories, type CardInDeck, type Deck } from '@/data/repo'
import {
  getKanjiByLiterals,
  getWordById,
  loadDeckDefinitions,
  parseContentRef,
} from '@/data/packs'

export interface StudyCard {
  readonly contentRef: string
  readonly contentType: 'kanji' | 'word'
  readonly literal: string
  readonly readings: readonly string[]
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
  const wordIds = cards
    .map((card) => card.contentRef)
    .map((ref) => parseContentRef(ref))
    .filter((parsed) => parsed.type === 'word')
    .map((parsed) => Number(parsed.key))
    .filter((id) => Number.isInteger(id) && id >= 0)
  const words = await Promise.all(wordIds.map((id) => getWordById(id)))
  const wordById = new Map(
    words.flatMap((record, index) =>
      record ? [[wordIds[index]!, record] as const] : [],
    ),
  )

  const content = new Map<string, StudyCard>()
  for (const ref of cards.map((card) => card.contentRef)) {
    const parsed = parseContentRef(ref)
    if (parsed.type === 'kanji') {
      const record = kanjiByLiteral.get(parsed.key)
      if (!record) continue
      content.set(ref, {
        contentRef: ref,
        contentType: 'kanji',
        literal: record.literal,
        readings: [
          ...record.onReadings,
          ...record.kunReadings,
          ...record.nanori,
        ],
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
      continue
    }
    if (parsed.type !== 'word') continue
    const record = wordById.get(Number(parsed.key))
    if (!record || record.forms.length === 0) continue
    content.set(ref, {
      contentRef: ref,
      contentType: 'word',
      literal: record.forms[0]!,
      readings: record.readings,
      strokeCount: 0,
      frequency: record.commonScore,
      jlptLegacy: null,
      grade: null,
      nanori: [],
      meanings: record.meanings,
      onReadings: [],
      kunReadings: [],
    })
  }

  return {
    deckId: deck.id,
    name: deck.name,
    // Unsupported content types must not produce blank study cards.
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
