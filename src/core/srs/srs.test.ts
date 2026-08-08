import { describe, expect, it } from 'vitest'
import {
  NOW as now,
  srsCard as card,
  srsConfig as cfg,
  srsReview as review,
  srsState as state,
} from '../../../test/factories'
import { applyGrade } from './grade'
import {
  goalTarget,
  progress,
  progressLevel,
  projectedCompletion,
  reviewForecast,
  suggestedGoalDate,
} from './goal'
import { retentionByLevel } from './retention'
import { identifyLeeches } from './leeches'
import {
  buildQueue,
  interleaveQueue,
  requeueAfterAgain,
  type QueueCard,
} from './queue'
import { replay } from './replay'
import { DAY_MS, intervalDays, nextDue } from './schedule'
import { DEFAULT_SRS_CONFIG, isCardLevel } from './types'

describe('SRS-SPEC §10', () => {
  it('1: advances four good answers and schedules each arriving level', () => {
    let current = state()
    for (const [index, days] of [3, 9, 30, 90].entries()) {
      current = applyGrade({
        state: current,
        grade: 'good',
        config: cfg,
        redCount: 0,
        at: now,
        deviceId: 'd',
      })
      expect(current.level).toBe(index + 1)
      expect(nextDue(current.level, cfg, now)).toBe(now + days * DAY_MS)
    }
  })
  it('2: lapsing with many reds goes to relearn level', () => {
    const result = applyGrade({
      state: state(3),
      grade: 'again',
      config: cfg,
      redCount: 40,
      at: now,
      deviceId: 'd',
    })
    expect(result).toMatchObject({
      level: 0,
      lapses: 1,
      correctStreak: 0,
      totalReviews: 1,
    })
  })
  it('3: lapsing with fewer than ten reds forces minus one', () =>
    expect(
      applyGrade({
        state: state(3),
        grade: 'again',
        config: cfg,
        redCount: 6,
        at: now,
        deviceId: 'd',
      }).level,
    ).toBe(2))
  it('4: easy promotes a new card to four', () => {
    const result = applyGrade({
      state: state(),
      grade: 'easy',
      config: cfg,
      redCount: 0,
      at: now,
      deviceId: 'd',
    })
    expect(result).toMatchObject({
      level: 4,
      totalReviews: 1,
      correctStreak: 1,
    })
  })
  it('5: never blocks: an empty due pool is filled from ahead', () =>
    expect(
      buildQueue([card('a', 2, now + DAY_MS)], {
        now,
        config: cfg,
        dayOfYear: 1,
      }).map((item) => item.stickyId),
    ).toEqual(['a']))
  it('6: limits new cards per session', () => {
    const cards = Array.from({ length: 200 }, (_, index): QueueCard => ({
      deckId: 'deck',
      stickyId: String(index),
      order: index,
    }))
    expect(
      buildQueue(cards, {
        now,
        config: { ...cfg, newPerSession: 5, maxNewInCirculation: 300 },
        dayOfYear: 1,
      }),
    ).toHaveLength(5)
  })
  it('7: respects max new in circulation', () => {
    const existing = Array.from({ length: 28 }, (_, index) =>
      card(`old-${index}`, index < 14 ? 0 : 1, now + DAY_MS, index),
    )
    const newCards = Array.from({ length: 20 }, (_, index): QueueCard => ({
      deckId: 'deck',
      stickyId: `new-${index}`,
      order: index + 28,
    }))
    const queue = buildQueue([...existing, ...newCards], {
      now,
      config: { ...cfg, newPerSession: 10, maxNewInCirculation: 30 },
      dayOfYear: 1,
    })
    expect(
      queue.filter((item) => item.stickyId.startsWith('new-')),
    ).toHaveLength(2)
  })
  it('8: requeues a lapse roughly five cards later, never immediately', () => {
    const queue = Array.from({ length: 8 }, (_, index) =>
      card(String(index), 1, now, index),
    )
    expect(
      requeueAfterAgain(queue, card('failed'), 1).findIndex(
        (item) => item.stickyId === 'failed',
      ),
    ).toBe(5)
    expect(
      requeueAfterAgain(queue, card('failed'), 2).findIndex(
        (item) => item.stickyId === 'failed',
      ),
    ).toBe(8)
  })
  it('9: merge replay contains both device reviews and is deterministic', () => {
    const log = [review('b', 'good', now + 1, 1), review('a', 'good', now, 1)]
    expect(replay(log, { config: cfg }).get('deck\u0000a')).toMatchObject({
      level: 2,
      totalReviews: 2,
    })
    expect(replay([...log].reverse(), { config: cfg })).toEqual(
      replay(log, { config: cfg }),
    )
  })
  it('10: a manual level four survives an earlier concurrent again', () => {
    const merged = replay(
      [
        review('again', 'again', now, 0),
        review('manual', 'again', now + 1, 4, 'manual'),
      ],
      { config: cfg },
    )
    expect(merged.get('deck\u0000a')).toMatchObject({
      level: 4,
      manualOverride: true,
    })
  })
  it('11: calculates the daily goal including default accuracy lapse load', () => {
    const states = Array.from({ length: 125 }, (_, index) =>
      state(0, String(index)),
    )
    expect(
      goalTarget(states, now + 30 * DAY_MS, now, 0, 0, 1.2).dailyTarget,
    ).toBe(21)
  })
  it('calculates a later goal date at the warning threshold', () => {
    const states = Array.from({ length: 200 }, () => state(0))
    const goal = goalTarget(states, now + DAY_MS, now, 0, 0, 1)
    const suggested = suggestedGoalDate(goal, now)
    expect(suggested).toBe(now + 5 * DAY_MS)
    expect(
      goalTarget(states, suggested, now, 0, 0, 1).dailyTarget,
    ).toBeLessThanOrEqual(200)

    const largeGoal = goalTarget(
      Array.from({ length: 5000 }, () => state(0)),
      now + DAY_MS,
      now,
      0,
      0,
      1,
    )
    expect(
      goalTarget(
        Array.from({ length: 5000 }, () => state(0)),
        suggestedGoalDate(largeGoal, now),
        now,
        0,
        0,
        1,
      ).dailyTarget,
    ).toBeLessThanOrEqual(200)
  })
  it('12: replay reproduces the same projection after backup import', () => {
    const log = [review('1', 'good', now, 1), review('2', 'easy', now + 2, 4)]
    expect(replay(log, { config: cfg })).toEqual(
      replay([...log], { config: cfg }),
    )
  })
  it('13: fuzz stays within plus or minus ten percent', () => {
    for (let index = 0; index < 1000; index += 1) {
      const due = nextDue(3, DEFAULT_SRS_CONFIG, now, () => index / 999)!
      expect(due - now).toBeGreaterThanOrEqual(27 * DAY_MS)
      expect(due - now).toBeLessThanOrEqual(33 * DAY_MS)
    }
  })
  it('14: level weighted progress uses full deck size', () =>
    expect(
      progress(
        100,
        Array.from({ length: 100 }, (_, index) => state(2, String(index))),
      ),
    ).toBe(0.5))
  it('15: maps progress to the matching belt-rank level', () => {
    expect(progressLevel(Number.NaN)).toBe(0)
    expect(progressLevel(0)).toBe(0)
    expect(progressLevel(0.249)).toBe(0)
    expect(progressLevel(0.25)).toBe(1)
    expect(progressLevel(0.5)).toBe(2)
    expect(progressLevel(0.75)).toBe(3)
    expect(progressLevel(1)).toBe(4)
    expect(progressLevel(2)).toBe(4)
  })
})

describe('SRS properties and edge cases', () => {
  it('is replay-twice idempotent, including duplicate review IDs', () => {
    const log = [
      review('same', 'good', now, 1),
      review('same', 'again', now + 1, 0),
    ]
    const once = replay(log, { config: cfg })
    expect(replay(log, { config: cfg })).toEqual(once)
    expect(once.get('deck\u0000a')?.totalReviews).toBe(1)
  })
  it('keeps grade-derived levels in the 0–4 domain', () => {
    for (let level = 0; level <= 4; level += 1)
      for (const grade of ['again', 'good', 'easy'] as const) {
        expect(
          isCardLevel(
            applyGrade({
              state: state(level),
              grade,
              config: { ...cfg, passIsMinusOne: true },
              redCount: 50,
              at: now,
              deviceId: 'd',
            }).level,
          ),
        ).toBe(true)
      }
  })
  it('covers schedule, queue priming, and goal boundary helpers', () => {
    expect(nextDue(0, cfg, now)).toBeNull()
    expect(intervalDays(null, now)).toBe(0)
    expect(intervalDays(now - DAY_MS, now)).toBe(0)
    expect(progress(0, [])).toBe(0)
    const primed = buildQueue(
      [
        card('a', 1, now, 0, ['日']),
        card('b', 1, now, 1, ['日']),
        card('c', 1, now, 2, ['月']),
      ],
      { now, config: cfg, dailyGoal: 3, dayOfYear: 9 },
    )
    expect(primed.map((item) => item.stickyId)).toHaveLength(3)
    expect(projectedCompletion(now, [state(0)], 0, 0)).toBeNull()
    expect(projectedCompletion(now, [state(0)], 0, 1)).toBeNull()
    expect(projectedCompletion(now, [state(0)], 4, 2)).toBe(now + 2 * DAY_MS)
    expect(goalTarget([], now - DAY_MS, now, 20, 20, 1).dailyTarget).toBe(5)
    expect(
      goalTarget(
        Array.from({ length: 2000 }, () => state(0)),
        now + DAY_MS,
        now,
        20,
        20,
        1,
      ).warns,
    ).toBe(true)
  })

  it('summarizes due study retention by starting level and ignores non-answer history', () => {
    expect(
      retentionByLevel([
        { levelBefore: 0, grade: 'good', source: 'study', elapsedDays: 0 },
        { levelBefore: 0, grade: 'again', source: 'study', elapsedDays: 0 },
        { levelBefore: 1, grade: 'easy', source: 'study', elapsedDays: 3 },
        { levelBefore: 1, grade: 'again', source: 'manual', elapsedDays: 3 },
        { levelBefore: 2, grade: 'again', source: 'study', elapsedDays: 1 },
      ]),
    ).toEqual([
      { level: 0, reviews: 2, retained: 1, retentionPercent: 50 },
      { level: 1, reviews: 1, retained: 1, retentionPercent: 100 },
      { level: 2, reviews: 0, retained: 0, retentionPercent: null },
      { level: 3, reviews: 0, retained: 0, retentionPercent: null },
      { level: 4, reviews: 0, retained: 0, retentionPercent: null },
    ])
  })
  it('excludes reviews before 80% of a stage interval but includes them at the threshold', () => {
    expect(
      retentionByLevel([
        { levelBefore: 1, grade: 'again', source: 'study', elapsedDays: 2 },
        { levelBefore: 1, grade: 'good', source: 'study', elapsedDays: 3 },
        { levelBefore: 2, grade: 'easy', source: 'study', elapsedDays: 7.1 },
        { levelBefore: 2, grade: 'good', source: 'study', elapsedDays: 8 },
      ]),
    ).toEqual([
      { level: 0, reviews: 0, retained: 0, retentionPercent: null },
      { level: 1, reviews: 1, retained: 1, retentionPercent: 100 },
      { level: 2, reviews: 1, retained: 1, retentionPercent: 100 },
      { level: 3, reviews: 0, retained: 0, retentionPercent: null },
      { level: 4, reviews: 0, retained: 0, retentionPercent: null },
    ])
  })
  it('forecasts scheduled reviews by local calendar day and carries overdue cards into today', () => {
    const forecastNow = new Date(2026, 7, 7, 15, 30).getTime()
    const forecast = reviewForecast(forecastNow, [
      { ...state(1), dueAt: forecastNow - DAY_MS },
      { ...state(2), dueAt: forecastNow + 2 * DAY_MS },
      { ...state(3), dueAt: forecastNow + 29 * DAY_MS },
      { ...state(4), dueAt: null },
      { ...state(1), dueAt: forecastNow + 31 * DAY_MS },
    ])

    expect(forecast).toHaveLength(30)
    expect(forecast[0]?.reviews).toBe(1)
    expect(forecast[2]?.reviews).toBe(1)
    expect(forecast[29]?.reviews).toBe(1)
    expect(forecast.reduce((total, day) => total + day.reviews, 0)).toBe(3)
    expect(reviewForecast(forecastNow, [], 0)).toEqual([])
  })
  it('identifies cards with six or more lapses and orders the worst first', () => {
    expect(
      identifyLeeches([
        { ...state(1, 'z'), lapses: 6 },
        { ...state(4, 'b'), lapses: 8 },
        { ...state(4, 'a'), lapses: 8 },
        { ...state(3, 'ignored'), lapses: 5 },
      ]),
    ).toEqual([
      expect.objectContaining({ stickyId: 'a', level: 4, lapses: 8 }),
      expect.objectContaining({ stickyId: 'b', level: 4, lapses: 8 }),
      expect.objectContaining({ stickyId: 'z', level: 1, lapses: 6 }),
    ])
  })
  it('exercises deterministic interleaving and all replay red-count paths', () => {
    const allPrimed = interleaveQueue(
      [
        card('a', 1, now, 0, ['日']),
        card('b', 1, now, 1, ['日']),
        card('c', 1, now, 2, ['日']),
      ],
      new Set(),
      'seed',
    )
    expect(allPrimed).toHaveLength(3)
    expect(
      interleaveQueue(
        [card('with-char', 1, now, 0, ['日']), card('without-char', 1, now, 1)],
        new Set(),
        'seed',
      ),
    ).toHaveLength(2)
    expect(buildQueue([], { now, config: cfg, dayOfYear: 1 })).toEqual([])
    expect(
      buildQueue([card('null-due', 1, null, 0)], {
        now,
        config: cfg,
        dayOfYear: 1,
      }),
    ).toHaveLength(1)
    expect(
      buildQueue([card('recycle', 4, now, 0)], {
        now,
        config: cfg,
        dayOfYear: 1,
      }),
    ).toHaveLength(1)
    const duplicateAhead = [
      card('same', 1, now, 0),
      card('same', 2, now + DAY_MS, 1),
      card('ahead', 2, now + DAY_MS, 2),
    ]
    expect(
      buildQueue(duplicateAhead, {
        now,
        config: cfg,
        dailyGoal: 3,
        dayOfYear: 1,
      })
        .map((item) => item.stickyId)
        .sort(),
    ).toEqual(['ahead', 'same'])
    const redLog = [
      review('red', 'again', now, 0),
      { ...review('other', 'again', now + 1, 0), stickyId: 'other' },
    ]
    expect(replay(redLog, { config: cfg }).size).toBe(2)
    expect(
      replay([review('injected', 'again', now, 0)], {
        config: cfg,
        redCount: () => 50,
      }).size,
    ).toBe(1)
    expect(
      replay([review('z', 'good', now, 1), review('a', 'good', now, 1)], {
        config: cfg,
      }).get('deck\u0000a')?.level,
    ).toBe(2)
  })
})
