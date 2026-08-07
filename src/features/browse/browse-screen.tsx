'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import type { CardState } from '@/data/repo'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { loadStarterDeck, type LoadedDeck } from '@/features/study/deck-loader'
import {
  DEFAULT_BROWSE_FILTERS,
  filterBrowseCards,
  type BrowseFilters,
} from './browse-filter'
import { sortBrowseCards, type BrowseSort } from './browse-sort'

const LEVEL_NAMES = ['New', 'Seen', 'Learning', 'Known', 'Mastered'] as const
const LEVEL_SHAPES = ['l0', 'l1', 'l2', 'l3', 'l4'] as const

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

  useEffect(() => {
    if (!runtime) return
    let active = true
    setDeck(null)
    setError(null)
    void (async () => {
      await runtime.database.ready
      const loaded = await loadStarterDeck(runtime.database, deckDefinitionId)
      if (active) setDeck(loaded)
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
