import { readFileSync } from 'fs'
import { join } from 'path'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { HomeScreen } from './home-screen'

const FIXTURE_ROOT = join(process.cwd(), 'public', 'packs-dev')

function fixtureFetch(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/packs/decks/')) {
      try {
        return new Response(
          readFileSync(join(process.cwd(), url.slice(1)), 'utf8'),
          { status: 200 },
        )
      } catch {
        return new Response('not found', { status: 404 })
      }
    }
    const path = url.replace(/^\/packs-dev\//, '')
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
      expect(
        screen.getByRole('heading', { name: 'JLPT Kanji N5', level: 2 }),
      ).toBeInTheDocument(),
    )
  })

  it('shows deck progress once loaded, with no goal set', async () => {
    bootstrapUserRuntime(`home-${userId}`)
    render(<HomeScreen />)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'JLPT Kanji N5', level: 2 }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', {
        name: 'Deck progress: 0%. Level 0, white (Shiro)',
      }),
    ).toHaveAttribute('data-level', '0')
    expect(screen.getByText('Not studied yet')).toBeInTheDocument()
    expect(screen.getByText('Total time studied:')).toBeInTheDocument()
    expect(screen.getByText('0s')).toBeInTheDocument()
    expect(screen.getByText('No goal date set yet.')).toBeInTheDocument()
  })

  it('offers every bundled deck with independent offline study metadata', async () => {
    bootstrapUserRuntime(`home-${userId}`)
    render(<HomeScreen />)

    const shelf = await screen.findByTestId('builtin-deck-shelf')
    const n4Heading = within(shelf).getByText('JLPT Kanji N4')
    expect(n4Heading).toBeInTheDocument()
    expect(n4Heading.nextElementSibling).toHaveTextContent('166 cards')
    const studyLink = within(shelf)
      .getAllByRole('link', { name: 'Study', exact: true })
      .find(
        (link) => link.getAttribute('href') === '/study?deckId=jlpt-kanji-n4',
      )
    const browseLink = within(shelf)
      .getAllByRole('link', { name: 'Browse', exact: true })
      .find(
        (link) => link.getAttribute('href') === '/browse?deckId=jlpt-kanji-n4',
      )
    expect(studyLink).toHaveAttribute('href', '/study?deckId=jlpt-kanji-n4')
    expect(browseLink).toHaveAttribute('href', '/browse?deckId=jlpt-kanji-n4')
    expect(studyLink?.parentElement).toHaveClass('flex-wrap')
  })

  it('keeps level distribution swatches shape-coded for color-independent reading', async () => {
    bootstrapUserRuntime(`home-${userId}`)
    render(<HomeScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('level-distribution')).toBeInTheDocument(),
    )

    const distribution = screen.getByTestId('level-distribution')
    for (const level of [0, 1, 2, 3, 4]) {
      expect(distribution.querySelector(`[data-level="${level}"]`)).toHaveClass(
        'sticky-shape',
        `l${level}`,
      )
    }
  })

  it('shows custom decks with offline study and browse links', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    await createUserRepositories(runtime.database).recordDeckMembership({
      deck: {
        id: 'custom-travel',
        name: 'Travel kanji',
        kind: 'custom',
        definitionId: null,
        updatedAt: 1,
      },
      membership: {
        deckId: 'custom-travel',
        contentRef: 'kanji:日',
        sortOrder: 0,
        addedAt: 1,
        updatedAt: 1,
      },
      mutation: {
        id: 'custom-travel-membership',
        mutType: 'deckMembership.upsert',
        payload: JSON.stringify({
          deckId: 'custom-travel',
          contentRef: 'kanji:日',
        }),
        createdAt: 1,
        attempts: 0,
      },
    })

    render(<HomeScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('custom-deck-shelf')).toBeInTheDocument(),
    )
    expect(screen.getByText('Travel kanji')).toBeInTheDocument()
    const studyLink = screen
      .getAllByRole('link', { name: 'Study', exact: true })
      .find(
        (link) => link.getAttribute('href') === '/study?deckId=custom-travel',
      )
    const browseLink = screen
      .getAllByRole('link', { name: 'Browse', exact: true })
      .find(
        (link) => link.getAttribute('href') === '/browse?deckId=custom-travel',
      )
    expect(studyLink).toHaveAttribute('href', '/study?deckId=custom-travel')
    expect(browseLink).toHaveAttribute('href', '/browse?deckId=custom-travel')
  })

  it('groups custom decks by their persisted folder on the deck shelf', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.recordDeckMembership({
      deck: {
        id: 'custom-travel',
        name: 'Travel kanji',
        kind: 'custom',
        definitionId: null,
        updatedAt: 1,
      },
      membership: {
        deckId: 'custom-travel',
        contentRef: 'kanji:日',
        sortOrder: 0,
        addedAt: 1,
        updatedAt: 1,
      },
      mutation: {
        id: 'custom-travel-membership-folder',
        mutType: 'deckMembership.upsert',
        payload: JSON.stringify({
          deckId: 'custom-travel',
          contentRef: 'kanji:日',
        }),
        createdAt: 1,
        attempts: 0,
      },
    })
    await repo.settings.set({
      key: 'deck-folder:custom-travel',
      value: 'Travel',
      updatedAt: 2,
    })

    render(<HomeScreen />)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Travel' }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('Travel kanji')).toBeInTheDocument()
  })

  it('shows the total duration of completed study sessions', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.sessions.start({
      id: 'session-1',
      deckId: 'jlpt-kanji-n5',
      startedAt: 1_700_000_000_000,
      endedAt: null,
    })
    await repo.sessions.end('session-1', 1_700_000_065_000)

    render(<HomeScreen />)

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'JLPT Kanji N5', level: 2 }),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText('1m 5s')).toBeInTheDocument()
  })

  it('shows projected completion against the goal using active review days', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    const review = (id: string, at: number) => ({
      id,
      deckId: 'jlpt-kanji-n5' as const,
      contentRef: 'kanji:日' as const,
      at,
      grade: 'good' as const,
      levelBefore: 0 as const,
      levelAfter: 1 as const,
      intervalBefore: 0,
      elapsedDays: 0,
      responseMs: 100,
      source: 'study' as const,
      deviceId: 'device',
    })
    await repo.reviews.append(review('review-1', now - 2 * 86_400_000))
    await repo.reviews.append(review('review-2', now - 86_400_000))
    await repo.settings.set({
      key: 'goal:jlpt-kanji-n5',
      value: String(now + 30 * 86_400_000),
      updatedAt: now,
    })

    render(<HomeScreen />)

    await waitFor(() =>
      expect(
        screen.getByText('Projected completion:', { exact: false }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByText(
        'At this pace, you are projected to finish after your goal date.',
      ),
    ).toBeInTheDocument()
  })

  it('reflects progress from recorded card states in the progress bar', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.recordGrade({
      review: {
        id: 'r1',
        deckId: 'jlpt-kanji-n5',
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
        deckId: 'jlpt-kanji-n5',
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
      expect(screen.getAllByText('Last studied', { exact: false }).length).toBe(
        2,
      ),
    )
    const progressBar = document.querySelector(
      '[style*="width"]',
    ) as HTMLElement
    expect(progressBar.style.width).not.toBe('0%')
  })

  it('shows the level distribution including untouched cards as level zero', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = 1_700_000_000_000
    const cards = [
      { contentRef: 'kanji:日', level: 1 as const, grade: 'good' as const },
      { contentRef: 'kanji:一', level: 2 as const, grade: 'good' as const },
      { contentRef: 'kanji:国', level: 4 as const, grade: 'easy' as const },
    ]
    for (const [index, card] of cards.entries()) {
      await repo.recordGrade({
        review: {
          id: `distribution-${index}`,
          deckId: 'jlpt-kanji-n5',
          contentRef: card.contentRef,
          at: now + index,
          grade: card.grade,
          levelBefore: 0,
          levelAfter: card.level,
          intervalBefore: 0,
          elapsedDays: 0,
          responseMs: 1,
          source: 'study',
          deviceId: 'device',
        },
        nextState: {
          deckId: 'jlpt-kanji-n5',
          contentRef: card.contentRef,
          level: card.level,
          dueAt: null,
          lastReviewedAt: now + index,
          correctStreak: 1,
          totalReviews: 1,
          totalCorrect: 1,
          lapses: 0,
          flagged: false,
          manualOverride: false,
          updatedAt: now + index,
          updatedBy: 'device',
        },
        day: '2023-11-14',
        mutation: {
          id: `distribution-${index}`,
          mutType: 'review.append',
          payload: '{}',
          createdAt: now + index,
          attempts: 0,
        },
      })
    }

    render(<HomeScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('level-distribution')).toBeInTheDocument(),
    )
    expect(screen.getByText('Level 0, white (Shiro)')).toBeInTheDocument()
    expect(screen.getByText('49 cards')).toBeInTheDocument()
    expect(screen.getByText('Level 1, yellow (Ki)')).toBeInTheDocument()
    expect(screen.getByText('Level 2, green (Midori)')).toBeInTheDocument()
    expect(screen.getByText('Level 4, black (Kuro)')).toBeInTheDocument()
    expect(
      screen.getAllByLabelText('Deck color: Level 0, white (Shiro)'),
    ).not.toHaveLength(0)
    expect(
      screen.getByRole('img', {
        name: /Level distribution: Level 0, white \(Shiro\): 49 cards/,
      }),
    ).toBeInTheDocument()
  })

  it('shows retention by starting level and calls out low retention', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    const reviews = [
      { id: 'retention-good', levelBefore: 0 as const, grade: 'good' as const },
      {
        id: 'retention-again',
        levelBefore: 0 as const,
        grade: 'again' as const,
      },
    ]
    for (const review of reviews) {
      await repo.reviews.append({
        id: review.id,
        deckId: 'jlpt-kanji-n5',
        contentRef: 'kanji:日',
        at: now,
        grade: review.grade,
        levelBefore: review.levelBefore,
        levelAfter: review.levelBefore,
        intervalBefore: 0,
        elapsedDays: 0,
        responseMs: 100,
        source: 'study',
        deviceId: 'device',
      })
    }
    await repo.reviews.append({
      id: 'retention-manual',
      deckId: 'jlpt-kanji-n5',
      contentRef: 'kanji:日',
      at: now,
      grade: 'again',
      levelBefore: 1,
      levelAfter: 1,
      intervalBefore: 0,
      elapsedDays: 0,
      responseMs: 0,
      source: 'manual',
      deviceId: 'device',
    })

    render(<HomeScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('retention-by-level')).toBeInTheDocument(),
    )
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1/2 correct')).toBeInTheDocument()
    expect(
      screen.getByText(/Retention below 80% can indicate/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('No reviews')).toHaveLength(4)
  })

  it('surfaces cards with six or more lapses as leeches', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    const state = (contentRef: string, lapses: number, level: 1 | 2) => ({
      deckId: 'jlpt-kanji-n5' as const,
      contentRef,
      level,
      dueAt: now,
      lastReviewedAt: now,
      correctStreak: 0,
      totalReviews: lapses + 1,
      totalCorrect: 1,
      lapses,
      flagged: false,
      manualOverride: false,
      updatedAt: now,
      updatedBy: 'device',
    })
    await repo.cardStates.upsert(state('kanji:日', 6, 1))
    await repo.cardStates.upsert(state('kanji:一', 8, 2))
    await repo.cardStates.upsert(state('kanji:国', 5, 2))

    render(<HomeScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('leeches')).toBeInTheDocument(),
    )
    expect(screen.getByText('日')).toBeInTheDocument()
    expect(screen.getByText('一')).toBeInTheDocument()
    expect(screen.getByText('6 lapses')).toBeInTheDocument()
    expect(screen.getByText('8 lapses')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'View details for 日' }),
    ).toHaveAttribute('href', '/detail?contentRef=kanji%3A%E6%97%A5')
    expect(
      screen.getByRole('link', { name: 'View details for 一' }),
    ).toHaveAttribute('href', '/detail?contentRef=kanji%3A%E4%B8%80')
    expect(screen.queryByText('国')).not.toBeInTheDocument()
    expect(
      screen.getByText(/Cards missed six or more times/),
    ).toBeInTheDocument()
  })

  it('shows the 30-day scheduled review forecast', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    const state = (contentRef: string, dueAt: number) => ({
      deckId: 'jlpt-kanji-n5' as const,
      contentRef,
      level: 1 as const,
      dueAt,
      lastReviewedAt: now,
      correctStreak: 1,
      totalReviews: 1,
      totalCorrect: 1,
      lapses: 0,
      flagged: false,
      manualOverride: false,
      updatedAt: now,
      updatedBy: 'device',
    })
    await repo.cardStates.upsert(state('kanji:日', now - 1_000))
    await repo.cardStates.upsert(state('kanji:一', now + 2 * 86_400_000))

    render(<HomeScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('review-forecast')).toBeInTheDocument(),
    )
    expect(
      screen.getByText('2 scheduled reviews over the next 30 days.', {
        exact: false,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: '30-day review forecast: 2 scheduled reviews. Peak day has 1 review.',
      }),
    ).toBeInTheDocument()
  })

  it('setting a goal date shows ahead/behind pace status', async () => {
    bootstrapUserRuntime(`home-${userId}`)
    render(<HomeScreen />)
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'JLPT Kanji N5', level: 2 }),
      ).toBeInTheDocument(),
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

  it('warns about an unrealistic pace and can move the goal inline', async () => {
    const runtime = bootstrapUserRuntime(`home-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    await repo.settings.set({
      key: 'goal:jlpt-kanji-n5',
      value: String(now + 86_400_000),
      updatedAt: now,
    })

    render(<HomeScreen />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(
      /At this pace, you'd need 240 correct answers a day/,
    )

    await userEvent.click(
      screen.getByRole('button', { name: /Move goal date to/ }),
    )

    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('On pace')).toBeInTheDocument()
  })
})
