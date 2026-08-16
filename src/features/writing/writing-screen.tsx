'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import { isKanjiLiteral } from '@/core/import/parse'
import {
  getKanjiByLiterals,
  loadDeckDefinitions,
  type KanjiRecord,
} from '@/data/packs'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import { loadWritingQueue, type WritingQueueEntry } from './writing-queue'
import { WritingPad } from './writing-pad'
import {
  DEFAULT_WRITING_LENIENCY,
  isWritingLeniency,
  parseWritingLeniency,
  WRITING_LENIENCY_OPTIONS,
  WRITING_LENIENCY_SETTING,
  isWritingValidationEnabled,
  WRITING_VALIDATION_SETTING,
} from './settings'

const DEFAULT_DECK_ID = 'dev-kanji'

/** How long the finished repetition stays on screen before the drill advances. */
const AUTO_CLEAR_DELAY_MS = 500

interface DeckOption {
  readonly id: string
  readonly name: string
}

function deckIdFromLocation(fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return new URL(window.location.href).searchParams.get('deckId') ?? fallback
}

function requestedContentRefFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get('contentRef')
}

/** Extracts a literal from `kanji:<literal>`, or null for anything else. */
function kanjiLiteralFromContentRef(ref: string): string | null {
  if (!ref.startsWith('kanji:')) return null
  const literal = ref.slice('kanji:'.length)
  return isKanjiLiteral(literal) ? literal : null
}

/** Offline writing practice surface with optional next-stroke validation. */
export function WritingScreen(): React.ReactElement {
  const [deckId, setDeckId] = useState(() =>
    deckIdFromLocation(DEFAULT_DECK_ID),
  )
  const [deckOptions, setDeckOptions] = useState<readonly DeckOption[]>([])
  const [deckName, setDeckName] = useState('')
  const [queue, setQueue] = useState<readonly WritingQueueEntry[]>([])
  const [index, setIndex] = useState(0)
  const [content, setContent] = useState<KanjiRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationEnabled, setValidationEnabled] = useState(true)
  const [leniency, setLeniency] = useState(DEFAULT_WRITING_LENIENCY)
  const [drillRepetitions, setDrillRepetitions] = useState(3)
  const [drillAttempt, setDrillAttempt] = useState(0)
  const [drillComplete, setDrillComplete] = useState(false)
  const [repetitionComplete, setRepetitionComplete] = useState(false)
  // The `?contentRef=` a Detail link arrived with, honoured on the first deck
  // load only. Held as state (not a mutable "used" ref) so the effect below
  // computes the same result on every invocation — React 18 Strict Mode runs
  // mount effects twice in development, and a ref that flips after first use
  // would make the second invocation silently drop the requested character.
  const [initialContentRef, setInitialContentRef] = useState(() =>
    requestedContentRefFromLocation(),
  )

  // Populate the deck picker once: every built-in deck plus the user's own.
  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime) return
    let active = true
    void (async () => {
      await runtime.database.ready
      const repositories = createUserRepositories(runtime.database)
      const [definitions, decks] = await Promise.all([
        loadDeckDefinitions(),
        repositories.decks.list(),
      ])
      if (!active) return
      const builtIn = definitions.map((definition) => ({
        id: definition.id,
        name: definition.name,
      }))
      const custom = decks
        .filter((deck) => deck.kind === 'custom')
        .map((deck) => ({ id: deck.id, name: deck.name }))
      setDeckOptions([...builtIn, ...custom])
    })()
    return () => {
      active = false
    }
  }, [])

  // Load the SRS-ordered kanji queue whenever the selected deck changes. The
  // first load only may honour a `?contentRef=` passed in from Detail, even
  // for a kanji outside the deck, so that link keeps working as before.
  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        await runtime.database.ready
        const loaded = await loadWritingQueue(runtime.database, deckId)
        if (loaded.entries.length === 0) {
          throw new Error('This deck has no kanji to practice writing.')
        }
        const requested = initialContentRef
        let entries = loaded.entries
        let requestedIndex = requested
          ? entries.findIndex((entry) => entry.contentRef === requested)
          : -1
        if (requestedIndex === -1 && requested) {
          const literal = kanjiLiteralFromContentRef(requested)
          if (literal) {
            entries = [
              { contentRef: requested, literal },
              ...entries.filter((entry) => entry.literal !== literal),
            ]
            requestedIndex = 0
          }
        }
        if (!active) return
        setDeckName(loaded.deckName)
        setQueue(entries)
        setIndex(requestedIndex >= 0 ? requestedIndex : 0)
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load writing practice.',
          )
          setLoading(false)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [deckId, initialContentRef])

  // Load the active character's record and stroke guide whenever the queue
  // position changes, and reset the canvas so the previous character's
  // strokes never bleed into the next one.
  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime) return
    const entry = queue[index]
    if (!entry) return
    let active = true
    setLoading(true)
    void (async () => {
      try {
        await runtime.database.ready
        const repositories = createUserRepositories(runtime.database)
        const [records, savedValidation, savedLeniency] = await Promise.all([
          getKanjiByLiterals([entry.literal]),
          repositories.settings.get(WRITING_VALIDATION_SETTING),
          repositories.settings.get(WRITING_LENIENCY_SETTING),
        ])
        const record = records.get(entry.literal)
        if (!record)
          throw new Error(
            `Kanji ${entry.literal} was not found in the installed pack.`,
          )
        if (!active) return
        setContent(record)
        setValidationEnabled(isWritingValidationEnabled(savedValidation?.value))
        setLeniency(parseWritingLeniency(savedLeniency?.value))
        setDrillAttempt(0)
        setDrillComplete(false)
        setRepetitionComplete(false)
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Could not load writing practice.',
          )
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [queue, index])

  // Keep the address bar in sync so refreshing or sharing the link returns to
  // the same deck and character.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const entry = queue[index]
    if (!entry) return
    const url = new URL(window.location.href)
    url.searchParams.set('deckId', deckId)
    url.searchParams.set('contentRef', entry.contentRef)
    window.history.replaceState({}, '', url)
  }, [deckId, queue, index])

  function changeDeck(nextDeckId: string): void {
    // A manual deck switch always starts at the top of the new queue — only
    // the very first load honours a `?contentRef=` carried in from Detail.
    setInitialContentRef(null)
    setDeckId(nextDeckId)
    setIndex(0)
  }

  function goToIndex(nextIndex: number): void {
    if (nextIndex < 0 || nextIndex >= queue.length) return
    setIndex(nextIndex)
  }

  // Finishing the character just leaves it filled in with no way to go again
  // short of clicking a button. During a drill, move on automatically once
  // every stroke is captured: the pad reports completion, and this advances
  // the repetition (or completes the drill) after a pause long enough to see
  // the result. Outside a drill the pad clears itself.
  function handlePadComplete(): void {
    if (drillAttempt === 0 || drillComplete) return
    setRepetitionComplete(true)
    const lastRepetition = drillAttempt >= drillRepetitions
    window.setTimeout(() => {
      if (lastRepetition) {
        setDrillComplete(true)
      } else {
        setDrillAttempt((current) => current + 1)
        setRepetitionComplete(false)
      }
    }, AUTO_CLEAR_DELAY_MS)
  }

  function startDrill(): void {
    const repetitions = Math.min(10, Math.max(1, drillRepetitions))
    setDrillRepetitions(repetitions)
    setDrillAttempt(1)
    setDrillComplete(false)
    setRepetitionComplete(false)
  }

  function exitDrill(): void {
    setDrillAttempt(0)
    setDrillComplete(false)
    setRepetitionComplete(false)
  }

  function finishDrillRepetition(): void {
    if (!repetitionComplete) return
    if (drillAttempt >= drillRepetitions) {
      setDrillComplete(true)
      return
    }
    setDrillAttempt((current) => current + 1)
    setRepetitionComplete(false)
  }

  function toggleValidation(enabled: boolean): void {
    setValidationEnabled(enabled)
    const runtime = getActiveUserRuntime()
    if (!runtime) return
    void runtime.database.ready.then(() =>
      createUserRepositories(runtime.database).settings.set({
        key: WRITING_VALIDATION_SETTING,
        value: String(enabled),
        updatedAt: Date.now(),
      }),
    )
  }

  function changeLeniency(value: string): void {
    if (!isWritingLeniency(value)) return
    setLeniency(value)
    const runtime = getActiveUserRuntime()
    if (!runtime) return
    void runtime.database.ready.then(() =>
      createUserRepositories(runtime.database).settings.set({
        key: WRITING_LENIENCY_SETTING,
        value,
        updatedAt: Date.now(),
      }),
    )
  }

  if (!getActiveUserRuntime()) {
    return (
      <main className="reading-page grid min-h-[70vh] w-full place-items-center p-6">
        <p>Sign in to practice writing.</p>
      </main>
    )
  }
  if (loading)
    return <main className="reading-page w-full p-6" aria-busy="true" />
  if (error || !content) {
    return (
      <main className="reading-page grid min-h-[70vh] w-full place-items-center p-6">
        <p role="alert">{error ?? 'Writing practice is unavailable.'}</p>
      </main>
    )
  }

  const drillActive = drillAttempt > 0 && !drillComplete

  const currentEntry = queue[index]

  return (
    <main className="reading-page w-full p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-primary inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          href={`/detail?contentRef=${encodeURIComponent(currentEntry?.contentRef ?? `kanji:${content.literal}`)}`}
        >
          ← Back to Detail
        </Link>
        <span className="text-muted-foreground text-sm">Offline practice</span>
      </div>
      <header className="mt-6">
        <p className="text-muted-foreground text-sm">Writing practice</p>
        <h1 className="font-jp-display mt-1 text-6xl font-semibold" lang="ja">
          {content.literal}
        </h1>
        <p className="text-muted-foreground mt-2">
          Draw each stroke in order. Your strokes stay on this device until you
          clear them.
        </p>
      </header>

      <section
        className="border-border bg-card mt-6 grid gap-3 rounded-xl border p-4"
        aria-labelledby="writing-deck-heading"
      >
        <div>
          <h2 id="writing-deck-heading" className="font-semibold">
            Deck
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Practice writing every kanji in a deck, ordered the same way Study
            would show them.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm" htmlFor="writing-deck">
            <span className="font-medium">Deck</span>
            <select
              id="writing-deck"
              value={deckId}
              onChange={(event) => changeDeck(event.target.value)}
              className="border-input bg-background focus-visible:ring-ring h-10 min-w-48 rounded-md border px-3 outline-none focus-visible:ring-2"
            >
              {deckOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm" htmlFor="writing-character">
            <span className="font-medium">Character</span>
            <select
              id="writing-character"
              value={index}
              onChange={(event) => goToIndex(Number(event.target.value))}
              className="border-input bg-background focus-visible:ring-ring font-jp-ui h-10 min-w-24 rounded-md border px-3 outline-none focus-visible:ring-2"
              lang="ja"
            >
              {queue.map((entry, entryIndex) => (
                <option key={entry.contentRef} value={entryIndex}>
                  {entry.literal}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            onClick={() => goToIndex(index - 1)}
            disabled={index <= 0}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => goToIndex(index + 1)}
            disabled={index >= queue.length - 1}
          >
            Next
          </Button>
        </div>
        <p className="text-muted-foreground text-sm" role="status">
          {deckName} · Character {index + 1} of {queue.length}
        </p>
      </section>

      <section
        className="border-border bg-card mt-6 grid gap-3 rounded-xl border p-4"
        aria-labelledby="standalone-drill-heading"
      >
        <div>
          <h2 id="standalone-drill-heading" className="font-semibold">
            Standalone drill
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Practice this kanji repeatedly without changing your study progress.
          </p>
        </div>
        {!drillActive && !drillComplete && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-sm" htmlFor="drill-repetitions">
              <span className="font-medium">Repetitions</span>
              <input
                id="drill-repetitions"
                className="border-input bg-background h-10 w-24 rounded-md border px-3"
                type="number"
                min={1}
                max={10}
                value={drillRepetitions}
                onChange={(event) =>
                  setDrillRepetitions(
                    Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                  )
                }
              />
            </label>
            <Button type="button" onClick={startDrill}>
              Start drill
            </Button>
          </div>
        )}
        {drillActive && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" role="status">
              {repetitionComplete
                ? drillAttempt === drillRepetitions
                  ? 'Nicely drawn — drill complete.'
                  : 'Nicely drawn — starting the next repetition.'
                : `Repetition ${drillAttempt} of ${drillRepetitions}`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={exitDrill}>
                Exit drill
              </Button>
              <Button
                type="button"
                onClick={finishDrillRepetition}
                disabled={!repetitionComplete}
              >
                {drillAttempt === drillRepetitions
                  ? 'Finish drill'
                  : 'Next repetition'}
              </Button>
            </div>
          </div>
        )}
        {drillComplete && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" role="status">
              Drill complete — {drillRepetitions} repetitions finished.
            </p>
            <Button type="button" variant="outline" onClick={startDrill}>
              Start again
            </Button>
          </div>
        )}
      </section>

      <section
        className="mt-6 grid gap-4"
        aria-labelledby="writing-canvas-heading"
      >
        <h2 id="writing-canvas-heading" className="sr-only">
          Writing canvas
        </h2>
        <WritingPad
          key={`${content.literal}-${Math.max(drillAttempt, 1)}`}
          literal={content.literal}
          validationEnabled={validationEnabled}
          leniency={leniency}
          autoClear={!drillActive}
          onComplete={handlePadComplete}
        />
        <label className="text-muted-foreground flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={validationEnabled}
            onChange={(event) => toggleValidation(event.target.checked)}
          />
          Check stroke order
        </label>
        <label
          className="text-muted-foreground grid max-w-sm gap-2 text-sm"
          htmlFor="writing-leniency"
        >
          <span>Stroke matching tolerance</span>
          <select
            id="writing-leniency"
            value={leniency}
            onChange={(event) => changeLeniency(event.target.value)}
            disabled={!validationEnabled}
            className="border-input bg-background focus-visible:ring-ring text-foreground h-10 rounded-md border px-3 outline-none focus-visible:ring-2"
          >
            {WRITING_LENIENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.description}
              </option>
            ))}
          </select>
        </label>
      </section>
    </main>
  )
}
