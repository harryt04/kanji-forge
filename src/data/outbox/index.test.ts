import { afterEach, describe, expect, it, vi } from 'vitest'
import { startOutboxFlusher, type OutboxFlusherOptions } from '@/data/outbox'
import type { OutboxMutation } from '@/data/repo'

function mutation(overrides: Partial<OutboxMutation> = {}): OutboxMutation {
  return {
    id: 'review-1',
    mutType: 'review.append',
    payload: JSON.stringify({ id: 'review-1', deckId: 'jlpt-n5' }),
    createdAt: 1,
    attempts: 0,
    ...overrides,
  }
}

function store(initial: readonly OutboxMutation[] = []) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]))
  return {
    rows,
    pending: vi.fn(async () => [...rows.values()]),
    markAttempt: vi.fn(async (id: string) => {
      const row = rows.get(id)
      if (row) rows.set(id, { ...row, attempts: row.attempts + 1 })
    }),
    remove: vi.fn(async (id: string) => {
      rows.delete(id)
    }),
  }
}

function options(
  outbox: ReturnType<typeof store>,
  fetchImpl: typeof globalThis.fetch,
  extra: Omit<OutboxFlusherOptions, 'store' | 'fetch'> = {},
): OutboxFlusherOptions {
  return { store: outbox, fetch: fetchImpl, ...extra }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('outbox flusher', () => {
  it('posts supported mutations and removes only acknowledged rows', async () => {
    const outbox = store([mutation()])
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        mutations: Array<{ id: string; payload: unknown }>
      }
      expect(body.mutations).toEqual([
        {
          id: 'review-1',
          mutType: 'review.append',
          payload: { id: 'review-1', deckId: 'jlpt-n5' },
        },
      ])
      return new Response(
        JSON.stringify({ applied: ['review-1'], rejected: [] }),
        { status: 200 },
      )
    })
    const previousApiUrl = process.env.NEXT_PUBLIC_API_URL
    process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test'

    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl),
    )
    await flusher.flush()
    flusher.stop()

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/mutations',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )
    expect(outbox.rows).toEqual(new Map())
    expect(outbox.markAttempt).toHaveBeenCalledWith('review-1')

    if (previousApiUrl === undefined) delete process.env.NEXT_PUBLIC_API_URL
    else process.env.NEXT_PUBLIC_API_URL = previousApiUrl
  })

  it('keeps rows queued after a network failure and backs off', async () => {
    vi.useFakeTimers()
    const outbox = store([mutation()])
    const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error('offline')
    })
    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl, { retryBaseMs: 25 }),
    )
    await flusher.flush()

    expect(outbox.rows).toHaveProperty('size', 1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(24)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    flusher.stop()
    vi.useRealTimers()
  })

  it('pauses on auth expiry and resumes without dropping the queue', async () => {
    const outbox = store([mutation()])
    const authRequired = vi.fn()
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ applied: ['review-1'], rejected: [] }), {
          status: 200,
        }),
      )
    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl, { onAuthRequired: authRequired }),
    )
    await flusher.flush()
    expect(authRequired).toHaveBeenCalledOnce()
    expect(outbox.rows).toHaveProperty('size', 1)

    flusher.resume()
    await flusher.flush()
    flusher.stop()
    expect(outbox.rows).toHaveProperty('size', 0)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('quarantines rejected rows so a poison mutation is not retried forever', async () => {
    const outbox = store([mutation()])
    const poisoned = vi.fn()
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(
          JSON.stringify({
            applied: [],
            rejected: [{ id: 'review-1', reason: 'not_owned' }],
          }),
          { status: 200 },
        ),
    )
    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl, { onPoisoned: poisoned }),
    )
    await flusher.flush()
    await flusher.flush()
    flusher.stop()

    expect(poisoned).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'review-1' }),
      'not_owned',
    )
    expect(outbox.rows).toHaveProperty('size', 1)
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('leaves local-only mutation types queued for a later server contract', async () => {
    const outbox = store([
      mutation({
        id: 'state-1',
        mutType: 'cardState.upsert',
        payload: '{}',
      }),
    ])
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl),
    )
    await flusher.flush()
    flusher.stop()

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(outbox.rows).toHaveProperty('size', 1)
  })

  it('quarantines malformed local payloads without making a request', async () => {
    const outbox = store([mutation({ payload: '{not-json' })])
    const poisoned = vi.fn()
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl, { onPoisoned: poisoned }),
    )
    await flusher.flush()
    flusher.stop()

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(poisoned).toHaveBeenCalledOnce()
    expect(outbox.rows).toHaveProperty('size', 1)
  })

  it('quarantines a forbidden batch response', async () => {
    const outbox = store([mutation()])
    const poisoned = vi.fn()
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () => new Response('{}', { status: 403 }),
    )
    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl, { onPoisoned: poisoned }),
    )
    await flusher.flush()
    flusher.stop()

    expect(poisoned).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'review-1' }),
      'forbidden',
    )
    expect(outbox.rows).toHaveProperty('size', 1)
  })

  it('backs off when the server returns an incomplete acknowledgement', async () => {
    vi.useFakeTimers()
    const outbox = store([mutation()])
    const fetchImpl = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ applied: [], rejected: [] }), {
          status: 200,
        }),
    )
    const flusher = startOutboxFlusher(
      'user-1',
      undefined,
      options(outbox, fetchImpl, { retryBaseMs: 10 }),
    )
    await flusher.flush()
    expect(outbox.rows).toHaveProperty('size', 1)
    await vi.advanceTimersByTimeAsync(10)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    flusher.stop()
    vi.useRealTimers()
  })
})
