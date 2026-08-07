'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { loadStarterDeck, type LoadedDeck } from '@/features/study/deck-loader'
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!runtime) return
    let active = true
    setContentRef(requestedContentRef())
    void (async () => {
      await runtime.database.ready
      const loaded = await loadStarterDeck(runtime.database)
      if (active) setDeck(loaded)
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
  if (!deck || !contentRef)
    return (
      <main className="p-6" aria-busy="true">
        <p className="text-muted-foreground">
          {deck
            ? 'Choose a card from Browse to view its details.'
            : 'Loading detail…'}
        </p>
      </main>
    )

  const content = deck.content.get(contentRef)
  const card = deck.cards.find(
    (candidate) => candidate.contentRef === contentRef,
  )
  if (!content || !card)
    return (
      <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-8 sm:px-6">
        <p role="alert" className="text-destructive">
          This card is not available in the installed deck.
        </p>
        <Link className="text-primary underline" href="/browse">
          Back to Browse
        </Link>
      </main>
    )

  const state = card.state
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
    </main>
  )
}
