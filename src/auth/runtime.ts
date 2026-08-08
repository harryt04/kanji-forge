import { type LocalUserDatabase, openLocalUserDatabase } from '@/data/db'
import { type OutboxFlusher, startOutboxFlusher } from '@/data/outbox'
import { type ShapeSubscription, startShapeSubscription } from '@/data/sync'

export interface UserRuntime {
  readonly userId: string
  readonly database: LocalUserDatabase
  stop(): void
}

let activeRuntime: UserRuntime | undefined

/**
 * Starts only resources belonging to `userId`. Switching accounts always stops
 * and drops the old in-memory handle before opening the next user namespace.
 */
export function bootstrapUserRuntime(userId: string): UserRuntime {
  if (activeRuntime?.userId === userId) return activeRuntime
  activeRuntime?.stop()

  const database = openLocalUserDatabase(userId)
  const subscription: ShapeSubscription = startShapeSubscription(
    userId,
    database,
  )
  const flusher: OutboxFlusher = startOutboxFlusher(userId, database)
  let stopped = false

  const runtime: UserRuntime = {
    userId,
    database,
    stop() {
      if (stopped) return
      stopped = true
      flusher.stop()
      subscription.stop()
      database.close()
      if (activeRuntime === runtime) activeRuntime = undefined
    },
  }
  activeRuntime = runtime
  return runtime
}

/** Clears every in-memory reference on sign-out; no account is selected afterward. */
export function clearUserRuntime(): void {
  activeRuntime?.stop()
  activeRuntime = undefined
}

export function getActiveUserRuntime(): UserRuntime | undefined {
  return activeRuntime
}
