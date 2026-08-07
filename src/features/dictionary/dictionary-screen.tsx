'use client'

import { FormEvent, useEffect, useState } from 'react'
import { getActiveUserRuntime } from '@/auth/runtime'
import { createUserRepositories } from '@/data/repo'
import { searchDictionary, type DictionaryResult } from '@/data/packs'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
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

function submitLabel(result: DictionaryResult): string {
  return result.type === 'kanji' ? 'Kanji' : 'Word'
}

export function DictionaryScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly DictionaryResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState('')
  const [history, setHistory] = useState<readonly string[]>([])
  const [pinned, setPinned] = useState<readonly string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runtime) return
    let active = true
    void (async () => {
      await runtime.database.ready
      const repo = createUserRepositories(runtime.database)
      const [savedHistory, savedPinned] = await Promise.all([
        repo.settings.get(DICTIONARY_HISTORY_SETTING),
        repo.settings.get(DICTIONARY_PINNED_SETTING),
      ])
      if (active) {
        setHistory(parseSearchHistory(savedHistory?.value))
        setPinned(parsePinnedSearches(savedPinned?.value))
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
      const nextHistory = recordSearch(history, trimmedQuery)
      setHistory(nextHistory)
      await saveSearchSetting(DICTIONARY_HISTORY_SETTING, nextHistory)
      setResults(await searchDictionary(trimmedQuery))
      setSearchedQuery(trimmedQuery)
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

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
      <header>
        <p className="font-jp-ui text-muted-foreground text-sm">辞書</p>
        <h1 className="font-display mt-1 text-3xl font-bold">Dictionary</h1>
        <p className="text-muted-foreground mt-2">
          Search the installed dictionary by kanji, kana, romaji, or English.
        </p>
      </header>

      <form className="flex gap-2" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="dictionary-query">
          Dictionary search
        </label>
        <input
          id="dictionary-query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. 日本, nihongo, or Japan"
          autoComplete="off"
          className="border-input bg-background h-11 min-w-0 flex-1 rounded-md border px-3 text-base"
        />
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>

      {(pinned.length > 0 || history.length > 0) && (
        <section className="grid gap-4" aria-label="Saved dictionary searches">
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
        <p role="status">No dictionary entries found for “{searchedQuery}”.</p>
      )}

      <section aria-live="polite" className="grid gap-3">
        {results.map((result) => (
          <Card
            key={`${result.type}-${result.type === 'kanji' ? result.record.literal : result.record.id}`}
          >
            <CardContent className="grid gap-2 pt-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-jp-ui text-3xl" lang="ja">
                  {result.type === 'kanji'
                    ? result.record.literal
                    : result.record.forms[0]}
                </h2>
                <span className="text-muted-foreground text-xs uppercase">
                  {submitLabel(result)}
                </span>
              </div>
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
                      <dt className="text-muted-foreground">Frequency rank</dt>
                      <dd className="mt-0.5">
                        {result.record.freq
                          ? `#${result.record.freq}`
                          : 'Not listed'}
                      </dd>
                    </div>
                    {result.record.nanori.length > 0 && (
                      <div>
                        <dt className="text-muted-foreground">Name readings</dt>
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
    </main>
  )
}
