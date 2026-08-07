/** Shared fixture builders for tests. Keep the `fuzzPercent: 0` determinism
 * convention from `srs.test.ts` when reusing `srsConfig`. */
import {
  DEFAULT_SRS_CONFIG,
  emptyCardState,
  type CardState as SrsCardState,
  type Review as SrsReview,
} from '@/core/srs/types'
import type { QueueCard } from '@/core/srs/queue'
import type {
  CardState as RepoCardState,
  Review as RepoReview,
} from '@/data/repo'

export const NOW = 1_700_000_000_000
export const srsConfig = { ...DEFAULT_SRS_CONFIG, fuzzPercent: 0 }

export function srsState(level = 0, stickyId = 'a'): SrsCardState {
  return {
    ...emptyCardState('deck', stickyId, 'device'),
    level: level as SrsCardState['level'],
    dueAt: level === 0 ? null : NOW,
    lastReviewedAt: null,
  }
}

export function srsCard(
  stickyId: string,
  level = 0,
  dueAt: number | null = null,
  order = 0,
  characters?: string[],
): QueueCard {
  return {
    deckId: 'deck',
    stickyId,
    state: { ...srsState(level, stickyId), dueAt },
    order,
    characters,
  }
}

export function srsReview(
  id: string,
  grade: SrsReview['grade'],
  at: number,
  levelAfter: SrsCardState['level'],
  source: SrsReview['source'] = 'study',
): SrsReview {
  return {
    id,
    deckId: 'deck',
    stickyId: 'a',
    at,
    grade,
    levelBefore: 0,
    levelAfter,
    intervalBefore: 0,
    elapsedDays: 0,
    responseMs: 1,
    source,
    deviceId: 'device',
  }
}

export function repoCardState(
  overrides: Partial<RepoCardState> = {},
): RepoCardState {
  return {
    deckId: 'jlpt-n5',
    contentRef: 'kanji:未',
    level: 1,
    dueAt: 1_700_000_000_000,
    lastReviewedAt: 1_699_999_000_000,
    correctStreak: 1,
    totalReviews: 1,
    totalCorrect: 1,
    lapses: 0,
    flagged: false,
    manualOverride: false,
    updatedAt: 1_699_999_000_000,
    updatedBy: 'device-a',
    ...overrides,
  }
}

export function repoReview(overrides: Partial<RepoReview> = {}): RepoReview {
  return {
    id: '018f0010-0000-7000-8000-000000000001',
    deckId: 'jlpt-n5',
    contentRef: 'kanji:未',
    at: 1_699_999_000_000,
    grade: 'good',
    levelBefore: 0,
    levelAfter: 1,
    intervalBefore: 0,
    elapsedDays: 0,
    responseMs: 700,
    source: 'study',
    deviceId: 'device-a',
    ...overrides,
  }
}
