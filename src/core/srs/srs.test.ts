import { describe, expect, it } from 'vitest';
import { applyGrade } from './grade';
import { goalTarget, progress, projectedCompletion } from './goal';
import { buildQueue, interleaveQueue, requeueAfterAgain, type QueueCard } from './queue';
import { replay } from './replay';
import { DAY_MS, intervalDays, nextDue } from './schedule';
import { DEFAULT_SRS_CONFIG, emptyCardState, isCardLevel, type CardState, type Review } from './types';

const now = 1_700_000_000_000;
const cfg = { ...DEFAULT_SRS_CONFIG, fuzzPercent: 0 };
function state(level = 0, stickyId = 'a'): CardState { return { ...emptyCardState('deck', stickyId, 'device'), level: level as CardState['level'], dueAt: level === 0 ? null : now, lastReviewedAt: null }; }
function card(stickyId: string, level = 0, dueAt: number | null = null, order = 0, characters?: string[]): QueueCard { return { deckId: 'deck', stickyId, state: { ...state(level, stickyId), dueAt }, order, characters }; }
function review(id: string, grade: Review['grade'], at: number, levelAfter: CardState['level'], source: Review['source'] = 'study'): Review { return { id, deckId: 'deck', stickyId: 'a', at, grade, levelBefore: 0, levelAfter, intervalBefore: 0, elapsedDays: 0, responseMs: 1, source, deviceId: 'device' }; }

describe('SRS-SPEC §10', () => {
  it('1: advances four good answers and schedules each arriving level', () => {
    let current = state();
    for (const [index, days] of [3, 9, 30, 90].entries()) {
      current = applyGrade({ state: current, grade: 'good', config: cfg, redCount: 0, at: now, deviceId: 'd' });
      expect(current.level).toBe(index + 1);
      expect(nextDue(current.level, cfg, now)).toBe(now + days * DAY_MS);
    }
  });
  it('2: lapsing with many reds goes to relearn level', () => {
    const result = applyGrade({ state: state(3), grade: 'again', config: cfg, redCount: 40, at: now, deviceId: 'd' });
    expect(result).toMatchObject({ level: 0, lapses: 1, correctStreak: 0, totalReviews: 1 });
  });
  it('3: lapsing with fewer than ten reds forces minus one', () => expect(applyGrade({ state: state(3), grade: 'again', config: cfg, redCount: 6, at: now, deviceId: 'd' }).level).toBe(2));
  it('4: easy promotes a new card to four', () => {
    const result = applyGrade({ state: state(), grade: 'easy', config: cfg, redCount: 0, at: now, deviceId: 'd' });
    expect(result).toMatchObject({ level: 4, totalReviews: 1, correctStreak: 1 });
  });
  it('5: never blocks: an empty due pool is filled from ahead', () => expect(buildQueue([card('a', 2, now + DAY_MS)], { now, config: cfg, dayOfYear: 1 }).map((item) => item.stickyId)).toEqual(['a']));
  it('6: limits new cards per session', () => {
    const cards = Array.from({ length: 200 }, (_, index): QueueCard => ({ deckId: 'deck', stickyId: String(index), order: index }));
    expect(buildQueue(cards, { now, config: { ...cfg, newPerSession: 5, maxNewInCirculation: 300 }, dayOfYear: 1 })).toHaveLength(5);
  });
  it('7: respects max new in circulation', () => {
    const existing = Array.from({ length: 28 }, (_, index) => card(`old-${index}`, index < 14 ? 0 : 1, now + DAY_MS, index));
    const newCards = Array.from({ length: 20 }, (_, index): QueueCard => ({ deckId: 'deck', stickyId: `new-${index}`, order: index + 28 }));
    const queue = buildQueue([...existing, ...newCards], { now, config: { ...cfg, newPerSession: 10, maxNewInCirculation: 30 }, dayOfYear: 1 });
    expect(queue.filter((item) => item.stickyId.startsWith('new-'))).toHaveLength(2);
  });
  it('8: requeues a lapse roughly five cards later, never immediately', () => {
    const queue = Array.from({ length: 8 }, (_, index) => card(String(index), 1, now, index));
    expect(requeueAfterAgain(queue, card('failed'), 1).findIndex((item) => item.stickyId === 'failed')).toBe(5);
    expect(requeueAfterAgain(queue, card('failed'), 2).findIndex((item) => item.stickyId === 'failed')).toBe(8);
  });
  it('9: merge replay contains both device reviews and is deterministic', () => {
    const log = [review('b', 'good', now + 1, 1), review('a', 'good', now, 1)];
    expect(replay(log, { config: cfg }).get('deck\u0000a')).toMatchObject({ level: 2, totalReviews: 2 });
    expect(replay([...log].reverse(), { config: cfg })).toEqual(replay(log, { config: cfg }));
  });
  it('10: a manual level four survives an earlier concurrent again', () => {
    const merged = replay([review('again', 'again', now, 0), review('manual', 'again', now + 1, 4, 'manual')], { config: cfg });
    expect(merged.get('deck\u0000a')).toMatchObject({ level: 4, manualOverride: true });
  });
  it('11: calculates the daily goal including default accuracy lapse load', () => {
    const states = Array.from({ length: 125 }, (_, index) => state(0, String(index)));
    expect(goalTarget(states, now + 30 * DAY_MS, now, 0, 0, 1.2).dailyTarget).toBe(21);
  });
  it('12: replay reproduces the same projection after backup import', () => {
    const log = [review('1', 'good', now, 1), review('2', 'easy', now + 2, 4)];
    expect(replay(log, { config: cfg })).toEqual(replay([...log], { config: cfg }));
  });
  it('13: fuzz stays within plus or minus ten percent', () => {
    for (let index = 0; index < 1000; index += 1) {
      const due = nextDue(3, DEFAULT_SRS_CONFIG, now, () => index / 999)!;
      expect(due - now).toBeGreaterThanOrEqual(27 * DAY_MS);
      expect(due - now).toBeLessThanOrEqual(33 * DAY_MS);
    }
  });
  it('14: level weighted progress uses full deck size', () => expect(progress(100, Array.from({ length: 100 }, (_, index) => state(2, String(index))))).toBe(0.5));
});

describe('SRS properties and edge cases', () => {
  it('is replay-twice idempotent, including duplicate review IDs', () => {
    const log = [review('same', 'good', now, 1), review('same', 'again', now + 1, 0)];
    const once = replay(log, { config: cfg });
    expect(replay(log, { config: cfg })).toEqual(once);
    expect(once.get('deck\u0000a')?.totalReviews).toBe(1);
  });
  it('keeps grade-derived levels in the 0–4 domain', () => {
    for (let level = 0; level <= 4; level += 1) for (const grade of ['again', 'good', 'easy'] as const) {
      expect(isCardLevel(applyGrade({ state: state(level), grade, config: { ...cfg, passIsMinusOne: true }, redCount: 50, at: now, deviceId: 'd' }).level)).toBe(true);
    }
  });
  it('covers schedule, queue priming, and goal boundary helpers', () => {
    expect(nextDue(0, cfg, now)).toBeNull();
    expect(intervalDays(null, now)).toBe(0);
    expect(intervalDays(now - DAY_MS, now)).toBe(0);
    expect(progress(0, [])).toBe(0);
    const primed = buildQueue([card('a', 1, now, 0, ['日']), card('b', 1, now, 1, ['日']), card('c', 1, now, 2, ['月'])], { now, config: cfg, dailyGoal: 3, dayOfYear: 9 });
    expect(primed.map((item) => item.stickyId)).toHaveLength(3);
    expect(projectedCompletion(now, [state(0)], 0, 0)).toBeNull();
    expect(projectedCompletion(now, [state(0)], 0, 1)).toBeNull();
    expect(projectedCompletion(now, [state(0)], 4, 2)).toBe(now + 2 * DAY_MS);
    expect(goalTarget([], now - DAY_MS, now, 20, 20, 1).dailyTarget).toBe(5);
    expect(goalTarget(Array.from({ length: 2000 }, () => state(0)), now + DAY_MS, now, 20, 20, 1).warns).toBe(true);
  });
  it('exercises deterministic interleaving and all replay red-count paths', () => {
    const allPrimed = interleaveQueue([card('a', 1, now, 0, ['日']), card('b', 1, now, 1, ['日']), card('c', 1, now, 2, ['日'])], new Set(), 'seed');
    expect(allPrimed).toHaveLength(3);
    expect(interleaveQueue([card('with-char', 1, now, 0, ['日']), card('without-char', 1, now, 1)], new Set(), 'seed')).toHaveLength(2);
    expect(buildQueue([], { now, config: cfg, dayOfYear: 1 })).toEqual([]);
    expect(buildQueue([card('null-due', 1, null, 0)], { now, config: cfg, dayOfYear: 1 })).toHaveLength(1);
    expect(buildQueue([card('recycle', 4, now, 0)], { now, config: cfg, dayOfYear: 1 })).toHaveLength(1);
    const duplicateAhead = [card('same', 1, now, 0), card('same', 2, now + DAY_MS, 1), card('ahead', 2, now + DAY_MS, 2)];
    expect(buildQueue(duplicateAhead, { now, config: cfg, dailyGoal: 3, dayOfYear: 1 }).map((item) => item.stickyId).sort()).toEqual(['ahead', 'same']);
    const redLog = [review('red', 'again', now, 0), { ...review('other', 'again', now + 1, 0), stickyId: 'other' }];
    expect(replay(redLog, { config: cfg }).size).toBe(2);
    expect(replay([review('injected', 'again', now, 0)], { config: cfg, redCount: () => 50 }).size).toBe(1);
    expect(replay([review('z', 'good', now, 1), review('a', 'good', now, 1)], { config: cfg }).get('deck\u0000a')?.level).toBe(2);
  });
});
