import { describe, expect, it } from 'vitest'
import { deckMembership, decks, reviews, settings } from './db/schema.js'
import { readSyncSnapshot } from './sync.js'

describe('sync snapshot projection', () => {
  it('serializes only the sync projections into the client contract', async () => {
    const rows = new Map<unknown, readonly unknown[]>([
      [
        reviews,
        [
          {
            id: 'review-1',
            deckId: 'dev-kanji',
            contentRef: 'kanji:日',
            grade: 1,
            reviewedAt: new Date(1_700_000_000_000),
            payload: {
              id: 'review-1',
              deckId: 'dev-kanji',
              contentRef: 'kanji:日',
              at: 1_700_000_000_000,
              grade: 'good',
              levelBefore: 0,
              levelAfter: 1,
              intervalBefore: 0,
              elapsedDays: 0,
              responseMs: 500,
              source: 'study',
              deviceId: 'device-1',
            },
          },
        ],
      ],
      [
        decks,
        [
          {
            id: 'custom-1',
            name: 'Custom',
            kind: 'custom',
            definitionId: null,
            updatedAt: new Date(1_700_000_000_000),
          },
        ],
      ],
      [
        settings,
        [
          {
            key: 'theme',
            value: 'dark',
            updatedAt: new Date(1_700_000_000_000),
          },
        ],
      ],
      [
        deckMembership,
        [
          {
            deckId: 'custom-1',
            contentRef: 'kanji:日',
            order: 0,
            addedAt: new Date(1_700_000_000_000),
            updatedAt: new Date(1_700_000_000_000),
          },
        ],
      ],
    ])
    const database = {
      select() {
        return {
          from(table: unknown) {
            return {
              where: async () => rows.get(table) ?? [],
            }
          },
        }
      },
    } as unknown as Parameters<typeof readSyncSnapshot>[0]

    await expect(readSyncSnapshot(database, 'user-1')).resolves.toEqual({
      reviews: [
        expect.objectContaining({
          id: 'review-1',
          grade: 'good',
          source: 'study',
        }),
      ],
      decks: [expect.objectContaining({ id: 'custom-1', kind: 'custom' })],
      settings: [{ key: 'theme', value: 'dark', updatedAt: 1_700_000_000_000 }],
      deckMembership: [
        expect.objectContaining({ deckId: 'custom-1', contentRef: 'kanji:日' }),
      ],
    })
  })
})
