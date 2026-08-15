import { isKanjiLiteral } from '@/core/import/parse'
import { buildQueue, type QueueCard } from '@/core/srs/queue'
import { DEFAULT_SRS_CONFIG } from '@/core/srs/types'
import type { LocalUserDatabase } from '@/data/db'
import { createUserRepositories } from '@/data/repo'
import { loadDeck } from '@/features/study/deck-loader'
import { toCoreState } from '@/features/study/adapters'
import {
  DEFAULT_SRS_MODE,
  isSrsMode,
  SRS_MODE_SETTING,
} from '@/features/study/study-style'

export interface WritingQueueEntry {
  readonly contentRef: string
  readonly literal: string
}

export interface WritingQueue {
  readonly deckId: string
  readonly deckName: string
  readonly entries: readonly WritingQueueEntry[]
}

/**
 * Loads a deck and turns it into an ordered, kanji-only practice queue.
 *
 * Ordering reuses the same SRS `buildQueue` the study screen uses, so the
 * front of the queue matches what a learner would see in Study. `buildQueue`
 * caps at roughly the daily goal, so the rest of the deck is appended in deck
 * order — nothing in the deck becomes unreachable. Word cards are expanded
 * into their constituent kanji (kana dropped); duplicates are removed,
 * keeping the first occurrence.
 *
 * This is read-only: no card state or review is written.
 */
export async function loadWritingQueue(
  database: LocalUserDatabase,
  deckId: string,
): Promise<WritingQueue> {
  const loaded = await loadDeck(database, deckId)
  const repositories = createUserRepositories(database)
  const savedSrsMode = await repositories.settings.get(SRS_MODE_SETTING)
  const savedSrsModeValue = savedSrsMode?.value ?? ''
  const schedulerMode = isSrsMode(savedSrsModeValue)
    ? savedSrsModeValue
    : DEFAULT_SRS_MODE

  const now = Date.now()
  const queueCards: QueueCard[] = loaded.cards.map((card, order) => ({
    deckId: card.deckId,
    stickyId: card.contentRef,
    state: card.state ? toCoreState(card.state) : undefined,
    order,
    characters: [loaded.content.get(card.contentRef)?.literal ?? ''],
  }))

  const prioritized = buildQueue(queueCards, {
    now,
    config: DEFAULT_SRS_CONFIG,
    dayOfYear: Math.floor(now / 86_400_000),
    dailyGoal: DEFAULT_SRS_CONFIG.newPerSession,
    schedulerMode,
  })

  const seenStickyIds = new Set(prioritized.map((card) => card.stickyId))
  const remainder = queueCards
    .filter((card) => !seenStickyIds.has(card.stickyId))
    .sort((left, right) => left.order - right.order)
  const orderedCards = [...prioritized, ...remainder]

  const entries: WritingQueueEntry[] = []
  const seenLiterals = new Set<string>()
  for (const card of orderedCards) {
    const studyCard = loaded.content.get(card.stickyId)
    if (!studyCard) continue
    const literals =
      studyCard.contentType === 'kanji'
        ? [studyCard.literal]
        : [...studyCard.literal].filter(isKanjiLiteral)
    for (const literal of literals) {
      if (seenLiterals.has(literal)) continue
      seenLiterals.add(literal)
      entries.push({ contentRef: `kanji:${literal}`, literal })
    }
  }

  return { deckId: loaded.deckId, deckName: loaded.name, entries }
}
