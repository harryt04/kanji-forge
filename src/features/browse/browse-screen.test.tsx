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
import * as deckLoader from '@/features/study/deck-loader'
import type { LoadedDeck } from '@/features/study/deck-loader'
import {
  BROWSE_TILE_CONTENT_SETTING,
  BROWSE_DEFAULTS_SETTING,
  BROWSE_VIEW_SETTING,
  BrowseScreen,
  BROWSE_TILE_ZOOM_SETTING,
} from './browse-screen'

vi.mock('@/features/study/deck-loader', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/features/study/deck-loader')>()
  return { ...actual, loadDeck: vi.fn(actual.loadDeck) }
})

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
  // The deck rail pushes ?deckId= onto history on selection; reset it so a
  // test that switches decks can't leak its URL into the next test.
  window.history.replaceState({}, '', '/browse')
})

/** Tiles are now the default view (see the "defaults to the tile wall" test
 * below); seed the per-deck list preference for tests whose subject is list
 * view specifically. */
async function seedListView(id: number) {
  const runtime = bootstrapUserRuntime(`browse-${id}`)
  await runtime.database.ready
  const repo = createUserRepositories(runtime.database)
  await repo.settings.set({
    key: `${BROWSE_VIEW_SETTING}:dev-kanji`,
    value: 'list',
    updatedAt: Date.now(),
  })
  return { runtime, repo }
}

function openBrowseMenu(name: 'Search' | 'Sort' | 'Filter') {
  fireEvent.pointerDown(screen.getByRole('menuitem', { name }))
  return screen.getByRole('menu')
}

describe('BrowseScreen', () => {
  it('prompts anonymous users to sign in', () => {
    render(<BrowseScreen />)
    expect(screen.getByText('Sign in to browse.')).toBeInTheDocument()
  })

  it('defaults to the tile wall when no view preference is saved', async () => {
    bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('browse-card-list')).not.toBeInTheDocument()
  })

  it('mounts one Search, Sort, or Filter menu at a time', async () => {
    await seedListView(userId)
    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('searchbox', { name: 'Search this deck' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitemradio', { name: /Deck order/ }),
    ).not.toBeInTheDocument()

    openBrowseMenu('Search')
    expect(
      screen.getByRole('searchbox', { name: 'Search this deck' }),
    ).toBeInTheDocument()

    openBrowseMenu('Sort')
    expect(
      screen.queryByRole('searchbox', { name: 'Search this deck' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('menuitemradio', { name: /Deck order/ }),
    ).toBeInTheDocument()

    openBrowseMenu('Filter')
    expect(
      screen.queryByRole('menuitemradio', { name: /Deck order/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('menuitemradio', { name: /All levels/ }),
    ).toBeInTheDocument()
  })

  it('falls back to level 0 styling and labels for an out-of-range level', async () => {
    bootstrapUserRuntime(`browse-${userId}`)
    const contentRef = 'kanji:日'
    const invalidDeck = {
      deckId: 'dev-kanji',
      name: 'Development Kanji',
      cards: [
        {
          deckId: 'dev-kanji',
          contentRef,
          state: {
            deckId: 'dev-kanji',
            contentRef,
            level: 7,
            dueAt: null,
            lastReviewedAt: null,
            correctStreak: 0,
            totalReviews: 0,
            totalCorrect: 0,
            lapses: 0,
            flagged: false,
            manualOverride: false,
            updatedAt: Date.now(),
            updatedBy: 'browse-test',
          },
        },
      ],
      content: new Map([
        [
          contentRef,
          {
            contentRef,
            contentType: 'kanji',
            literal: '日',
            readings: ['ひ'],
            strokeCount: 4,
            frequency: null,
            jlptLegacy: 5,
            grade: 1,
            nanori: [],
            meanings: ['day; sun; Japan'],
            onReadings: ['ニチ'],
            kunReadings: ['ひ'],
          },
        ],
      ]),
    } as unknown as LoadedDeck
    vi.mocked(deckLoader.loadDeck).mockResolvedValueOnce(invalidDeck)

    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-tile')).toBeInTheDocument(),
    )
    const tile = screen.getByTestId('browse-tile')
    expect(tile).toHaveAttribute('data-level', '0')
    expect(tile).toHaveClass('l0')
    expect(tile).toHaveAccessibleName('日, Level 0, white (Shiro), New')
    expect(tile.getAttribute('aria-label')).not.toContain('undefined')

    await fireEvent.click(
      screen.getByRole('button', { name: 'Show list view' }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )
    const card = screen.getByTestId('browse-card')
    expect(card).toHaveAttribute('data-level', '0')
    expect(card).toHaveClass('l0')
    expect(card).toHaveAccessibleName('日, Level 0, white (Shiro), New')
    expect(card.getAttribute('aria-label')).not.toContain('undefined')
  })

  it('keeps a stable results wrapper across both views', async () => {
    bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)

    await waitFor(() =>
      expect(
        within(screen.getByTestId('browse-cards')).getByTestId(
          'browse-tile-wall',
        ),
      ).toBeInTheDocument(),
    )

    await fireEvent.click(
      screen.getByRole('button', { name: 'Show list view' }),
    )
    await waitFor(() =>
      expect(
        within(screen.getByTestId('browse-cards')).getByTestId(
          'browse-card-list',
        ),
      ).toBeInTheDocument(),
    )
  })

  it('loads the deck into an accessible list of cards', async () => {
    await seedListView(userId)
    render(<BrowseScreen />)

    expect(screen.getByText('Loading deck…')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    expect(
      screen.getByText('Development Kanji · 200 cards'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('日')).not.toHaveLength(0)
    expect(
      screen.getByText('day; sun; Japan; counter for days'),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('browse-card')).toHaveLength(200)
  })

  it('switches to a compact tile wall and persists the selected view', async () => {
    const { repo } = await seedListView(userId)

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    await fireEvent.click(
      screen.getByRole('button', { name: 'Show tile view' }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    expect(screen.getAllByTestId('browse-tile')).toHaveLength(200)
    expect(
      screen.getByRole('gridcell', {
        name: '日, Level 0, white (Shiro), New',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('browse-card-list')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Show tile view' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen
        .getByRole('gridcell', {
          name: '日, Level 0, white (Shiro), New',
        })
        .closest('a'),
    ).toHaveAttribute(
      'href',
      '/browse?deckId=dev-kanji&contentRef=kanji%3A%E6%97%A5',
    )

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

  it('keeps Browse visible beside the selected offline detail on large screens', async () => {
    window.history.replaceState(
      {},
      '',
      '/browse?deckId=dev-kanji&contentRef=kanji%3A%E6%97%A5',
    )
    bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-detail-pane')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('browse-cards')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByTestId('kanji-detail')).toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { name: '日' })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '← Back to Browse' }),
    ).toHaveAttribute('href', '/browse')
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
      'grid-template-columns: repeat(auto-fill, minmax(44px, 1fr))',
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

  it('shows a level ramp with a labelled segment for every level', async () => {
    const { repo } = await seedListView(userId)
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
      flagged: false,
      manualOverride: false,
      updatedAt: Date.now(),
      updatedBy: 'browse-ramp-test',
    })

    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-level-ramp')).toBeInTheDocument(),
    )
    const ramp = within(screen.getByTestId('browse-level-ramp'))
    expect(
      ramp.getByLabelText('Level 3, blue (Ao), Known, 1 cards'),
    ).toBeInTheDocument()
    expect(
      ramp.getByLabelText('Level 0, white (Shiro), New, 199 cards'),
    ).toBeInTheDocument()
  })

  it('filters the wall to one level from a ramp segment', async () => {
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
      flagged: false,
      manualOverride: false,
      updatedAt: Date.now(),
      updatedBy: 'browse-ramp-filter-test',
    })

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )
    expect(screen.getAllByTestId('browse-tile')).toHaveLength(200)

    const ramp = within(screen.getByTestId('browse-level-ramp'))
    const segment = ramp.getByLabelText('Level 3, blue (Ao), Known, 1 cards')
    fireEvent.click(segment)

    await waitFor(() =>
      expect(screen.getAllByTestId('browse-tile')).toHaveLength(1),
    )
    expect(segment).toHaveAttribute('aria-pressed', 'true')
    openBrowseMenu('Filter')
    expect(
      screen.getByRole('menuitemradio', { name: /3 · Known/ }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  it('clears the level filter when the active segment is clicked again', async () => {
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
      flagged: false,
      manualOverride: false,
      updatedAt: Date.now(),
      updatedBy: 'browse-ramp-filter-test',
    })

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    const ramp = within(screen.getByTestId('browse-level-ramp'))
    const segment = ramp.getByLabelText('Level 3, blue (Ao), Known, 1 cards')
    fireEvent.click(segment)
    await waitFor(() =>
      expect(screen.getAllByTestId('browse-tile')).toHaveLength(1),
    )

    fireEvent.click(segment)
    await waitFor(() =>
      expect(screen.getAllByTestId('browse-tile')).toHaveLength(200),
    )
    expect(segment).toHaveAttribute('aria-pressed', 'false')
  })

  it('shows a due-today count on each deck in the rail', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    const now = Date.now()
    await repo.decks.upsert({
      id: 'my-due-deck',
      name: 'My Due Deck',
      kind: 'custom',
      definitionId: null,
      updatedAt: now,
    })
    for (const [contentRef, order] of [
      ['kanji:日', 0],
      ['kanji:一', 1],
      ['kanji:国', 2],
    ] as const) {
      await repo.deckMembership.save({
        deckId: 'my-due-deck',
        contentRef,
        sortOrder: order,
        addedAt: now,
        updatedAt: now,
      })
    }
    // 日 and 一 are overdue (due); 国 is not due until tomorrow.
    for (const contentRef of ['kanji:日', 'kanji:一']) {
      await repo.cardStates.upsert({
        deckId: 'my-due-deck',
        contentRef,
        level: 2,
        dueAt: now - 1000,
        lastReviewedAt: now - 1000,
        correctStreak: 1,
        totalReviews: 1,
        totalCorrect: 1,
        lapses: 0,
        flagged: false,
        manualOverride: false,
        updatedAt: now,
        updatedBy: 'browse-due-test',
      })
    }
    await repo.cardStates.upsert({
      deckId: 'my-due-deck',
      contentRef: 'kanji:国',
      level: 2,
      dueAt: now + 86_400_000,
      lastReviewedAt: now,
      correctStreak: 1,
      totalReviews: 1,
      totalCorrect: 1,
      lapses: 0,
      flagged: false,
      manualOverride: false,
      updatedAt: now,
      updatedBy: 'browse-due-test',
    })

    render(<BrowseScreen />)

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /My Due Deck.*2 due today/ }),
      ).toBeInTheDocument(),
    )
  })

  it('switches the wall to another deck from the rail', async () => {
    bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-deck-rail')).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Kanji Kentei 10,/ }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByText('Development Kanji · 200 cards'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Kanji Kentei 10,/ }))

    await waitFor(() =>
      expect(
        screen.getByText('Kanji Kentei 10 · 43 cards'),
      ).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(screen.getAllByTestId('browse-tile')).toHaveLength(43),
    )
  })

  it('groups custom decks by folder in the rail', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    await runtime.database.ready
    const repo = createUserRepositories(runtime.database)
    await repo.decks.upsert({
      id: 'my-jlpt-deck',
      name: 'My JLPT Deck',
      kind: 'custom',
      definitionId: null,
      updatedAt: Date.now(),
    })
    await repo.deckMembership.save({
      deckId: 'my-jlpt-deck',
      contentRef: 'kanji:日',
      sortOrder: 0,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    })
    await repo.settings.set({
      key: 'deck-folder:my-jlpt-deck',
      value: 'JLPT prep',
      updatedAt: Date.now(),
    })

    render(<BrowseScreen />)

    await waitFor(() =>
      expect(
        within(screen.getByTestId('browse-deck-rail')).getByText('JLPT prep'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('button', { name: /^My JLPT Deck,/ }),
    ).toBeInTheDocument()
  })

  it('shows each card level and flag state from the local database', async () => {
    const { repo } = await seedListView(userId)
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
      screen.getByRole('article', {
        name: '日, Level 3, blue (Ao), Known, flagged',
      }),
    ).toBeInTheDocument()
  })

  it('filters cards by kanji, reading, and English meaning', async () => {
    await seedListView(userId)
    render(<BrowseScreen />)

    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    openBrowseMenu('Search')
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
    const { repo } = await seedListView(userId)
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

    openBrowseMenu('Sort')
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: /Level \(new → mastered\)/ }),
    )

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
    const { repo } = await seedListView(userId)
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

    openBrowseMenu('Filter')
    fireEvent.click(screen.getByRole('menuitemradio', { name: /3 · Known/ }))
    expect(screen.getAllByTestId('browse-card')).toHaveLength(1)
    expect(screen.getByText(/1 of 200 cards/)).toBeInTheDocument()
    expect(screen.getByText('Flagged')).toBeInTheDocument()

    openBrowseMenu('Filter')
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'All levels' }))
    openBrowseMenu('Filter')
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Show flagged only' }),
    )
    expect(screen.getAllByTestId('browse-card')).toHaveLength(1)
    expect(
      screen.getByRole('article', {
        name: /日, Level 3, blue \(Ao\), Known, flagged/,
      }),
    ).toBeInTheDocument()

    openBrowseMenu('Filter')
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum stroke count' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Maximum stroke count' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Filter by JLPT level' }),
    ).toBeInTheDocument()
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Minimum stroke count' }),
      {
        target: { value: '999' },
      },
    )
    expect(screen.queryByTestId('browse-card-list')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear filters' }))
    expect(screen.getAllByTestId('browse-card')).toHaveLength(200)
  })

  it('sets a card level manually without changing review totals', async () => {
    const { repo } = await seedListView(userId)
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
    const { repo } = await seedListView(userId)

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select cards' }))
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
    const { repo } = await seedListView(userId)

    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select cards' }))
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

  it('renders exactly one live region while several messages are pending', async () => {
    await seedListView(userId)
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('')

    fireEvent.click(
      screen.getByRole('button', { name: 'Use these settings for all decks' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'default for all decks',
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select cards' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 日' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 一' }))
    fireEvent.click(screen.getByRole('button', { name: 'Flag selected' }))

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('2 cards flagged.'),
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('renders view-setting failures in the single alert region', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    vi.spyOn(runtime.database, 'write').mockRejectedValue(
      new Error('View settings failed.'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show list view' }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'View settings failed.',
      ),
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('renders tile-content failures in the single alert region', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    vi.spyOn(runtime.database, 'write').mockRejectedValue(
      new Error('Tile content settings failed.'),
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Tile content' }), {
      target: { value: 'reading' },
    })

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Tile content settings failed.',
      ),
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('renders tile-zoom failures in the single alert region', async () => {
    const runtime = bootstrapUserRuntime(`browse-${userId}`)
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-tile-wall')).toBeInTheDocument(),
    )

    vi.spyOn(runtime.database, 'write').mockRejectedValue(
      new Error('Tile zoom settings failed.'),
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Tile zoom' }), {
      target: { value: '0.75' },
    })

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Tile zoom settings failed.',
      ),
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('renders edit failures in the single alert region', async () => {
    const { runtime } = await seedListView(userId)
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Set level for 日' }),
      ).toBeInTheDocument(),
    )

    vi.spyOn(runtime.database, 'transaction').mockRejectedValue(
      new Error('Card edit failed.'),
    )
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Set level for 日' }),
      { target: { value: '4' } },
    )

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Card edit failed.'),
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('shows bulk actions only when cards are selected', async () => {
    await seedListView(userId)
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    expect(
      screen.queryByRole('toolbar', { name: 'Bulk card actions' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Select cards' }))
    expect(
      screen.queryByRole('toolbar', { name: 'Bulk card actions' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select 日' }))
    expect(
      screen.getByRole('toolbar', { name: 'Bulk card actions' }),
    ).toBeInTheDocument()
  })

  it('mounts every filter only while the Filter menu is open', async () => {
    await seedListView(userId)
    render(<BrowseScreen />)
    await waitFor(() =>
      expect(screen.getByTestId('browse-card-list')).toBeInTheDocument(),
    )

    expect(
      screen.queryByRole('spinbutton', { name: 'Minimum stroke count' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('spinbutton', { name: 'Maximum stroke count' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: 'Filter by JLPT level' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitemcheckbox', { name: 'Show flagged only' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('menuitem', { name: 'Clear filters' }),
    ).not.toBeInTheDocument()
    expect(document.querySelector('details')).not.toBeInTheDocument()

    openBrowseMenu('Filter')

    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: 'Minimum stroke count' }),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByRole('spinbutton', { name: 'Maximum stroke count' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Filter by JLPT level' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Show flagged only' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: 'Clear filters' }),
    ).toBeInTheDocument()
  })
})
