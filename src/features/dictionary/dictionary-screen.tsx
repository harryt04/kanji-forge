'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories, type OutboxMutation } from '@/data/repo'
import {
  searchDictionary,
  searchDictionaryByRadical,
  searchDictionaryByStrokeCount,
  type DictionaryResult,
} from '@/data/packs'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { detectInputType, INPUT_TYPE_LABELS } from '@/core/text/detect'
import {
  DICTIONARY_HISTORY_SETTING,
  DICTIONARY_PINNED_SETTING,
  isPinnedSearch,
  parsePinnedSearches,
  parseSearchHistory,
  recordSearch,
  serializeSearchHistory,
  togglePinnedSearch,
} from './search-history'
import { SAVE_BEHAVIOR_SETTING } from '@/features/detail/save-behavior'
import { DetailScreen } from '@/features/detail'

function contentRefForResult(result: DictionaryResult): string {
  return result.type === 'kanji'
    ? `kanji:${result.record.literal}`
    : `${result.type}:${result.record.id}`
}

function detailHrefForResult(result: DictionaryResult): string {
  return `/dictionary?contentRef=${encodeURIComponent(contentRefForResult(result))}`
}

function requestedContentRef(): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get('contentRef')
}

function submitLabel(result: DictionaryResult): string {
  if (result.type === 'kanji') return 'Kanji'
  return result.type === 'name' ? 'Name' : 'Word'
}

type SearchMode = 'text' | 'radical' | 'stroke-count'

export function DictionaryScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('text')
  const [results, setResults] = useState<readonly DictionaryResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState('')
  const [history, setHistory] = useState<readonly string[]>([])
  const [pinned, setPinned] = useState<readonly string[]>([])
  const [savedContentRefs, setSavedContentRefs] = useState<readonly string[]>(
    [],
  )
  const [savingContentRef, setSavingContentRef] = useState<string | null>(null)
  const [askBeforeSaving, setAskBeforeSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedContentRef, setSelectedContentRef] = useState<string | null>(
    requestedContentRef,
  )

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
    void (async () => {
      await runtime.database.ready
      const repo = createUserRepositories(runtime.database)
      const [savedHistory, savedPinned, savedMembership, savedSaveBehavior] =
        await Promise.all([
          repo.settings.get(DICTIONARY_HISTORY_SETTING),
          repo.settings.get(DICTIONARY_PINNED_SETTING),
          repo.deckMembership.list(),
          repo.settings.get(SAVE_BEHAVIOR_SETTING),
        ])
      if (active) {
        setHistory(parseSearchHistory(savedHistory?.value))
        setPinned(parsePinnedSearches(savedPinned?.value))
        setSavedContentRefs(
          savedMembership.map((membership) => membership.contentRef),
        )
        setAskBeforeSaving(savedSaveBehavior?.value === 'ask')
      }
    })()
    return () => {
      active = false
    }
  }, [runtime])

  async function saveSearchSetting(
    key: string,
    queries: readonly string[],
  ): Promise<void> {
    if (!runtime) return
    const repo = createUserRepositories(runtime.database)
    await repo.settings.set({
      key,
      value: serializeSearchHistory(queries),
      updatedAt: Date.now(),
    })
  }

  async function runSearch(nextQuery: string): Promise<void> {
    const trimmedQuery = nextQuery.trim()
    if (!trimmedQuery) return
    setQuery(trimmedQuery)
    setLoading(true)
    setError(null)
    try {
      if (searchMode === 'radical') {
        const radical = Number(trimmedQuery)
        if (!Number.isInteger(radical) || radical < 1 || radical > 214) {
          throw new Error('Enter a classical radical number from 1 to 214.')
        }
        setResults(await searchDictionaryByRadical(radical))
        setSearchedQuery(`radical ${radical}`)
      } else if (searchMode === 'stroke-count') {
        const strokeCount = Number(trimmedQuery)
        if (!Number.isInteger(strokeCount) || strokeCount < 1) {
          throw new Error('Enter a positive whole-number stroke count.')
        }
        setResults(await searchDictionaryByStrokeCount(strokeCount))
        setSearchedQuery(`${strokeCount} strokes`)
      } else {
        const nextHistory = recordSearch(history, trimmedQuery)
        setHistory(nextHistory)
        await saveSearchSetting(DICTIONARY_HISTORY_SETTING, nextHistory)
        setResults(await searchDictionary(trimmedQuery))
        setSearchedQuery(trimmedQuery)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!query.trim()) {
      setResults([])
      setSearchedQuery('')
      return
    }
    await runSearch(query)
  }

  async function togglePin(queryToToggle: string): Promise<void> {
    const nextPinned = togglePinnedSearch(pinned, queryToToggle)
    setPinned(nextPinned)
    try {
      await saveSearchSetting(DICTIONARY_PINNED_SETTING, nextPinned)
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not save pinned search.',
      )
    }
  }

  async function saveResult(result: DictionaryResult): Promise<void> {
    if (!runtime) return
    const contentRef = contentRefForResult(result)
    if (savedContentRefs.includes(contentRef)) return
    if (
      askBeforeSaving &&
      !window.confirm(`Save this ${result.type} to your Saved deck?`)
    )
      return
    const now = Date.now()
    const mutation: OutboxMutation = {
      id: crypto.randomUUID(),
      mutType: 'deckMembership.upsert',
      payload: JSON.stringify({
        deckId: 'saved',
        contentRef,
        updatedAt: now,
      }),
      createdAt: now,
      attempts: 0,
    }
    setSavingContentRef(contentRef)
    setError(null)
    try {
      const repo = createUserRepositories(runtime.database)
      const saved = await repo.deckMembership.list()
      await repo.recordDeckMembership({
        deck: {
          id: 'saved',
          name: 'Saved',
          kind: 'saved',
          definitionId: null,
          updatedAt: now,
        },
        membership: {
          deckId: 'saved',
          contentRef,
          sortOrder: saved.length,
          addedAt: now,
          updatedAt: now,
        },
        mutation,
      })
      setSavedContentRefs((current) =>
        current.includes(contentRef) ? current : [...current, contentRef],
      )
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not save result.',
      )
    } finally {
      setSavingContentRef(null)
    }
  }

  const hasDetailPane = selectedContentRef !== null

  return (
    <main
      className={`mx-auto grid w-full gap-6 px-4 py-8 sm:px-6 ${hasDetailPane ? 'max-w-[96rem] lg:grid-cols-[minmax(22rem,0.9fr)_minmax(28rem,1.1fr)] lg:items-start' : 'max-w-3xl'}`}
    >
      <section className="grid min-w-0 gap-6">
        <header>
          <p className="font-jp-ui text-muted-foreground text-sm">辞書</p>
          <h1 className="font-display mt-1 text-3xl font-bold">Dictionary</h1>
          <p className="text-muted-foreground mt-2">
            Search the installed dictionary by kanji, kana, romaji, English, or
            classical radical number.
          </p>
        </header>

        <form className="grid gap-3" onSubmit={(event) => void submit(event)}>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Dictionary search type"
          >
            <Button
              type="button"
              variant={searchMode === 'text' ? 'secondary' : 'outline'}
              aria-pressed={searchMode === 'text'}
              onClick={() => {
                setSearchMode('text')
                setQuery('')
                setResults([])
                setSearchedQuery('')
              }}
            >
              Text search
            </Button>
            <Button
              type="button"
              variant={searchMode === 'radical' ? 'secondary' : 'outline'}
              aria-pressed={searchMode === 'radical'}
              onClick={() => {
                setSearchMode('radical')
                setQuery('')
                setResults([])
                setSearchedQuery('')
              }}
            >
              Radical search
            </Button>
            <Button
              type="button"
              variant={searchMode === 'stroke-count' ? 'secondary' : 'outline'}
              aria-pressed={searchMode === 'stroke-count'}
              onClick={() => {
                setSearchMode('stroke-count')
                setQuery('')
                setResults([])
                setSearchedQuery('')
              }}
            >
              Stroke-count search
            </Button>
          </div>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="dictionary-query">
              {searchMode === 'radical'
                ? 'Classical radical number'
                : searchMode === 'stroke-count'
                  ? 'Stroke count'
                  : 'Dictionary search'}
            </label>
            <input
              id="dictionary-query"
              type={searchMode === 'text' ? 'search' : 'number'}
              min={searchMode === 'text' ? undefined : 1}
              max={searchMode === 'radical' ? 214 : undefined}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                searchMode === 'radical'
                  ? 'e.g. 75 (grass radical)'
                  : searchMode === 'stroke-count'
                    ? 'e.g. 4'
                    : 'e.g. 日本, お*, or *Japan*'
              }
              autoComplete="off"
              className="border-input bg-background h-11 min-w-0 flex-1 rounded-md border px-3 text-base"
            />
            <Button type="submit" size="lg" disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </Button>
          </div>
          {searchMode === 'text' && (
            <div className="grid gap-1">
              {query.trim() && (
                <p
                  className="text-muted-foreground text-sm"
                  data-testid="dictionary-input-type"
                  aria-live="polite"
                >
                  Detected input: {INPUT_TYPE_LABELS[detectInputType(query)]}
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                Use * for any number of characters or ? for exactly one
                character.
              </p>
            </div>
          )}
        </form>

        {(pinned.length > 0 || history.length > 0) && (
          <section
            className="grid gap-4"
            aria-label="Saved dictionary searches"
          >
            {pinned.length > 0 && (
              <div className="grid gap-2">
                <h2 className="text-sm font-semibold">Pinned searches</h2>
                <div className="flex flex-wrap gap-2">
                  {pinned.map((savedQuery) => (
                    <div key={`pinned-${savedQuery}`} className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void runSearch(savedQuery)}
                      >
                        {savedQuery}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Unpin search ${savedQuery}`}
                        onClick={() => void togglePin(savedQuery)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {history.length > 0 && (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Recent searches</h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setHistory([])
                      void saveSearchSetting(DICTIONARY_HISTORY_SETTING, [])
                    }}
                  >
                    Clear
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {history.map((savedQuery) => (
                    <div key={`history-${savedQuery}`} className="flex gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void runSearch(savedQuery)}
                      >
                        {savedQuery}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${isPinnedSearch(pinned, savedQuery) ? 'Unpin' : 'Pin'} search ${savedQuery}`}
                        onClick={() => void togglePin(savedQuery)}
                      >
                        {isPinnedSearch(pinned, savedQuery) ? '★' : '☆'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        {!searchedQuery && !loading && (
          <p className="text-muted-foreground text-sm">
            Search works offline after the dictionary pack is installed.
          </p>
        )}
        {searchedQuery && !loading && results.length === 0 && (
          <p role="status">
            No dictionary entries found for “{searchedQuery}”.
          </p>
        )}

        <section aria-live="polite" className="grid gap-3">
          {results.map((result) => (
            <Card
              key={`${result.type}-${result.type === 'kanji' ? result.record.literal : result.record.id}`}
            >
              <CardContent className="grid gap-2 pt-6">
                <div className="flex items-baseline justify-between gap-4">
                  <h2>
                    <Link
                      className="font-jp-ui text-primary rounded-sm text-3xl underline underline-offset-4 focus-visible:ring-2"
                      href={detailHrefForResult(result)}
                      lang="ja"
                      aria-label={`View details for ${result.type === 'kanji' ? result.record.literal : (result.record.forms[0] ?? result.record.readings[0])}`}
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey ||
                          event.altKey
                        )
                          return
                        event.preventDefault()
                        const nextContentRef = contentRefForResult(result)
                        window.history.pushState(
                          {},
                          '',
                          detailHrefForResult(result),
                        )
                        setSelectedContentRef(nextContentRef)
                      }}
                    >
                      {result.type === 'kanji'
                        ? result.record.literal
                        : (result.record.forms[0] ?? result.record.readings[0])}
                    </Link>
                  </h2>
                  <span className="text-muted-foreground text-xs uppercase">
                    {submitLabel(result)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  disabled={
                    savingContentRef !== null ||
                    savedContentRefs.includes(contentRefForResult(result))
                  }
                  onClick={() => void saveResult(result)}
                >
                  {savedContentRefs.includes(contentRefForResult(result))
                    ? 'Saved'
                    : savingContentRef === contentRefForResult(result)
                      ? 'Saving…'
                      : 'Save to Saved'}
                </Button>
                {result.type === 'kanji' ? (
                  <>
                    <dl
                      className="grid gap-3 text-sm sm:grid-cols-2"
                      data-testid="kanji-details"
                    >
                      <div>
                        <dt className="text-muted-foreground">On readings</dt>
                        <dd className="font-jp-ui mt-0.5" lang="ja">
                          {result.record.onReadings.join('、') || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Kun readings</dt>
                        <dd className="font-jp-ui mt-0.5" lang="ja">
                          {result.record.kunReadings.join('、') || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Meanings</dt>
                        <dd className="mt-0.5">
                          {result.record.meanings.join('; ') || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Stroke count</dt>
                        <dd className="mt-0.5">
                          {result.record.strokeCount || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Classical radical
                        </dt>
                        <dd className="mt-0.5">
                          {result.record.radicalClassical ?? 'Not listed'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">School grade</dt>
                        <dd className="mt-0.5">
                          {result.record.grade
                            ? `Grade ${result.record.grade}`
                            : 'Not listed'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">JLPT</dt>
                        <dd className="mt-0.5">
                          {result.record.jlptLegacy
                            ? `N${result.record.jlptLegacy}`
                            : 'Not listed'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Frequency rank
                        </dt>
                        <dd className="mt-0.5">
                          {result.record.freq
                            ? `#${result.record.freq}`
                            : 'Not listed'}
                        </dd>
                      </div>
                      {result.record.nanori.length > 0 && (
                        <div>
                          <dt className="text-muted-foreground">
                            Name readings
                          </dt>
                          <dd className="font-jp-ui mt-0.5" lang="ja">
                            {result.record.nanori.join('、')}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </>
                ) : (
                  <>
                    <p lang="ja">{result.record.readings.join('、')}</p>
                    <p>
                      {result.record.meanings.join('; ') || 'No English gloss'}
                    </p>
                    {result.record.partsOfSpeech.length > 0 && (
                      <p className="text-muted-foreground text-sm">
                        {result.record.partsOfSpeech.join(', ')}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </section>
      </section>
      {hasDetailPane && (
        <aside
          className="border-border min-w-0 rounded-lg border lg:sticky lg:top-6"
          aria-label="Selected dictionary entry details"
          data-testid="dictionary-detail-pane"
        >
          <DetailScreen embedded embeddedPath="/dictionary" />
        </aside>
      )}
    </main>
  )
}
