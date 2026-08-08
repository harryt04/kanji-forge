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
    annotations: [
      {
        deckId: 'custom-remote',
        contentRef: 'kanji:日',
        note: 'Review the radical.',
        tags: ['radical'],
        updatedAt: 1_700_000_000_000,
        updatedBy: 'remote-device',
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
    await expect(
      repositories.annotations.get('custom-remote', 'kanji:日'),
    ).resolves.toEqual(expect.objectContaining({ note: 'Review the radical.' }))
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/sync',
      expect.objectContaining({ credentials: 'include', method: 'GET' }),
    )
    subscription.stop()
  })

  it('uses the authenticated Electric shape proxy when configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test')
    vi.stubEnv('NEXT_PUBLIC_ELECTRIC_URL', 'https://electric.example.test')
    const runtime = bootstrapUserRuntime('electric-user')
    await runtime.database.ready
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async (input) => {
      const table = new URL(String(input)).searchParams.get('table')
      const values: Record<string, unknown> = {
        reviews: {
          key: 'electric-review',
          value: {
            id: 'electric-review',
            deck_id: 'dev-kanji',
            content_ref: 'kanji:日',
            at: 1_700_000_000_000,
            grade: 'good',
            level_before: 0,
            level_after: 1,
            interval_before: 0,
            elapsed_days: 0,
            response_ms: 500,
            source: 'study',
            device_id: 'electric-device',
          },
          headers: { operation: 'insert' },
        },
        decks: {
          key: 'electric-deck',
          value: {
            id: 'electric-deck',
            name: 'Electric deck',
            kind: 'custom',
            updated_at: 1_700_000_000_000,
          },
          headers: { operation: 'insert' },
        },
        settings: {
          key: 'theme',
          value: { key: 'theme', value: 'dark', updated_at: 1_700_000_000_000 },
          headers: { operation: 'insert' },
        },
        deck_membership: {
          key: 'electric-deck:kanji:日',
          value: {
            deck_id: 'electric-deck',
            content_ref: 'kanji:日',
            sort_order: 0,
            added_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_000,
          },
          headers: { operation: 'insert' },
        },
        sticky_annotations: {
          key: 'electric-deck:kanji:日',
          value: {
            deck_id: 'electric-deck',
            content_ref: 'kanji:日',
            note: 'Electric note',
            tags_json: '["electric"]',
            updated_at: 1_700_000_000_000,
            updated_by: 'electric-device',
          },
          headers: { operation: 'insert' },
        },
      }
      return new Response(
        JSON.stringify([
          values[table ?? ''] ?? { headers: { control: 'up-to-date' } },
          { headers: { control: 'up-to-date' } },
        ]),
        {
          headers: {
            'content-type': 'application/json',
            'electric-handle': 'electric-handle',
            'electric-offset': '1',
            'electric-cursor': 'electric-cursor',
          },
        },
      )
    })
    const subscription = startShapeSubscription(
      'electric-user',
      runtime.database,
      {
        fetch: fetchImpl,
        intervalMs: 1_000,
      },
    )
    await subscription.sync()

    const repositories = createUserRepositories(runtime.database)
    await expect(
      repositories.decks.get('electric-deck'),
    ).resolves.toMatchObject({
      name: 'Electric deck',
    })
    await expect(repositories.settings.get('theme')).resolves.toMatchObject({
      value: 'dark',
    })
    await expect(
      repositories.annotations.get('electric-deck', 'kanji:日'),
    ).resolves.toMatchObject({
      note: 'Electric note',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(5)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      '/api/electric/shape',
    )
    subscription.stop()
  })

  it('falls back to the authenticated snapshot when Electric is unavailable', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test')
    vi.stubEnv('NEXT_PUBLIC_ELECTRIC_URL', 'https://electric.example.test')
    const runtime = bootstrapUserRuntime('electric-fallback-user')
    await runtime.database.ready
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(snapshot()), {
          headers: { 'content-type': 'application/json' },
        }),
      )
    const subscription = startShapeSubscription(
      'electric-fallback-user',
      runtime.database,
      { fetch: fetchImpl, intervalMs: 1_000 },
    )
    await subscription.sync()

    await expect(
      createUserRepositories(runtime.database).settings.get('theme'),
    ).resolves.toMatchObject({ value: 'dark' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('/api/sync')
    subscription.stop()
  })

  it('restarts a rotated Electric shape through the snapshot fallback', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test')
    vi.stubEnv('NEXT_PUBLIC_ELECTRIC_URL', 'https://electric.example.test')
    const runtime = bootstrapUserRuntime('electric-refetch-user')
    await runtime.database.ready
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ headers: { control: 'must-refetch' } }]),
          {
            headers: { 'electric-handle': 'rotated-handle' },
          },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(snapshot())))
    const subscription = startShapeSubscription(
      'electric-refetch-user',
      runtime.database,
      { fetch: fetchImpl, intervalMs: 1_000 },
    )
    await subscription.sync()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain('/api/sync')
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
