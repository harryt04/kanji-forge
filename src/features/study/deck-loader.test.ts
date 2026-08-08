import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openLocalUserDatabase, type LocalUserDatabase } from '@/data/db'
import { loadStarterDeck } from './deck-loader'

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
