import {
  createUserRepositories,
  type Deck,
  type DeckMembership,
  type Review,
  type Setting,
} from '@/data/repo'
import type { LocalUserDatabase } from '@/data/db'

/**
 * Authenticated read synchronization for the local-first runtime.
 *
 * The API snapshot is deliberately shaped like the eventual Electric shape
 * projection. This keeps local merge semantics independent of the transport
 * while the Electric auth-proxy deployment is finalized.
 */

export interface SyncSnapshot {
  readonly reviews: readonly Review[]
  readonly decks: readonly Deck[]
  readonly settings: readonly Setting[]
  readonly deckMembership: readonly DeckMembership[]
}

export interface ShapeSubscription {
  stop(): void
  sync(): Promise<void>
}

export interface ShapeSubscriptionOptions {
  readonly fetch?: typeof globalThis.fetch
  readonly intervalMs?: number
}

const DEFAULT_INTERVAL_MS = 15_000

function syncUrl(): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/sync`
}

function isSyncSnapshot(value: unknown): value is SyncSnapshot {
  if (!value || typeof value !== 'object') return false
  const body = value as Record<string, unknown>
  return (
    Array.isArray(body.reviews) &&
    Array.isArray(body.decks) &&
    Array.isArray(body.settings) &&
    Array.isArray(body.deckMembership)
  )
}

/**
 * Starts a user-scoped read subscription. Until the Electric auth proxy is
 * deployed, the self-hosted API's authenticated snapshot endpoint provides the
 * same four sync projections and uses the same merge contract.
 */
export function startShapeSubscription(
  userId: string,
  database?: LocalUserDatabase,
  options: ShapeSubscriptionOptions = {},
): ShapeSubscription {
  if (!userId.trim())
    throw new Error('A user id is required for shape subscriptions.')
  if (!database) return { stop() {}, sync: async () => {} }

  const repositories = createUserRepositories(database)
  const fetchImpl = options.fetch ?? globalThis.fetch
  const intervalMs = Math.max(options.intervalMs ?? DEFAULT_INTERVAL_MS, 1_000)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let inFlight: Promise<void> | undefined

  const schedule = (): void => {
    if (stopped) return
    timer = globalThis.setTimeout(() => {
      timer = undefined
      void requestSync()
    }, intervalMs)
  }

  const syncOnce = async (): Promise<void> => {
    if (stopped || typeof fetchImpl !== 'function') return
    let response: Response
    try {
      response = await fetchImpl(syncUrl(), {
        method: 'GET',
        credentials: 'include',
        headers: { accept: 'application/json' },
      })
    } catch {
      schedule()
      return
    }
    if (response.status === 401 || !response.ok) {
      schedule()
      return
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      schedule()
      return
    }
    if (!isSyncSnapshot(body)) {
      schedule()
      return
    }
    if (!stopped) await repositories.restoreBackup(body)
    schedule()
  }

  const requestSync = (): Promise<void> => {
    if (inFlight) return inFlight
    inFlight = syncOnce().finally(() => {
      inFlight = undefined
    })
    return inFlight
  }

  const subscription: ShapeSubscription = {
    stop() {
      if (stopped) return
      stopped = true
      if (timer !== undefined) globalThis.clearTimeout(timer)
    },
    sync: requestSync,
  }
  void requestSync()
  return subscription
}
