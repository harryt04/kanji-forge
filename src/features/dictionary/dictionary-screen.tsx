'use client'

import { FormEvent, useState } from 'react'
import { searchDictionary, type DictionaryResult } from '@/data/packs'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'

function submitLabel(result: DictionaryResult): string {
  return result.type === 'kanji' ? 'Kanji' : 'Word'
}

export function DictionaryScreen(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly DictionaryResult[]>([])
  const [searchedQuery, setSearchedQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const nextQuery = query.trim()
    if (!nextQuery) {
      setResults([])
      setSearchedQuery('')
      return
    }
    setLoading(true)
    setError(null)
    try {
      setResults(await searchDictionary(nextQuery))
      setSearchedQuery(nextQuery)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Search failed.')
    } finally {
      setLoading(false)
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
                  <p lang="ja">
                    {result.record.onReadings.join('、') || '—'}
                    {result.record.kunReadings.length > 0 &&
                      ` · ${result.record.kunReadings.join('、')}`}
                  </p>
                  <p>
                    {result.record.meanings.join('; ') || 'No English gloss'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {result.record.strokeCount} strokes
                    {result.record.grade
                      ? ` · school grade ${result.record.grade}`
                      : ''}
                  </p>
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
