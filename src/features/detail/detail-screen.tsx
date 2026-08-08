'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  getKanjiByLiterals,
  getSimilarKanji,
  parseContentRef,
} from '@/data/packs'
import { createUserRepositories } from '@/data/repo'
import {
  loadStarterDeck,
  type LoadedDeck,
  type StudyCard,
} from '@/features/study/deck-loader'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'

const LEVEL_NAMES = ['New', 'Seen', 'Learning', 'Known', 'Mastered'] as const
const LEVEL_SHAPES = ['l0', 'l1', 'l2', 'l3', 'l4'] as const

function requestedContentRef(): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get('contentRef')
}

export function DetailScreen(): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [deck, setDeck] = useState<LoadedDeck | null>(null)
  const [contentRef, setContentRef] = useState<string | null>(null)
  const [detailCard, setDetailCard] = useState<{
    readonly content: StudyCard
    readonly state: LoadedDeck['cards'][number]['state']
  } | null>(null)
  const [similarKanji, setSimilarKanji] = useState<readonly string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runtime) return
    let active = true
    setContentRef(requestedContentRef())
    void (async () => {
      await runtime.database.ready
      const loaded = await loadStarterDeck(runtime.database)
      const requestedRef = requestedContentRef()
      if (!requestedRef) {
        if (active) setDeck(loaded)
        return
      }
      const inDeck = loaded.content.get(requestedRef)
      const inDeckCard = loaded.cards.find(
        (candidate) => candidate.contentRef === requestedRef,
      )
      let literal = inDeck?.literal
      if (inDeck) {
        if (active) setDetailCard({ content: inDeck, state: inDeckCard?.state })
      } else {
        const parsed = parseContentRef(requestedRef)
        if (parsed.type !== 'kanji') throw new Error('Unsupported detail type.')
        const record = (await getKanjiByLiterals([parsed.key])).get(parsed.key)
        if (!record)
          throw new Error('This card is not available in the installed pack.')
        literal = record.literal
        const state = await createUserRepositories(
          runtime.database,
        ).cardStates.get(loaded.deckId, requestedRef)
        if (active)
          setDetailCard({
            content: {
              contentRef: requestedRef,
              literal: record.literal,
              strokeCount: record.strokeCount,
              frequency: record.freq,
              jlptLegacy: record.jlptLegacy,
              grade: record.grade,
              nanori: record.nanori,
              meanings: record.meanings,
              onReadings: record.onReadings,
              kunReadings: record.kunReadings,
            },
            state,
          })
      }
      if (active) {
        setDeck(loaded)
        setSimilarKanji(literal ? await getSimilarKanji(literal) : [])
      }
    })().catch((reason: unknown) => {
      if (active)
        setError(
          reason instanceof Error ? reason.message : 'Failed to load detail.',
        )
    })
    return () => {
      active = false
    }
  }, [runtime])

  if (!runtime)
    return <p className="text-muted-foreground p-6">Sign in to view details.</p>
  if (error) return <p className="text-destructive p-6">{error}</p>
  if (!deck || !contentRef || !detailCard)
    return (
      <main className="p-6" aria-busy="true">
        <p className="text-muted-foreground">
          {deck
            ? 'Choose a card from Browse to view its details.'
            : 'Loading detail…'}
        </p>
      </main>
    )

  const { content, state } = detailCard
  const level = state?.level ?? 0
  const reading = [...content.onReadings, ...content.kunReadings]

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-8 sm:px-6">
      <Link className="text-primary w-fit text-sm underline" href="/browse">
        ← Back to Browse
      </Link>
      <Card
        className={`sticky-shape ${LEVEL_SHAPES[level]}`}
        data-level={level}
        data-testid="kanji-detail"
      >
        <CardHeader>
          <p className="font-jp-ui text-muted-foreground text-sm">漢字の詳細</p>
          <CardTitle className="font-jp-display text-7xl" lang="ja">
            {content.literal}
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Level {level} · {LEVEL_NAMES[level]}
            {state?.flagged ? ' · Flagged' : ''}
          </p>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Readings</dt>
              <dd className="font-jp-ui mt-1" lang="ja">
                {reading.join('、') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Meanings</dt>
              <dd className="mt-1">{content.meanings.join('; ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Stroke count</dt>
              <dd className="mt-1">{content.strokeCount || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">School grade</dt>
              <dd className="mt-1">
                {content.grade ? `Grade ${content.grade}` : 'Not listed'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">JLPT</dt>
              <dd className="mt-1">
                {content.jlptLegacy ? `N${content.jlptLegacy}` : 'Not listed'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Frequency rank</dt>
              <dd className="mt-1">
                {content.frequency ? `#${content.frequency}` : 'Not listed'}
              </dd>
            </div>
            {content.nanori.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Name readings</dt>
                <dd className="font-jp-ui mt-1" lang="ja">
                  {content.nanori.join('、')}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
      {similarKanji.length > 0 && (
        <section aria-labelledby="similar-kanji-heading">
          <h2
            id="similar-kanji-heading"
            className="font-jp-ui text-lg font-semibold"
          >
            Similar-looking kanji
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Generated from shared visual features. Select one to view its
            details.
          </p>
          <ul
            className="mt-3 flex flex-wrap gap-2"
            aria-label="Similar-looking kanji"
          >
            {similarKanji.map((literal) => (
              <li key={literal}>
                <Link
                  className="border-border bg-card text-foreground focus-visible:ring-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 py-2 text-2xl shadow-sm focus-visible:ring-2 focus-visible:outline-none"
                  href={`/detail?contentRef=${encodeURIComponent(`kanji:${literal}`)}`}
                  lang="ja"
                  aria-label={`View details for ${literal}`}
                >
                  {literal}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
