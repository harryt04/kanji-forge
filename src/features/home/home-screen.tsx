'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  progress as computeProgress,
  progressLevel as computeProgressLevel,
  projectedCompletion,
  goalTarget,
} from '@/core/srs/goal'
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
  readonly lastStudiedAt: number | null
  readonly totalStudyTimeMs: number
  readonly goalDate: number | null
  readonly goal: ReturnType<typeof goalTarget> | null
  readonly projectedCompletionAt: number | null
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

export function HomeScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [data, setData] = useState<HomeData | null>(null)
  const [goalInput, setGoalInput] = useState('')

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

    const goalSetting = await repo.settings.get(`goal:${STARTER_DECK_ID}`)
    const goalDate = goalSetting ? Number(goalSetting.value) : null
    const recentReviews = await repo.reviews.list(STARTER_DECK_ID)
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
      lastStudiedAt,
      totalStudyTimeMs,
      goalDate,
      goal,
      projectedCompletionAt,
    })
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime])

  async function setGoal(): Promise<void> {
    if (!runtime || !goalInput) return
    const repo = createUserRepositories(runtime.database)
    const date = new Date(goalInput).getTime()
    if (Number.isNaN(date)) return
    await repo.settings.set({
      key: `goal:${STARTER_DECK_ID}`,
      value: String(date),
      updatedAt: Date.now(),
    })
    await refresh()
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
