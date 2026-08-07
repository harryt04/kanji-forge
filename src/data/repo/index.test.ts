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
