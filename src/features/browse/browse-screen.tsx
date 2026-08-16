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
import { loadDeck, type LoadedDeck } from '@/features/study/deck-loader'
import { DetailScreen } from '@/features/detail'
import { getDeviceId } from '@/lib/device-id'
import {
  DEFAULT_BROWSE_FILTERS,
  filterBrowseCards,
  type BrowseFilters,
} from './browse-filter'
import { buildBulkFlagUpdates, buildBulkLevelOverrides } from './browse-bulk'
import { sortBrowseCards, type BrowseSort } from './browse-sort'
import { beltLevelLabel, LEVEL_NAMES } from '@/features/level-rank'
import {
  BROWSE_LIST_ROW_HEIGHT,
  BROWSE_LIST_VIEWPORT_HEIGHT,
  BROWSE_LIST_VIRTUALIZATION_THRESHOLD,
  getBrowseVirtualRange,
} from './browse-virtual'
import {
  countCardsByLevel,
  loadDeckSummaries,
  type DeckSummary,
} from '@/features/decks/deck-summary'
import { LevelRamp } from './level-ramp'
import { DeckRail } from './deck-rail'

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

function requestedContentRef(): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get('contentRef')
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
  const [view, setView] = useState<BrowseView>('tiles')
  const [tileContent, setTileContent] = useState<BrowseTileContent>('kanji')
  const [tileZoom, setTileZoom] = useState<BrowseTileZoom>(1)
  const [savingContentRef, setSavingContentRef] = useState<string | null>(null)
  const [selectedContentRefs, setSelectedContentRefs] = useState<Set<string>>(
    () => new Set(),
  )
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkLevel, setBulkLevel] = useState<CardState['level'] | 'all'>('all')
  const [editError, setEditError] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [tileContentError, setTileContentError] = useState<string | null>(null)
  const [tileZoomError, setTileZoomError] = useState<string | null>(null)
  const [selectedDeckId, setSelectedDeckId] = useState(deckDefinitionId)
  const [selectedContentRef, setSelectedContentRef] = useState<string | null>(
    requestedContentRef,
  )
  const [listScrollTop, setListScrollTop] = useState(0)
  const [summaries, setSummaries] = useState<{
    readonly builtIn: readonly DeckSummary[]
    readonly custom: readonly DeckSummary[]
  } | null>(null)
  const [summaryVersion, setSummaryVersion] = useState(0)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const requested = new URL(window.location.href).searchParams.get('deckId')
    setSelectedDeckId(requested || deckDefinitionId)
    setSelectedContentRef(requestedContentRef())
  }, [deckDefinitionId])

  useEffect(() => {
    function handlePopState(): void {
      setSelectedContentRef(requestedContentRef())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!runtime) return
    let active = true
    setDeck(null)
    setError(null)
    void (async () => {
      await runtime.database.ready
      const loaded = await loadDeck(runtime.database, selectedDeckId)
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
      if (active) setSelectedContentRefs(new Set())
    })().catch((reason: unknown) => {
      if (active)
        setError(
          reason instanceof Error ? reason.message : 'Failed to load the deck.',
        )
    })
    return () => {
      active = false
    }
  }, [runtime, deckDefinitionId, selectedDeckId])

  useEffect(() => {
    if (!runtime) return
    let active = true
    void runtime.database.ready
      .then(() =>
        loadDeckSummaries(runtime.database, runtime.userId, {
          includeSessions: false,
        }),
      )
      .then((loaded) => {
        if (active) setSummaries(loaded)
      })
    return () => {
      active = false
    }
  }, [runtime, summaryVersion])

  function selectDeck(nextDeckId: string): void {
    if (nextDeckId === selectedDeckId) return
    setSelectedDeckId(nextDeckId)
    setSelectedContentRef(null)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('deckId', nextDeckId)
      url.searchParams.delete('contentRef')
      window.history.pushState({}, '', url)
    }
  }

  const cards = useMemo(() => (deck ? toBrowseCards(deck) : []), [deck])
  const filteredCards = useMemo(() => {
    const searched = searchBrowseCards(cards, query)
    return filterBrowseCards(searched, filters)
  }, [cards, filters, query])
  const sortedCards = useMemo(
    () => sortBrowseCards(filteredCards, sort),
    [filteredCards, sort],
  )
  const virtualizeList =
    view === 'list' && sortedCards.length > BROWSE_LIST_VIRTUALIZATION_THRESHOLD
  const listRange = virtualizeList
    ? getBrowseVirtualRange(sortedCards.length, listScrollTop)
    : { start: 0, end: sortedCards.length }
  const visibleListCards = sortedCards.slice(listRange.start, listRange.end)

  useEffect(() => {
    setListScrollTop(0)
  }, [sortedCards, view])
  const selectedCards = useMemo(
    () => cards.filter((card) => selectedContentRefs.has(card.contentRef)),
    [cards, selectedContentRefs],
  )
  const selectedVisibleCount = sortedCards.filter((card) =>
    selectedContentRefs.has(card.contentRef),
  ).length
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
    if (!runtime || !deck || savingContentRef !== null || bulkBusy) return

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
      setSummaryVersion((v) => v + 1)
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

  function toggleSelection(contentRef: string): void {
    setSelectedContentRefs((current) => {
      const next = new Set(current)
      if (next.has(contentRef)) next.delete(contentRef)
      else next.add(contentRef)
      return next
    })
  }

  function selectVisibleCards(): void {
    setSelectedContentRefs((current) => {
      const next = new Set(current)
      for (const card of sortedCards) next.add(card.contentRef)
      return next
    })
  }

  function clearSelection(): void {
    setSelectedContentRefs(new Set())
    setStatusMessage(null)
  }

  function applyStateUpdates(updates: readonly { state: CardState }[]): void {
    const states = new Map(
      updates.map((update) => [update.state.contentRef, update.state]),
    )
    setDeck((current) =>
      current
        ? {
            ...current,
            cards: current.cards.map((card) => ({
              ...card,
              state: states.get(card.contentRef) ?? card.state,
            })),
          }
        : current,
    )
  }

  async function bulkSetFlagged(flagged: boolean): Promise<void> {
    if (!runtime || !deck || selectedCards.length === 0 || bulkBusy) return
    const now = Date.now()
    setBulkBusy(true)
    setStatusMessage(null)
    try {
      const updates = buildBulkFlagUpdates(selectedCards, flagged, {
        deckId: deck.deckId,
        now,
        deviceId: getDeviceId(),
        idFactory: () => crypto.randomUUID(),
      })
      await createUserRepositories(runtime.database).recordCardStates(updates)
      applyStateUpdates(updates)
      setSelectedContentRefs(new Set())
      setSummaryVersion((v) => v + 1)
      setStatusMessage(
        `${updates.length} card${updates.length === 1 ? '' : 's'} ${flagged ? 'flagged' : 'unflagged'}.`,
      )
    } catch (reason: unknown) {
      setStatusMessage(
        reason instanceof Error ? reason.message : 'Could not update cards.',
      )
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkSetLevel(level: CardState['level']): Promise<void> {
    if (!runtime || !deck || selectedCards.length === 0 || bulkBusy) return
    const now = Date.now()
    setBulkBusy(true)
    setStatusMessage(null)
    try {
      const updates = buildBulkLevelOverrides(selectedCards, level, {
        deckId: deck.deckId,
        now,
        deviceId: getDeviceId(),
        idFactory: () => crypto.randomUUID(),
      })
      await createUserRepositories(runtime.database).recordManualOverrides(
        updates,
      )
      applyStateUpdates(updates.map(({ nextState }) => ({ state: nextState })))
      setSelectedContentRefs(new Set())
      setBulkLevel('all')
      setSummaryVersion((v) => v + 1)
      setStatusMessage(
        `${updates.length} card${updates.length === 1 ? '' : 's'} set to Level ${level} · ${LEVEL_NAMES[level]}.`,
      )
    } catch (reason: unknown) {
      setStatusMessage(
        reason instanceof Error ? reason.message : 'Could not update cards.',
      )
    } finally {
      setBulkBusy(false)
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

  function handleListScroll(event: React.UIEvent<HTMLDivElement>): void {
    setListScrollTop(event.currentTarget.scrollTop)
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
    setStatusMessage(null)
    try {
      await createUserRepositories(runtime.database).settings.set({
        key: BROWSE_DEFAULTS_SETTING,
        value: JSON.stringify({ view, tileContent, tileZoom }),
        updatedAt: Date.now(),
      })
      setStatusMessage(
        'These Browse settings are now the default for all decks.',
      )
    } catch (reason: unknown) {
      setStatusMessage(
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

  const hasDetailPane = selectedContentRef !== null

  return (
    <main
      className={`grid w-full min-w-0 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start ${hasDetailPane ? 'xl:grid-cols-[15rem_minmax(0,1fr)_22.5rem]' : ''}`}
    >
      <div className="min-w-0">
        {summaries ? (
          <DeckRail
            builtIn={summaries.builtIn}
            custom={summaries.custom}
            selectedDeckId={selectedDeckId}
            onSelectDeck={selectDeck}
          />
        ) : (
          <p className="text-muted-foreground text-sm">Loading decks…</p>
        )}
      </div>
      <section className="grid min-w-0 gap-6">
        <header className="flex min-w-0 flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-jp-ui text-muted-foreground text-sm" lang="ja">
              一覧
            </p>
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

        <div data-testid="browse-level-ramp">
          <LevelRamp
            counts={countCardsByLevel(cards)}
            total={cards.length}
            selectedLevel={filters.level}
            onSelectLevel={(level) =>
              setFilters((current) => ({ ...current, level }))
            }
          />
        </div>

        <p
          className="text-muted-foreground min-h-5 text-sm"
          role="status"
          data-testid="browse-status"
        >
          {statusMessage}
        </p>

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

        <div
          className="flex min-w-0 flex-wrap items-end gap-3"
          role="group"
          aria-label="Browse controls"
        >
          <label className="grid gap-1" htmlFor="browse-search">
            <span className="text-muted-foreground text-xs">
              Search this deck
            </span>
            <input
              id="browse-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Kanji, reading, or meaning"
              aria-label="Search this deck"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
            />
          </label>

          <label className="grid gap-1" htmlFor="browse-sort">
            <span className="text-muted-foreground text-xs">Sort cards</span>
            <select
              id="browse-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as BrowseSort)}
              aria-label="Sort cards"
              className="border-input bg-background focus-visible:ring-ring h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
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
          </label>

          <label className="grid gap-1" htmlFor="browse-level-filter">
            <span className="text-muted-foreground text-xs">Level</span>
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

          <label className="flex min-h-11 items-center gap-3">
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

          <Button
            type="button"
            size="sm"
            variant={selectionMode ? 'secondary' : 'outline'}
            aria-pressed={selectionMode}
            onClick={() => {
              setSelectionMode((current) => !current)
              if (selectionMode) clearSelection()
            }}
          >
            Select cards
          </Button>

          <details
            className="min-w-0"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
            <summary className="text-primary flex min-h-11 cursor-pointer items-center text-sm font-medium select-none">
              More filters
            </summary>
            {filtersOpen && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
            )}
          </details>
        </div>

        <div className="border-border flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <p className="text-muted-foreground text-sm">
            Choose the same view, tile content, and zoom automatically for
            future decks.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void saveBrowseDefaults()}
          >
            Use these settings for all decks
          </Button>
        </div>

        {selectionMode && selectedContentRefs.size > 0 && (
          <div
            role="toolbar"
            aria-label="Bulk card actions"
            className="border-border bg-card sticky bottom-2 z-10 flex min-w-0 flex-wrap items-end gap-3 rounded-md border p-3 shadow-sm"
          >
            <p className="text-muted-foreground min-w-0 basis-full text-sm">
              {`${selectedContentRefs.size} selected${selectedVisibleCount < selectedContentRefs.size ? ` · ${selectedVisibleCount} visible` : ''}.`}
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={selectVisibleCards}
              disabled={bulkBusy}
            >
              Select visible
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={bulkBusy}
            >
              Clear selection
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void bulkSetFlagged(true)}
              disabled={bulkBusy}
            >
              Flag selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void bulkSetFlagged(false)}
              disabled={bulkBusy}
            >
              Unflag selected
            </Button>
            <label className="grid gap-1" htmlFor="browse-bulk-level">
              <span className="text-muted-foreground text-xs">
                Set selected level
              </span>
              <select
                id="browse-bulk-level"
                value={bulkLevel}
                disabled={bulkBusy}
                onChange={(event) => {
                  const value = event.target.value
                  if (value !== 'all')
                    void bulkSetLevel(Number(value) as CardState['level'])
                }}
                aria-label="Set selected level"
                className="border-input bg-background focus-visible:ring-ring h-10 min-w-32 rounded-md border px-2 text-sm shadow-sm outline-none focus-visible:ring-2 disabled:opacity-60"
              >
                <option value="all">Choose level…</option>
                {LEVEL_NAMES.map((name, candidateLevel) => (
                  <option key={name} value={candidateLevel}>
                    {candidateLevel} · {name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="min-w-0" data-testid="browse-cards">
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
                gridTemplateColumns: `repeat(auto-fill, minmax(${Math.max(
                  44,
                  56 * tileZoom,
                )}px, 1fr))`,
              }}
              data-testid="browse-tile-wall"
              role="grid"
              aria-label={`${deck.name} tile wall`}
            >
              {sortedCards.map((card) => {
                const level = card.state?.level ?? 0
                const flagged = card.state?.flagged ?? false
                const selected = selectedContentRefs.has(card.contentRef)
                const text = tileText(card, tileContent)
                const japanese = tileContent !== 'meaning'
                const accessibleLabel =
                  tileContent === 'kanji'
                    ? `${card.literal}, ${beltLevelLabel(level)}, ${LEVEL_NAMES[level]}${flagged ? ', flagged' : ''}`
                    : `${card.literal}, ${tileContentLabel(tileContent)}: ${text}, ${beltLevelLabel(level)}, ${LEVEL_NAMES[level]}${flagged ? ', flagged' : ''}`
                const tileClassName = `level-swatch sticky-shape ${LEVEL_SHAPES[level]} relative grid aspect-square w-full min-w-0 place-items-center rounded-md border ${tileContent === 'kanji' ? 'text-2xl' : 'px-1 text-center text-xs'} focus-visible:ring-ring shadow-sm focus-visible:ring-2 focus-visible:outline-none ${selectionMode && selected ? 'ring-primary ring-3 ring-inset pr-5' : ''}`
                const tileContents = (
                  <>
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
                    {selectionMode && selected && (
                      <span
                        className="text-primary absolute top-1 right-1 text-sm leading-none font-bold"
                        aria-hidden="true"
                        data-testid="browse-tile-selection-check"
                      >
                        ✓
                      </span>
                    )}
                  </>
                )
                return (
                  <div
                    key={card.contentRef}
                    className="relative min-w-0"
                    data-testid="browse-tile-shell"
                  >
                    {selectionMode ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={selected}
                        aria-label={accessibleLabel}
                        className={tileClassName}
                        data-level={level}
                        data-content-ref={card.contentRef}
                        data-selected={selected}
                        data-testid="browse-tile"
                        style={
                          selectionMode && selected
                            ? { boxShadow: 'inset 0 0 0 3px var(--primary)' }
                            : undefined
                        }
                        onClick={() => toggleSelection(card.contentRef)}
                      >
                        {tileContents}
                      </button>
                    ) : (
                      <Link
                        href={`/browse?deckId=${encodeURIComponent(deck.deckId)}&contentRef=${encodeURIComponent(card.contentRef)}`}
                        className={tileClassName}
                        data-level={level}
                        data-content-ref={card.contentRef}
                        data-testid="browse-tile"
                        role="gridcell"
                        aria-label={accessibleLabel}
                      >
                        {tileContents}
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              className={virtualizeList ? 'overflow-y-auto' : undefined}
              style={
                virtualizeList
                  ? {
                      height: `${BROWSE_LIST_VIEWPORT_HEIGHT}px`,
                    }
                  : undefined
              }
              onScroll={virtualizeList ? handleListScroll : undefined}
              data-testid="browse-card-list"
            >
              <ul
                className={virtualizeList ? 'relative' : 'grid gap-3'}
                style={
                  virtualizeList
                    ? {
                        height: `${sortedCards.length * BROWSE_LIST_ROW_HEIGHT}px`,
                      }
                    : undefined
                }
                aria-label={`${deck.name} cards`}
              >
                {visibleListCards.map((card, visibleIndex) => {
                  const cardIndex = listRange.start + visibleIndex
                  const level = card.state?.level ?? 0
                  const flagged = card.state?.flagged ?? false
                  const reading = [
                    ...card.onReadings,
                    ...card.kunReadings,
                  ].join('、')
                  return (
                    <li
                      key={card.contentRef}
                      style={
                        virtualizeList
                          ? {
                              position: 'absolute',
                              top: `${cardIndex * BROWSE_LIST_ROW_HEIGHT}px`,
                              right: 0,
                              left: 0,
                              height: `${BROWSE_LIST_ROW_HEIGHT - 12}px`,
                            }
                          : undefined
                      }
                      aria-setsize={sortedCards.length}
                      aria-posinset={cardIndex + 1}
                    >
                      <Card
                        className={`sticky-shape ${LEVEL_SHAPES[level]}`}
                        data-level={level}
                        data-content-ref={card.contentRef}
                        data-testid="browse-card"
                        role="article"
                        aria-label={`${card.literal}, ${beltLevelLabel(level)}, ${LEVEL_NAMES[level]}${flagged ? ', flagged' : ''}`}
                      >
                        <CardContent className="flex min-w-0 items-center gap-4 p-4 sm:p-5">
                          {selectionMode && (
                            <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                              <span className="sr-only">
                                Select {card.literal}
                              </span>
                              <input
                                type="checkbox"
                                checked={selectedContentRefs.has(
                                  card.contentRef,
                                )}
                                onChange={() =>
                                  toggleSelection(card.contentRef)
                                }
                                aria-label={`Select ${card.literal}`}
                                className="accent-primary h-5 w-5"
                              />
                            </label>
                          )}
                          <div
                            className={`level-swatch sticky-shape ${LEVEL_SHAPES[level]} grid h-14 w-14 shrink-0 place-items-center rounded-md text-3xl`}
                            data-level={level}
                            aria-hidden="true"
                          >
                            <span className="font-jp-display" lang="ja">
                              {card.literal}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                              <h2 className="font-jp-ui text-lg" lang="ja">
                                <Link
                                  className="text-primary inline-flex min-h-11 min-w-11 items-center underline underline-offset-2"
                                  href={`/browse?deckId=${encodeURIComponent(deck.deckId)}&contentRef=${encodeURIComponent(card.contentRef)}`}
                                  aria-label={`View details for ${card.literal}`}
                                >
                                  {card.literal}
                                </Link>
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
                            <p
                              className="font-jp-ui text-muted-foreground mt-1 text-sm"
                              lang="ja"
                            >
                              {reading || 'No reading recorded'}
                            </p>
                            <p className="text-muted-foreground mt-1 truncate text-sm">
                              {card.meanings.join('; ') ||
                                'No meaning recorded'}
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
                                  Number(
                                    event.target.value,
                                  ) as CardState['level'],
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
            </div>
          )}
        </div>
      </section>
      {hasDetailPane && (
        <aside
          className="border-border min-w-0 rounded-lg border lg:sticky lg:top-6"
          aria-label="Selected card details"
          data-testid="browse-detail-pane"
        >
          <DetailScreen embedded embeddedPath="/browse" />
        </aside>
      )}
    </main>
  )
}
