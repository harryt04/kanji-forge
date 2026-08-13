'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  progress as computeProgress,
  progressLevel as computeProgressLevel,
  projectedCompletion,
  goalTarget,
  reviewForecast,
  suggestedGoalDate,
} from '@/core/srs/goal'
import { retentionByLevel, type RetentionLevel } from '@/core/srs/retention'
import { identifyLeeches, type Leech } from '@/core/srs/leeches'
import { emptyCardState } from '@/core/srs/types'
import {
  createUserRepositories,
  type CardInDeck,
  type CardState,
  type UserRepositories,
} from '@/data/repo'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import { loadDeck, loadStarterDeck } from '@/features/study/deck-loader'
import { loadDeckDefinitions } from '@/data/packs'
import { toCoreState } from '@/features/study/adapters'
import {
  groupDecksByFolder,
  normalizeDeckFolder,
} from '@/features/settings/deck-folders'

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

interface DeckShelfItem {
  readonly id: string
  readonly name: string
  readonly cardCount: number
  readonly progressPercent: number
  readonly progressLevel: 0 | 1 | 2 | 3 | 4
  readonly lastStudiedAt: number | null
  readonly folder: string
}

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
  readonly leeches: readonly Leech[]
  readonly content: ReadonlyMap<string, { readonly literal: string }>
  readonly forecast: ReturnType<typeof reviewForecast>
  readonly builtInDecks: readonly DeckShelfItem[]
  readonly customDecks: readonly DeckShelfItem[]
}

async function summarizeDeck(
  repo: UserRepositories,
  deck: Pick<DeckShelfItem, 'id' | 'name'>,
  cards: readonly CardInDeck[],
  userId: string,
  folder = '',
): Promise<DeckShelfItem> {
  const states = cards.map(({ contentRef, state }) =>
    state ? toCoreState(state) : emptyCardState(deck.id, contentRef, userId),
  )
  const sessions = await repo.sessions.list(deck.id)
  const lastReviewedAt = cards.reduce<number | null>(
    (latest, card) =>
      card.state?.lastReviewedAt &&
      (latest === null || card.state.lastReviewedAt > latest)
        ? card.state.lastReviewedAt
        : latest,
    null,
  )
  const lastSessionAt = sessions.reduce<number | null>(
    (latest, session) =>
      session.endedAt !== null && (latest === null || session.endedAt > latest)
        ? session.endedAt
        : latest,
    null,
  )

  return {
    id: deck.id,
    name: deck.name,
    cardCount: cards.length,
    progressPercent: Math.round(computeProgress(cards.length, states) * 100),
    progressLevel: computeProgressLevel(computeProgress(cards.length, states)),
    lastStudiedAt:
      lastReviewedAt === null
        ? lastSessionAt
        : lastSessionAt === null
          ? lastReviewedAt
          : Math.max(lastReviewedAt, lastSessionAt),
    folder,
  }
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
    const settings = await repo.settings.list()
    const builtInDecks = await Promise.all(
      (await loadDeckDefinitions()).map(async (definition) => {
        const existing = await repo.decks.get(definition.id)
        const deck =
          existing ??
          ({
            id: definition.id,
            name: definition.name,
            kind: 'derived',
            definitionId: definition.id,
            updatedAt: Date.now(),
          } as const)
        if (!existing) await repo.decks.upsert(deck)
        const cards = await repo.decks.listCards(deck.id, {
          contentRefsFor: () => definition.contentRefs,
        })
        return summarizeDeck(repo, deck, cards, runtime.userId)
      }),
    )
    const customDecks = await Promise.all(
      (await repo.decks.list())
        .filter((candidate) => candidate.kind === 'custom')
        .map(async (candidate): Promise<DeckShelfItem> => {
          const customDeck = await loadDeck(runtime.database, candidate.id)
          return summarizeDeck(
            repo,
            candidate,
            customDeck.cards,
            runtime.userId,
            normalizeDeckFolder(
              settings.find(
                (setting) => setting.key === `deck-folder:${candidate.id}`,
              )?.value,
            ),
          )
        }),
    )

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
    const leeches = identifyLeeches(coreStates)
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
    const forecast = reviewForecast(now, coreStates)
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
      leeches,
      content: loaded.content,
      forecast,
      builtInDecks,
      customDecks,
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
  const customDeckGroups = groupDecksByFolder(
    data.customDecks,
    Object.fromEntries(data.customDecks.map((deck) => [deck.id, deck.folder])),
  )
  const builtInDecks = data.builtInDecks
  const progressLabel = `Level ${data.progressLevel}, ${BELT_NAMES[data.progressLevel]}`
  const forecastTotal = data.forecast.reduce(
    (total, day) => total + day.reviews,
    0,
  )
  const forecastPeak = data.forecast.reduce(
    (peak, day) => Math.max(peak, day.reviews),
    0,
  )
  const forecastPeakDay = data.forecast.find(
    (day) => day.reviews === forecastPeak,
  )
  const formatForecastDay = (date: string, index: number): string => {
    if (index === 0) return 'Today'
    return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

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
                    className={`level-swatch sticky-shape l${level} h-full`}
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
                      className={`level-swatch sticky-shape l${level} h-3 w-3 shrink-0 rounded-sm`}
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

      {data.customDecks.length > 0 && (
        <Card data-testid="custom-deck-shelf">
          <CardHeader>
            <CardTitle className="text-base">Your decks</CardTitle>
            <p className="text-muted-foreground text-sm">
              Study or browse any custom deck offline. Each deck keeps its own
              SRS progress.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {customDeckGroups.map((group) => (
              <section
                key={group.name}
                aria-labelledby={`custom-deck-folder-${group.name}`}
              >
                <h3
                  id={`custom-deck-folder-${group.name}`}
                  className="text-muted-foreground mb-2 text-sm font-semibold"
                >
                  {group.name}
                </h3>
                <div className="space-y-3">
                  {group.decks.map((deck) => (
                    <div
                      key={deck.id}
                      className="border-border rounded-md border p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate font-medium">{deck.name}</h4>
                          <p className="text-muted-foreground text-sm">
                            {deck.progressPercent}% · {deck.cardCount}{' '}
                            {deck.cardCount === 1 ? 'card' : 'cards'}
                            {deck.lastStudiedAt
                              ? ` · Last studied ${new Date(deck.lastStudiedAt).toLocaleString()}`
                              : ' · Not studied yet'}
                          </p>
                        </div>
                        <span
                          className="level-swatch sticky-shape h-8 w-8 shrink-0"
                          data-level={deck.progressLevel}
                          aria-label={`Deck color: level ${deck.progressLevel}`}
                        />
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" asChild>
                          <Link
                            href={`/study?deckId=${encodeURIComponent(deck.id)}`}
                          >
                            Study
                          </Link>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            href={`/browse?deckId=${encodeURIComponent(deck.id)}`}
                          >
                            Browse
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </CardContent>
        </Card>
      )}

      <Card data-testid="builtin-deck-shelf">
        <CardHeader>
          <CardTitle className="text-base">Built-in decks</CardTitle>
          <p className="text-muted-foreground text-sm">
            Choose a bundled deck to study or browse. Progress is tracked
            separately for each deck.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {builtInDecks.map((deck) => (
            <div key={deck.id} className="border-border rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">{deck.name}</h3>
                  <p className="text-muted-foreground text-sm">
                    {deck.progressPercent}% · {deck.cardCount}{' '}
                    {deck.cardCount === 1 ? 'card' : 'cards'}
                    {deck.lastStudiedAt
                      ? ` · Last studied ${new Date(deck.lastStudiedAt).toLocaleString()}`
                      : ' · Not studied yet'}
                  </p>
                </div>
                <span
                  className="level-swatch sticky-shape h-8 w-8 shrink-0"
                  data-level={deck.progressLevel}
                  aria-label={`Deck color: level ${deck.progressLevel}`}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link href={`/study?deckId=${encodeURIComponent(deck.id)}`}>
                    Study
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/browse?deckId=${encodeURIComponent(deck.id)}`}>
                    Browse
                  </Link>
                </Button>
              </div>
            </div>
          ))}
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

      <Card data-testid="leeches">
        <CardHeader>
          <CardTitle className="text-base">Leeches</CardTitle>
          <p className="text-muted-foreground text-sm">
            Cards missed six or more times. Give these extra attention or review
            your intervals.
          </p>
        </CardHeader>
        <CardContent>
          {data.leeches.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No leeches yet. Keep studying to find cards that need extra
              attention.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.leeches.map((leech) => {
                const card = data.content.get(leech.stickyId)
                return (
                  <li
                    key={leech.stickyId}
                    className="border-border flex items-center justify-between gap-3 rounded-md border p-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Link
                        className="text-primary text-xl underline underline-offset-4"
                        href={`/detail?contentRef=${encodeURIComponent(leech.stickyId)}`}
                        lang="ja"
                        aria-label={`View details for ${card?.literal ?? leech.stickyId}`}
                      >
                        {card?.literal ?? leech.stickyId}
                      </Link>
                      <span className="text-muted-foreground truncate">
                        Level {leech.level}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">
                      {leech.lapses} lapses
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card data-testid="review-forecast">
        <CardHeader>
          <CardTitle className="text-base">30-day review forecast</CardTitle>
          <p className="text-muted-foreground text-sm">
            Reviews currently scheduled by your card intervals. Overdue cards
            count today; new cards are not scheduled until a session starts.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            role="img"
            aria-label={`30-day review forecast: ${forecastTotal} scheduled ${forecastTotal === 1 ? 'review' : 'reviews'}. Peak day has ${forecastPeak} ${forecastPeak === 1 ? 'review' : 'reviews'}.`}
            className="bg-muted flex h-28 items-end gap-px rounded-md p-2"
          >
            {data.forecast.map((day, index) => (
              <div
                key={day.date}
                aria-hidden="true"
                data-date={day.date}
                title={`${formatForecastDay(day.date, index)}: ${day.reviews} ${day.reviews === 1 ? 'review' : 'reviews'}`}
                className="bg-primary min-w-0 flex-1 rounded-t-sm"
                style={{
                  height: `${day.reviews === 0 ? 3 : Math.max(8, (day.reviews / Math.max(1, forecastPeak)) * 100)}%`,
                }}
              />
            ))}
          </div>
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>Today</span>
            <span>30 days</span>
          </div>
          <p className="text-muted-foreground text-sm">
            {forecastTotal === 0
              ? 'No reviews are scheduled in this window.'
              : `${forecastTotal} scheduled ${forecastTotal === 1 ? 'review' : 'reviews'} over the next 30 days. Busiest day: ${formatForecastDay(forecastPeakDay!.date, data.forecast.indexOf(forecastPeakDay!))} (${forecastPeak}).`}
          </p>
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
