'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  getExampleSentences,
  getExampleWords,
  getKanjiComponents,
  getKanjiByLiterals,
  getSimilarKanji,
  parseContentRef,
} from '@/data/packs'
import { createUserRepositories, type OutboxMutation } from '@/data/repo'
import {
  loadStarterDeck,
  type LoadedDeck,
  type StudyCard,
} from '@/features/study/deck-loader'
import { Button } from '@/ui/button'
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
  const [contentRef, setContentRef] = useState<string | null>(
    requestedContentRef,
  )
  const [detailCard, setDetailCard] = useState<{
    readonly content: StudyCard
    readonly state: LoadedDeck['cards'][number]['state']
  } | null>(null)
  const [similarKanji, setSimilarKanji] = useState<readonly string[]>([])
  const [exampleWords, setExampleWords] = useState<
    Awaited<ReturnType<typeof getExampleWords>>
  >([])
  const [exampleSentences, setExampleSentences] = useState<
    Awaited<ReturnType<typeof getExampleSentences>>
  >([])
  const [components, setComponents] =
    useState<Awaited<ReturnType<typeof getKanjiComponents>>>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  useEffect(() => {
    if (!runtime) return
    function handlePopState(): void {
      setContentRef(requestedContentRef())
    }
    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [runtime])

  useEffect(() => {
    if (!runtime || !contentRef) return
    let active = true
    setDeck(null)
    setDetailCard(null)
    setSimilarKanji([])
    setExampleWords([])
    setExampleSentences([])
    setComponents(null)
    setError(null)
    void (async () => {
      await runtime.database.ready
      const loaded = await loadStarterDeck(runtime.database)
      const savedMembership = await createUserRepositories(
        runtime.database,
      ).deckMembership.list()
      setSaved(
        savedMembership.some(
          (membership) => membership.contentRef === contentRef,
        ),
      )
      const inDeck = loaded.content.get(contentRef)
      const inDeckCard = loaded.cards.find(
        (candidate) => candidate.contentRef === contentRef,
      )
      let literal = inDeck?.literal
      if (inDeck) {
        if (active) setDetailCard({ content: inDeck, state: inDeckCard?.state })
      } else {
        const parsed = parseContentRef(contentRef)
        if (parsed.type !== 'kanji') throw new Error('Unsupported detail type.')
        const record = (await getKanjiByLiterals([parsed.key])).get(parsed.key)
        if (!record)
          throw new Error('This card is not available in the installed pack.')
        literal = record.literal
        const state = await createUserRepositories(
          runtime.database,
        ).cardStates.get(loaded.deckId, contentRef)
        if (active)
          setDetailCard({
            content: {
              contentRef,
              literal: record.literal,
              radicalClassical: record.radicalClassical,
              radicalNelson: record.radicalNelson,
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
      if (!active) return
      setDeck(loaded)
      if (literal) {
        const [similar, examples, sentences, componentTree] = await Promise.all(
          [
            getSimilarKanji(literal),
            getExampleWords(literal),
            getExampleSentences(literal),
            getKanjiComponents(literal),
          ],
        )
        if (active) {
          setSimilarKanji(similar)
          setExampleWords(examples)
          setExampleSentences(sentences)
          setComponents(componentTree)
        }
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
  }, [contentRef, runtime])

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
  const selectedContentRef = contentRef
  const navigableRefs = deck.cards
    .map((card) => card.contentRef)
    .filter((ref) => deck.content.has(ref))
  const currentIndex = navigableRefs.indexOf(selectedContentRef)
  const previousContentRef =
    currentIndex > 0 ? navigableRefs[currentIndex - 1] : null
  const nextContentRef =
    currentIndex >= 0 && currentIndex < navigableRefs.length - 1
      ? navigableRefs[currentIndex + 1]
      : null

  function renderComponentTree(
    nodes: NonNullable<typeof components>['children'],
  ): React.ReactElement | null {
    if (nodes.length === 0) return null
    return (
      <ul className="mt-2 grid gap-2 pl-5" aria-label="Character elements">
        {nodes.map((node, index) => (
          <li key={`${node.element}-${index}`} lang="ja">
            <span className="font-jp-display text-2xl">{node.element}</span>
            {node.children.length > 0 && renderComponentTree(node.children)}
          </li>
        ))}
      </ul>
    )
  }

  function navigateTo(nextContentRef: string): void {
    const nextUrl = `/detail?contentRef=${encodeURIComponent(nextContentRef)}`
    window.history.pushState({}, '', nextUrl)
    setContentRef(nextContentRef)
  }

  function finishTouchSwipe(endX: number | undefined): void {
    if (touchStartX === null || endX === undefined) return
    const deltaX = endX - touchStartX
    setTouchStartX(null)
    if (Math.abs(deltaX) < 60) return
    if (deltaX < 0 && nextContentRef) navigateTo(nextContentRef)
    if (deltaX > 0 && previousContentRef) navigateTo(previousContentRef)
  }

  async function saveToSaved(): Promise<void> {
    if (!runtime || saved || saving) return
    const now = Date.now()
    const mutation: OutboxMutation = {
      id: crypto.randomUUID(),
      mutType: 'deckMembership.upsert',
      payload: JSON.stringify({
        deckId: 'saved',
        contentRef: selectedContentRef,
        updatedAt: now,
      }),
      createdAt: now,
      attempts: 0,
    }
    setSaving(true)
    setError(null)
    try {
      const repo = createUserRepositories(runtime.database)
      const memberships = await repo.deckMembership.list()
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
          contentRef: selectedContentRef,
          sortOrder: memberships.length,
          addedAt: now,
          updatedAt: now,
        },
        mutation,
      })
      setSaved(true)
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not save card.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <main
      className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-8 sm:px-6"
      onTouchStart={(event) =>
        setTouchStartX(event.touches[0]?.clientX ?? null)
      }
      onTouchEnd={(event) => finishTouchSwipe(event.changedTouches[0]?.clientX)}
    >
      <Link className="text-primary w-fit text-sm underline" href="/browse">
        ← Back to Browse
      </Link>
      {currentIndex >= 0 && (
        <nav
          className="flex items-center justify-between gap-3"
          aria-label="Detail navigation"
        >
          <Button
            type="button"
            variant="outline"
            disabled={!previousContentRef}
            onClick={() => {
              if (previousContentRef) navigateTo(previousContentRef)
            }}
          >
            ← Previous
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {currentIndex + 1} of {navigableRefs.length}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={!nextContentRef}
            onClick={() => {
              if (nextContentRef) navigateTo(nextContentRef)
            }}
          >
            Next →
          </Button>
        </nav>
      )}
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
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-fit"
            disabled={saved || saving}
            onClick={() => void saveToSaved()}
          >
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save to Saved'}
          </Button>
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
              <dt className="text-muted-foreground">Classical radical</dt>
              <dd className="mt-1">
                {content.radicalClassical ?? 'Not listed'}
              </dd>
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
      <section aria-labelledby="components-heading">
        <h2
          id="components-heading"
          className="font-jp-ui text-lg font-semibold"
        >
          Radical and components
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Classical radical: {content.radicalClassical ?? 'Not listed'}
        </p>
        {components?.children.length ? (
          renderComponentTree(components.children)
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            No component decomposition is available in the installed stroke
            pack.
          </p>
        )}
      </section>
      <section aria-labelledby="example-words-heading">
        <h2
          id="example-words-heading"
          className="font-jp-ui text-lg font-semibold"
        >
          Example words
        </h2>
        {exampleWords.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {exampleWords.map((word) => (
              <li
                key={word.id}
                className="border-border bg-card rounded-md border p-3"
              >
                <p className="font-jp-ui text-lg" lang="ja">
                  {word.forms.join('、') || word.readings.join('、')}
                </p>
                <p
                  className="font-jp-ui text-muted-foreground text-sm"
                  lang="ja"
                >
                  {word.readings.join('、') || 'Reading unavailable'}
                </p>
                <p className="mt-1 text-sm">
                  {word.meanings.join('; ') || 'Meaning unavailable'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            No example words are available in the installed dictionary pack.
          </p>
        )}
      </section>
      <section aria-labelledby="example-sentences-heading">
        <h2
          id="example-sentences-heading"
          className="font-jp-ui text-lg font-semibold"
        >
          Example sentences
        </h2>
        {exampleSentences.length > 0 ? (
          <ul className="mt-3 grid gap-3">
            {exampleSentences.map((sentence) => (
              <li
                key={sentence.id}
                className="border-border bg-card rounded-md border p-3"
              >
                <p
                  className="font-jp-ui text-lg leading-loose"
                  lang="ja"
                  aria-label={sentence.japanese}
                >
                  {sentence.furigana.map((token, index) => {
                    const text = token.text.includes(content.literal) ? (
                      <>
                        {token.text
                          .split(content.literal)
                          .map((part, partIndex) => (
                            <span key={`${partIndex}-${part}`}>
                              {part}
                              {partIndex <
                                token.text.split(content.literal).length -
                                  1 && (
                                <mark className="bg-primary/20 text-inherit">
                                  {content.literal}
                                </mark>
                              )}
                            </span>
                          ))}
                      </>
                    ) : (
                      token.text
                    )
                    return token.furigana ? (
                      <ruby key={`${sentence.id}-${index}`}>
                        {text}
                        <rt className="text-sm">{token.furigana}</rt>
                      </ruby>
                    ) : (
                      <span key={`${sentence.id}-${index}`}>{text}</span>
                    )
                  })}
                </p>
                <p className="mt-1 text-sm">{sentence.english}</p>
                <p className="text-muted-foreground mt-2 text-xs">
                  Tatoeba · Japanese by {sentence.japaneseAuthor} · English by{' '}
                  {sentence.englishAuthor}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            No example sentences are available in the installed sentence pack.
          </p>
        )}
      </section>
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
