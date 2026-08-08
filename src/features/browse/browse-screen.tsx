'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { DEFAULT_SRS_CONFIG, emptyCardState } from '@/core/srs/types'
import { nextDue } from '@/core/srs/schedule'
import type { CardState } from '@/data/repo'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { loadStarterDeck, type LoadedDeck } from '@/features/study/deck-loader'
import { getDeviceId } from '@/lib/device-id'
import {
  DEFAULT_BROWSE_FILTERS,
  filterBrowseCards,
  type BrowseFilters,
} from './browse-filter'
import { sortBrowseCards, type BrowseSort } from './browse-sort'

const LEVEL_NAMES = ['New', 'Seen', 'Learning', 'Known', 'Mastered'] as const
const LEVEL_SHAPES = ['l0', 'l1', 'l2', 'l3', 'l4'] as const
export const BROWSE_VIEW_SETTING = 'browse.view'
export const BROWSE_TILE_CONTENT_SETTING = 'browse.tile-content'
export const BROWSE_TILE_ZOOM_SETTING = 'browse.tile-zoom'
export const BROWSE_DEFAULTS_SETTING = 'browse.defaults'

export interface BrowseDefaults {
  readonly view: 'list' | 'tiles'
  readonly tileContent: 'kanji' | 'reading' | 'meaning'
  readonly tileZoom: 0.75 | 1 | 1.5
}

type BrowseView = 'list' | 'tiles'
type BrowseTileContent = 'kanji' | 'reading' | 'meaning'
type BrowseTileZoom = 0.75 | 1 | 1.5

function isBrowseView(value: string | undefined): value is BrowseView {
  return value === 'list' || value === 'tiles'
}

function isBrowseTileContent(
  value: string | undefined,
): value is BrowseTileContent {
  return value === 'kanji' || value === 'reading' || value === 'meaning'
}

function isBrowseTileZoom(
  value: string | undefined,
): value is `${BrowseTileZoom}` {
  return value === '0.75' || value === '1' || value === '1.5'
}

function browseTileZoomValue(value: BrowseTileZoom): string {
  return String(value)
}

function deckBrowseSettingKey(setting: string, deckId: string): string {
  return `${setting}:${deckId}`
}

export function parseBrowseDefaults(
  value: string | undefined,
): BrowseDefaults | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    const candidate = parsed as Record<string, unknown>
    if (
      typeof candidate.view !== 'string' ||
      !isBrowseView(candidate.view) ||
      typeof candidate.tileContent !== 'string' ||
      !isBrowseTileContent(candidate.tileContent) ||
      typeof candidate.tileZoom !== 'number' ||
      ![0.75, 1, 1.5].includes(candidate.tileZoom)
    )
      return null
    return {
      view: candidate.view,
      tileContent: candidate.tileContent,
      tileZoom: candidate.tileZoom as BrowseTileZoom,
    }
  } catch {
    return null
  }
}

interface BrowseCard {
  readonly contentRef: string
  readonly deckIndex: number
  readonly state: CardState | undefined
  readonly literal: string
  readonly strokeCount: number
  readonly frequency: number | null
  readonly jlptLegacy: number | null
  readonly grade: number | null
  readonly kana: string
  readonly meanings: readonly string[]
  readonly onReadings: readonly string[]
  readonly kunReadings: readonly string[]
}

function toBrowseCards(deck: LoadedDeck): readonly BrowseCard[] {
  return deck.cards.flatMap((card, deckIndex) => {
    const content = deck.content.get(card.contentRef)
    if (!content) return []
    return [
      {
        contentRef: card.contentRef,
        deckIndex,
        state: card.state,
        literal: content.literal,
        strokeCount: content.strokeCount,
        frequency: content.frequency,
        jlptLegacy: content.jlptLegacy,
        grade: content.grade,
        kana: [...content.onReadings, ...content.kunReadings].join(' '),
        meanings: content.meanings,
        onReadings: content.onReadings,
        kunReadings: content.kunReadings,
      },
    ]
  })
}

function searchBrowseCards(
  cards: readonly BrowseCard[],
  query: string,
): readonly BrowseCard[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean)
  if (terms.length === 0) return cards

  return cards.filter((card) => {
    const searchableText = [
      card.literal,
      ...card.onReadings,
      ...card.kunReadings,
      ...card.meanings,
    ]
      .join(' ')
      .toLocaleLowerCase()
    return terms.every((term) => searchableText.includes(term))
  })
}

function tileText(card: BrowseCard, content: BrowseTileContent): string {
  if (content === 'reading') return card.kana || 'No reading'
  if (content === 'meaning') return card.meanings[0] || 'No meaning'
  return card.literal
}

function tileContentLabel(content: BrowseTileContent): string {
  if (content === 'reading') return 'reading'
  if (content === 'meaning') return 'meaning'
  return 'kanji'
}

export function BrowseScreen({
  deckDefinitionId = 'dev-kanji',
}: {
  deckDefinitionId?: string
}): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [deck, setDeck] = useState<LoadedDeck | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<BrowseSort>('deck-order')
  const [filters, setFilters] = useState<BrowseFilters>(DEFAULT_BROWSE_FILTERS)
  const [view, setView] = useState<BrowseView>('list')
  const [tileContent, setTileContent] = useState<BrowseTileContent>('kanji')
  const [tileZoom, setTileZoom] = useState<BrowseTileZoom>(1)
  const [savingContentRef, setSavingContentRef] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [tileContentError, setTileContentError] = useState<string | null>(null)
  const [tileZoomError, setTileZoomError] = useState<string | null>(null)
  const [defaultsMessage, setDefaultsMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!runtime) return
    let active = true
    setDeck(null)
    setError(null)
    void (async () => {
      await runtime.database.ready
      const loaded = await loadStarterDeck(runtime.database, deckDefinitionId)
      const repositories = createUserRepositories(runtime.database)
      const [
        savedView,
        savedTileContent,
        savedTileZoom,
        savedDeckView,
        savedDeckTileContent,
        savedDeckTileZoom,
        savedDefaults,
      ] = await Promise.all([
        repositories.settings.get(BROWSE_VIEW_SETTING),
        repositories.settings.get(BROWSE_TILE_CONTENT_SETTING),
        repositories.settings.get(BROWSE_TILE_ZOOM_SETTING),
        repositories.settings.get(
          deckBrowseSettingKey(BROWSE_VIEW_SETTING, loaded.deckId),
        ),
        repositories.settings.get(
          deckBrowseSettingKey(BROWSE_TILE_CONTENT_SETTING, loaded.deckId),
        ),
        repositories.settings.get(
          deckBrowseSettingKey(BROWSE_TILE_ZOOM_SETTING, loaded.deckId),
        ),
        repositories.settings.get(BROWSE_DEFAULTS_SETTING),
      ])
      const defaults = parseBrowseDefaults(savedDefaults?.value)
      const selectedView =
        savedDeckView?.value ?? defaults?.view ?? savedView?.value
      const selectedTileContent =
        savedDeckTileContent?.value ??
        defaults?.tileContent ??
        savedTileContent?.value
      const selectedTileZoom =
        savedDeckTileZoom?.value ??
        (defaults ? String(defaults.tileZoom) : savedTileZoom?.value)
      if (active) setDeck(loaded)
      if (active && isBrowseView(selectedView)) setView(selectedView)
      if (active && isBrowseTileContent(selectedTileContent))
        setTileContent(selectedTileContent)
      if (active && isBrowseTileZoom(selectedTileZoom))
        setTileZoom(Number(selectedTileZoom) as BrowseTileZoom)
    })().catch((reason: unknown) => {
      if (active)
        setError(
          reason instanceof Error ? reason.message : 'Failed to load the deck.',
        )
    })
    return () => {
      active = false
    }
  }, [runtime, deckDefinitionId])

  const cards = useMemo(() => (deck ? toBrowseCards(deck) : []), [deck])
  const filteredCards = useMemo(() => {
    const searched = searchBrowseCards(cards, query)
    return filterBrowseCards(searched, filters)
  }, [cards, filters, query])
  const sortedCards = useMemo(
    () => sortBrowseCards(filteredCards, sort),
    [filteredCards, sort],
  )
  const hasFilters =
    filters.level !== null ||
    filters.flagged ||
    filters.minStrokeCount !== null ||
    filters.maxStrokeCount !== null ||
    filters.jlptLegacy !== null
  const hasSearchOrFilters = Boolean(query.trim()) || hasFilters

  function setNumericFilter(
    key: 'minStrokeCount' | 'maxStrokeCount',
    value: string,
  ): void {
    const parsed = value === '' ? null : Number(value)
    setFilters((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? parsed : null,
    }))
  }

  async function setCardLevel(
    card: BrowseCard,
    level: CardState['level'],
  ): Promise<void> {
    if (!runtime || !deck || savingContentRef !== null) return

    const now = Date.now()
    const deviceId = getDeviceId()
    const before =
      card.state ?? emptyCardState(deck.deckId, card.contentRef, deviceId)
    const after: CardState = {
      deckId: deck.deckId,
      contentRef: card.contentRef,
      level,
      dueAt: nextDue(level, DEFAULT_SRS_CONFIG, now),
      lastReviewedAt: now,
      correctStreak: before.correctStreak,
      totalReviews: before.totalReviews,
      totalCorrect: before.totalCorrect,
      lapses: before.lapses,
      flagged: before.flagged,
      manualOverride: true,
      updatedAt: now,
      updatedBy: deviceId,
    }
    const reviewId = crypto.randomUUID()

    setSavingContentRef(card.contentRef)
    setEditError(null)
    try {
      const repo = createUserRepositories(runtime.database)
      await repo.recordManualOverride({
        review: {
          id: reviewId,
          deckId: after.deckId,
          contentRef: card.contentRef,
          at: now,
          grade: 'good',
          levelBefore: before.level,
          levelAfter: level,
          intervalBefore: before.dueAt ? Math.max(0, before.dueAt - now) : 0,
          elapsedDays: before.lastReviewedAt
            ? Math.max(0, (now - before.lastReviewedAt) / 86_400_000)
            : 0,
          responseMs: 0,
          source: 'manual',
          deviceId,
        },
        nextState: after,
        mutation: {
          id: reviewId,
          mutType: 'review.append',
          payload: JSON.stringify({
            deckId: after.deckId,
            contentRef: card.contentRef,
            source: 'manual',
            levelBefore: before.level,
            levelAfter: level,
            at: now,
          }),
          createdAt: now,
          attempts: 0,
        },
      })
      setDeck((current) =>
        current
          ? {
              ...current,
              cards: current.cards.map((candidate) =>
                candidate.contentRef === card.contentRef
                  ? { ...candidate, state: after }
                  : candidate,
              ),
            }
          : current,
      )
    } catch (reason: unknown) {
      setEditError(
        reason instanceof Error
          ? reason.message
          : 'Could not save the manual level.',
      )
    } finally {
      setSavingContentRef(null)
    }
  }

  async function chooseView(next: BrowseView): Promise<void> {
    if (!runtime || next === view) return
    const previous = view
    setView(next)
    setViewError(null)
    try {
      const repositories = createUserRepositories(runtime.database)
      const updatedAt = Date.now()
      await Promise.all([
        repositories.settings.set({
          key: BROWSE_VIEW_SETTING,
          value: next,
          updatedAt,
        }),
        repositories.settings.set({
          key: deckBrowseSettingKey(BROWSE_VIEW_SETTING, deck?.deckId ?? ''),
          value: next,
          updatedAt,
        }),
      ])
    } catch (reason: unknown) {
      setView(previous)
      setViewError(
        reason instanceof Error
          ? reason.message
          : 'Could not save Browse view.',
      )
    }
  }

  async function chooseTileContent(next: BrowseTileContent): Promise<void> {
    if (!runtime || next === tileContent) return
    const previous = tileContent
    setTileContent(next)
    setTileContentError(null)
    try {
      const repositories = createUserRepositories(runtime.database)
      const updatedAt = Date.now()
      await Promise.all([
        repositories.settings.set({
          key: BROWSE_TILE_CONTENT_SETTING,
          value: next,
          updatedAt,
        }),
        repositories.settings.set({
          key: deckBrowseSettingKey(
            BROWSE_TILE_CONTENT_SETTING,
            deck?.deckId ?? '',
          ),
          value: next,
          updatedAt,
        }),
      ])
    } catch (reason: unknown) {
      setTileContent(previous)
      setTileContentError(
        reason instanceof Error
          ? reason.message
          : 'Could not save tile content.',
      )
    }
  }

  async function chooseTileZoom(next: BrowseTileZoom): Promise<void> {
    if (!runtime || next === tileZoom) return
    const previous = tileZoom
    setTileZoom(next)
    setTileZoomError(null)
    try {
      const repositories = createUserRepositories(runtime.database)
      const updatedAt = Date.now()
      await Promise.all([
        repositories.settings.set({
          key: BROWSE_TILE_ZOOM_SETTING,
          value: browseTileZoomValue(next),
          updatedAt,
        }),
        repositories.settings.set({
          key: deckBrowseSettingKey(
            BROWSE_TILE_ZOOM_SETTING,
            deck?.deckId ?? '',
          ),
          value: browseTileZoomValue(next),
          updatedAt,
        }),
      ])
    } catch (reason: unknown) {
      setTileZoom(previous)
      setTileZoomError(
        reason instanceof Error ? reason.message : 'Could not save tile zoom.',
      )
    }
  }

  async function saveBrowseDefaults(): Promise<void> {
    if (!runtime) return
    setDefaultsMessage(null)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: BROWSE_DEFAULTS_SETTING,
        value: JSON.stringify({ view, tileContent, tileZoom }),
        updatedAt: Date.now(),
      })
      setDefaultsMessage(
        'These Browse settings are now the default for all decks.',
      )
    } catch (reason: unknown) {
      setDefaultsMessage(
        reason instanceof Error
          ? reason.message
          : 'Could not save Browse defaults.',
      )
    }
  }

  if (!runtime)
    return <p className="text-muted-foreground p-6">Sign in to browse.</p>
  if (error) return <p className="text-destructive p-6">{error}</p>
  if (!deck)
    return (
      <main className="p-6" aria-busy="true">
        <p className="text-muted-foreground">Loading deck…</p>
      </main>
    )

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-jp-ui text-muted-foreground text-sm">一覧</p>
          <h1 className="font-display mt-1 text-3xl font-bold">Browse</h1>
          <p className="text-muted-foreground mt-2">
            {deck.name} ·{' '}
            {hasSearchOrFilters
              ? `${filteredCards.length} of ${cards.length} cards`
              : `${cards.length} cards`}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/study">Study this deck</Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">View</h2>
          <p className="text-muted-foreground text-sm">
            Tiles make the filtered deck visible at a glance.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1" htmlFor="browse-tile-content">
            <span className="text-muted-foreground text-xs">Tile content</span>
            <select
              id="browse-tile-content"
              value={tileContent}
              onChange={(event) =>
                void chooseTileContent(event.target.value as BrowseTileContent)
              }
              aria-label="Tile content"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
            >
              <option value="kanji">Kanji</option>
              <option value="reading">Reading</option>
              <option value="meaning">Meaning</option>
            </select>
          </label>
          <label className="grid gap-1" htmlFor="browse-tile-zoom">
            <span className="text-muted-foreground text-xs">Tile zoom</span>
            <select
              id="browse-tile-zoom"
              value={tileZoom}
              onChange={(event) =>
                void chooseTileZoom(
                  Number(event.target.value) as BrowseTileZoom,
                )
              }
              aria-label="Tile zoom"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
            >
              <option value="0.75">75% · Compact</option>
              <option value="1">100% · Standard</option>
              <option value="1.5">150% · Large</option>
            </select>
          </label>
          <div
            className="border-border inline-flex rounded-md border p-1"
            role="group"
            aria-label="Browse view"
          >
            <Button
              type="button"
              size="sm"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'list'}
              aria-label="Show list view"
              onClick={() => void chooseView('list')}
            >
              List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'tiles' ? 'secondary' : 'ghost'}
              aria-pressed={view === 'tiles'}
              aria-label="Show tile view"
              onClick={() => void chooseView('tiles')}
            >
              Tiles
            </Button>
          </div>
        </div>
      </div>

      <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <p className="text-muted-foreground text-sm">
          Choose the same view, tile content, and zoom automatically for future
          decks.
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void saveBrowseDefaults()}
        >
          Use these settings for all decks
        </Button>
      </div>
      {defaultsMessage && (
        <p className="text-muted-foreground text-sm" role="status">
          {defaultsMessage}
        </p>
      )}

      {viewError && (
        <p className="text-destructive" role="alert">
          {viewError}
        </p>
      )}

      {tileContentError && (
        <p className="text-destructive" role="alert">
          {tileContentError}
        </p>
      )}

      {tileZoomError && (
        <p className="text-destructive" role="alert">
          {tileZoomError}
        </p>
      )}

      {editError && (
        <p className="text-destructive" role="alert">
          {editError}
        </p>
      )}

      <label className="grid gap-2" htmlFor="browse-search">
        <span className="text-sm font-semibold">Search this deck</span>
        <input
          id="browse-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Kanji, reading, or meaning"
          aria-label="Search this deck"
          className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
          aria-describedby="browse-search-help"
        />
        <span id="browse-search-help" className="text-muted-foreground text-sm">
          Search matches kanji, kana readings, and English meanings.
        </span>
      </label>

      <label className="grid max-w-sm gap-2" htmlFor="browse-sort">
        <span className="text-sm font-semibold">Sort cards</span>
        <select
          id="browse-sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as BrowseSort)}
          aria-label="Sort cards"
          className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
          aria-describedby="browse-sort-help"
        >
          <option value="deck-order">Deck order</option>
          <option value="level">Level (new → mastered)</option>
          <option value="stroke-count">Stroke count</option>
          <option value="frequency">Frequency rank</option>
          <option value="jlpt">JLPT level (N5 → N1)</option>
          <option value="grade">School grade</option>
          <option value="times-reviewed">Times reviewed</option>
          <option value="last-reviewed">Last reviewed</option>
          <option value="kana">Kana alphabetical</option>
        </select>
        <span id="browse-sort-help" className="text-muted-foreground text-sm">
          Missing metadata is placed after cards with a value. Ties keep deck
          order.
        </span>
      </label>

      <section
        className="border-border grid gap-4 rounded-lg border p-4"
        aria-labelledby="browse-filters-heading"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 id="browse-filters-heading" className="font-semibold">
              Filter cards
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Filters combine with search. Leave a field empty to include all
              values.
            </p>
          </div>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters(DEFAULT_BROWSE_FILTERS)}
            >
              Clear filters
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2" htmlFor="browse-level-filter">
            <span className="text-sm font-semibold">Level</span>
            <select
              id="browse-level-filter"
              value={filters.level ?? 'all'}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  level:
                    event.target.value === 'all'
                      ? null
                      : (Number(event.target.value) as BrowseFilters['level']),
                }))
              }
              aria-label="Filter by level"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
            >
              <option value="all">All levels</option>
              {LEVEL_NAMES.map((name, level) => (
                <option key={name} value={level}>
                  {level} · {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-h-10 items-center gap-3 self-end pb-2">
            <input
              type="checkbox"
              checked={filters.flagged}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  flagged: event.target.checked,
                }))
              }
              aria-label="Show flagged only"
              className="accent-primary h-4 w-4"
            />
            <span className="text-sm font-semibold">Show flagged only</span>
          </label>

          <label className="grid gap-2" htmlFor="browse-min-strokes">
            <span className="text-sm font-semibold">Minimum strokes</span>
            <input
              id="browse-min-strokes"
              type="number"
              min="1"
              inputMode="numeric"
              value={filters.minStrokeCount ?? ''}
              onChange={(event) =>
                setNumericFilter('minStrokeCount', event.target.value)
              }
              aria-label="Minimum stroke count"
              placeholder="Any"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
            />
          </label>

          <label className="grid gap-2" htmlFor="browse-max-strokes">
            <span className="text-sm font-semibold">Maximum strokes</span>
            <input
              id="browse-max-strokes"
              type="number"
              min="1"
              inputMode="numeric"
              value={filters.maxStrokeCount ?? ''}
              onChange={(event) =>
                setNumericFilter('maxStrokeCount', event.target.value)
              }
              aria-label="Maximum stroke count"
              placeholder="Any"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
            />
          </label>

          <label
            className="grid gap-2 sm:max-w-sm"
            htmlFor="browse-jlpt-filter"
          >
            <span className="text-sm font-semibold">JLPT level</span>
            <select
              id="browse-jlpt-filter"
              value={filters.jlptLegacy ?? 'all'}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  jlptLegacy:
                    event.target.value === 'all'
                      ? null
                      : Number(event.target.value),
                }))
              }
              aria-label="Filter by JLPT level"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
            >
              <option value="all">All JLPT levels</option>
              <option value="5">N5</option>
              <option value="4">N4</option>
              <option value="3">N3</option>
              <option value="2">N2</option>
              <option value="1">N1</option>
            </select>
          </label>
        </div>
      </section>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            This deck has no cards available in the installed content pack.
          </CardContent>
        </Card>
      ) : filteredCards.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            {hasSearchOrFilters
              ? query.trim() && !hasFilters
                ? `No cards match “${query}”.`
                : 'No cards match the current search and filters.'
              : 'No cards match the current filters.'}
          </CardContent>
        </Card>
      ) : view === 'tiles' ? (
        <div
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${56 * tileZoom}px, 1fr))`,
          }}
          data-testid="browse-tile-wall"
          role="grid"
          aria-label={`${deck.name} tile wall`}
        >
          {sortedCards.map((card) => {
            const level = card.state?.level ?? 0
            const flagged = card.state?.flagged ?? false
            const text = tileText(card, tileContent)
            const japanese = tileContent !== 'meaning'
            const accessibleLabel =
              tileContent === 'kanji'
                ? `${card.literal}, Level ${level}, ${LEVEL_NAMES[level]}${flagged ? ', flagged' : ''}`
                : `${card.literal}, ${tileContentLabel(tileContent)}: ${text}, Level ${level}, ${LEVEL_NAMES[level]}${flagged ? ', flagged' : ''}`
            return (
              <Link
                href={`/detail?contentRef=${encodeURIComponent(card.contentRef)}`}
                key={card.contentRef}
                className={`level-swatch sticky-shape ${LEVEL_SHAPES[level]} relative grid aspect-square min-w-0 place-items-center rounded-md border ${tileContent === 'kanji' ? 'text-2xl' : 'px-1 text-center text-xs'} focus-visible:ring-ring shadow-sm focus-visible:ring-2 focus-visible:outline-none`}
                data-level={level}
                data-content-ref={card.contentRef}
                data-testid="browse-tile"
                role="gridcell"
                aria-label={accessibleLabel}
              >
                <span
                  className={japanese ? 'font-jp-display' : undefined}
                  lang={japanese ? 'ja' : undefined}
                >
                  {text}
                </span>
                {flagged && (
                  <span
                    className="text-primary absolute right-1 bottom-0 text-xs"
                    aria-hidden="true"
                  >
                    ⚑
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      ) : (
        <ul
          className="grid gap-3"
          data-testid="browse-card-list"
          aria-label={`${deck.name} cards`}
        >
          {sortedCards.map((card) => {
            const level = card.state?.level ?? 0
            const flagged = card.state?.flagged ?? false
            const reading = [...card.onReadings, ...card.kunReadings].join('、')
            return (
              <li key={card.contentRef}>
                <Card
                  className={`sticky-shape ${LEVEL_SHAPES[level]}`}
                  data-level={level}
                  data-content-ref={card.contentRef}
                  data-testid="browse-card"
                  role="article"
                  aria-label={`${card.literal}, Level ${level}, ${LEVEL_NAMES[level]}${flagged ? ', flagged' : ''}`}
                >
                  <CardContent className="flex items-center gap-4 p-4 sm:p-5">
                    <div
                      className="level-swatch grid h-14 w-14 shrink-0 place-items-center rounded-md text-3xl"
                      data-level={level}
                      aria-hidden="true"
                    >
                      <span className="font-jp-display">{card.literal}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="font-jp-ui text-lg" lang="ja">
                          {card.literal}
                        </h2>
                        <span className="text-muted-foreground text-sm">
                          Level {level} · {LEVEL_NAMES[level]}
                        </span>
                        {flagged && (
                          <span className="text-primary text-xs font-semibold">
                            Flagged
                          </span>
                        )}
                      </div>
                      <p className="font-jp-ui text-muted-foreground mt-1 text-sm">
                        {reading || 'No reading recorded'}
                      </p>
                      <p className="text-muted-foreground mt-1 truncate text-sm">
                        {card.meanings.join('; ') || 'No meaning recorded'}
                      </p>
                    </div>
                    <label className="grid shrink-0 gap-1 text-right">
                      <span className="text-muted-foreground text-xs">
                        Set level
                      </span>
                      <select
                        value={level}
                        disabled={savingContentRef !== null}
                        onChange={(event) => {
                          void setCardLevel(
                            card,
                            Number(event.target.value) as CardState['level'],
                          )
                        }}
                        aria-label={`Set level for ${card.literal}`}
                        className="border-input bg-background focus-visible:ring-ring h-10 min-w-24 rounded-md border px-2 text-sm shadow-sm outline-none focus-visible:ring-2 disabled:opacity-60"
                      >
                        {LEVEL_NAMES.map((name, candidateLevel) => (
                          <option key={name} value={candidateLevel}>
                            {candidateLevel} · {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
