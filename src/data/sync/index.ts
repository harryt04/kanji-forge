import {
  createUserRepositories,
  type Deck,
  type DeckMembership,
  type Review,
  type Setting,
  type StickyAnnotation,
} from '@/data/repo'
import type { LocalUserDatabase } from '@/data/db'
import {
  applyElectricShapeMessages,
  createElectricShapeState,
  electricSnapshot,
  parseElectricShapeMessages,
  type ElectricShapeCursor,
  type ElectricTable,
} from './electric-shape'

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
  readonly annotations: readonly StickyAnnotation[]
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

function electricProxyEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ELECTRIC_URL)
}

function electricUrl(
  table: ElectricTable,
  cursor?: ElectricShapeCursor,
): string {
  const url = new URL(
    `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/electric/shape`,
    typeof window === 'undefined' ? 'http://localhost' : window.location.origin,
  )
  url.searchParams.set('table', table)
  url.searchParams.set('live', 'true')
  url.searchParams.set('offset', cursor?.offset ?? '-1')
  if (cursor?.handle) url.searchParams.set('handle', cursor.handle)
  if (cursor?.cursor) url.searchParams.set('cursor', cursor.cursor)
  return url.toString()
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
  const electricState = createElectricShapeState()

  const schedule = (): void => {
    if (stopped) return
    timer = globalThis.setTimeout(() => {
      timer = undefined
      void requestSync()
    }, intervalMs)
  }

  const syncOnce = async (): Promise<void> => {
    if (stopped || typeof fetchImpl !== 'function') return
    if (electricProxyEnabled()) {
      const electricSucceeded = await syncFromElectric()
      if (electricSucceeded) {
        schedule()
        return
      }
    }
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

  const syncFromElectric = async (): Promise<boolean> => {
    for (const table of [
      'reviews',
      'decks',
      'settings',
      'deck_membership',
      'sticky_annotations',
    ] as const) {
      const cursor = electricState.cursors.get(table)
      let response: Response
      try {
        response = await fetchImpl(electricUrl(table, cursor), {
          method: 'GET',
          credentials: 'include',
          headers: { accept: 'application/json, text/event-stream' },
        })
      } catch {
        return false
      }
      if (!response.ok) return false
      const messages = parseElectricShapeMessages(await response.text())
      applyElectricShapeMessages(electricState, table, messages)
      if (
        messages.some((message) => message.headers?.control === 'must-refetch')
      ) {
        // Electric rotated this shape handle. The next request must restart
        // from -1; the snapshot fallback keeps this sync cycle complete.
        electricState.cursors.delete(table)
        return false
      }
      electricState.cursors.set(table, {
        handle: response.headers.get('electric-handle') ?? cursor?.handle,
        offset: response.headers.get('electric-offset') ?? cursor?.offset,
        cursor: response.headers.get('electric-cursor') ?? cursor?.cursor,
      })
    }
    if (!stopped)
      await repositories.restoreBackup(electricSnapshot(electricState))
    return true
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
