import { readFileSync } from 'fs'
import { join } from 'path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { HomeScreen } from './home-screen'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^\/packs-dev\//, '')
    try {
      const buffer = readFileSync(join(FIXTURE_ROOT, path))
      const body = path.endsWith('.json')
        ? buffer.toString('utf8')
        : new Uint8Array(buffer)
      return new Response(body as BodyInit, { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }) as unknown as typeof fetch
}

let userId = 0

beforeEach(() => {
  vi.stubGlobal('fetch', fixtureFetch())
  userId += 1
})

afterEach(() => {
  cleanup()
  clearUserRuntime()
})

describe('HomeScreen', () => {
  it('shows a sign-in prompt when there is no active runtime', () => {
    render(<HomeScreen />)
    expect(
      screen.getByText('Sign in to see your progress.'),
    ).toBeInTheDocument()
  })

  it('shows a loading state before the deck resolves', async () => {
    bootstrapUserRuntime(`home-${userId}`)
    render(<HomeScreen />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    // Let the in-flight load settle before teardown closes the database out from under it.
    await waitFor(() =>
      expect(screen.getByText('Development Kanji')).toBeInTheDocument(),
    )
  })

  it('shows deck progress once loaded, with no goal set', async () => {
    bootstrapUserRuntime(`home-${userId}`)
    render(<HomeScreen />)

    await waitFor(() =>
      expect(screen.getByText('Development Kanji')).toBeInTheDocument(),
    )
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', {
        name: 'Deck progress: 0%. Level 0, white (Shiro)',
      }),
    ).toHaveAttribute('data-level', '0')
    expect(screen.getByText('Not studied yet')).toBeInTheDocument()
    expect(screen.getByText('No goal date set yet.')).toBeInTheDocument()
  })

  it('reflects progress from recorded card states in the progress bar', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.recordGrade({
      review: {
        id: 'r1',
        deckId: 'dev-kanji',
        contentRef: 'kanji:日',
        at: 1_700_000_000_000,
        grade: 'easy',
        levelBefore: 0,
        levelAfter: 4,
        intervalBefore: 0,
        elapsedDays: 0,
        responseMs: 1,
        source: 'study',
        deviceId: 'device',
      },
      nextState: {
        deckId: 'dev-kanji',
        contentRef: 'kanji:日',
        level: 4,
        dueAt: null,
        lastReviewedAt: 1_700_000_000_000,
        correctStreak: 1,
        totalReviews: 1,
        totalCorrect: 1,
        lapses: 0,
        flagged: false,
        manualOverride: false,
        updatedAt: 1_700_000_000_000,
        updatedBy: 'device',
      },
      day: '2023-11-14',
      mutation: {
        id: 'r1',
        mutType: 'review.append',
        payload: '{}',
        createdAt: 1_700_000_000_000,
        attempts: 0,
      },
    })

    render(<HomeScreen />)

    await waitFor(() =>
      expect(
        screen.getByText('Last studied', { exact: false }),
      ).toBeInTheDocument(),
    )
    const progressBar = document.querySelector(
      '[style*="width"]',
    ) as HTMLElement
    expect(progressBar.style.width).not.toBe('0%')
  })

  it('setting a goal date shows ahead/behind pace status', async () => {
    bootstrapUserRuntime(`home-${userId}`)
    render(<HomeScreen />)
    await waitFor(() =>
      expect(screen.getByText('Development Kanji')).toBeInTheDocument(),
    )

    const dateInput = document.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement
    const farFuture = new Date(Date.now() + 365 * 86_400_000)
      .toISOString()
      .slice(0, 10)
    await userEvent.type(dateInput, farFuture)
    await userEvent.click(screen.getByRole('button', { name: 'Set goal' }))

    await waitFor(() =>
      expect(screen.getByText('Days left')).toBeInTheDocument(),
    )
    expect(screen.getByText(/On pace|Behind pace/)).toBeInTheDocument()
  })
})
