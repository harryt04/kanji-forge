import { afterEach, describe, expect, it } from 'vitest'
import { openLocalUserDatabase, type LocalUserDatabase } from '@/data/db'
import {
  repoCardState as state,
  repoReview as review,
} from '../../../test/factories'
import { createUserRepositories, type Deck } from '.'

const databases: LocalUserDatabase[] = []
afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

async function freshRepo(userId = 'learner-1') {
  const database = openLocalUserDatabase(userId)
  databases.push(database)
  await database.ready
  return createUserRepositories(database)
}

describe('derived deck state projection', () => {
  it('has no per-card rows before a grade and creates exactly one on first grade', async () => {
    const repos = await freshRepo()
    await repos.decks.upsert({
      id: 'jlpt-n5',
      name: 'JLPT N5',
      kind: 'derived',
      definitionId: 'jlpt-kanji-n5',
      updatedAt: 1,
    })

    const source = { contentRefsFor: () => ['kanji:未', 'kanji:日'] }
    expect(await repos.cardStates.count('jlpt-n5')).toBe(0)
    expect(
      (await repos.decks.listCards('jlpt-n5', source)).map(
        (card) => card.state,
      ),
    ).toEqual([undefined, undefined])

    const nextState = state()
    const firstReview = review()
    await repos.recordGrade({
      review: firstReview,
      nextState,
      day: '2023-11-14',
      mutation: {
        id: firstReview.id,
        mutType: 'review.append',
        payload: JSON.stringify(firstReview),
        createdAt: firstReview.at,
        attempts: 0,
      },
    })

    expect(await repos.cardStates.count('jlpt-n5')).toBe(1)
    expect(await repos.cardStates.get('jlpt-n5', 'kanji:未')).toEqual(nextState)
    expect(
      (await repos.decks.listCards('jlpt-n5', source)).filter(
        (card) => card.state !== undefined,
      ),
    ).toHaveLength(1)
  })

  it('lists card states and persists a batch with matching outbox mutations', async () => {
    const repos = await freshRepo()
    const first = state({ deckId: 'jlpt-n5', contentRef: 'kanji:未' })
    const second = state({
      deckId: 'jlpt-n5',
      contentRef: 'kanji:日',
      level: 2,
    })
    await repos.cardStates.upsert(first)
    await repos.cardStates.upsert(second)

    const resetFirst = { ...first, level: 0 as const, dueAt: null }
    const resetSecond = { ...second, level: 0 as const, dueAt: null }
    await repos.recordCardStates([
      {
        state: resetFirst,
        mutation: {
          id: 'reset-first',
          mutType: 'cardState.upsert',
          payload: '{}',
          createdAt: 1,
          attempts: 0,
        },
      },
      {
        state: resetSecond,
        mutation: {
          id: 'reset-second',
          mutType: 'cardState.upsert',
          payload: '{}',
          createdAt: 1,
          attempts: 0,
        },
      },
    ])

    expect(await repos.cardStates.list('jlpt-n5')).toEqual([
      resetSecond,
      resetFirst,
    ])
    expect(
      (await repos.outbox.pending()).map((mutation) => mutation.id),
    ).toEqual(['reset-first', 'reset-second'])
  })
})

describe('recordGrade atomicity', () => {
  it('rejects a mismatched review/mutation id before writing anything', async () => {
    const repos = await freshRepo()
    const firstReview = review()
    await expect(
      repos.recordGrade({
        review: firstReview,
        nextState: state(),
        day: '2023-11-14',
        mutation: {
          id: 'not-the-review-id',
          mutType: 'review.append',
          payload: '{}',
          createdAt: firstReview.at,
          attempts: 0,
        },
      }),
    ).rejects.toThrow('must equal its review id')
    expect(await repos.reviews.list()).toEqual([])
    expect(await repos.cardStates.count()).toBe(0)
    expect(await repos.outbox.pending()).toEqual([])
  })

  it('writes the review, card state, daily stat, and outbox row together', async () => {
    const repos = await freshRepo()
    const firstReview = review()
    await repos.recordGrade({
      review: firstReview,
      nextState: state(),
      day: '2023-11-14',
      mutation: {
        id: firstReview.id,
        mutType: 'review.append',
        payload: JSON.stringify(firstReview),
        createdAt: firstReview.at,
        attempts: 0,
      },
    })

    expect(await repos.reviews.list()).toHaveLength(1)
    expect(await repos.cardStates.count()).toBe(1)
    expect(await repos.dailyStats.get('2023-11-14')).toMatchObject({
      reviews: 1,
      correct: 1,
      again: 0,
    })
    const pending = await repos.outbox.pending()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toMatchObject({
      id: firstReview.id,
      mutType: 'review.append',
      attempts: 0,
    })
  })
})

describe('recordCardState atomicity', () => {
  it('resets one deck statistics atomically while preserving flags', async () => {
    const repos = await freshRepo()
    const firstReview = review({ deckId: 'dev-kanji', contentRef: 'kanji:日' })
    const studiedState = state({
      deckId: 'dev-kanji',
      contentRef: 'kanji:日',
      level: 3,
      totalReviews: 4,
      totalCorrect: 3,
      lapses: 1,
      flagged: true,
    })
    await repos.recordGrade({
      review: firstReview,
      nextState: studiedState,
      day: '2023-11-14',
      mutation: {
        id: firstReview.id,
        mutType: 'review.append',
        payload: JSON.stringify(firstReview),
        createdAt: firstReview.at,
        attempts: 0,
      },
    })
    await repos.sessions.start({
      id: 'session-to-reset',
      deckId: 'dev-kanji',
      startedAt: 1,
      endedAt: 2,
    })

    const resetState = {
      ...studiedState,
      level: 0 as const,
      dueAt: null,
      lastReviewedAt: null,
      correctStreak: 0,
      totalReviews: 0,
      totalCorrect: 0,
      lapses: 0,
      manualOverride: false,
      updatedAt: 10,
      updatedBy: 'device-reset',
    }
    await repos.resetStatistics({
      deckId: 'dev-kanji',
      states: [
        {
          state: resetState,
          mutation: {
            id: 'statistics-reset-1',
            mutType: 'cardState.upsert',
            payload: JSON.stringify({ source: 'reset-statistics' }),
            createdAt: 10,
            attempts: 0,
          },
        },
      ],
    })

    await expect(repos.reviews.list('dev-kanji')).resolves.toEqual([])
    await expect(repos.dailyStats.list()).resolves.toEqual([])
    await expect(repos.sessions.list('dev-kanji')).resolves.toEqual([])
    await expect(
      repos.cardStates.get('dev-kanji', 'kanji:日'),
    ).resolves.toMatchObject({
      level: 0,
      dueAt: null,
      lastReviewedAt: null,
      totalReviews: 0,
      totalCorrect: 0,
      lapses: 0,
      flagged: true,
    })
    await expect(repos.outbox.pending()).resolves.toEqual([
      expect.objectContaining({ id: 'statistics-reset-1' }),
    ])
  })

  it('persists deck metadata together with its outbox mutation', async () => {
    const repos = await freshRepo()
    const deck = {
      id: 'dev-kanji',
      name: 'N5 commute deck',
      kind: 'derived' as const,
      definitionId: 'dev-kanji',
      updatedAt: 12,
    }
    await repos.recordDeck({
      deck,
      mutation: {
        id: 'deck-rename-1',
        mutType: 'deck.upsert',
        payload: JSON.stringify(deck),
        createdAt: 12,
        attempts: 0,
      },
    })

    await expect(repos.decks.get('dev-kanji')).resolves.toEqual(deck)
    await expect(repos.outbox.pending()).resolves.toMatchObject([
      { id: 'deck-rename-1', mutType: 'deck.upsert' },
    ])
  })

  it('persists a manual flag change together with its outbox mutation', async () => {
    const repos = await freshRepo()
    const nextState = state({ flagged: true })
    await repos.recordCardState({
      state: nextState,
      mutation: {
        id: 'flag-mutation-1',
        mutType: 'cardState.upsert',
        payload: JSON.stringify({ flagged: true }),
        createdAt: nextState.updatedAt,
        attempts: 0,
      },
    })

    expect(
      await repos.cardStates.get(nextState.deckId, nextState.contentRef),
    ).toEqual(nextState)
    expect(await repos.outbox.pending()).toMatchObject([
      { id: 'flag-mutation-1', mutType: 'cardState.upsert' },
    ])
  })

  it('persists a manual level override without a daily review stat', async () => {
    const repos = await freshRepo()
    const before = state({ level: 1, totalReviews: 4, totalCorrect: 3 })
    const nextState = state({
      ...before,
      level: 4,
      manualOverride: true,
      updatedAt: before.updatedAt + 1,
    })
    const manualReview = review({
      id: 'manual-level-1',
      source: 'manual',
      levelBefore: 1,
      levelAfter: 4,
      grade: 'good',
    })

    await repos.recordManualOverride({
      review: manualReview,
      nextState,
      mutation: {
        id: manualReview.id,
        mutType: 'review.append',
        payload: JSON.stringify(manualReview),
        createdAt: manualReview.at,
        attempts: 0,
      },
    })

    expect(
      await repos.cardStates.get(nextState.deckId, nextState.contentRef),
    ).toEqual(nextState)
    expect(await repos.reviews.list()).toHaveLength(1)
    expect(await repos.dailyStats.list()).toEqual([])
    expect(await repos.outbox.pending()).toMatchObject([
      { id: manualReview.id, mutType: 'review.append' },
    ])
  })

  it('rejects a manual override with a mismatched mutation id', async () => {
    const repos = await freshRepo()
    const manualReview = review({ id: 'manual-level-2', source: 'manual' })

    await expect(
      repos.recordManualOverride({
        review: manualReview,
        nextState: state(),
        mutation: {
          id: 'different-id',
          mutType: 'review.append',
          payload: '{}',
          createdAt: manualReview.at,
          attempts: 0,
        },
      }),
    ).rejects.toThrow('must equal its review id')
    expect(await repos.reviews.list()).toEqual([])
  })

  it('rejects a non-manual review passed to the manual override path', async () => {
    const repos = await freshRepo()
    const studyReview = review({ id: 'manual-level-3', source: 'study' })

    await expect(
      repos.recordManualOverride({
        review: studyReview,
        nextState: state(),
        mutation: {
          id: studyReview.id,
          mutType: 'review.append',
          payload: '{}',
          createdAt: studyReview.at,
          attempts: 0,
        },
      }),
    ).rejects.toThrow('manual source')
    expect(await repos.reviews.list()).toEqual([])
  })
})

describe('outbox lifecycle', () => {
  it('tracks attempts and removal', async () => {
    const repos = await freshRepo()
    const firstReview = review()
    await repos.recordGrade({
      review: firstReview,
      nextState: state(),
      day: '2023-11-14',
      mutation: {
        id: firstReview.id,
        mutType: 'review.append',
        payload: '{}',
        createdAt: firstReview.at,
        attempts: 0,
      },
    })

    await repos.outbox.markAttempt(firstReview.id)
    expect((await repos.outbox.pending())[0]).toMatchObject({ attempts: 1 })

    await repos.outbox.remove(firstReview.id)
    expect(await repos.outbox.pending()).toEqual([])
  })
})

describe('daily-stat rollup', () => {
  it('accumulates reviews, correct, and again counts across multiple grades', async () => {
    const repos = await freshRepo()
    async function grade(id: string, grade: 'again' | 'good') {
      const r = review({ id, grade, at: 1_699_999_000_000 })
      await repos.recordGrade({
        review: r,
        nextState: state({ contentRef: `kanji:${id}` }),
        day: '2023-11-14',
        mutation: {
          id,
          mutType: 'review.append',
          payload: '{}',
          createdAt: r.at,
          attempts: 0,
        },
      })
    }
    await grade('r1', 'good')
    await grade('r2', 'again')
    await grade('r3', 'good')

    expect(await repos.dailyStats.get('2023-11-14')).toMatchObject({
      reviews: 3,
      correct: 2,
      again: 1,
    })
  })

  it('lists all daily stats in stable update order', async () => {
    const repos = await freshRepo()
    const first = review({ id: 'daily-1', at: 1_699_999_000_000 })
    const second = review({ id: 'daily-2', at: 1_700_000_000_000 })
    await repos.recordGrade({
      review: first,
      nextState: state({ contentRef: 'kanji:一' }),
      day: '2023-11-14',
      mutation: {
        id: first.id,
        mutType: 'review.append',
        payload: '{}',
        createdAt: first.at,
        attempts: 0,
      },
    })
    await repos.recordGrade({
      review: second,
      nextState: state({ contentRef: 'kanji:二' }),
      day: '2023-11-15',
      mutation: {
        id: second.id,
        mutType: 'review.append',
        payload: '{}',
        createdAt: second.at,
        attempts: 0,
      },
    })

    expect(await repos.dailyStats.list()).toEqual([
      expect.objectContaining({ day: '2023-11-14', reviews: 1 }),
      expect.objectContaining({ day: '2023-11-15', reviews: 1 }),
    ])
  })
})

describe('session lifecycle', () => {
  it('starts and ends a session', async () => {
    const repos = await freshRepo()
    await repos.sessions.start({
      id: 'session-1',
      deckId: 'jlpt-n5',
      startedAt: 1,
      endedAt: null,
    })
    await repos.sessions.end('session-1', 2)
    expect(await repos.sessions.list()).toEqual([
      {
        id: 'session-1',
        deckId: 'jlpt-n5',
        startedAt: 1,
        endedAt: 2,
      },
    ])
  })

  it('filters sessions by deck while preserving active sessions', async () => {
    const repos = await freshRepo()
    await repos.sessions.start({
      id: 'session-1',
      deckId: 'jlpt-n5',
      startedAt: 1,
      endedAt: null,
    })
    await repos.sessions.start({
      id: 'session-2',
      deckId: 'jlpt-n4',
      startedAt: 2,
      endedAt: 4,
    })

    expect(await repos.sessions.list('jlpt-n5')).toEqual([
      {
        id: 'session-1',
        deckId: 'jlpt-n5',
        startedAt: 1,
        endedAt: null,
      },
    ])
  })
})

describe('settings round-trip', () => {
  it('sets and reads back a setting, with last-write-wins on conflict', async () => {
    const repos = await freshRepo()
    await repos.settings.set({ key: 'theme', value: 'dark', updatedAt: 1 })
    expect(await repos.settings.get('theme')).toEqual({
      key: 'theme',
      value: 'dark',
      updatedAt: 1,
    })
    await repos.settings.set({ key: 'theme', value: 'light', updatedAt: 2 })
    expect(await repos.settings.get('theme')).toEqual({
      key: 'theme',
      value: 'light',
      updatedAt: 2,
    })
  })

  it('returns undefined for a missing setting', async () => {
    const repos = await freshRepo()
    expect(await repos.settings.get('missing')).toBeUndefined()
  })
})

describe('sticky annotations', () => {
  it('round-trips notes and tags with an atomic sync mutation', async () => {
    const repos = await freshRepo()
    const annotation = {
      deckId: 'dev-kanji',
      contentRef: 'kanji:日',
      note: 'Remember the sun radical.',
      tags: ['review', 'radical'],
      updatedAt: 42,
      updatedBy: 'device-1',
    } as const

    await repos.annotations.upsert(annotation, {
      id: 'annotation-1',
      mutType: 'annotation.upsert',
      payload: JSON.stringify(annotation),
      createdAt: 42,
      attempts: 0,
    })

    expect(await repos.annotations.get('dev-kanji', 'kanji:日')).toEqual(
      annotation,
    )
    expect(await repos.annotations.list()).toEqual([annotation])
    expect(await repos.outbox.pending()).toMatchObject([
      { id: 'annotation-1', mutType: 'annotation.upsert' },
    ])
  })
})

describe('deckMembership', () => {
  it('saves, lists in sort order, and removes a saved-deck card', async () => {
    const repos = await freshRepo()
    await repos.deckMembership.save({
      deckId: 'saved',
      contentRef: 'kanji:二',
      sortOrder: 1,
      addedAt: 1,
      updatedAt: 1,
    })
    await repos.deckMembership.save({
      deckId: 'saved',
      contentRef: 'kanji:一',
      sortOrder: 0,
      addedAt: 1,
      updatedAt: 1,
    })

    expect(
      (await repos.deckMembership.list()).map((m) => m.contentRef),
    ).toEqual(['kanji:一', 'kanji:二'])

    await repos.deckMembership.remove('kanji:一')
    expect(
      (await repos.deckMembership.list()).map((m) => m.contentRef),
    ).toEqual(['kanji:二'])
  })

  it('atomically creates the Saved deck, membership, and sync mutation', async () => {
    const repos = await freshRepo()
    await repos.recordDeckMembership({
      deck: {
        id: 'saved',
        name: 'Saved',
        kind: 'saved',
        definitionId: null,
        updatedAt: 10,
      },
      membership: {
        deckId: 'saved',
        contentRef: 'kanji:日',
        sortOrder: 0,
        addedAt: 10,
        updatedAt: 10,
      },
      mutation: {
        id: 'saved-mutation-1',
        mutType: 'deckMembership.upsert',
        payload: '{"contentRef":"kanji:日"}',
        createdAt: 10,
        attempts: 0,
      },
    })

    expect(await repos.decks.get('saved')).toMatchObject({ name: 'Saved' })
    expect(await repos.deckMembership.list()).toMatchObject([
      { contentRef: 'kanji:日' },
    ])
    expect(await repos.outbox.pending()).toMatchObject([
      { id: 'saved-mutation-1', mutType: 'deckMembership.upsert' },
    ])
  })
})

describe('decks', () => {
  it('upserts and reads back a deck, updating on conflict', async () => {
    const repos = await freshRepo()
    const deck: Deck = {
      id: 'saved',
      name: 'My Deck',
      kind: 'saved',
      definitionId: null,
      updatedAt: 1,
    }
    await repos.decks.upsert(deck)
    expect(await repos.decks.get('saved')).toEqual(deck)

    await repos.decks.upsert({ ...deck, name: 'Renamed', updatedAt: 2 })
    expect(await repos.decks.get('saved')).toMatchObject({ name: 'Renamed' })
  })

  it('lists decks for the owning user only', async () => {
    const alice = await freshRepo('alice')
    const bob = await freshRepo('bob')
    await alice.decks.upsert({
      id: 'd1',
      name: 'Alice deck',
      kind: 'saved',
      definitionId: null,
      updatedAt: 1,
    })
    expect(await bob.decks.list()).toEqual([])
    expect((await alice.decks.list()).map((deck) => deck.id)).toEqual(['d1'])
  })

  it('throws when listing cards for an unknown deck', async () => {
    const repos = await freshRepo()
    await expect(
      repos.decks.listCards('missing', { contentRefsFor: () => [] }),
    ).rejects.toThrow('Unknown deck')
  })

  it('lists membership-backed cards for a saved deck', async () => {
    const repos = await freshRepo()
    await repos.decks.upsert({
      id: 'saved',
      name: 'My Deck',
      kind: 'saved',
      definitionId: null,
      updatedAt: 1,
    })
    await repos.deckMembership.save({
      deckId: 'saved',
      contentRef: 'kanji:一',
      sortOrder: 0,
      addedAt: 1,
      updatedAt: 1,
    })
    const cards = await repos.decks.listCards('saved', {
      contentRefsFor: () => [],
    })
    expect(cards.map((card) => card.contentRef)).toEqual(['kanji:一'])
  })
})

describe('reviews.list filtering', () => {
  it('filters by deckId and contentRef independently', async () => {
    const repos = await freshRepo()
    async function record(id: string, deckId: string, contentRef: string) {
      const r = review({ id, deckId, contentRef, at: Number(id) })
      await repos.recordGrade({
        review: r,
        nextState: state({ deckId, contentRef }),
        day: '2023-11-14',
        mutation: {
          id,
          mutType: 'review.append',
          payload: '{}',
          createdAt: r.at,
          attempts: 0,
        },
      })
    }
    await record('1', 'deck-a', 'kanji:一')
    await record('2', 'deck-a', 'kanji:二')
    await record('3', 'deck-b', 'kanji:一')

    expect(
      (await repos.reviews.list('deck-a')).map((r) => r.id).sort(),
    ).toEqual(['1', '2'])
    expect(
      (await repos.reviews.list(undefined, 'kanji:一')).map((r) => r.id).sort(),
    ).toEqual(['1', '3'])
    expect(await repos.reviews.list('deck-a', 'kanji:一')).toHaveLength(1)
    expect(await repos.reviews.list()).toHaveLength(3)
  })
})
