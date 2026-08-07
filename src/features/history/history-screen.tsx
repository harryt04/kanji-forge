'use client'

import { useEffect, useState } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories, type DailyStat } from '@/data/repo'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/ui/card'

const HISTORY_DAYS = 30

interface ActivityDay {
  readonly date: Date
  readonly day: string
  readonly reviews: number
  readonly correct: number
  readonly again: number
}

interface HistoryData {
  readonly days: readonly ActivityDay[]
  readonly totalReviews: number
  readonly totalCorrect: number
}

function dayKey(date: Date): string {
  return date.toDateString()
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function buildActivityDays(
  stats: readonly DailyStat[],
  now = Date.now(),
): HistoryData {
  const today = new Date(now)
  const statByDay = new Map(stats.map((stat) => [stat.day, stat]))
  const days: ActivityDay[] = []

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    const stat = statByDay.get(dayKey(date))
    days.push({
      date,
      day: dayKey(date),
      reviews: stat?.reviews ?? 0,
      correct: stat?.correct ?? 0,
      again: stat?.again ?? 0,
    })
  }

  return {
    days,
    totalReviews: days.reduce((total, day) => total + day.reviews, 0),
    totalCorrect: days.reduce((total, day) => total + day.correct, 0),
  }
}

export function HistoryScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [data, setData] = useState<HistoryData | null>(null)

  useEffect(() => {
    if (!runtime) return
    let active = true
    void (async () => {
      await runtime.database.ready
      const repo = createUserRepositories(runtime.database)
      const stats = await repo.dailyStats.list()
      if (active) setData(buildActivityDays(stats))
    })()
    return () => {
      active = false
    }
  }, [runtime])

  if (!runtime)
    return (
      <main className="text-muted-foreground p-6">
        Sign in to see your study history.
      </main>
    )

  if (!data)
    return (
      <main className="text-muted-foreground p-6" aria-busy="true">
        Loading…
      </main>
    )

  const maxReviews = Math.max(1, ...data.days.map((day) => day.reviews))

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Study history</CardTitle>
          <CardDescription>
            Review activity for the last {HISTORY_DAYS} days. Each bar is one
            local calendar day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="group"
            aria-label={`Study activity for the last ${HISTORY_DAYS} days. ${data.totalReviews} reviews, ${data.totalCorrect} correct.`}
          >
            <div className="border-border flex h-52 items-end gap-1 border-b border-l px-1 pb-0">
              {data.days.map((day) => (
                <div
                  key={day.day}
                  data-testid="history-bar"
                  data-day={day.day}
                  className="bg-primary min-w-0 flex-1 rounded-t-sm transition-[height] motion-reduce:transition-none"
                  style={{
                    height:
                      day.reviews === 0
                        ? '0%'
                        : `${Math.max(4, (day.reviews / maxReviews) * 100)}%`,
                  }}
                  role="img"
                  aria-label={`${formatDay(day.date)}: ${day.reviews} ${day.reviews === 1 ? 'review' : 'reviews'}, ${day.correct} correct, ${day.again} again`}
                  title={`${formatDay(day.date)}: ${day.reviews} reviews`}
                />
              ))}
            </div>
            <div className="text-muted-foreground mt-2 flex justify-between px-1 text-xs">
              <span>{formatDay(data.days[0]!.date)}</span>
              <span>{formatDay(data.days[data.days.length - 1]!.date)}</span>
            </div>
          </div>
          <dl className="border-border mt-6 grid grid-cols-2 gap-4 border-t pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Reviews</dt>
              <dd className="text-xl font-semibold">{data.totalReviews}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Correct</dt>
              <dd className="text-xl font-semibold">{data.totalCorrect}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Again</dt>
              <dd className="text-xl font-semibold">
                {data.totalReviews - data.totalCorrect}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active days</dt>
              <dd className="text-xl font-semibold">
                {data.days.filter((day) => day.reviews > 0).length}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </main>
  )
}
