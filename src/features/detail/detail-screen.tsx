'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  getExampleSentences,
  getExampleWords,
  getKanjiComponents,
  getKanjiByLiterals,
  getKanjiStrokes,
  getSimilarKanji,
  getNameById,
  getWordById,
  parseContentRef,
  type NameRecord,
  type WordRecord,
} from '@/data/packs'
import {
  createUserRepositories,
  type Deck,
  type OutboxMutation,
} from '@/data/repo'
import { getDeviceId } from '@/lib/device-id'
import {
  loadStarterDeck,
  type LoadedDeck,
  type StudyCard,
} from '@/features/study/deck-loader'
import { Button } from '@/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/card'
import {
  isStrokeAnimationEnabled,
  STROKE_ANIMATION_SETTING,
  StrokeAnimation,
} from './stroke-animation'
import {
  playJapaneseAudioForReadings,
  supportsJapaneseSpeech,
  findInstalledJapaneseAudioReading,
} from '@/features/study/audio'
import { listAudioPacks } from '@/features/study/audio-pack'
import { SAVE_BEHAVIOR_SETTING } from './save-behavior'

const LEVEL_NAMES = ['New', 'Seen', 'Learning', 'Known', 'Mastered'] as const
const LEVEL_SHAPES = ['l0', 'l1', 'l2', 'l3', 'l4'] as const
type AudioSource = Awaited<ReturnType<typeof playJapaneseAudioForReadings>>

function requestedContentRef(): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get('contentRef')
}

function parseTags(value: string): readonly string[] {
  const seen = new Set<string>()
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase()
      if (!tag || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

interface WordDetailViewProps {
  readonly word: WordRecord | NameRecord
  readonly canSpeak: boolean
  readonly hasAudioPack: boolean
  readonly saveDecks: readonly Deck[]
  readonly savedDeckIds: ReadonlySet<string>
  readonly saving: boolean
  readonly onSave: (deck: Deck) => void
  readonly backHref: string
  readonly backLabel: string
  readonly embedded: boolean
}

interface AudioControlProps {
  readonly writing: string
  readonly readings: readonly string[]
  readonly canSpeak: boolean
  readonly hasAudioPack: boolean
}

function AudioControl({
  writing,
  readings,
  canSpeak,
  hasAudioPack,
}: AudioControlProps): React.ReactElement | null {
  const [source, setSource] = useState<AudioSource | null>(null)
  const [hasRecording, setHasRecording] = useState(false)
  const readingKey = readings.join('\u0000')

  useEffect(() => {
    let active = true
    if (!hasAudioPack) {
      setHasRecording(false)
      return () => {
        active = false
      }
    }
    setSource(null)
    void findInstalledJapaneseAudioReading(
      writing,
      readingKey ? readingKey.split('\u0000') : [],
    ).then((reading) => {
      if (active) setHasRecording(Boolean(reading))
    })
    return () => {
      active = false
    }
  }, [hasAudioPack, readingKey, writing])

  if (!canSpeak && !hasRecording) return null

  const displayedSource: AudioSource =
    source ?? (hasRecording ? 'pack' : 'synthesized')
  const sourceLabel =
    displayedSource === 'pack'
      ? 'Community recording'
      : displayedSource === 'synthesized'
        ? 'Synthesized voice'
        : 'Audio unavailable'
  const actionLabel =
    displayedSource === 'pack'
      ? `Play community recording for ${writing}`
      : `Play synthesized Japanese audio for ${writing}`

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void playJapaneseAudioForReadings(writing, readings).then(setSource)
        }}
        aria-label={actionLabel}
      >
        Play audio
      </Button>
      <span className="text-muted-foreground text-xs">{sourceLabel}</span>
    </div>
  )
}

function WordDetailView({
  word,
  canSpeak,
  hasAudioPack,
  saveDecks,
  savedDeckIds,
  saving,
  onSave,
  backHref,
  backLabel,
  embedded,
}: WordDetailViewProps): React.ReactElement {
  return (
    <main
      className={`mx-auto grid w-full gap-6 px-4 py-8 sm:px-6 ${embedded ? 'max-w-none' : 'max-w-2xl'}`}
    >
      <Link className="text-primary w-fit text-sm underline" href={backHref}>
        ← {backLabel}
      </Link>
      <Card data-testid="word-detail">
        <CardHeader>
          <p className="font-jp-ui text-muted-foreground text-sm">単語の詳細</p>
          <CardTitle className="font-jp-ui text-4xl" lang="ja">
            {word.forms.join('、') || word.readings.join('、')}
          </CardTitle>
          <p className="font-jp-ui text-muted-foreground" lang="ja">
            {word.readings.join('、') || 'Reading unavailable'}
          </p>
          <AudioControl
            writing={word.forms[0] ?? word.readings[0] ?? ''}
            readings={word.readings}
            canSpeak={canSpeak}
            hasAudioPack={hasAudioPack}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-fit"
            disabled={savedDeckIds.has('saved') || saving}
            onClick={() => {
              const savedDeck = saveDecks.find(
                (candidate) => candidate.id === 'saved',
              )
              if (savedDeck) onSave(savedDeck)
            }}
          >
            {savedDeckIds.has('saved')
              ? 'Saved'
              : saving
                ? 'Saving…'
                : 'Save to Saved'}
          </Button>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Meanings</dt>
              <dd className="mt-1">
                {word.meanings.join('; ') || 'No English gloss'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Parts of speech</dt>
              <dd className="mt-1">
                {word.partsOfSpeech.join(', ') || 'Not listed'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dictionary entry</dt>
              <dd className="mt-1">#{word.id}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      {saveDecks.some((candidate) => candidate.kind === 'custom') && (
        <section aria-labelledby="custom-deck-save-heading">
          <h2
            id="custom-deck-save-heading"
            className="font-jp-ui text-lg font-semibold"
          >
            Add to a custom deck
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {saveDecks
              .filter((candidate) => candidate.kind === 'custom')
              .map((candidate) => {
                const alreadyAdded = savedDeckIds.has(candidate.id)
                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    variant={alreadyAdded ? 'secondary' : 'outline'}
                    disabled={alreadyAdded || saving}
                    onClick={() => onSave(candidate)}
                  >
                    {alreadyAdded
                      ? `Added to ${candidate.name}`
                      : `Add to ${candidate.name}`}
                  </Button>
                )
              })}
          </div>
        </section>
      )}
    </main>
  )
}

export function DetailScreen({
  embedded = false,
  embeddedPath = '/browse',
}: {
  readonly embedded?: boolean
  readonly embeddedPath?: '/browse' | '/dictionary'
} = {}): React.ReactElement {
  const runtime = getActiveUserRuntime()
  const [deck, setDeck] = useState<LoadedDeck | null>(null)
  const [contentRef, setContentRef] = useState<string | null>(
    requestedContentRef,
  )
  const [detailCard, setDetailCard] = useState<{
    readonly content: StudyCard
    readonly state: LoadedDeck['cards'][number]['state']
  } | null>(null)
  const [wordDetail, setWordDetail] = useState<WordRecord | null>(null)
  const [similarKanji, setSimilarKanji] = useState<readonly string[]>([])
  const [exampleWords, setExampleWords] = useState<
    Awaited<ReturnType<typeof getExampleWords>>
  >([])
  const [exampleSentences, setExampleSentences] = useState<
    Awaited<ReturnType<typeof getExampleSentences>>
  >([])
  const [components, setComponents] =
    useState<Awaited<ReturnType<typeof getKanjiComponents>>>(null)
  const [strokes, setStrokes] =
    useState<Awaited<ReturnType<typeof getKanjiStrokes>>>(null)
  const [showStrokeAnimation, setShowStrokeAnimation] = useState(true)
  const [askBeforeSaving, setAskBeforeSaving] = useState(false)
  const [canSpeak, setCanSpeak] = useState(false)
  const [hasAudioPack, setHasAudioPack] = useState(false)
  const [saveDecks, setSaveDecks] = useState<readonly Deck[]>([])
  const [savedDeckIds, setSavedDeckIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [annotationSaving, setAnnotationSaving] = useState(false)
  const [annotationMessage, setAnnotationMessage] = useState<string | null>(
    null,
  )
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
    setWordDetail(null)
    setSimilarKanji([])
    setExampleWords([])
    setExampleSentences([])
    setComponents(null)
    setStrokes(null)
    setNote('')
    setTagsInput('')
    setSaveDecks([])
    setSavedDeckIds(new Set())
    setAnnotationMessage(null)
    setError(null)
    void (async () => {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const loaded = await loadStarterDeck(runtime.database)
      const [decks, savedStrokeSetting, savedSaveBehavior, savedAnnotation] =
        await Promise.all([
          repositories.decks.list(),
          repositories.settings.get(STROKE_ANIMATION_SETTING),
          repositories.settings.get(SAVE_BEHAVIOR_SETTING),
          repositories.annotations.get(loaded.deckId, contentRef),
        ])
      const saveDecksForUser: readonly Deck[] = [
        {
          id: 'saved',
          name: 'Saved',
          kind: 'saved',
          definitionId: null,
          updatedAt: 0,
        },
        ...decks.filter((candidate) => candidate.kind === 'custom'),
      ]
      const memberships = await Promise.all(
        saveDecksForUser.map(async (candidate) => ({
          deckId: candidate.id,
          membership: await repositories.deckMembership.list(candidate.id),
        })),
      )
      setSaveDecks(saveDecksForUser)
      setSavedDeckIds(
        new Set(
          memberships
            .filter(({ membership }) =>
              membership.some(
                (candidate) => candidate.contentRef === contentRef,
              ),
            )
            .map(({ deckId }) => deckId),
        ),
      )
      setShowStrokeAnimation(
        isStrokeAnimationEnabled(savedStrokeSetting?.value),
      )
      setAskBeforeSaving(savedSaveBehavior?.value === 'ask')
      if (active) {
        setNote(savedAnnotation?.note ?? '')
        setTagsInput(savedAnnotation?.tags.join(', ') ?? '')
      }
      const inDeck = loaded.content.get(contentRef)
      const inDeckCard = loaded.cards.find(
        (candidate) => candidate.contentRef === contentRef,
      )
      let literal = inDeck?.literal
      if (inDeck) {
        if (active) setDetailCard({ content: inDeck, state: inDeckCard?.state })
      } else {
        const parsed = parseContentRef(contentRef)
        if (parsed.type === 'kanji') {
          const record = (await getKanjiByLiterals([parsed.key])).get(
            parsed.key,
          )
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
                contentType: 'kanji',
                literal: record.literal,
                readings: [
                  ...record.onReadings,
                  ...record.kunReadings,
                  ...record.nanori,
                ],
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
        } else if (parsed.type === 'word' || parsed.type === 'name') {
          const wordId = Number(parsed.key)
          const word = Number.isInteger(wordId)
            ? parsed.type === 'name'
              ? await getNameById(wordId)
              : await getWordById(wordId)
            : null
          if (!word)
            throw new Error(
              'This entry is not available in the installed dictionary pack.',
            )
          if (active) setWordDetail(word)
        } else {
          throw new Error('Unsupported detail type.')
        }
      }
      if (!active) return
      setDeck(loaded)
      if (literal) {
        const [similar, examples, sentences, componentTree, strokePaths] =
          await Promise.all([
            getSimilarKanji(literal),
            getExampleWords(literal),
            getExampleSentences(literal),
            getKanjiComponents(literal),
            getKanjiStrokes(literal),
          ])
        if (active) {
          setSimilarKanji(similar)
          setExampleWords(examples)
          setExampleSentences(sentences)
          setComponents(componentTree)
          setStrokes(strokePaths)
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

  useEffect(() => {
    setCanSpeak(supportsJapaneseSpeech())
    void listAudioPacks().then((packs) => setHasAudioPack(packs.length > 0))
  }, [])

  if (!runtime)
    return <p className="text-muted-foreground p-6">Sign in to view details.</p>
  if (error) return <p className="text-destructive p-6">{error}</p>
  if (!deck || !contentRef || (!detailCard && !wordDetail))
    return (
      <main className="p-6" aria-busy="true">
        <p className="text-muted-foreground">
          {deck
            ? 'Choose a card from Browse to view its details.'
            : 'Loading detail…'}
        </p>
      </main>
    )

  const selectedContentRef = contentRef
  const detailPath = embedded ? embeddedPath : '/detail'
  if (wordDetail)
    return (
      <WordDetailView
        word={wordDetail}
        canSpeak={canSpeak}
        hasAudioPack={hasAudioPack}
        saveDecks={saveDecks}
        savedDeckIds={savedDeckIds}
        saving={saving}
        backHref={embedded ? embeddedPath : '/analyze'}
        backLabel={
          embeddedPath === '/dictionary'
            ? 'Back to Dictionary'
            : 'Back to text analyzer'
        }
        embedded={embedded}
        onSave={(targetDeck) => void saveToDeck(targetDeck)}
      />
    )

  const { content, state } = detailCard!
  const level = state?.level ?? 0
  const reading = [...content.onReadings, ...content.kunReadings]
  const audioText = reading[0] ?? content.nanori[0] ?? content.literal
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
    const nextUrl = `${detailPath}?contentRef=${encodeURIComponent(nextContentRef)}`
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

  async function saveToDeck(targetDeck: Deck): Promise<void> {
    if (!runtime || savedDeckIds.has(targetDeck.id) || saving) return
    if (
      targetDeck.id === 'saved' &&
      askBeforeSaving &&
      !window.confirm(
        `Save ${detailCard?.content.literal ?? wordDetail?.forms[0] ?? selectedContentRef} to your Saved deck?`,
      )
    )
      return
    const now = Date.now()
    const mutation: OutboxMutation = {
      id: crypto.randomUUID(),
      mutType: 'deckMembership.upsert',
      payload: JSON.stringify({
        deckId: targetDeck.id,
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
      const memberships = await repo.deckMembership.list(targetDeck.id)
      await repo.recordDeckMembership({
        deck:
          targetDeck.id === 'saved'
            ? { ...targetDeck, updatedAt: now }
            : targetDeck,
        membership: {
          deckId: targetDeck.id,
          contentRef: selectedContentRef,
          sortOrder: memberships.length,
          addedAt: now,
          updatedAt: now,
        },
        mutation,
      })
      setSavedDeckIds((current) => new Set(current).add(targetDeck.id))
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not save card.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function saveAnnotation(): Promise<void> {
    if (!runtime || !deck || annotationSaving) return
    const now = Date.now()
    const tags = parseTags(tagsInput)
    const mutation: OutboxMutation = {
      id: crypto.randomUUID(),
      mutType: 'annotation.upsert',
      payload: JSON.stringify({
        deckId: deck.deckId,
        contentRef: selectedContentRef,
        note,
        tags,
        updatedAt: now,
        updatedBy: getDeviceId(),
      }),
      createdAt: now,
      attempts: 0,
    }
    setAnnotationSaving(true)
    setAnnotationMessage(null)
    try {
      await createUserRepositories(runtime.database).annotations.upsert(
        {
          deckId: deck.deckId,
          contentRef: selectedContentRef,
          note,
          tags,
          updatedAt: now,
          updatedBy: getDeviceId(),
        },
        mutation,
      )
      setTagsInput(tags.join(', '))
      setAnnotationMessage('Saved locally and queued for sync.')
    } catch (reason) {
      setAnnotationMessage(
        reason instanceof Error ? reason.message : 'Could not save notes.',
      )
    } finally {
      setAnnotationSaving(false)
    }
  }

  return (
    <main
      className={`mx-auto grid w-full gap-6 px-4 py-8 sm:px-6 ${embedded ? 'max-w-none' : 'max-w-2xl'}`}
      onTouchStart={(event) =>
        setTouchStartX(event.touches[0]?.clientX ?? null)
      }
      onTouchEnd={(event) => finishTouchSwipe(event.changedTouches[0]?.clientX)}
    >
      <Link
        className="text-primary w-fit text-sm underline"
        href={embedded ? embeddedPath : '/browse'}
      >
        ←{' '}
        {embeddedPath === '/dictionary'
          ? 'Back to Dictionary'
          : 'Back to Browse'}
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
          <AudioControl
            writing={content.literal}
            readings={[audioText, ...reading]}
            canSpeak={canSpeak}
            hasAudioPack={hasAudioPack}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-fit"
            disabled={savedDeckIds.has('saved') || saving}
            onClick={() => {
              const savedDeck = saveDecks.find(
                (candidate) => candidate.id === 'saved',
              )
              if (savedDeck) void saveToDeck(savedDeck)
            }}
          >
            {savedDeckIds.has('saved')
              ? 'Saved'
              : saving
                ? 'Saving…'
                : 'Save to Saved'}
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
      {saveDecks.some((candidate) => candidate.kind === 'custom') && (
        <section aria-labelledby="custom-deck-save-heading">
          <h2
            id="custom-deck-save-heading"
            className="font-jp-ui text-lg font-semibold"
          >
            Add to a custom deck
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Keep this card in another deck for focused study. The membership is
            saved locally and queued for sync.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {saveDecks
              .filter((candidate) => candidate.kind === 'custom')
              .map((candidate) => {
                const alreadyAdded = savedDeckIds.has(candidate.id)
                return (
                  <Button
                    key={candidate.id}
                    type="button"
                    variant={alreadyAdded ? 'secondary' : 'outline'}
                    disabled={alreadyAdded || saving}
                    onClick={() => void saveToDeck(candidate)}
                  >
                    {alreadyAdded
                      ? `Added to ${candidate.name}`
                      : `Add to ${candidate.name}`}
                  </Button>
                )
              })}
          </div>
        </section>
      )}
      <section aria-labelledby="notes-tags-heading">
        <h2
          id="notes-tags-heading"
          className="font-jp-ui text-lg font-semibold"
        >
          Notes and tags
        </h2>
        <div className="mt-3 grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="sticky-note" className="text-sm font-medium">
              Personal note
            </label>
            <textarea
              id="sticky-note"
              className="border-input bg-background min-h-24 rounded-md border px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add a memory hint or study note…"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="sticky-tags" className="text-sm font-medium">
              Tags
            </label>
            <input
              id="sticky-tags"
              className="border-input bg-background h-10 rounded-md border px-3 text-sm shadow-sm outline-none focus-visible:ring-2"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="e.g. tricky, radical"
            />
            <p className="text-muted-foreground text-xs">
              Separate tags with commas. Duplicate tags are removed when saved.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void saveAnnotation()}
              disabled={annotationSaving}
            >
              {annotationSaving ? 'Saving…' : 'Save notes and tags'}
            </Button>
            {annotationMessage && (
              <p className="text-muted-foreground text-sm" aria-live="polite">
                {annotationMessage}
              </p>
            )}
          </div>
        </div>
      </section>
      <section aria-labelledby="stroke-animation-heading">
        <h2
          id="stroke-animation-heading"
          className="font-jp-ui text-lg font-semibold"
        >
          Stroke order
        </h2>
        <Link
          className="text-primary mt-2 inline-block text-sm underline-offset-4 hover:underline"
          href={`/writing?contentRef=${encodeURIComponent(contentRef)}`}
        >
          Practice writing {content.literal}
        </Link>
        {showStrokeAnimation && strokes ? (
          <div className="mt-3">
            <StrokeAnimation character={content.literal} paths={strokes} />
          </div>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">
            {showStrokeAnimation
              ? 'No stroke animation is available in the installed pack.'
              : 'Stroke animation is disabled in Settings.'}
          </p>
        )}
      </section>
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
                <Link
                  className="font-jp-ui text-primary text-lg underline underline-offset-4"
                  href={`${detailPath}?contentRef=${encodeURIComponent(`word:${word.id}`)}`}
                  lang="ja"
                  aria-label={`View details for ${word.forms[0] ?? word.readings[0]}`}
                >
                  {word.forms.join('、') || word.readings.join('、')}
                </Link>
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
                  href={`${detailPath}?contentRef=${encodeURIComponent(`kanji:${literal}`)}`}
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
