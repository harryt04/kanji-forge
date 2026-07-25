/**
 * Core SRS types — pure data structures with no React or DOM dependencies.
 * Implements SRS-SPEC.md.
 *
 * TODO(T1.2): Implement full SRS state machine.
 */

/**
 * A review record — immutable, append-only log entry.
 * UUIDv7 id for idempotency and multi-device sync.
 */
export interface Review {
  id: string; // UUIDv7
  userId: string;
  deckId: string;
  contentRef: string; // e.g., "kanji:未" | "word:1234567"
  grade: 0 | 1 | 2; // 0: "I don't know", 1: "I know", 2: "No problem"
  at: number; // unix ms
  deviceId: string;
}

/**
 * Card state — level, due date, flags.
 * Never synced; always re-derived via replay() on all devices.
 */
export interface CardState {
  deckId: string;
  contentRef: string;
  level: 0 | 1 | 2 | 3 | 4;
  dueAt: number; // unix ms; 0 = due now
  flagged: boolean;
  lastReviewedAt: number | null;
}

/**
 * Stub export to satisfy TypeScript strict mode and enable testing.
 */
export const SRS_SPEC_VERSION = '1.0';
