import {
  createUserRepositories,
  type OutboxMutation,
  type UserRepositories,
} from '@/data/repo'
import type { LocalUserDatabase } from '@/data/db'

const MAX_MUTATIONS_PER_REQUEST = 100
const DEFAULT_RETRY_BASE_MS = 1_000
const MAX_RETRY_MS = 60_000
const SYNCABLE_MUTATION_TYPES = new Set<OutboxMutation['mutType']>([
  'review.append',
  'deck.upsert',
  'settings.upsert',
  'deckMembership.upsert',
])

type OutboxStore = Pick<
  UserRepositories['outbox'],
  'pending' | 'markAttempt' | 'remove'
>

export interface OutboxFlusherOptions {
  /** Injectable store and transport keep the lifecycle deterministic in tests. */
  readonly store?: OutboxStore
  readonly fetch?: typeof globalThis.fetch
  readonly retryBaseMs?: number
  readonly onAuthRequired?: () => void | Promise<void>
  readonly onPoisoned?: (mutation: OutboxMutation, reason: string) => void
}

export interface OutboxFlusher {
  stop(): void
  flush(): Promise<void>
  resume(): void
}

interface MutationResponse {
  readonly applied: readonly string[]
  readonly rejected: readonly { id: string; reason: string }[]
}

function apiUrl(): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/mutations`
}

function retryDelay(attempts: number, baseMs: number): number {
  return Math.min(
    MAX_RETRY_MS,
    baseMs * 2 ** Math.min(Math.max(attempts, 0), 6),
  )
}

function isMutationResponse(value: unknown): value is MutationResponse {
  if (!value || typeof value !== 'object') return false
  const body = value as Record<string, unknown>
  const applied = body.applied
  const rejected = body.rejected
  return (
    Array.isArray(applied) &&
    applied.every((id) => typeof id === 'string') &&
    Array.isArray(rejected) &&
    rejected.every(
      (entry) =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as Record<string, unknown>).id === 'string' &&
        typeof (entry as Record<string, unknown>).reason === 'string',
    )
  )
}

/**
 * Starts the authenticated local outbox worker. Study never awaits this worker:
 * a failed network request leaves the local transaction authoritative and schedules
 * a later retry. Mutations not yet understood by the write API remain queued for a
 * future server contract instead of being silently discarded.
 */
export function startOutboxFlusher(
  userId: string,
  database?: LocalUserDatabase,
  options: OutboxFlusherOptions = {},
): OutboxFlusher {
  if (!userId.trim())
    throw new Error('A user id is required for outbox flushing.')

  const store =
    options.store ?? (database && createUserRepositories(database).outbox)
  const fetchImpl = options.fetch ?? globalThis.fetch
  const retryBaseMs = Math.max(options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS, 0)
  const poisoned = new Set<string>()
  let stopped = false
  let authPaused = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined

  const clearTimer = (): void => {
    if (timer !== undefined) {
      globalThis.clearTimeout(timer)
      timer = undefined
    }
  }

  const schedule = (delayMs: number): void => {
    if (stopped || timer !== undefined) return
    timer = globalThis.setTimeout(() => {
      timer = undefined
      void requestFlush()
    }, delayMs)
  }

  const poison = (mutation: OutboxMutation, reason: string): void => {
    poisoned.add(mutation.id)
    options.onPoisoned?.(mutation, reason)
  }

  const flushOnce = async (): Promise<void> => {
    if (stopped || authPaused || !store || typeof fetchImpl !== 'function')
      return

    while (!stopped && !authPaused) {
      let pending: readonly OutboxMutation[]
      try {
        pending = await store.pending()
      } catch {
        // Account switching can close the database while an initial flush is waiting
        // for SQLite-WASM to load. The runtime teardown owns that race.
        if (!stopped) schedule(retryBaseMs)
        return
      }
      const batch = pending
        .filter(
          (mutation) =>
            SYNCABLE_MUTATION_TYPES.has(mutation.mutType) &&
            !poisoned.has(mutation.id),
        )
        .slice(0, MAX_MUTATIONS_PER_REQUEST)
      if (batch.length === 0) return

      let payload: Array<{
        id: string
        mutType: OutboxMutation['mutType']
        payload: unknown
      }>
      try {
        payload = batch.map((mutation) => ({
          id: mutation.id,
          mutType: mutation.mutType,
          payload: JSON.parse(mutation.payload) as unknown,
        }))
      } catch (error) {
        for (const mutation of batch) {
          await store.markAttempt(mutation.id)
          poison(
            mutation,
            error instanceof Error ? error.message : 'invalid_payload',
          )
        }
        continue
      }

      for (const mutation of batch) await store.markAttempt(mutation.id)

      let response: Response
      try {
        response = await fetchImpl(apiUrl(), {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mutations: payload }),
        })
      } catch {
        schedule(retryDelay(batch[0]?.attempts ?? 0, retryBaseMs))
        return
      }

      if (response.status === 401) {
        authPaused = true
        await options.onAuthRequired?.()
        return
      }

      if (response.status === 403 || response.status === 400) {
        const reason = response.status === 403 ? 'forbidden' : 'rejected_batch'
        for (const mutation of batch) poison(mutation, reason)
        continue
      }

      if (!response.ok) {
        schedule(retryDelay(batch[0]?.attempts ?? 0, retryBaseMs))
        return
      }

      let body: unknown
      try {
        body = await response.json()
      } catch {
        schedule(retryDelay(batch[0]?.attempts ?? 0, retryBaseMs))
        return
      }
      if (!isMutationResponse(body)) {
        schedule(retryDelay(batch[0]?.attempts ?? 0, retryBaseMs))
        return
      }

      const applied = new Set(body.applied)
      const handled = new Set<string>()
      for (const mutation of batch) {
        const rejected = body.rejected.find((entry) => entry.id === mutation.id)
        if (applied.has(mutation.id)) {
          handled.add(mutation.id)
          await store.remove(mutation.id)
        } else if (rejected) {
          handled.add(mutation.id)
          poison(mutation, rejected.reason)
        }
      }
      if (handled.size !== batch.length) {
        schedule(retryDelay(batch[0]?.attempts ?? 0, retryBaseMs))
        return
      }
    }
  }

  const requestFlush = (): Promise<void> => {
    if (inFlight) return inFlight
    inFlight = flushOnce().finally(() => {
      inFlight = undefined
    })
    return inFlight
  }

  const onlineTarget =
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
      ? window
      : undefined
  const handleOnline = (): void => {
    authPaused = false
    void requestFlush()
  }
  onlineTarget?.addEventListener('online', handleOnline)

  const flusher: OutboxFlusher = {
    stop() {
      if (stopped) return
      stopped = true
      clearTimer()
      onlineTarget?.removeEventListener('online', handleOnline)
    },
    flush: requestFlush,
    resume() {
      authPaused = false
      void requestFlush()
    },
  }

  void requestFlush()
  return flusher
}
