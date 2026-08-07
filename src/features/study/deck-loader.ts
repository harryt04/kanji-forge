import type { LocalUserDatabase } from '@/data/db';
import { createUserRepositories, type CardInDeck, type Deck } from '@/data/repo';
import { getKanjiByLiterals, loadDeckDefinitions, parseContentRef } from '@/data/packs';

export interface StudyCard {
  readonly contentRef: string;
  readonly literal: string;
  readonly meanings: readonly string[];
  readonly onReadings: readonly string[];
  readonly kunReadings: readonly string[];
}

export interface LoadedDeck {
  readonly deckId: string;
  readonly name: string;
  readonly cards: readonly CardInDeck[];
  readonly content: ReadonlyMap<string, StudyCard>;
}

/** Loads (and lazily registers) one built-in deck by its packs-dev definition id. */
export async function loadStarterDeck(database: LocalUserDatabase, definitionId = 'dev-kanji'): Promise<LoadedDeck> {
  const definitions = await loadDeckDefinitions();
  const definition = definitions.find((candidate) => candidate.id === definitionId);
  if (!definition) throw new Error(`Unknown deck definition: ${definitionId}`);

  const repo = createUserRepositories(database);
  const existingDeck = await repo.decks.get(definition.id);
  if (!existingDeck) {
    await repo.decks.upsert({
      id: definition.id,
      name: definition.name,
      kind: 'derived',
      definitionId: definition.id,
      updatedAt: Date.now(),
    });
  }

  const source = {
    contentRefsFor: (deck: Deck): readonly string[] => (deck.definitionId === definition.id ? definition.contentRefs : []),
  };
  const cards = await repo.decks.listCards(definition.id, source);

  const kanjiLiterals = definition.contentRefs
    .map((ref) => parseContentRef(ref))
    .filter((parsed) => parsed.type === 'kanji')
    .map((parsed) => parsed.key);
  const kanjiByLiteral = await getKanjiByLiterals(kanjiLiterals);

  const content = new Map<string, StudyCard>();
  for (const ref of definition.contentRefs) {
    const parsed = parseContentRef(ref);
    if (parsed.type !== 'kanji') continue; // words/sentences arrive with a future starter deck
    const record = kanjiByLiteral.get(parsed.key);
    if (!record) continue;
    content.set(ref, {
      contentRef: ref,
      literal: record.literal,
      meanings: record.meanings,
      onReadings: record.onReadings,
      kunReadings: record.kunReadings,
    });
  }

  return { deckId: definition.id, name: definition.name, cards, content };
}
