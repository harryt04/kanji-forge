import type { CardLevel, SrsConfig } from './types';

export const DAY_MS = 86_400_000;

/** Applies fuzz at write time. A supplied random source makes writes and tests reproducible. */
export function nextDue(levelAfter: CardLevel, config: SrsConfig, now: number, random: () => number = Math.random): number | null {
  const days = config.stageDays[levelAfter];
  if (days === 0) return null;
  const fuzz = 1 + (random() * 2 - 1) * (config.fuzzPercent / 100);
  return now + days * DAY_MS * fuzz;
}

export function intervalDays(dueAt: number | null, reviewedAt: number): number {
  return dueAt === null ? 0 : Math.max(0, (dueAt - reviewedAt) / DAY_MS);
}

/** A small stable PRNG for replay and session ordering; it has no platform dependencies. */
export function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6D2B79F5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
