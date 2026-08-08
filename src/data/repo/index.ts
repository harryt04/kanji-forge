import type { LocalUserDatabase, SqlRow, SqlValue } from '@/data/db'
import { replay } from '@/core/srs/replay'
import { DEFAULT_SRS_CONFIG } from '@/core/srs/types'

export type CardLevel = 0 | 1 | 2 | 3 | 4
export type Grade = 'again' | 'good' | 'easy'
export type ReviewSource = 'study' | 'manual' | 'import' | 'transfer'

export interface Deck {
  id: string
  name: string
  kind: 'saved' | 'custom' | 'derived'
  definitionId: string | null
  updatedAt: number
}
export interface DeckMembership {
  deckId: string
  contentRef: string
  sortOrder: number
  addedAt: number
  updatedAt: number
}
export interface CardState {
  deckId: string
  contentRef: string
  level: CardLevel
  dueAt: number | null
  lastReviewedAt: number | null
  correctStreak: number
  totalReviews: number
  totalCorrect: number
  lapses: number
  flagged: boolean
  manualOverride: boolean
  updatedAt: number
  updatedBy: string
}
export interface Review {
  id: string
  deckId: string
  contentRef: string
  at: number
  grade: Grade
  levelBefore: CardLevel
  levelAfter: CardLevel
  intervalBefore: number
  elapsedDays: number
  responseMs: number
  source: ReviewSource
  deviceId: string
}
export interface StudySession {
  id: string
  deckId: string
  startedAt: number
  endedAt: number | null
}
export interface Setting {
  key: string
  value: string
  updatedAt: number
}
export interface StickyAnnotation {
  deckId: string
  contentRef: string
  note: string
  tags: readonly string[]
  updatedAt: number
  updatedBy: string
}
export interface DailyStat {
  day: string
  reviews: number
  correct: number
  again: number
  updatedAt: number
}
export interface OutboxMutation {
  id: string
  mutType:
    | 'review.append'
    | 'cardState.upsert'
    | 'deck.upsert'
    | 'settings.upsert'
    | 'deckMembership.upsert'
    | 'deck.delete'
    | 'annotation.upsert'
  payload: string
  createdAt: number
  attempts: number
}

/** Supplied by packs/deck definitions; no per-card membership is stored for derived decks. */
export interface DeckCardSource {
  contentRefsFor(deck: Deck): readonly string[]
}
export interface CardInDeck {
  readonly deckId: string
  readonly contentRef: string
  readonly state: CardState | undefined
}

export interface UserRepositories {
  readonly decks: {
    upsert(deck: Deck): Promise<void>
    get(id: string): Promise<Deck | undefined>
    list(): Promise<readonly Deck[]>
    listCards(
      deckId: string,
      source: DeckCardSource,
    ): Promise<readonly CardInDeck[]>
  }
  readonly deckMembership: {
    save(membership: DeckMembership): Promise<void>
    remove(contentRef: string, deckId?: string): Promise<void>
    list(deckId?: string): Promise<readonly DeckMembership[]>
  }
  readonly cardStates: {
    get(deckId: string, contentRef: string): Promise<CardState | undefined>
    list(deckId: string): Promise<readonly CardState[]>
    count(deckId?: string): Promise<number>
    upsert(state: CardState): Promise<void>
  }
  readonly reviews: {
    append(review: Review): Promise<void>
    list(deckId?: string, contentRef?: string): Promise<readonly Review[]>
  }
  readonly sessions: {
    start(session: StudySession): Promise<void>
    end(id: string, endedAt: number): Promise<void>
    list(deckId?: string): Promise<readonly StudySession[]>
  }
  readonly settings: {
    set(setting: Setting): Promise<void>
    get(key: string): Promise<Setting | undefined>
    list(): Promise<readonly Setting[]>
  }
  readonly annotations: {
    get(
      deckId: string,
      contentRef: string,
    ): Promise<StickyAnnotation | undefined>
    list(): Promise<readonly StickyAnnotation[]>
    upsert(
      annotation: StickyAnnotation,
      mutation: OutboxMutation,
    ): Promise<void>
  }
  readonly dailyStats: {
    get(day: string): Promise<DailyStat | undefined>
    list(): Promise<readonly DailyStat[]>
  }
  readonly outbox: {
    pending(): Promise<readonly OutboxMutation[]>
    markAttempt(id: string): Promise<void>
    remove(id: string): Promise<void>
  }
  /** The T1.2 local write path: review + projection + stat + outbox, atomically. */
  recordGrade(input: {
    review: Review
    nextState: CardState
    day: string
    mutation: OutboxMutation
  }): Promise<void>
  /** Persists a manual card-state change and its sync mutation atomically. */
  recordCardState(input: {
    state: CardState
    mutation: OutboxMutation
  }): Promise<void>
  /** Persists several manual card-state changes and their sync mutations atomically. */
  recordCardStates(
    inputs: readonly { state: CardState; mutation: OutboxMutation }[],
  ): Promise<void>
  /** Clears one deck's local study statistics and reprojects its touched cards to New atomically. */
  resetStatistics(input: {
    deckId: string
    states: readonly { state: CardState; mutation: OutboxMutation }[]
  }): Promise<void>
  /** Persists deck metadata and its sync mutation atomically. */
  recordDeck(input: { deck: Deck; mutation: OutboxMutation }): Promise<void>
  /** Deletes one user-owned deck and all of its local study data atomically. */
  deleteDeck(input: { deckId: string; mutation: OutboxMutation }): Promise<void>
  /** Persists a manual level assignment without counting it as a study review. */
  recordManualOverride(input: {
    review: Review
    nextState: CardState
    mutation: OutboxMutation
  }): Promise<void>
  /** Persists several manual level assignments without counting them as study reviews. */
  recordManualOverrides(
    inputs: readonly {
      review: Review
      nextState: CardState
      mutation: OutboxMutation
    }[],
  ): Promise<void>
  /** Persists a user-owned deck membership and its sync mutation atomically. */
  recordDeckMembership(input: {
    deck: Deck
    membership: DeckMembership
    mutation: OutboxMutation
  }): Promise<void>
  /** Persists several user-owned deck memberships and their sync mutations atomically. */
  recordDeckMemberships(input: {
    deck: Deck
    deckMutation: OutboxMutation
    memberships: readonly {
      membership: DeckMembership
      mutation: OutboxMutation
    }[]
  }): Promise<void>
  /** Merges a KanjiForge backup without deleting newer local data. */
  restoreBackup(input: {
    decks: readonly Deck[]
    settings: readonly Setting[]
    deckMembership: readonly DeckMembership[]
    reviews: readonly Review[]
    annotations?: readonly StickyAnnotation[]
  }): Promise<void>
}

function value(row: SqlRow, key: string): SqlValue {
  const result = row[key]
  if (result === undefined)
    throw new Error(`Local database row is missing ${key}.`)
  return result
}
function text(row: SqlRow, key: string): string {
  const result = value(row, key)
  if (typeof result !== 'string') throw new Error(`Expected ${key} to be text.`)
  return result
}
function numberValue(row: SqlRow, key: string): number {
  const result = value(row, key)
  if (typeof result !== 'number')
    throw new Error(`Expected ${key} to be a number.`)
  return result
}
function nullableNumber(row: SqlRow, key: string): number | null {
  const result = value(row, key)
  if (result === null || typeof result === 'number') return result
  throw new Error(`Expected ${key} to be nullable number.`)
}
function level(valueToCheck: number): CardLevel {
  if (valueToCheck >= 0 && valueToCheck <= 4 && Number.isInteger(valueToCheck))
    return valueToCheck as CardLevel
  throw new Error('Invalid card level in local database.')
}
function bool(row: SqlRow, key: string): boolean {
  return numberValue(row, key) === 1
}

function cardState(row: SqlRow): CardState {
  return {
    deckId: text(row, 'deck_id'),
    contentRef: text(row, 'content_ref'),
    level: level(numberValue(row, 'level')),
    dueAt: nullableNumber(row, 'due_at'),
    lastReviewedAt: nullableNumber(row, 'last_reviewed_at'),
    correctStreak: numberValue(row, 'correct_streak'),
    totalReviews: numberValue(row, 'total_reviews'),
    totalCorrect: numberValue(row, 'total_correct'),
    lapses: numberValue(row, 'lapses'),
    flagged: bool(row, 'flagged'),
    manualOverride: bool(row, 'manual_override'),
    updatedAt: numberValue(row, 'updated_at'),
    updatedBy: text(row, 'updated_by'),
  }
}

function annotationTags(row: SqlRow): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(text(row, 'tags_json'))
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : []
  } catch {
    return []
  }
}

/** Creates repositories bound to precisely one T1.1-authenticated local database. */
export function createUserRepositories(
  database: LocalUserDatabase,
): UserRepositories {
  const userId = database.userId
  const stateParams = (state: CardState): readonly SqlValue[] => [
    state.deckId,
    state.contentRef,
    state.level,
    state.dueAt,
    state.lastReviewedAt,
    state.correctStreak,
    state.totalReviews,
    state.totalCorrect,
    state.lapses,
    state.flagged ? 1 : 0,
    state.manualOverride ? 1 : 0,
    state.updatedAt,
    state.updatedBy,
  ]
  const putState =
    'INSERT INTO card_states(deck_id, content_ref, level, due_at, last_reviewed_at, correct_streak, total_reviews, total_correct, lapses, flagged, manual_override, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(deck_id, content_ref) DO UPDATE SET level=excluded.level, due_at=excluded.due_at, last_reviewed_at=excluded.last_reviewed_at, correct_streak=excluded.correct_streak, total_reviews=excluded.total_reviews, total_correct=excluded.total_correct, lapses=excluded.lapses, flagged=excluded.flagged, manual_override=excluded.manual_override, updated_at=excluded.updated_at, updated_by=excluded.updated_by'
  const putOutbox =
    'INSERT INTO outbox(id, user_id, mut_type, payload, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)'
  const reviewParams = (review: Review): readonly SqlValue[] => [
    review.id,
    userId,
    review.deckId,
    review.contentRef,
    review.at,
    review.grade,
    review.levelBefore,
    review.levelAfter,
    review.intervalBefore,
    review.elapsedDays,
    review.responseMs,
    review.source,
    review.deviceId,
  ]
  const putReview =
    'INSERT INTO reviews(id, user_id, deck_id, content_ref, at, grade, level_before, level_after, interval_before, elapsed_days, response_ms, source, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  const putDeck =
    'INSERT INTO decks(id, user_id, name, kind, definition_id, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, definition_id=excluded.definition_id, updated_at=excluded.updated_at'
  const putMembership =
    'INSERT INTO deck_membership(user_id, deck_id, content_ref, sort_order, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(deck_id, content_ref) DO UPDATE SET sort_order=excluded.sort_order, updated_at=excluded.updated_at'
  const putAnnotation =
    'INSERT INTO sticky_annotations(user_id, deck_id, content_ref, note, tags_json, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(deck_id, content_ref) DO UPDATE SET note=excluded.note, tags_json=excluded.tags_json, updated_at=excluded.updated_at, updated_by=excluded.updated_by'
  const persistManualOverrides = async (
    inputs: readonly {
      review: Review
      nextState: CardState
      mutation: OutboxMutation
    }[],
  ): Promise<void> => {
    for (const { review, mutation } of inputs) {
      if (review.id !== mutation.id)
        throw new Error(
          'A manual override mutation id must equal its review id.',
        )
      if (review.source !== 'manual')
        throw new Error('Manual override reviews must use the manual source.')
    }
    await database.transaction(
      inputs.flatMap(({ review, nextState, mutation }) => [
        { sql: putReview, parameters: reviewParams(review) },
        { sql: putState, parameters: stateParams(nextState) },
        {
          sql: 'INSERT INTO outbox(id, user_id, mut_type, payload, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
          parameters: [
            mutation.id,
            userId,
            mutation.mutType,
            mutation.payload,
            mutation.createdAt,
            mutation.attempts,
          ],
        },
      ]),
    )
  }

  return {
    decks: {
      async upsert(deck) {
        await database.write(putDeck, [
          deck.id,
          userId,
          deck.name,
          deck.kind,
          deck.definitionId,
          deck.updatedAt,
        ])
      },
      async get(id) {
        const row = (
          await database.read(
            'SELECT id, name, kind, definition_id, updated_at FROM decks WHERE id = ? AND user_id = ?',
            [id, userId],
          )
        )[0]
        return row
          ? {
              id: text(row, 'id'),
              name: text(row, 'name'),
              kind: text(row, 'kind') as Deck['kind'],
              definitionId:
                value(row, 'definition_id') === null
                  ? null
                  : text(row, 'definition_id'),
              updatedAt: numberValue(row, 'updated_at'),
            }
          : undefined
      },
      async list() {
        const rows = await database.read(
          'SELECT id, name, kind, definition_id, updated_at FROM decks WHERE user_id = ? ORDER BY name',
          [userId],
        )
        return rows.map((row) => ({
          id: text(row, 'id'),
          name: text(row, 'name'),
          kind: text(row, 'kind') as Deck['kind'],
          definitionId:
            value(row, 'definition_id') === null
              ? null
              : text(row, 'definition_id'),
          updatedAt: numberValue(row, 'updated_at'),
        }))
      },
      async listCards(deckId, source) {
        const deck = await this.get(deckId)
        if (!deck) throw new Error(`Unknown deck ${deckId}.`)
        const refs =
          deck.kind !== 'derived'
            ? (
                await database.read(
                  'SELECT content_ref FROM deck_membership WHERE user_id = ? AND deck_id = ? ORDER BY sort_order',
                  [userId, deckId],
                )
              ).map((row) => text(row, 'content_ref'))
            : source.contentRefsFor(deck)
        return Promise.all(
          refs.map(async (contentRef) => {
            const row = (
              await database.read(
                'SELECT * FROM card_states WHERE deck_id = ? AND content_ref = ?',
                [deckId, contentRef],
              )
            )[0]
            return {
              deckId,
              contentRef,
              state: row ? cardState(row) : undefined,
            }
          }),
        )
      },
    },
    deckMembership: {
      async save(membership) {
        await database.write(putMembership, [
          userId,
          membership.deckId,
          membership.contentRef,
          membership.sortOrder,
          membership.addedAt,
          membership.updatedAt,
        ])
      },
      async remove(contentRef, deckId = 'saved') {
        await database.write(
          'DELETE FROM deck_membership WHERE user_id = ? AND deck_id = ? AND content_ref = ?',
          [userId, deckId, contentRef],
        )
      },
      async list(deckId) {
        const filterDeckId = arguments.length === 0 ? 'saved' : deckId
        return (
          await database.read(
            'SELECT deck_id, content_ref, sort_order, added_at, updated_at FROM deck_membership WHERE user_id = ? AND (? IS NULL OR deck_id = ?) ORDER BY deck_id, sort_order',
            [userId, filterDeckId ?? null, filterDeckId ?? null],
          )
        ).map((row) => ({
          deckId: text(row, 'deck_id'),
          contentRef: text(row, 'content_ref'),
          sortOrder: numberValue(row, 'sort_order'),
          addedAt: numberValue(row, 'added_at'),
          updatedAt: numberValue(row, 'updated_at'),
        }))
      },
    },
    cardStates: {
      async get(deckId, contentRef) {
        const row = (
          await database.read(
            'SELECT * FROM card_states WHERE deck_id = ? AND content_ref = ?',
            [deckId, contentRef],
          )
        )[0]
        return row ? cardState(row) : undefined
      },
      async list(deckId) {
        const rows = await database.read(
          'SELECT * FROM card_states WHERE deck_id = ? ORDER BY content_ref',
          [deckId],
        )
        return rows.map(cardState)
      },
      async count(deckId) {
        const rows = await database.read(
          deckId
            ? 'SELECT COUNT(*) AS count FROM card_states WHERE deck_id = ?'
            : 'SELECT COUNT(*) AS count FROM card_states',
          deckId ? [deckId] : [],
        )
        return numberValue(rows[0]!, 'count')
      },
      async upsert(state) {
        await database.write(putState, stateParams(state))
      },
    },
    reviews: {
      async append(review) {
        await database.write(putReview, reviewParams(review))
      },
      async list(deckId, contentRef) {
        const rows = await database.read(
          'SELECT * FROM reviews WHERE user_id = ? AND (? IS NULL OR deck_id = ?) AND (? IS NULL OR content_ref = ?) ORDER BY at',
          [
            userId,
            deckId ?? null,
            deckId ?? null,
            contentRef ?? null,
            contentRef ?? null,
          ],
        )
        return rows.map((row) => ({
          id: text(row, 'id'),
          deckId: text(row, 'deck_id'),
          contentRef: text(row, 'content_ref'),
          at: numberValue(row, 'at'),
          grade: text(row, 'grade') as Grade,
          levelBefore: level(numberValue(row, 'level_before')),
          levelAfter: level(numberValue(row, 'level_after')),
          intervalBefore: numberValue(row, 'interval_before'),
          elapsedDays: numberValue(row, 'elapsed_days'),
          responseMs: numberValue(row, 'response_ms'),
          source: text(row, 'source') as ReviewSource,
          deviceId: text(row, 'device_id'),
        }))
      },
    },
    sessions: {
      async start(session) {
        await database.write(
          'INSERT INTO sessions(id, user_id, deck_id, started_at, ended_at) VALUES (?, ?, ?, ?, ?)',
          [
            session.id,
            userId,
            session.deckId,
            session.startedAt,
            session.endedAt,
          ],
        )
      },
      async end(id, endedAt) {
        await database.write(
          'UPDATE sessions SET ended_at = ? WHERE id = ? AND user_id = ?',
          [endedAt, id, userId],
        )
      },
      async list(deckId) {
        const rows = await database.read(
          'SELECT id, deck_id, started_at, ended_at FROM sessions WHERE user_id = ? AND (? IS NULL OR deck_id = ?) ORDER BY started_at',
          [userId, deckId ?? null, deckId ?? null],
        )
        return rows.map((row) => ({
          id: text(row, 'id'),
          deckId: text(row, 'deck_id'),
          startedAt: numberValue(row, 'started_at'),
          endedAt: nullableNumber(row, 'ended_at'),
        }))
      },
    },
    settings: {
      async set(setting) {
        await database.write(
          'INSERT INTO settings(user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at',
          [userId, setting.key, setting.value, setting.updatedAt],
        )
      },
      async get(key) {
        const row = (
          await database.read(
            'SELECT key, value, updated_at FROM settings WHERE user_id = ? AND key = ?',
            [userId, key],
          )
        )[0]
        return row
          ? {
              key: text(row, 'key'),
              value: text(row, 'value'),
              updatedAt: numberValue(row, 'updated_at'),
            }
          : undefined
      },
      async list() {
        return (
          await database.read(
            'SELECT key, value, updated_at FROM settings WHERE user_id = ? ORDER BY key',
            [userId],
          )
        ).map((row) => ({
          key: text(row, 'key'),
          value: text(row, 'value'),
          updatedAt: numberValue(row, 'updated_at'),
        }))
      },
    },
    annotations: {
      async get(deckId, contentRef) {
        const row = (
          await database.read(
            'SELECT deck_id, content_ref, note, tags_json, updated_at, updated_by FROM sticky_annotations WHERE user_id = ? AND deck_id = ? AND content_ref = ?',
            [userId, deckId, contentRef],
          )
        )[0]
        if (!row) return undefined
        return {
          deckId: text(row, 'deck_id'),
          contentRef: text(row, 'content_ref'),
          note: text(row, 'note'),
          tags: annotationTags(row),
          updatedAt: numberValue(row, 'updated_at'),
          updatedBy: text(row, 'updated_by'),
        }
      },
      async list() {
        const rows = await database.read(
          'SELECT deck_id, content_ref, note, tags_json, updated_at, updated_by FROM sticky_annotations WHERE user_id = ? ORDER BY deck_id, content_ref',
          [userId],
        )
        return rows.map((row) => ({
          deckId: text(row, 'deck_id'),
          contentRef: text(row, 'content_ref'),
          note: text(row, 'note'),
          tags: annotationTags(row),
          updatedAt: numberValue(row, 'updated_at'),
          updatedBy: text(row, 'updated_by'),
        }))
      },
      async upsert(annotation, mutation) {
        await database.transaction([
          {
            sql: putAnnotation,
            parameters: [
              userId,
              annotation.deckId,
              annotation.contentRef,
              annotation.note,
              JSON.stringify(annotation.tags),
              annotation.updatedAt,
              annotation.updatedBy,
            ],
          },
          {
            sql: putOutbox,
            parameters: [
              mutation.id,
              userId,
              mutation.mutType,
              mutation.payload,
              mutation.createdAt,
              mutation.attempts,
            ],
          },
        ])
      },
    },
    dailyStats: {
      async get(day) {
        const row = (
          await database.read(
            'SELECT day, reviews, correct, again, updated_at FROM daily_stats WHERE user_id = ? AND day = ?',
            [userId, day],
          )
        )[0]
        return row
          ? {
              day: text(row, 'day'),
              reviews: numberValue(row, 'reviews'),
              correct: numberValue(row, 'correct'),
              again: numberValue(row, 'again'),
              updatedAt: numberValue(row, 'updated_at'),
            }
          : undefined
      },
      async list() {
        const rows = await database.read(
          'SELECT day, reviews, correct, again, updated_at FROM daily_stats WHERE user_id = ? ORDER BY updated_at, day',
          [userId],
        )
        return rows.map((row) => ({
          day: text(row, 'day'),
          reviews: numberValue(row, 'reviews'),
          correct: numberValue(row, 'correct'),
          again: numberValue(row, 'again'),
          updatedAt: numberValue(row, 'updated_at'),
        }))
      },
    },
    outbox: {
      async pending() {
        return (
          await database.read(
            'SELECT id, mut_type, payload, created_at, attempts FROM outbox WHERE user_id = ? ORDER BY created_at',
            [userId],
          )
        ).map((row) => ({
          id: text(row, 'id'),
          mutType: text(row, 'mut_type') as OutboxMutation['mutType'],
          payload: text(row, 'payload'),
          createdAt: numberValue(row, 'created_at'),
          attempts: numberValue(row, 'attempts'),
        }))
      },
      async markAttempt(id) {
        await database.write(
          'UPDATE outbox SET attempts = attempts + 1 WHERE id = ? AND user_id = ?',
          [id, userId],
        )
      },
      async remove(id) {
        await database.write(
          'DELETE FROM outbox WHERE id = ? AND user_id = ?',
          [id, userId],
        )
      },
    },
    async recordGrade({ review, nextState, day, mutation }) {
      if (review.id !== mutation.id)
        throw new Error('A review mutation id must equal its review id.')
      await database.transaction([
        { sql: putReview, parameters: reviewParams(review) },
        { sql: putState, parameters: stateParams(nextState) },
        {
          sql: 'INSERT INTO daily_stats(user_id, day, reviews, correct, again, updated_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET reviews=reviews+1, correct=correct+excluded.correct, again=again+excluded.again, updated_at=excluded.updated_at',
          parameters: [
            userId,
            day,
            review.grade === 'again' ? 0 : 1,
            review.grade === 'again' ? 1 : 0,
            review.at,
          ],
        },
        {
          sql: 'INSERT INTO outbox(id, user_id, mut_type, payload, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
          parameters: [
            mutation.id,
            userId,
            mutation.mutType,
            mutation.payload,
            mutation.createdAt,
            mutation.attempts,
          ],
        },
      ])
    },
    async recordCardState({ state, mutation }) {
      await this.recordCardStates([{ state, mutation }])
    },
    async recordCardStates(inputs) {
      if (inputs.length === 0) return
      await database.transaction(
        inputs.flatMap(({ state, mutation }) => [
          { sql: putState, parameters: stateParams(state) },
          {
            sql: putOutbox,
            parameters: [
              mutation.id,
              userId,
              mutation.mutType,
              mutation.payload,
              mutation.createdAt,
              mutation.attempts,
            ],
          },
        ]),
      )
    },
    async resetStatistics({ deckId, states }) {
      await database.transaction([
        {
          sql: 'DELETE FROM reviews WHERE user_id = ? AND deck_id = ?',
          parameters: [userId, deckId],
        },
        {
          sql: 'DELETE FROM outbox WHERE user_id = ? AND mut_type = ? AND payload LIKE ?',
          parameters: [userId, 'review.append', `%\"deckId\":\"${deckId}\"%`],
        },
        {
          sql: 'DELETE FROM sessions WHERE user_id = ? AND deck_id = ?',
          parameters: [userId, deckId],
        },
        {
          // daily_stats is currently the local aggregate for the app's active study deck.
          sql: 'DELETE FROM daily_stats WHERE user_id = ?',
          parameters: [userId],
        },
        ...states.flatMap(({ state, mutation }) => [
          { sql: putState, parameters: stateParams(state) },
          {
            sql: putOutbox,
            parameters: [
              mutation.id,
              userId,
              mutation.mutType,
              mutation.payload,
              mutation.createdAt,
              mutation.attempts,
            ],
          },
        ]),
      ])
    },
    async recordDeck({ deck, mutation }) {
      await database.transaction([
        {
          sql: putDeck,
          parameters: [
            deck.id,
            userId,
            deck.name,
            deck.kind,
            deck.definitionId,
            deck.updatedAt,
          ],
        },
        {
          sql: putOutbox,
          parameters: [
            mutation.id,
            userId,
            mutation.mutType,
            mutation.payload,
            mutation.createdAt,
            mutation.attempts,
          ],
        },
      ])
    },
    async deleteDeck({ deckId, mutation }) {
      if (deckId === 'dev-kanji')
        throw new Error('The built-in starter deck cannot be deleted.')
      if (mutation.mutType !== 'deck.delete')
        throw new Error('Deck deletion must use the deck.delete mutation.')
      await database.transaction([
        {
          sql: 'DELETE FROM outbox WHERE user_id = ? AND payload LIKE ?',
          parameters: [userId, `%\"deckId\":\"${deckId}\"%`],
        },
        {
          sql: 'DELETE FROM deck_membership WHERE user_id = ? AND deck_id = ?',
          parameters: [userId, deckId],
        },
        {
          sql: 'DELETE FROM card_states WHERE deck_id = ?',
          parameters: [deckId],
        },
        {
          sql: 'DELETE FROM reviews WHERE user_id = ? AND deck_id = ?',
          parameters: [userId, deckId],
        },
        {
          sql: 'DELETE FROM sessions WHERE user_id = ? AND deck_id = ?',
          parameters: [userId, deckId],
        },
        {
          sql: 'DELETE FROM sticky_annotations WHERE user_id = ? AND deck_id = ?',
          parameters: [userId, deckId],
        },
        {
          sql: 'DELETE FROM settings WHERE user_id = ? AND key = ?',
          parameters: [userId, `deck-folder:${deckId}`],
        },
        {
          sql: 'DELETE FROM decks WHERE user_id = ? AND id = ?',
          parameters: [userId, deckId],
        },
        {
          sql: putOutbox,
          parameters: [
            mutation.id,
            userId,
            mutation.mutType,
            mutation.payload,
            mutation.createdAt,
            mutation.attempts,
          ],
        },
      ])
    },
    async recordManualOverride(input) {
      await persistManualOverrides([input])
    },
    async recordManualOverrides(inputs) {
      await persistManualOverrides(inputs)
    },
    async recordDeckMembership({ deck, membership, mutation }) {
      if (deck.kind === 'derived')
        throw new Error('Derived decks cannot receive custom memberships.')
      if (membership.deckId !== deck.id)
        throw new Error('Deck memberships must belong to their deck.')
      await database.transaction([
        {
          sql: putDeck,
          parameters: [
            deck.id,
            userId,
            deck.name,
            deck.kind,
            deck.definitionId,
            deck.updatedAt,
          ],
        },
        {
          sql: putMembership,
          parameters: [
            userId,
            membership.deckId,
            membership.contentRef,
            membership.sortOrder,
            membership.addedAt,
            membership.updatedAt,
          ],
        },
        {
          sql: 'INSERT INTO outbox(id, user_id, mut_type, payload, created_at, attempts) VALUES (?, ?, ?, ?, ?, ?)',
          parameters: [
            mutation.id,
            userId,
            mutation.mutType,
            mutation.payload,
            mutation.createdAt,
            mutation.attempts,
          ],
        },
      ])
    },
    async recordDeckMemberships({ deck, deckMutation, memberships }) {
      if (deck.kind === 'derived')
        throw new Error('Derived decks cannot receive custom memberships.')
      if (deckMutation.mutType !== 'deck.upsert')
        throw new Error('Custom deck creation must use a deck.upsert mutation.')
      for (const { membership, mutation } of memberships) {
        if (membership.deckId !== deck.id)
          throw new Error('Deck memberships must belong to their deck.')
        if (mutation.mutType !== 'deckMembership.upsert')
          throw new Error(
            'Deck membership mutations must use deckMembership.upsert.',
          )
      }
      await database.transaction([
        {
          sql: putDeck,
          parameters: [
            deck.id,
            userId,
            deck.name,
            deck.kind,
            deck.definitionId,
            deck.updatedAt,
          ],
        },
        {
          sql: putOutbox,
          parameters: [
            deckMutation.id,
            userId,
            deckMutation.mutType,
            deckMutation.payload,
            deckMutation.createdAt,
            deckMutation.attempts,
          ],
        },
        ...memberships.flatMap(({ membership, mutation }) => [
          {
            sql: putMembership,
            parameters: [
              userId,
              membership.deckId,
              membership.contentRef,
              membership.sortOrder,
              membership.addedAt,
              membership.updatedAt,
            ],
          },
          {
            sql: putOutbox,
            parameters: [
              mutation.id,
              userId,
              mutation.mutType,
              mutation.payload,
              mutation.createdAt,
              mutation.attempts,
            ],
          },
        ]),
      ])
    },
    async restoreBackup({
      decks,
      settings,
      deckMembership,
      reviews,
      annotations = [],
    }) {
      const existingReviews = await this.reviews.list()
      const mergedReviews = new Map<string, Review>()
      for (const review of existingReviews) mergedReviews.set(review.id, review)
      for (const review of reviews) mergedReviews.set(review.id, review)
      const projectedStates = replay(
        [...mergedReviews.values()].map((review) => ({
          ...review,
          stickyId: review.contentRef,
        })),
        { config: DEFAULT_SRS_CONFIG },
      )
      const statements = [
        ...decks.map((deck) => ({
          sql: 'INSERT INTO decks(id, user_id, name, kind, definition_id, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind, definition_id=excluded.definition_id, updated_at=excluded.updated_at WHERE excluded.updated_at >= decks.updated_at',
          parameters: [
            deck.id,
            userId,
            deck.name,
            deck.kind,
            deck.definitionId,
            deck.updatedAt,
          ] as readonly SqlValue[],
        })),
        ...settings.map((setting) => ({
          sql: 'INSERT INTO settings(user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at WHERE excluded.updated_at >= settings.updated_at',
          parameters: [
            userId,
            setting.key,
            setting.value,
            setting.updatedAt,
          ] as readonly SqlValue[],
        })),
        ...deckMembership.map((membership) => ({
          sql: 'INSERT INTO deck_membership(user_id, deck_id, content_ref, sort_order, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(deck_id, content_ref) DO UPDATE SET sort_order=excluded.sort_order, added_at=excluded.added_at, updated_at=excluded.updated_at WHERE excluded.updated_at >= deck_membership.updated_at',
          parameters: [
            userId,
            membership.deckId,
            membership.contentRef,
            membership.sortOrder,
            membership.addedAt,
            membership.updatedAt,
          ] as readonly SqlValue[],
        })),
        ...reviews.map((review) => ({
          sql: putReview.replace('INSERT INTO', 'INSERT OR IGNORE INTO'),
          parameters: reviewParams(review),
        })),
        ...annotations.map((annotation) => ({
          sql: `${putAnnotation} WHERE excluded.updated_at >= sticky_annotations.updated_at`,
          parameters: [
            userId,
            annotation.deckId,
            annotation.contentRef,
            annotation.note,
            JSON.stringify(annotation.tags),
            annotation.updatedAt,
            annotation.updatedBy,
          ] as readonly SqlValue[],
        })),
        ...[...projectedStates.values()].map((state) => ({
          sql: putState,
          parameters: stateParams({
            ...state,
            contentRef: state.stickyId,
          }),
        })),
      ]
      await database.transaction(statements)
    },
  }
}
