'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import type { CardState } from '@/data/repo'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import { loadStarterDeck, type LoadedDeck } from '@/features/study/deck-loader'

const LEVEL_NAMES = ['New', 'Seen', 'Learning', 'Known', 'Mastered'] as const
const LEVEL_SHAPES = ['l0', 'l1', 'l2', 'l3', 'l4'] as const

interface BrowseCard {
  readonly contentRef: string
  readonly state: CardState | undefined
  readonly literal: string
  readonly meanings: readonly string[]
  readonly onReadings: readonly string[]
  readonly kunReadings: readonly string[]
}

function toBrowseCards(deck: LoadedDeck): readonly BrowseCard[] {
  return deck.cards.flatMap((card) => {
    const content = deck.content.get(card.contentRef)
    if (!content) return []
    return [
      {
        contentRef: card.contentRef,
        state: card.state,
        literal: content.literal,
        meanings: content.meanings,
        onReadings: content.onReadings,
        kunReadings: content.kunReadings,
      },
    ]
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

  if (!runtime)
    return <p className="text-muted-foreground p-6">Sign in to browse.</p>
  if (error) return <p className="text-destructive p-6">{error}</p>
  if (!deck)
    return (
      <main className="p-6" aria-busy="true">
        <p className="text-muted-foreground">Loading deck…</p>
      </main>
    )

  const cards = toBrowseCards(deck)

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-jp-ui text-muted-foreground text-sm">一覧</p>
          <h1 className="font-display mt-1 text-3xl font-bold">Browse</h1>
          <p className="text-muted-foreground mt-2">
            {deck.name} · {cards.length} cards
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/study">Study this deck</Link>
        </Button>
      </header>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center">
            This deck has no cards available in the installed content pack.
          </CardContent>
        </Card>
      ) : (
        <ul
          className="grid gap-3"
          data-testid="browse-card-list"
          aria-label={`${deck.name} cards`}
        >
          {cards.map((card) => {
            const level = card.state?.level ?? 0
            const flagged = card.state?.flagged ?? false
            const reading = [...card.onReadings, ...card.kunReadings].join('、')
            return (
              <li key={card.contentRef}>
                <Card
                  className={`sticky-shape ${LEVEL_SHAPES[level]}`}
                  data-level={level}
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
