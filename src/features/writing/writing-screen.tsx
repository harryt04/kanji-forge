'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getActiveUserRuntime } from '@/auth/runtime'
import {
  getKanjiByLiterals,
  getKanjiStrokes,
  parseContentRef,
  type KanjiRecord,
} from '@/data/packs'
import { createUserRepositories } from '@/data/repo'
import { Button } from '@/ui/button'
import { matchStroke, STROKE_CANVAS } from '@/core/stroke/match'
import { nextStrokeIndexes } from '@/core/stroke/order'
import { flattenSvgPath } from '@/core/stroke/resample'
import {
  DEFAULT_WRITING_LENIENCY,
  isWritingLeniency,
  parseWritingLeniency,
  WRITING_LENIENCY_OPTIONS,
  WRITING_LENIENCY_SETTING,
  isWritingValidationEnabled,
  WRITING_VALIDATION_SETTING,
} from './settings'

interface Point {
  readonly x: number
  readonly y: number
}

const DEFAULT_CONTENT_REF = 'kanji:日'

/**
 * Rejected attempts allowed before the next stroke is taken regardless. A
 * learner stuck on stroke 7 of 14 closes the app, so the trainer never blocks.
 */
const ASSIST_AFTER_FAILURES = 3

/** How long the finished character stays on screen before the canvas resets. */
const AUTO_CLEAR_DELAY_MS = 1200

function contentRefFromLocation(): string {
  if (typeof window === 'undefined') return DEFAULT_CONTENT_REF
  return (
    new URL(window.location.href).searchParams.get('contentRef') ??
    DEFAULT_CONTENT_REF
  )
}

/** Map a pointer position into the KanjiVG coordinate space the guides use. */
function pointFromEvent(
  event: React.PointerEvent<SVGSVGElement>,
  surface: SVGSVGElement,
): Point {
  const bounds = surface.getBoundingClientRect()
  const width = bounds.width || STROKE_CANVAS
  const height = bounds.height || STROKE_CANVAS
  return {
    x: Math.max(
      0,
      Math.min(
        STROKE_CANVAS,
        ((event.clientX - bounds.left) / width) * STROKE_CANVAS,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        STROKE_CANVAS,
        ((event.clientY - bounds.top) / height) * STROKE_CANVAS,
      ),
    ),
  }
}

function pointsAttribute(points: readonly Point[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

/** Offline writing practice surface with optional next-stroke validation. */
export function WritingScreen(): React.ReactElement {
  const [contentRef] = useState(contentRefFromLocation)
  const [content, setContent] = useState<KanjiRecord | null>(null)
  const [paths, setPaths] = useState<readonly string[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [capturedStrokes, setCapturedStrokes] = useState<readonly Point[][]>([])
  const [capturedStrokeIndexes, setCapturedStrokeIndexes] = useState<
    readonly number[]
  >([])
  const [draftStroke, setDraftStroke] = useState<readonly Point[]>([])
  const [validationEnabled, setValidationEnabled] = useState(true)
  const [leniency, setLeniency] = useState(DEFAULT_WRITING_LENIENCY)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [drillRepetitions, setDrillRepetitions] = useState(3)
  const [drillAttempt, setDrillAttempt] = useState(0)
  const [drillComplete, setDrillComplete] = useState(false)
  const surfaceRef = useRef<SVGSVGElement>(null)
  const activePointerId = useRef<number | null>(null)
  const draftStrokeRef = useRef<readonly Point[]>([])

  useEffect(() => {
    const runtime = getActiveUserRuntime()
    if (!runtime) {
      setLoading(false)
      return
    }
    let active = true
    void (async () => {
      try {
        await runtime.database.ready
        const repositories = createUserRepositories(runtime.database)
        const { type, key } = parseContentRef(contentRef)
        if (type !== 'kanji' || [...key].length !== 1) {
          throw new Error(
            'Writing practice is currently available for one kanji at a time.',
          )
        }
        const [records, strokePaths, savedValidation, savedLeniency] =
          await Promise.all([
            getKanjiByLiterals([key]),
            getKanjiStrokes(key),
            repositories.settings.get(WRITING_VALIDATION_SETTING),
            repositories.settings.get(WRITING_LENIENCY_SETTING),
          ])
        const record = records.get(key)
        if (!record)
          throw new Error(`Kanji ${key} was not found in the installed pack.`)
        if (active) {
          setContent(record)
          setPaths(strokePaths)
          setValidationEnabled(
            isWritingValidationEnabled(savedValidation?.value),
          )
          setLeniency(parseWritingLeniency(savedLeniency?.value))
        }
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
  }, [contentRef])

  function beginStroke(event: React.PointerEvent<SVGSVGElement>): void {
    if (!surfaceRef.current || activePointerId.current !== null) return
    activePointerId.current = event.pointerId
    surfaceRef.current.setPointerCapture?.(event.pointerId)
    const point = pointFromEvent(event, surfaceRef.current)
    draftStrokeRef.current = [point]
    setDraftStroke(draftStrokeRef.current)
  }

  function continueStroke(event: React.PointerEvent<SVGSVGElement>): void {
    if (
      !surfaceRef.current ||
      activePointerId.current !== event.pointerId ||
      draftStrokeRef.current.length === 0
    )
      return
    const point = pointFromEvent(event, surfaceRef.current)
    draftStrokeRef.current = [...draftStrokeRef.current, point]
    setDraftStroke(draftStrokeRef.current)
  }

  function endStroke(event: React.PointerEvent<SVGSVGElement>): void {
    if (activePointerId.current !== event.pointerId) return
    activePointerId.current = null
    const stroke = draftStrokeRef.current
    if (stroke.length > 1) {
      const expectedIndexes = nextStrokeIndexes(
        content?.literal ?? '',
        capturedStrokeIndexes,
        paths?.length ?? 0,
      )
      const matchedIndex = validationEnabled
        ? expectedIndexes.find((index) => {
            const expectedPath = paths?.[index]
            return (
              !expectedPath ||
              matchStroke(stroke, expectedPath, leniency).accepted
            )
          })
        : (expectedIndexes[0] ?? capturedStrokeIndexes.length)
      // Never hard-block: once the learner has missed ASSIST_AFTER_FAILURES
      // times, take the stroke anyway so they can finish the character.
      const assisted =
        matchedIndex === undefined && failedAttempts >= ASSIST_AFTER_FAILURES
      const acceptedIndex = assisted
        ? (expectedIndexes[0] ?? capturedStrokeIndexes.length)
        : matchedIndex
      if (acceptedIndex !== undefined) {
        setCapturedStrokes((current) => [...current, [...stroke]])
        setCapturedStrokeIndexes((current) => [...current, acceptedIndex])
        setFailedAttempts(0)
        setFeedback(
          assisted
            ? 'Close enough — moving on. Trace the highlighted stroke to feel the shape.'
            : null,
        )
      } else {
        const nextFailures = failedAttempts + 1
        setFailedAttempts(nextFailures)
        setFeedback(
          nextFailures >= ASSIST_AFTER_FAILURES
            ? 'Trace the animated stroke — the next attempt will be accepted.'
            : nextFailures >= 2
              ? 'Hint: start at the highlighted dot, then follow the stroke.'
              : 'That stroke was not close enough. Try again from the highlighted start.',
        )
      }
    }
    draftStrokeRef.current = []
    setDraftStroke([])
  }

  // Outside a drill, finishing the character just leaves it filled in with no
  // way to go again short of clicking "Clear all". Reset automatically once
  // every stroke is captured, after a pause long enough to see the result.
  // The drill flow is exempt: it manages its own reset between repetitions
  // and ends on a summary rather than a blank canvas.
  useEffect(() => {
    if (drillAttempt > 0) return
    if (!paths || paths.length === 0 || capturedStrokes.length < paths.length)
      return
    setFeedback('Nicely drawn — clearing the canvas so you can try again.')
    const timeout = window.setTimeout(() => {
      clearStrokes()
    }, AUTO_CLEAR_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [capturedStrokes.length, paths, drillAttempt])

  function clearStrokes(): void {
    activePointerId.current = null
    draftStrokeRef.current = []
    setDraftStroke([])
    setCapturedStrokes([])
    setCapturedStrokeIndexes([])
    setFailedAttempts(0)
    setFeedback(null)
  }

  function startDrill(): void {
    const repetitions = Math.min(10, Math.max(1, drillRepetitions))
    setDrillRepetitions(repetitions)
    setDrillAttempt(1)
    setDrillComplete(false)
    clearStrokes()
  }

  function exitDrill(): void {
    setDrillAttempt(0)
    setDrillComplete(false)
    clearStrokes()
  }

  function finishDrillRepetition(): void {
    if (!paths || capturedStrokes.length < paths.length) return
    if (drillAttempt >= drillRepetitions) {
      setDrillComplete(true)
      return
    }
    clearStrokes()
    setDrillAttempt((current) => current + 1)
  }

  function undoStroke(): void {
    setCapturedStrokes((current) => current.slice(0, -1))
    setCapturedStrokeIndexes((current) => current.slice(0, -1))
    setFailedAttempts(0)
    setFeedback(null)
  }

  function toggleValidation(enabled: boolean): void {
    setValidationEnabled(enabled)
    setFailedAttempts(0)
    setFeedback(null)
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
    setFailedAttempts(0)
    setFeedback(null)
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
  const repetitionComplete =
    Boolean(paths) && capturedStrokes.length >= (paths?.length ?? 0)
  const expectedStrokeIndexes = nextStrokeIndexes(
    content.literal,
    capturedStrokeIndexes,
    paths?.length ?? 0,
  )
  const expectedStrokeIndex = expectedStrokeIndexes[0]

  return (
    <main className="reading-page w-full p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-primary inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline"
          href={`/detail?contentRef=${encodeURIComponent(contentRef)}`}
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
              Repetition {drillAttempt} of {drillRepetitions}
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
        <div className="border-border bg-card mx-auto w-full max-w-[28rem] rounded-xl border p-3 shadow-[var(--shadow-card)]">
          <svg
            ref={surfaceRef}
            className="bg-background aspect-square w-full touch-none select-none"
            viewBox={`0 0 ${STROKE_CANVAS} ${STROKE_CANVAS}`}
            role="application"
            aria-label={`Writing canvas for ${content.literal}`}
            onPointerDown={beginStroke}
            onPointerMove={continueStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          >
            <rect
              x="0.5"
              y="0.5"
              width={STROKE_CANVAS - 1}
              height={STROKE_CANVAS - 1}
              fill="none"
              stroke="currentColor"
              opacity="0.25"
            />
            <line
              x1={STROKE_CANVAS / 2}
              y1="0"
              x2={STROKE_CANVAS / 2}
              y2={STROKE_CANVAS}
              stroke="currentColor"
              strokeDasharray="1.5 1.5"
              opacity="0.2"
            />
            <line
              x1="0"
              y1={STROKE_CANVAS / 2}
              x2={STROKE_CANVAS}
              y2={STROKE_CANVAS / 2}
              stroke="currentColor"
              strokeDasharray="1.5 1.5"
              opacity="0.2"
            />
            {paths?.map((path, index) => (
              <path
                key={`${index}-${path}`}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.1"
                aria-hidden="true"
              />
            )) ?? (
              <text
                x={STROKE_CANVAS / 2}
                y="70"
                textAnchor="middle"
                fontSize="65"
                fill="currentColor"
                opacity="0.1"
                lang="ja"
              >
                {content.literal}
              </text>
            )}
            {validationEnabled &&
              expectedStrokeIndex !== undefined &&
              paths?.[expectedStrokeIndex] &&
              failedAttempts > 0 && (
                <>
                  <path
                    d={paths[expectedStrokeIndex]}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={failedAttempts >= 3 ? '0.28' : '0.16'}
                    className={
                      failedAttempts >= 3 ? 'writing-hint-animate' : undefined
                    }
                    data-testid="writing-hint-stroke"
                    aria-hidden="true"
                  />
                  {failedAttempts >= 2 &&
                    (() => {
                      const start = flattenSvgPath(
                        paths[expectedStrokeIndex]!,
                      )[0]
                      return start ? (
                        <circle
                          cx={start.x}
                          cy={start.y}
                          r="3"
                          fill="var(--accent)"
                          data-testid="writing-hint-start"
                          aria-hidden="true"
                        />
                      ) : null
                    })()}
                </>
              )}
            {capturedStrokes.map((stroke, index) => (
              <polyline
                key={`captured-${index}`}
                points={pointsAttribute(stroke)}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label={`Captured stroke ${index + 1}`}
              />
            ))}
            {draftStroke.length > 0 && (
              <polyline
                points={pointsAttribute(draftStroke)}
                fill="none"
                stroke="var(--accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              />
            )}
          </svg>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm" role="status">
            {capturedStrokes.length}{' '}
            {capturedStrokes.length === 1 ? 'stroke' : 'strokes'} captured
            {paths ? ` of ${paths.length}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={undoStroke}
              disabled={capturedStrokes.length === 0}
            >
              Undo stroke
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={clearStrokes}
              disabled={
                capturedStrokes.length === 0 && draftStroke.length === 0
              }
            >
              Clear all
            </Button>
          </div>
        </div>
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
        <p className="text-muted-foreground text-xs" role="status">
          {feedback ??
            (validationEnabled
              ? 'Draw the highlighted strokes in order. Incorrect strokes are rejected.'
              : 'Stroke checks are off; every captured stroke is kept.')}
        </p>
      </section>
    </main>
  )
}
