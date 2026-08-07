/**
 * Electric shape subscriptions and apply logic for multi-device sync.
 *
 * TODO(T4.0): Implement Electric client initialization and shape syncing.
 */

export interface ShapeSubscription {
  stop(): void
}

/**
 * T1.1 lifecycle seam. T4 wires this to Electric after its auth-proxy spike.
 * The user id is required now so a future shape cannot accidentally be global.
 */
export function startShapeSubscription(userId: string): ShapeSubscription {
  if (!userId.trim())
    throw new Error('A user id is required for shape subscriptions.')
  return { stop() {} }
}
