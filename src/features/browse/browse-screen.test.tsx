import { readFileSync } from 'fs'
import { join } from 'path'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapUserRuntime, clearUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import {
  BROWSE_TILE_CONTENT_SETTING,
  BROWSE_DEFAULTS_SETTING,
  BROWSE_VIEW_SETTING,
  BrowseScreen,
  BROWSE_TILE_ZOOM_SETTING,
} from './browse-screen'

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

describe('BrowseScreen', () => {
  it('prompts anonymous users to sign in', () => {
    render(<BrowseScreen />)
    expect(screen.getByText('Sign in to browse.')).toBeInTheDocument()
  })

  it('loads the deck into an accessible list of cards', async () => {
    bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)

    expect(screen.getByText('Loading deck…')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    expect(screen.getByText(/Development Kanji/)).toBeInTheDocument()
    expect(screen.getByText(/200 cards/)).toBeInTheDocument()
    expect(screen.getAllByText('日')).not.toHaveLength(0)
    expect(
      screen.getByText('day; sun; Japan; counter for days'),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('browse-card')).toHaveLength(200)
  })

  it('switches to a compact tile wall and persists the selected view', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.settings.set({
      key: BROWSE_VIEW_SETTING,
      value: 'tiles',
      updatedAt: Date.now(),
    })

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    expect(screen.getAllByTestId('browse-tile')).toHaveLength(200)
    expect(
      screen.getByRole('gridcell', { name: '日, Level 0, New' }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('browse-card-list')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show tile view' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('gridcell', { name: '日, Level 0, New' }).closest('a'),
    ).toHaveAttribute('href', '/detail?contentRef=kanji%3A%E6%97%A5')

    await fireEvent.click(
      screen.getByRole('button', { name: 'Show list view' }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )
    expect(await repo.settings.get(BROWSE_VIEW_SETTING)).toMatchObject({
      value: 'list',
    })
  })

  it('persists configurable tile content and renders the selected field', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.settings.set({
      key: BROWSE_VIEW_SETTING,
      value: 'tiles',
      updatedAt: Date.now(),
    })
    await repo.settings.set({
      key: BROWSE_TILE_CONTENT_SETTING,
      value: 'reading',
      updatedAt: Date.now(),
    })

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    const dayTile = screen
      .getAllByTestId('browse-tile')
      .find((tile) => tile.getAttribute('data-content-ref') === 'kanji:日')
    expect(dayTile).toBeDefined()
    expect(dayTile).toHaveAccessibleName(/日, reading:/u)
    expect(dayTile?.textContent).not.toContain('日')
    expect(screen.getByRole('combobox', { name: 'Tile content' })).toHaveValue(
      'reading',
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Tile content' }), {
      target: { value: 'meaning' },
    })
    await waitFor(async () =>
      expect(
        await repo.settings.get(BROWSE_TILE_CONTENT_SETTING),
      ).toMatchObject({ value: 'meaning' }),
    )
    expect(dayTile).toHaveTextContent(/day|sun|Japan/u)
  })

  it('persists the selected tile zoom ratio and applies its density', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.settings.set({
      key: BROWSE_VIEW_SETTING,
      value: 'tiles',
      updatedAt: Date.now(),
    })
    await repo.settings.set({
      key: BROWSE_TILE_ZOOM_SETTING,
      value: '0.75',
      updatedAt: Date.now(),
    })

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    const wall = screen.getByTestId('browse-tile-wall')
    expect(screen.getByRole('combobox', { name: 'Tile zoom' })).toHaveValue(
      '0.75',
    )
    expect(wall).toHaveStyle(
      'grid-template-columns: repeat(auto-fill, minmax(42px, 1fr))',
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Tile zoom' }), {
      target: { value: '1.5' },
    })
    await waitFor(async () =>
      expect(await repo.settings.get(BROWSE_TILE_ZOOM_SETTING)).toMatchObject({
        value: '1.5',
      }),
    )
    expect(wall).toHaveStyle(
      'grid-template-columns: repeat(auto-fill, minmax(84px, 1fr))',
    )
  })

  it('saves the current Browse preferences as defaults for all decks', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.settings.set({
      key: BROWSE_VIEW_SETTING,
      value: 'tiles',
      updatedAt: Date.now(),
    })
    await repo.settings.set({
      key: BROWSE_TILE_CONTENT_SETTING,
      value: 'meaning',
      updatedAt: Date.now(),
    })
    await repo.settings.set({
      key: BROWSE_TILE_ZOOM_SETTING,
      value: '1.5',
      updatedAt: Date.now(),
    })

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Use these settings for all decks' }),
    )

    await waitFor(async () => {
      expect(await repo.settings.get(BROWSE_DEFAULTS_SETTING)).toMatchObject({
        value: JSON.stringify({
          view: 'tiles',
          tileContent: 'meaning',
          tileZoom: 1.5,
        }),
      })
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'default for all decks',
    )

    cleanup()
    await repo.settings.set({
      key: BROWSE_VIEW_SETTING,
      value: 'list',
      updatedAt: Date.now(),
    })
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    cleanup()
    await repo.settings.set({
      key: `${BROWSE_VIEW_SETTING}:dev-kanji`,
      value: 'list',
      updatedAt: Date.now(),
    })
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )
  })

  it('shows each card level and flag state from the local database', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.cardStates.upsert({
      deckId: 'dev-kanji',
      contentRef: 'kanji:日',
      level: 3,
      dueAt: Date.now(),
      lastReviewedAt: Date.now(),
      correctStreak: 3,
      totalReviews: 3,
      totalCorrect: 3,
      lapses: 0,
      flagged: true,
      manualOverride: false,
      updatedAt: Date.now(),
      updatedBy: 'browse-test',
    })

    render(<BrowseScreen />)

    await waitFor(() => expect(screen.getByText('Flagged')).toBeInTheDocument())
    expect(screen.getByText('Level 3 · Known')).toBeInTheDocument()
    expect(
      screen.getByRole('article', { name: '日, Level 3, Known, flagged' }),
    ).toBeInTheDocument()
  })

  it('filters cards by kanji, reading, and English meaning', async () => {
    bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    const search = screen.getByRole('searchbox', { name: 'Search this deck' })
    fireEvent.change(search, { target: { value: 'sun' } })

    expect(
      screen.getByText('Development Kanji · 1 of 200 cards'),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('browse-card')).toHaveLength(1)
    expect(screen.getAllByText('日')).not.toHaveLength(0)

    fireEvent.change(search, { target: { value: 'ひ' } })
    expect(screen.getAllByTestId('browse-card').length).toBeGreaterThan(0)

    fireEvent.change(search, { target: { value: 'does-not-exist' } })
    expect(screen.queryByTestId('browse-card-list')).not.toBeInTheDocument()
    expect(
      screen.getByText('No cards match “does-not-exist”.'),
    ).toBeInTheDocument()
  })

  it('sorts cards by level while preserving deck order for ties', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    for (const [contentRef, level] of [
      ['kanji:日', 3],
      ['kanji:一', 1],
    ] as const) {
      await repo.cardStates.upsert({
        deckId: 'dev-kanji',
        contentRef,
        level,
        dueAt: now,
        lastReviewedAt: now,
        correctStreak: level,
        totalReviews: level,
        totalCorrect: level,
        lapses: 0,
        flagged: false,
        manualOverride: false,
        updatedAt: now,
        updatedBy: 'browse-sort-test',
      })
    }

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Sort cards' }), {
      target: { value: 'level' },
    })

    const cards = screen.getAllByTestId('browse-card')
    const positionOf = (contentRef: string) =>
      cards.findIndex(
        (item) => item.getAttribute('data-content-ref') === contentRef,
      )
    expect(positionOf('kanji:二')).toBeLessThan(positionOf('kanji:一'))
    expect(positionOf('kanji:一')).toBeLessThan(positionOf('kanji:日'))
    expect(
      within(cards[positionOf('kanji:一')]).getByText('Level 1 · Seen'),
    ).toBeInTheDocument()
  })

  it('filters the rendered deck by level and flagged state', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    for (const [contentRef, level, flagged] of [
      ['kanji:日', 3, true],
      ['kanji:一', 1, false],
    ] as const) {
      await repo.cardStates.upsert({
        deckId: 'dev-kanji',
        contentRef,
        level,
        dueAt: now,
        lastReviewedAt: now,
        correctStreak: level,
        totalReviews: level,
        totalCorrect: level,
        lapses: 0,
        flagged,
        manualOverride: false,
        updatedAt: now,
        updatedBy: 'browse-filter-test',
      })
    }

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Filter by level' }),
      {
        target: { value: '3' },
      },
    )
    expect(screen.getAllByTestId('browse-card')).toHaveLength(1)
    expect(screen.getByText(/1 of 200 cards/)).toBeInTheDocument()
    expect(screen.getByText('Flagged')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show flagged only' }))
    expect(screen.getAllByTestId('browse-card')).toHaveLength(1)
    expect(
      screen.getByRole('article', { name: /日, Level 3, Known, flagged/ }),
    ).toBeInTheDocument()
  })

  it('sets a card level manually without changing review totals', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const reviewedAt = Date.now() - 86_400_000
    await repo.cardStates.upsert({
      deckId: 'dev-kanji',
      contentRef: 'kanji:日',
      level: 1,
      dueAt: reviewedAt + 86_400_000,
      lastReviewedAt: reviewedAt,
      correctStreak: 1,
      totalReviews: 2,
      totalCorrect: 1,
      lapses: 1,
      flagged: true,
      manualOverride: false,
      updatedAt: reviewedAt,
      updatedBy: 'browse-test',
    })

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Set level for 日' }),
      ).toBeInTheDocument(),
    )

    fireEvent.change(
      screen.getByRole('combobox', { name: 'Set level for 日' }),
      { target: { value: '4' } },
    )

    await waitFor(() =>
      expect(screen.getByText('Level 4 · Mastered')).toBeInTheDocument(),
    )
    expect(await repo.cardStates.get('dev-kanji', 'kanji:日')).toMatchObject({
      level: 4,
      manualOverride: true,
      totalReviews: 2,
      totalCorrect: 1,
      lapses: 1,
      flagged: true,
    })
    expect(await repo.dailyStats.list()).toEqual([])
    expect(await repo.reviews.list('dev-kanji', 'kanji:日')).toHaveLength(1)
    expect(await repo.outbox.pending()).toHaveLength(1)
  })

  it('flags multiple selected cards in one local operation', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 日' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 一' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flag selected' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('2 cards flagged.'),
    )
    expect(await repo.cardStates.get('dev-kanji', 'kanji:日')).toMatchObject({
      flagged: true,
    })
    expect(await repo.cardStates.get('dev-kanji', 'kanji:一')).toMatchObject({
      flagged: true,
    })
    expect(await repo.outbox.pending()).toHaveLength(2)
  })

  it('sets multiple selected levels with manual-review history', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 日' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 一' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Set selected level' }),
      {
        target: { value: '4' },
      },
    )

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        '2 cards set to Level 4 · Mastered.',
      ),
    )
    expect(await repo.cardStates.get('dev-kanji', 'kanji:日')).toMatchObject({
      level: 4,
      manualOverride: true,
      totalReviews: 0,
    })
    expect(await repo.cardStates.get('dev-kanji', 'kanji:一')).toMatchObject({
      level: 4,
      manualOverride: true,
      totalReviews: 0,
    })
    expect(await repo.reviews.list('dev-kanji')).toHaveLength(2)
    expect(await repo.dailyStats.list()).toEqual([])
    expect(await repo.outbox.pending()).toHaveLength(2)
  })
})
