/**
 * Deck progress math shared between Home's deck shelf and Browse's deck rail.
 * Pure functions live here so both screens compute identical numbers from the
 * same inputs; only `loadDeckSummaries` (added alongside Browse's rail) does I/O.
 */
import {
  progress as computeProgress,
  progressLevel as computeProgressLevel,
} from '@/core/srs/goal'
import { isCardDue } from '@/core/srs/schedule'
import { emptyCardState } from '@/core/srs/types'
import type { LocalUserDatabase } from '@/data/db'
import {
  createUserRepositories,
  type CardState,
  type StudySession,
} from '@/data/repo'
import { loadDeckDefinitions } from '@/data/packs'
import { toCoreState } from '@/features/study/adapters'
import {
  DECK_FOLDER_SETTING_PREFIX,
  normalizeDeckFolder,
} from '@/features/settings/deck-folders'

export type LevelCounts = readonly [number, number, number, number, number]

export interface DeckSummary {
  readonly id: string
  readonly name: string
  readonly kind: 'derived' | 'custom'
  readonly cardCount: number
  readonly levelCounts: LevelCounts
  readonly dueCount: number
  readonly progressPercent: number
  readonly progressLevel: 0 | 1 | 2 | 3 | 4
  readonly lastStudiedAt: number | null
  readonly folder: string
  /** Built-in shelf category (e.g. 'jlpt', 'kanken'); empty for custom decks. */
  readonly category: string
}

/** Untouched cards (no saved state) count as level 0. */
export function countCardsByLevel(
  cards: readonly { readonly state: CardState | undefined }[],
): LevelCounts {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const card of cards) {
    const level = card.state?.level ?? 0
    counts[level] = counts[level]! + 1
  }
  return counts
}

/**
 * Pure — no DB access. Walks `contentRefs`, not `states`: a `card_states` row
 * for a contentRef the deck no longer references (e.g. after a pack update)
 * must not be counted.
 */
export function summarizeDeckCards(input: {
  readonly deck: {
    readonly id: string
    readonly name: string
    readonly kind: 'derived' | 'custom'
    readonly category?: string
  }
  readonly contentRefs: readonly string[]
  readonly states: readonly CardState[]
  readonly userId: string
  readonly folder?: string
  readonly lastSessionAt?: number | null
  readonly now?: number
}): DeckSummary {
  const stateByRef = new Map(
    input.states.map((state) => [state.contentRef, state]),
  )
  const cards = input.contentRefs.map((contentRef) => ({
    contentRef,
    state: stateByRef.get(contentRef),
  }))

  const levelCounts = countCardsByLevel(cards)
  const now = input.now ?? Date.now()
  const dueCount = cards.filter((card) => isCardDue(card.state, now)).length
  const coreStates = cards.map(({ contentRef, state }) =>
    state
      ? toCoreState(state)
      : emptyCardState(input.deck.id, contentRef, input.userId),
  )
  const progressValue = computeProgress(cards.length, coreStates)

  const lastReviewedAt = cards.reduce<number | null>(
    (latest, card) =>
      card.state?.lastReviewedAt &&
      (latest === null || card.state.lastReviewedAt > latest)
        ? card.state.lastReviewedAt
        : latest,
    null,
  )
  const lastSessionAt = input.lastSessionAt ?? null
  const lastStudiedAt =
    lastReviewedAt === null
      ? lastSessionAt
      : lastSessionAt === null
        ? lastReviewedAt
        : Math.max(lastReviewedAt, lastSessionAt)

  return {
    id: input.deck.id,
    name: input.deck.name,
    kind: input.deck.kind,
    cardCount: cards.length,
    levelCounts,
    dueCount,
    progressPercent: Math.round(progressValue * 100),
    progressLevel: computeProgressLevel(progressValue),
    lastStudiedAt,
    folder: input.folder ?? '',
    category: input.deck.category ?? '',
  }
}

/** The later of a deck's last review and its last completed study session. */
export function lastSessionEndedAt(
  sessions: readonly StudySession[],
): number | null {
  return sessions.reduce<number | null>(
    (latest, session) =>
      session.endedAt !== null && (latest === null || session.endedAt > latest)
        ? session.endedAt
        : latest,
    null,
  )
}

/**
 * Loads a `DeckSummary` for every deck the user can see — built-in and
 * custom — in roughly a dozen reads total, never one query per card.
 *
 * Built-in decks read their content refs from the pack manifest
 * (`loadDeckDefinitions`, zero DB reads) rather than `decks.listCards`,
 * which issues one `SELECT` per contentRef. Custom decks read their
 * membership with one `deckMembership.list(deckId)` call each — calling it
 * with no argument returns only the `saved` deck, so every custom deck is
 * queried explicitly rather than relying on that default.
 */
export async function loadDeckSummaries(
  database: LocalUserDatabase,
  userId: string,
  options?: { readonly now?: number; readonly includeSessions?: boolean },
): Promise<{
  readonly builtIn: readonly DeckSummary[]
  readonly custom: readonly DeckSummary[]
}> {
  const repo = createUserRepositories(database)
  const [definitions, decks, settings] = await Promise.all([
    loadDeckDefinitions(),
    repo.decks.list(),
    repo.settings.list(),
  ])
  const folderByDeckId = new Map(
    settings
      .filter((setting) => setting.key.startsWith(DECK_FOLDER_SETTING_PREFIX))
      .map((setting) => [
        setting.key.slice(DECK_FOLDER_SETTING_PREFIX.length),
        setting.value,
      ]),
  )

  async function sessionLastEndedAt(deckId: string): Promise<number | null> {
    if (!options?.includeSessions) return null
    return lastSessionEndedAt(await repo.sessions.list(deckId))
  }

  const builtIn = await Promise.all(
    definitions.map(async (definition) => {
      const [states, lastSessionAt] = await Promise.all([
        repo.cardStates.list(definition.id),
        sessionLastEndedAt(definition.id),
      ])
      return summarizeDeckCards({
        deck: {
          id: definition.id,
          name: definition.name,
          kind: 'derived',
          category: definition.category,
        },
        contentRefs: definition.contentRefs,
        states,
        userId,
        lastSessionAt,
        now: options?.now,
      })
    }),
  )

  const customDeckRows = decks.filter((deck) => deck.kind === 'custom')
  const custom = await Promise.all(
    customDeckRows.map(async (deck) => {
      const [memberships, states, lastSessionAt] = await Promise.all([
        repo.deckMembership.list(deck.id),
        repo.cardStates.list(deck.id),
        sessionLastEndedAt(deck.id),
      ])
      return summarizeDeckCards({
        deck: { id: deck.id, name: deck.name, kind: 'custom' },
        contentRefs: memberships.map((membership) => membership.contentRef),
        states,
        userId,
        folder: normalizeDeckFolder(folderByDeckId.get(deck.id)),
        lastSessionAt,
        now: options?.now,
      })
    }),
  )

  return { builtIn, custom }
}
