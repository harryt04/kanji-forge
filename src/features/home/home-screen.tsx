'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  progress as computeProgress,
  progressLevel as computeProgressLevel,
  projectedCompletion,
  goalTarget,
  suggestedGoalDate,
} from '@/core/srs/goal'
import { retentionByLevel, type RetentionLevel } from '@/core/srs/retention'
import { emptyCardState } from '@/core/srs/types'
import { createUserRepositories, type CardState } from '@/data/repo'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { loadStarterDeck } from '@/features/study/deck-loader'
import { toCoreState } from '@/features/study/adapters'

const STARTER_DECK_ID = 'dev-kanji'
const DAY_MS = 86_400_000
const BELT_NAMES = [
  'white (Shiro)',
  'yellow (Ki)',
  'green (Midori)',
  'blue (Ao)',
  'black (Kuro)',
] as const
type LevelCounts = readonly [number, number, number, number, number]

function countCardsByLevel(
  cards: readonly { state: CardState | undefined }[],
): LevelCounts {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  for (const card of cards) {
    const level = card.state?.level ?? 0
    counts[level] = counts[level]! + 1
  }
  return counts
}

function formatStudyDuration(durationMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

interface HomeData {
  readonly deckName: string
  readonly cardCount: number
  readonly progressPercent: number
  readonly progressLevel: 0 | 1 | 2 | 3 | 4
  readonly levelCounts: LevelCounts
  readonly lastStudiedAt: number | null
  readonly totalStudyTimeMs: number
  readonly goalDate: number | null
  readonly goal: ReturnType<typeof goalTarget> | null
  readonly projectedCompletionAt: number | null
  readonly retention: readonly RetentionLevel[]
}

function localReviewDay(timestamp: number): string {
  return new Date(timestamp).toDateString()
}

function projectedComparison(
  projectedAt: number,
  goalDate: number,
  now: number,
): string {
  const projectedDays = Math.max(0, (projectedAt - now) / DAY_MS)
  const goalDays = Math.max(1, (goalDate - now) / DAY_MS)
  if (projectedDays > goalDays * 1.2)
    return 'At this pace, you are projected to finish after your goal date.'
  if (projectedDays < goalDays * 0.8)
    return 'At this pace, you are projected to finish ahead of your goal date.'
  return 'Your projected completion is on pace for your goal date.'
}

function formatProjectedDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  })
}

function formatDateInput(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function HomeScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [data, setData] = useState<HomeData | null>(null)
  const [goalInput, setGoalInput] = useState('')
  const [goalWarningDismissed, setGoalWarningDismissed] = useState(false)

  async function refresh(): Promise<void> {
    if (!runtime) return
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const loaded = await loadStarterDeck(runtime.database, STARTER_DECK_ID)

    const states: CardState[] = loaded.cards
      .map((card) => card.state)
      .filter((state): state is CardState => state !== undefined)
    let lastStudiedAt: number | null = null
    for (const state of states) {
      if (
        state.lastReviewedAt &&
        (lastStudiedAt === null || state.lastReviewedAt > lastStudiedAt)
      ) {
        lastStudiedAt = state.lastReviewedAt
      }
    }
    const completedSessions = await repo.sessions.list(STARTER_DECK_ID)
    const totalStudyTimeMs = completedSessions.reduce(
      (total, session) =>
        total +
        (session.endedAt === null
          ? 0
          : Math.max(0, session.endedAt - session.startedAt)),
      0,
    )
    const coreStates = loaded.cards.map(({ contentRef, state }) =>
      state
        ? toCoreState(state)
        : emptyCardState(STARTER_DECK_ID, contentRef, runtime.userId),
    )
    const progressPercent = Math.round(
      computeProgress(loaded.cards.length, coreStates) * 100,
    )
    const progressLevel = computeProgressLevel(progressPercent / 100)
    const levelCounts = countCardsByLevel(loaded.cards)

    const goalSetting = await repo.settings.get(`goal:${STARTER_DECK_ID}`)
    const goalDate = goalSetting ? Number(goalSetting.value) : null
    const recentReviews = await repo.reviews.list(STARTER_DECK_ID)
    const retention = retentionByLevel(recentReviews)
    const now = Date.now()
    const cutoff = now - 14 * DAY_MS
    const recent = recentReviews.filter((review) => review.at >= cutoff)
    const correct14d = recent.filter(
      (review) => review.grade !== 'again',
    ).length
    const activeDays14d = new Set(
      recent.map((review) => localReviewDay(review.at)),
    ).size
    const projectedCompletionAt = projectedCompletion(
      now,
      coreStates,
      correct14d,
      activeDays14d,
    )
    let goal: ReturnType<typeof goalTarget> | null = null
    if (goalDate) {
      goal = goalTarget(coreStates, goalDate, now, correct14d, recent.length, 1)
    }

    setData({
      deckName: loaded.name,
      cardCount: loaded.cards.length,
      progressPercent,
      progressLevel,
      levelCounts,
      lastStudiedAt,
      totalStudyTimeMs,
      goalDate,
      goal,
      projectedCompletionAt,
      retention,
    })
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime])

  async function saveGoalDate(date: number): Promise<void> {
    if (!runtime) return
    const repo = createUserRepositories(runtime.database)
    await repo.settings.set({
      key: `goal:${STARTER_DECK_ID}`,
      value: String(date),
      updatedAt: Date.now(),
    })
    await refresh()
  }

  async function setGoal(): Promise<void> {
    if (!goalInput) return
    const date = new Date(goalInput).getTime()
    if (Number.isNaN(date)) return
    await saveGoalDate(date)
  }

  async function moveGoalToSuggestedDate(): Promise<void> {
    if (!data?.goal) return
    const date = suggestedGoalDate(data.goal, Date.now())
    setGoalInput(formatDateInput(date))
    await saveGoalDate(date)
  }

  if (!runtime)
    return (
      <main className="text-muted-foreground p-6">
        Sign in to see your progress.
      </main>
    )
  if (!data)
    return (
      <main className="text-muted-foreground p-6" aria-busy="true">
        Loading…
      </main>
    )

  const deckName = data.deckName
  const progressLabel = `Level ${data.progressLevel}, ${BELT_NAMES[data.progressLevel]}`

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{deckName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>Progress</span>
              <span>{data.progressPercent}%</span>
            </div>
            <div
              role="progressbar"
              aria-label={`Deck progress: ${data.progressPercent}%. ${progressLabel}`}
              aria-valuenow={data.progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              data-level={data.progressLevel}
              className="bg-muted mt-1.5 h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className={`level-swatch sticky-shape l${data.progressLevel} h-full rounded-full transition-all motion-reduce:transition-none`}
                data-level={data.progressLevel}
                style={{ width: `${data.progressPercent}%` }}
              />
            </div>
          </div>
          <div className="space-y-3" data-testid="level-distribution">
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>Level distribution</span>
              <span>{data.cardCount} cards</span>
            </div>
            <div
              role="img"
              aria-label={`Level distribution: ${data.levelCounts
                .map(
                  (count, level) =>
                    `Level ${level}, ${BELT_NAMES[level]}: ${count} ${count === 1 ? 'card' : 'cards'}`,
                )
                .join('; ')}`}
              className="bg-muted flex h-3 w-full overflow-hidden rounded-full"
            >
              {data.levelCounts.map((count, level) =>
                count > 0 ? (
                  <div
                    key={level}
                    aria-hidden="true"
                    data-level={level}
                    className="level-swatch h-full"
                    style={{ width: `${(count / data.cardCount) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
              {data.levelCounts.map((count, level) => (
                <li
                  key={level}
                  className="text-muted-foreground flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      data-level={level}
                      className="level-swatch h-3 w-3 shrink-0 rounded-sm"
                    />
                    <span>
                      Level {level}, {BELT_NAMES[level]}
                    </span>
                  </span>
                  <span>
                    {count} {count === 1 ? 'card' : 'cards'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-muted-foreground text-sm">
            {data.lastStudiedAt
              ? `Last studied ${new Date(data.lastStudiedAt).toLocaleString()}`
              : 'Not studied yet'}
          </p>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">
              Total time studied:
            </span>{' '}
            {formatStudyDuration(data.totalStudyTimeMs)}
          </p>
          <Button size="lg" asChild className="w-full">
            <Link href="/study">Start studying</Link>
          </Button>
          <Button variant="outline" size="lg" asChild className="w-full">
            <Link href="/history">View study history</Link>
          </Button>
        </CardContent>
      </Card>

      <Card data-testid="retention-by-level">
        <CardHeader>
          <CardTitle className="text-base">Retention by level</CardTitle>
          <p className="text-muted-foreground text-sm">
            Correct answers divided by study reviews that started at each level.
            Manual adjustments are excluded.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border border-b text-left">
                  <th className="pb-2 font-medium">Level</th>
                  <th className="pb-2 text-right font-medium">Retention</th>
                  <th className="pb-2 text-right font-medium">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {data.retention.map((row) => (
                  <tr
                    key={row.level}
                    className="border-border border-b last:border-0"
                  >
                    <th className="py-2 text-left font-medium" scope="row">
                      Level {row.level}
                    </th>
                    <td className="py-2 text-right">
                      {row.retentionPercent === null
                        ? 'No reviews'
                        : `${row.retentionPercent}%`}
                    </td>
                    <td className="py-2 text-right">
                      {row.reviews === 0
                        ? '—'
                        : `${row.retained}/${row.reviews} correct`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.retention.some(
            (row) => row.retentionPercent !== null && row.retentionPercent < 80,
          ) ? (
            <p className="text-muted-foreground text-xs">
              Retention below 80% can indicate that a level&apos;s interval is
              too long.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Study more cards to see where your intervals are working best.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Goal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.goal ? (
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Days left</dt>
              <dd className="text-right">{data.goal.daysLeft}</dd>
              <dt className="text-muted-foreground">
                Correct answers needed today
              </dt>
              <dd className="text-right">{data.goal.dailyTarget}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-right">
                {data.goal.warns
                  ? 'Behind pace — consider a later date'
                  : 'On pace'}
              </dd>
            </dl>
          ) : (
            <p className="text-muted-foreground text-sm">
              No goal date set yet.
            </p>
          )}
          {data.goal?.warns && !goalWarningDismissed ? (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/5 space-y-3 rounded-md border p-3 text-sm"
            >
              <p>
                At this pace, you&apos;d need{' '}
                <strong>{data.goal.dailyTarget} correct answers a day</strong>.
                Move the goal date, or keep this goal and choose a smaller deck
                when deck selection is available.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void moveGoalToSuggestedDate()}
                >
                  Move goal date to{' '}
                  {formatDateInput(suggestedGoalDate(data.goal, Date.now()))}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setGoalWarningDismissed(true)}
                >
                  Keep current goal
                </Button>
              </div>
            </div>
          ) : null}
          {data.projectedCompletionAt ? (
            <div className="border-border rounded-md border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">
                  Projected completion:
                </span>{' '}
                {formatProjectedDate(data.projectedCompletionAt)}
              </p>
              {data.goalDate ? (
                <p className="text-muted-foreground mt-1">
                  {projectedComparison(
                    data.projectedCompletionAt,
                    data.goalDate,
                    Date.now(),
                  )}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Projected completion will appear after a study day with correct
              answers.
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="date"
              value={goalInput}
              onChange={(event) => setGoalInput(event.target.value)}
              className="border-input bg-background h-10 flex-1 rounded-md border px-3 text-sm"
            />
            <Button variant="secondary" onClick={() => void setGoal()}>
              Set goal
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
