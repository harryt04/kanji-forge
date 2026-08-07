import { applyGrade } from './grade';
import { nextDue, seededRandom } from './schedule';
import { emptyCardState, type CardState, type Review, type SrsConfig } from './types';

export interface ReplayOptions { config: SrsConfig; redCount?: (deckId: string, states: ReadonlyMap<string, CardState>) => number; }

/**
 * Projects the append-only log. Duplicate IDs are ignored before sorting, making union/replay
 * idempotent. Manual reviews are absolute level assignments as required by the merge contract.
 */
export function replay(reviews: readonly Review[], { config, redCount }: ReplayOptions): Map<string, CardState> {
  const unique = new Map<string, Review>();
  for (const review of reviews) unique.set(review.id, review);
  const ordered = [...unique.values()].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
  const states = new Map<string, CardState>();
  for (const review of ordered) {
    const key = `${review.deckId}\u0000${review.stickyId}`;
    const previous = states.get(key) ?? emptyCardState(review.deckId, review.stickyId, review.deviceId);
    const state = review.source === 'manual'
      ? { ...previous, level: review.levelAfter, dueAt: nextDue(review.levelAfter, config, review.at, seededRandom(review.id)), lastReviewedAt: review.at, manualOverride: true, updatedAt: review.at, updatedBy: review.deviceId }
      : applyGrade({ state: previous, grade: review.grade, config, redCount: redCount?.(review.deckId, states) ?? countRed(review.deckId, states), at: review.at, deviceId: review.deviceId });
    state.dueAt = nextDue(state.level, config, review.at, seededRandom(review.id));
    states.set(key, state);
  }
  return states;
}

function countRed(deckId: string, states: ReadonlyMap<string, CardState>): number {
  let count = 0;
  for (const state of states.values()) if (state.deckId === deckId && state.level === 0) count += 1;
  return count;
}
