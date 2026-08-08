import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUserRepositories } from '@/data/repo'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { startShapeSubscription } from './index'

afterEach(() => {
  clearUserRuntime()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function snapshot() {
  return {
    reviews: [
      {
        id: 'remote-review-1',
        deckId: 'dev-kanji',
        contentRef: 'kanji:日',
        at: 1_700_000_000_000,
        grade: 'good',
        levelBefore: 0,
        levelAfter: 1,
        intervalBefore: 0,
        elapsedDays: 0,
        responseMs: 900,
        source: 'study',
        deviceId: 'remote-device',
      },
    ],
    decks: [
      {
        id: 'custom-remote',
        name: 'Remote deck',
        kind: 'custom',
        definitionId: null,
        updatedAt: 1_700_000_000_000,
      },
    ],
    settings: [
      {
        key: 'theme',
        value: 'dark',
        updatedAt: 1_700_000_000_000,
      },
    ],
    deckMembership: [
      {
        deckId: 'custom-remote',
        contentRef: 'kanji:日',
        sortOrder: 0,
        addedAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ],
  }
}

describe('authenticated read synchronization', () => {
  it('merges remote reviews and metadata into the user-local database', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test')
    const runtime = bootstrapUserRuntime('sync-user')
    await runtime.database.ready
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify(snapshot()), {
          headers: { 'content-type': 'application/json' },
        }),
    )

    const subscription = startShapeSubscription('sync-user', runtime.database, {
      fetch: fetchImpl,
      intervalMs: 1_000,
    })
    await subscription.sync()

    const repositories = createUserRepositories(runtime.database)
    await expect(repositories.reviews.list()).resolves.toMatchObject([
      { id: 'remote-review-1', contentRef: 'kanji:日', grade: 'good' },
    ])
    await expect(
      repositories.decks.get('custom-remote'),
    ).resolves.toMatchObject({ name: 'Remote deck', kind: 'custom' })
    await expect(repositories.settings.get('theme')).resolves.toEqual({
      key: 'theme',
      value: 'dark',
      updatedAt: 1_700_000_000_000,
    })
    await expect(
      repositories.deckMembership.list('custom-remote'),
    ).resolves.toEqual([expect.objectContaining({ contentRef: 'kanji:日' })])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/sync',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    subscription.stop()
  })

  it('does not overwrite newer local metadata and remains idempotent', async () => {
    const runtime = bootstrapUserRuntime('sync-lww-user')
    await runtime.database.ready
    const repositories = createUserRepositories(runtime.database)
    await repositories.decks.upsert({
      id: 'custom-remote',
      name: 'Newer local name',
      kind: 'custom',
      definitionId: null,
      updatedAt: 1_800_000_000_000,
    })
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify(snapshot())),
    )
    const subscription = startShapeSubscription(
      'sync-lww-user',
      runtime.database,
      {
        fetch: fetchImpl,
        intervalMs: 1_000,
      },
    )

    await subscription.sync()
    await subscription.sync()

    await expect(
      repositories.decks.get('custom-remote'),
    ).resolves.toMatchObject({
      name: 'Newer local name',
      updatedAt: 1_800_000_000_000,
    })
    await expect(repositories.reviews.list()).resolves.toHaveLength(1)
    subscription.stop()
  })

  it('cancels scheduled polling when the runtime stops the subscription', async () => {
    vi.useFakeTimers()
    const runtime = bootstrapUserRuntime('sync-stop-user')
    await runtime.database.ready
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify(snapshot())),
    )
    const subscription = startShapeSubscription(
      'sync-stop-user',
      runtime.database,
      {
        fetch: fetchImpl,
        intervalMs: 1_000,
      },
    )
    await subscription.sync()
    subscription.stop()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
