/**
 * Outbox for pending mutations toward the Postgres write API.
 *
 * TODO(T1.4): Implement enqueue, flush, and idempotent retry logic.
 */

export interface OutboxFlusher {
  stop(): void;
}

/** T1.1 lifecycle seam; T1.4 supplies queueing and authenticated retries. */
export function startOutboxFlusher(userId: string): OutboxFlusher {
  if (!userId.trim()) throw new Error('A user id is required for outbox flushing.');
  return { stop() {} };
}
