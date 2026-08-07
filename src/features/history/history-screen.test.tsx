import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { HistoryScreen } from './history-screen'

const DAY_MS = 86_400_000

afterEach(() => {
  cleanup()
  clearUserRuntime()
})

async function recordReview(
  userId: string,
  id: string,
  at: number,
  grade: 'again' | 'good',
): Promise<void> {
  const runtime = bootstrapUserRuntime(userId)
  await runtime.database.ready
  const repo = createUserRepositories(runtime.database)
  await repo.recordGrade({
    review: {
      id,
      deckId: 'dev-kanji',
      contentRef: `kanji:${id}`,
      at,
      grade,
      levelBefore: 0,
      levelAfter: grade === 'again' ? 0 : 1,
      intervalBefore: 0,
      elapsedDays: 0,
      responseMs: 100,
      source: 'study',
      deviceId: 'device',
    },
    nextState: {
      deckId: 'dev-kanji',
      contentRef: `kanji:${id}`,
      level: grade === 'again' ? 0 : 1,
      dueAt: null,
      lastReviewedAt: at,
      correctStreak: grade === 'again' ? 0 : 1,
      totalReviews: 1,
      totalCorrect: grade === 'again' ? 0 : 1,
      lapses: grade === 'again' ? 1 : 0,
      flagged: false,
      manualOverride: false,
      updatedAt: at,
      updatedBy: 'device',
    },
    day: new Date(at).toDateString(),
    mutation: {
      id,
      mutType: 'review.append',
      payload: '{}',
      createdAt: at,
      attempts: 0,
    },
  })
}

describe('HistoryScreen', () => {
  it('requires an authenticated runtime', () => {
    render(<HistoryScreen />)
    expect(
      screen.getByText('Sign in to see your study history.'),
    ).toBeInTheDocument()
  })

  it('renders a 30-day empty chart for a new learner', async () => {
    bootstrapUserRuntime('history-empty')
    render(<HistoryScreen />)

    await waitFor(() =>
      expect(screen.getByText('Study history')).toBeInTheDocument(),
    )
    expect(screen.getAllByTestId('history-bar')).toHaveLength(30)
    expect(screen.getAllByTestId('history-heatmap-day')).toHaveLength(30)
    expect(
      screen.getByRole('group', {
        name: 'Review activity heatmap for the last 30 days',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('group', {
        name: 'Study activity for the last 30 days. 0 reviews, 0 correct.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Active days').nextElementSibling,
    ).toHaveTextContent('0')
  })

  it('plots recorded days and summarizes their activity', async () => {
    const now = Date.now()
    await recordReview('history-active', '日', now - 2 * DAY_MS, 'good')
    await recordReview('history-active', '本', now - 2 * DAY_MS + 1, 'again')
    await recordReview('history-active', '語', now, 'good')

    render(<HistoryScreen />)

    await waitFor(() =>
      expect(screen.getByText('Study history')).toBeInTheDocument(),
    )
    expect(screen.getByText('Reviews').nextElementSibling).toHaveTextContent(
      '3',
    )
    expect(screen.getByText('Correct').nextElementSibling).toHaveTextContent(
      '2',
    )
    expect(screen.getByText('Again').nextElementSibling).toHaveTextContent('1')
    const selectedDays = screen.getAllByRole('button', {
      name: /2 reviews, 1 correct, 1 again/,
    })
    expect(selectedDays).toHaveLength(2)
    const selectedBar = selectedDays[0]!
    const selectedHeatmapDay = selectedDays[1]!
    expect(selectedHeatmapDay).toHaveAttribute('data-activity-level', '4')

    fireEvent.click(selectedBar)
    const detail = screen.getByTestId('history-day-detail')
    const values = detail.querySelectorAll('dd')
    expect(values[0]).toHaveTextContent('2')
    expect(values[1]).toHaveTextContent('1')
    expect(values[2]).toHaveTextContent('1')
    expect(selectedBar).toHaveAttribute('aria-pressed', 'true')
    expect(selectedHeatmapDay).toHaveAttribute('aria-pressed', 'true')
  })
})
