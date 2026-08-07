'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getActiveUserRuntime } from '@/auth/runtime';
import { progress as computeProgress, goalTarget } from '@/core/srs/goal';
import { createUserRepositories, type CardState } from '@/data/repo';
import { Button } from '@/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card';
import { loadStarterDeck } from '@/features/study/deck-loader';

const STARTER_DECK_ID = 'dev-kanji';
const DAY_MS = 86_400_000;

interface HomeData {
  readonly deckName: string;
  readonly cardCount: number;
  readonly progressPercent: number;
  readonly lastStudiedAt: number | null;
  readonly goalDate: number | null;
  readonly goal: ReturnType<typeof goalTarget> | null;
}

export function HomeScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime();
  const [data, setData] = useState<HomeData | null>(null);
  const [goalInput, setGoalInput] = useState('');

  async function refresh(): Promise<void> {
    if (!runtime) return;
    await runtime.database.ready;
    const repo = createUserRepositories(runtime.database);
    const loaded = await loadStarterDeck(runtime.database, STARTER_DECK_ID);

    const states: CardState[] = loaded.cards
      .map((card) => card.state)
      .filter((state): state is CardState => state !== undefined);
    let lastStudiedAt: number | null = null;
    for (const state of states) {
      if (state.lastReviewedAt && (lastStudiedAt === null || state.lastReviewedAt > lastStudiedAt)) {
        lastStudiedAt = state.lastReviewedAt;
      }
    }
    const coreStates = states.map(({ contentRef, ...rest }) => ({ ...rest, stickyId: contentRef }));
    const progressPercent = Math.round(computeProgress(loaded.cards.length, coreStates) * 100);

    const goalSetting = await repo.settings.get(`goal:${STARTER_DECK_ID}`);
    const goalDate = goalSetting ? Number(goalSetting.value) : null;
    let goal: ReturnType<typeof goalTarget> | null = null;
    if (goalDate) {
      const now = Date.now();
      const recentReviews = await repo.reviews.list(STARTER_DECK_ID);
      const cutoff = now - 14 * DAY_MS;
      const recent = recentReviews.filter((review) => review.at >= cutoff);
      const correct14d = recent.filter((review) => review.grade !== 'again').length;
      goal = goalTarget(coreStates, goalDate, now, correct14d, recent.length, 1);
    }

    setData({ deckName: loaded.name, cardCount: loaded.cards.length, progressPercent, lastStudiedAt, goalDate, goal });
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  async function setGoal(): Promise<void> {
    if (!runtime || !goalInput) return;
    const repo = createUserRepositories(runtime.database);
    const date = new Date(goalInput).getTime();
    if (Number.isNaN(date)) return;
    await repo.settings.set({ key: `goal:${STARTER_DECK_ID}`, value: String(date), updatedAt: Date.now() });
    await refresh();
  }

  if (!runtime) return <main className="p-6 text-muted-foreground">Sign in to see your progress.</main>;
  if (!data) return <main className="p-6 text-muted-foreground" aria-busy="true">Loading…</main>;

  const deckName = data.deckName;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>{deckName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Progress</span>
              <span>{data.progressPercent}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[var(--level-3)] transition-all motion-reduce:transition-none"
                style={{ width: `${data.progressPercent}%` }}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {data.lastStudiedAt ? `Last studied ${new Date(data.lastStudiedAt).toLocaleString()}` : 'Not studied yet'}
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
              <dt className="text-muted-foreground">Correct answers needed today</dt>
              <dd className="text-right">{data.goal.dailyTarget}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-right">{data.goal.warns ? 'Behind pace — consider a later date' : 'On pace'}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No goal date set yet.</p>
          )}
          <div className="flex gap-2">
            <input
              type="date"
              value={goalInput}
              onChange={(event) => setGoalInput(event.target.value)}
              className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button variant="secondary" onClick={() => void setGoal()}>
              Set goal
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
