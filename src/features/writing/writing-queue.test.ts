import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openLocalUserDatabase, type LocalUserDatabase } from '@/data/db'
import { findDictionaryEntry } from '@/data/packs'
import { loadWritingQueue } from './writing-queue'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/packs/decks/')) {
      try {
        return new Response(
          readFileSync(join(process.cwd(), url.slice(1)), 'utf8'),
          { status: 200 },
        )
      } catch {
        return new Response('not found', { status: 404 })
      }
    }
    const path = url.replace(/^\/packs-dev\//, '')
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
  vi.stubGlobal('fetch', fixtureFetch())
})
afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

async function freshDatabase(): Promise<LocalUserDatabase> {
  const database = openLocalUserDatabase('writing-queue-test-user')
  databases.push(database)
  await database.ready
  return database
}

describe('loadWritingQueue', () => {
  it('returns every kanji in a built-in deck, not just one', async () => {
    const database = await freshDatabase()
    const queue = await loadWritingQueue(database, 'jlpt-kanji-n5')

    expect(queue.deckId).toBe('jlpt-kanji-n5')
    expect(queue.entries.length).toBeGreaterThan(1)
    expect(queue.entries.map((entry) => entry.literal)).toContain('日')
    for (const entry of queue.entries) {
      expect(entry.contentRef).toBe(`kanji:${entry.literal}`)
    }
  })

  it('deduplicates literals while keeping the first occurrence', async () => {
    const database = await freshDatabase()
    const queue = await loadWritingQueue(database, 'jlpt-kanji-n5')
    const literals = queue.entries.map((entry) => entry.literal)
    expect(new Set(literals).size).toBe(literals.length)
  })

  it('expands word decks into their constituent kanji, dropping kana', async () => {
    const database = await freshDatabase()
    const repo = (await import('@/data/repo')).createUserRepositories(database)
    const entry = await findDictionaryEntry('お金')
    if (!entry || entry.type !== 'word') throw new Error('word fixture missing')
    const wordRef = `word:${entry.record.id}`
    const deck = {
      id: 'custom-word-writing',
      name: 'Word deck',
      kind: 'custom' as const,
      definitionId: null,
      updatedAt: 1,
    }
    await repo.recordDeckMemberships({
      deck,
      deckMutation: {
        id: 'custom-word-writing-deck',
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
          id: `custom-word-writing-${sortOrder}`,
          mutType: 'deckMembership.upsert' as const,
          payload: JSON.stringify({ deckId: deck.id, contentRef }),
          createdAt: 1,
          attempts: 0,
        },
      })),
    })

    const queue = await loadWritingQueue(database, deck.id)
    // お金 (okane) is kana + 金 (kanji); only the kanji should surface.
    expect(queue.entries).toEqual([{ contentRef: 'kanji:金', literal: '金' }])
  })

  it('throws for an unknown deck id', async () => {
    const database = await freshDatabase()
    await expect(loadWritingQueue(database, 'no-such-deck')).rejects.toThrow(
      'Unknown deck definition',
    )
  })
})
