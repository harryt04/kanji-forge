import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openLocalUserDatabase, type LocalUserDatabase } from '@/data/db'
import { findDictionaryEntry } from '@/data/packs'
import { loadDeck, loadStarterDeck } from './deck-loader'

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

const databases: LocalUserDatabase[] = []
beforeEach(() => {
  // `data/packs` caches deck definitions and the pack handle process-wide by design,
  // so fetch counts below are deltas within a test, not global totals.
  vi.stubGlobal('fetch', fixtureFetch())
})
afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

async function freshDatabase(): Promise<LocalUserDatabase> {
  const database = openLocalUserDatabase('deck-loader-test-user')
  databases.push(database)
  await database.ready
  return database
}

describe('loadStarterDeck', () => {
  it('lazily registers the deck on first load and loads kanji content', async () => {
    const database = await freshDatabase()
    const loaded = await loadStarterDeck(database, 'dev-kanji')

    expect(loaded.deckId).toBe('dev-kanji')
    expect(loaded.name).toBe('Development Kanji')
    expect(loaded.cards.length).toBeGreaterThan(0)
    expect(loaded.content.get('kanji:日')).toMatchObject({ literal: '日' })
  })

  it('does not re-register the deck on a second load', async () => {
    const database = await freshDatabase()
    await loadStarterDeck(database, 'dev-kanji')
    const fetchesAfterFirst = vi.mocked(fetch).mock.calls.length
    await loadStarterDeck(database, 'dev-kanji')
    // Deck definitions and the kanji pack are process-cached; a second load must not
    // re-fetch them, and must not error on the already-registered deck row.
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchesAfterFirst)
  })

  it('uses a locally renamed deck in the loaded deck projection', async () => {
    const database = await freshDatabase()
    const repo = (await import('@/data/repo')).createUserRepositories(database)
    await repo.decks.upsert({
      id: 'dev-kanji',
      name: 'N5 commute deck',
      kind: 'derived',
      definitionId: 'dev-kanji',
      updatedAt: Date.now(),
    })

    await expect(loadStarterDeck(database, 'dev-kanji')).resolves.toMatchObject(
      {
        name: 'N5 commute deck',
      },
    )
  })

  it('throws for an unknown deck definition id', async () => {
    const database = await freshDatabase()
    await expect(loadStarterDeck(database, 'no-such-deck')).rejects.toThrow(
      'Unknown deck definition',
    )
  })

  it('skips content refs whose kanji record is missing from the pack', async () => {
    const database = await freshDatabase()
    const loaded = await loadStarterDeck(database, 'dev-kanji')
    // Every content ref not resolvable in the pack is simply absent from `content`,
    // rather than throwing — the loader tolerates partial packs.
    for (const [ref, card] of loaded.content) {
      expect(ref.startsWith('kanji:')).toBe(true)
      expect(card.literal.length).toBeGreaterThan(0)
    }
  })
})

describe('loadDeck', () => {
  it('loads kanji memberships from a user-owned custom deck', async () => {
    const database = await freshDatabase()
    const repo = (await import('@/data/repo')).createUserRepositories(database)
    const deck = {
      id: 'custom-travel',
      name: 'Travel kanji',
      kind: 'custom' as const,
      definitionId: null,
      updatedAt: 1,
    }
    await repo.recordDeckMembership({
      deck,
      membership: {
        deckId: deck.id,
        contentRef: 'kanji:日',
        sortOrder: 0,
        addedAt: 1,
        updatedAt: 1,
      },
      mutation: {
        id: 'custom-membership',
        mutType: 'deckMembership.upsert',
        payload: JSON.stringify({ deckId: deck.id, contentRef: 'kanji:日' }),
        createdAt: 1,
        attempts: 0,
      },
    })

    const loaded = await loadDeck(database, deck.id)
    expect(loaded).toMatchObject({
      deckId: deck.id,
      name: deck.name,
      cards: [{ deckId: deck.id, contentRef: 'kanji:日' }],
    })
    expect(loaded.content.get('kanji:日')).toMatchObject({ literal: '日' })
  })

  it('loads dictionary words into custom decks as study cards', async () => {
    const database = await freshDatabase()
    const repo = (await import('@/data/repo')).createUserRepositories(database)
    const entry = await findDictionaryEntry('お金')
    if (!entry || entry.type !== 'word') throw new Error('word fixture missing')
    const wordRef = `word:${entry.record.id}`
    const deck = {
      id: 'custom-word',
      name: 'Word deck',
      kind: 'custom' as const,
      definitionId: null,
      updatedAt: 1,
    }
    await repo.recordDeckMemberships({
      deck,
      deckMutation: {
        id: 'custom-word-deck',
        mutType: 'deck.upsert',
        payload: JSON.stringify(deck),
        createdAt: 1,
        attempts: 0,
      },
      memberships: [wordRef].map((contentRef, sortOrder) => ({
        membership: {
          deckId: deck.id,
          contentRef,
          sortOrder,
          addedAt: 1,
          updatedAt: 1,
        },
        mutation: {
          id: `custom-word-${sortOrder}`,
          mutType: 'deckMembership.upsert' as const,
          payload: JSON.stringify({ deckId: deck.id, contentRef }),
          createdAt: 1,
          attempts: 0,
        },
      })),
    })

    const loaded = await loadDeck(database, deck.id)
    expect(loaded.cards.map((card) => card.contentRef)).toEqual([wordRef])
    expect(loaded.content.get(wordRef)).toMatchObject({
      contentType: 'word',
      literal: 'お金',
      readings: expect.arrayContaining(['おかね']),
    })
  })
})
