import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { progress } from '@/core/srs/goal'
import { emptyCardState } from '@/core/srs/types'
import { createUserRepositories, type CardState } from '@/data/repo'
import { toCoreState } from '@/features/study/adapters'
import {
  countCardsByLevel,
  loadDeckSummaries,
  summarizeDeckCards,
} from './deck-summary'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/packs-dev\//, '')
    try {
      const buffer = readFileSync(join(FIXTURE_ROOT, path))
      const body = path.endsWith('.json')
        ? buffer.toString('utf8')
        : new Uint8Array(buffer)
      return new Response(body as BodyInit, { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }) as unknown as typeof fetch
}

function cardState(contentRef: string, level: CardState['level']): CardState {
  return {
    deckId: 'test-deck',
    contentRef,
    level,
    dueAt: null,
    lastReviewedAt: null,
    correctStreak: 0,
    totalReviews: 0,
    totalCorrect: 0,
    lapses: 0,
    flagged: false,
    manualOverride: false,
    updatedAt: 0,
    updatedBy: 'test',
  }
}

describe('countCardsByLevel', () => {
  it('counts an untouched card (no saved state) as level 0', () => {
    const counts = countCardsByLevel([
      { state: undefined },
      { state: cardState('a', 2) },
      { state: cardState('b', 2) },
    ])
    expect(counts).toEqual([1, 0, 2, 0, 0])
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(3)
  })

  it('sums to the input length regardless of level distribution', () => {
    const cards = [
      { state: undefined },
      { state: cardState('a', 0) },
      { state: cardState('b', 1) },
      { state: cardState('c', 4) },
    ]
    const counts = countCardsByLevel(cards)
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(cards.length)
  })
})

describe('summarizeDeckCards', () => {
  const baseInput = {
    deck: {
      id: 'dev-kanji',
      name: 'Development Kanji',
      kind: 'derived' as const,
    },
    userId: 'user-1',
  }

  it('buckets cards by level and computes progress from the same states', () => {
    const contentRefs = ['kanji:a', 'kanji:b', 'kanji:c', 'kanji:d']
    const states = [
      cardState('kanji:a', 0),
      cardState('kanji:b', 2),
      cardState('kanji:c', 4),
      // kanji:d has no state row — untouched, counts as level 0
    ]

    const summary = summarizeDeckCards({ ...baseInput, contentRefs, states })

    expect(summary.levelCounts).toEqual([2, 0, 1, 0, 1])
    expect(summary.cardCount).toBe(4)

    const coreStates = contentRefs.map((contentRef) => {
      const state = states.find((s) => s.contentRef === contentRef)
      return state
        ? toCoreState(state)
        : emptyCardState('dev-kanji', contentRef, 'user-1')
    })
    expect(summary.progressPercent).toBe(
      Math.round(progress(contentRefs.length, coreStates) * 100),
    )
  })

  it('ignores a state row whose contentRef the deck no longer references', () => {
    const contentRefs = ['kanji:a', 'kanji:b']
    const states = [
      cardState('kanji:a', 3),
      cardState('kanji:stale-removed-from-deck', 4),
    ]

    const summary = summarizeDeckCards({ ...baseInput, contentRefs, states })

    expect(summary.cardCount).toBe(2)
    expect(summary.levelCounts).toEqual([1, 0, 0, 1, 0])
  })

  it('takes the later of last review and last session as lastStudiedAt', () => {
    const contentRefs = ['kanji:a']
    const states = [{ ...cardState('kanji:a', 1), lastReviewedAt: 1000 }]

    expect(
      summarizeDeckCards({
        ...baseInput,
        contentRefs,
        states,
        lastSessionAt: 2000,
      }).lastStudiedAt,
    ).toBe(2000)
    expect(
      summarizeDeckCards({
        ...baseInput,
        contentRefs,
        states,
        lastSessionAt: 500,
      }).lastStudiedAt,
    ).toBe(1000)
    expect(
      summarizeDeckCards({ ...baseInput, contentRefs, states }).lastStudiedAt,
    ).toBe(1000)
  })

  it('defaults folder to an empty string when not provided', () => {
    const summary = summarizeDeckCards({
      ...baseInput,
      contentRefs: [],
      states: [],
    })
    expect(summary.folder).toBe('')
  })
})

describe('loadDeckSummaries', () => {
  let userId = 0

  beforeEach(() => {
    vi.stubGlobal('fetch', fixtureFetch())
    userId += 1
  })

  afterEach(() => {
    clearUserRuntime()
  })

  it('summarizes every built-in and custom deck without a per-card query', async () => {
    const runtime = bootstrapUserRuntime(`deck-summaries-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.decks.upsert({
      id: 'my-custom-deck',
      name: 'My Custom Deck',
      kind: 'custom',
      definitionId: null,
      updatedAt: Date.now(),
    })
    await repo.deckMembership.save({
      deckId: 'my-custom-deck',
      contentRef: 'kanji:日',
      sortOrder: 0,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    })

    const originalRead = runtime.database.read.bind(runtime.database)
    const calls: string[] = []
    Object.assign(runtime.database, {
      read: async (sql: string, parameters?: readonly unknown[]) => {
        calls.push(sql)
        return originalRead(sql, parameters as never)
      },
    })

    const summaries = await loadDeckSummaries(runtime.database, runtime.userId)

    expect(summaries.builtIn.length).toBeGreaterThan(0)
    expect(summaries.custom).toEqual([
      expect.objectContaining({ id: 'my-custom-deck', cardCount: 1 }),
    ])

    const perCardQueries = calls.filter(
      (sql) =>
        sql ===
        'SELECT * FROM card_states WHERE deck_id = ? AND content_ref = ?',
    )
    expect(perCardQueries).toHaveLength(0)
    expect(calls.length).toBeLessThan(20)
  })

  it('groups a custom deck under its saved folder setting', async () => {
    const runtime = bootstrapUserRuntime(`deck-summaries-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.decks.upsert({
      id: 'my-custom-deck',
      name: 'My Custom Deck',
      kind: 'custom',
      definitionId: null,
      updatedAt: Date.now(),
    })
    await repo.settings.set({
      key: 'deck-folder:my-custom-deck',
      value: 'JLPT prep',
      updatedAt: Date.now(),
    })

    const summaries = await loadDeckSummaries(runtime.database, runtime.userId)
    expect(summaries.custom[0]).toMatchObject({ folder: 'JLPT prep' })
  })

  it('omits session lookups unless includeSessions is requested', async () => {
    const runtime = bootstrapUserRuntime(`deck-summaries-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.sessions.start({
      id: 's1',
      deckId: 'dev-kanji',
      startedAt: 1000,
      endedAt: null,
    })
    await repo.sessions.end('s1', 2000)

    const withoutSessions = await loadDeckSummaries(
      runtime.database,
      runtime.userId,
    )
    const devKanjiWithout = withoutSessions.builtIn.find(
      (summary) => summary.id === 'dev-kanji',
    )
    expect(devKanjiWithout?.lastStudiedAt).toBeNull()

    const withSessions = await loadDeckSummaries(
      runtime.database,
      runtime.userId,
      {
        includeSessions: true,
      },
    )
    const devKanjiWith = withSessions.builtIn.find(
      (summary) => summary.id === 'dev-kanji',
    )
    expect(devKanjiWith?.lastStudiedAt).toBe(2000)
  })
})
