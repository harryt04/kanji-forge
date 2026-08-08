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
import { matchStroke } from '@/core/stroke/match'
import {
  isWritingValidationEnabled,
  WRITING_VALIDATION_SETTING,
} from './settings'

interface Point {
  readonly x: number
  readonly y: number
}

const DEFAULT_CONTENT_REF = 'kanji:日'

function contentRefFromLocation(): string {
  if (typeof window === 'undefined') return DEFAULT_CONTENT_REF
  return (
    new URL(window.location.href).searchParams.get('contentRef') ??
    DEFAULT_CONTENT_REF
  )
}

function pointFromEvent(
  event: React.PointerEvent<SVGSVGElement>,
  surface: SVGSVGElement,
): Point {
  const bounds = surface.getBoundingClientRect()
  return {
    x: Math.max(
      0,
      Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100),
    ),
    y: Math.max(
      0,
      Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100),
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
  const [draftStroke, setDraftStroke] = useState<readonly Point[]>([])
  const [validationEnabled, setValidationEnabled] = useState(true)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
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
        const [records, strokePaths, savedValidation] = await Promise.all([
          getKanjiByLiterals([key]),
          getKanjiStrokes(key),
          repositories.settings.get(WRITING_VALIDATION_SETTING),
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
      const expectedPath = paths?.[capturedStrokes.length]
      const accepted =
        !validationEnabled ||
        !expectedPath ||
        matchStroke(stroke, expectedPath).accepted
      if (accepted) {
        setCapturedStrokes((current) => [...current, [...stroke]])
        setFailedAttempts(0)
        setFeedback(null)
      } else {
        const nextFailures = failedAttempts + 1
        setFailedAttempts(nextFailures)
        setFeedback(
          nextFailures >= 3
            ? 'Try tracing the highlighted stroke from its start.'
            : 'That stroke was not close enough. Try again from the highlighted start.',
        )
      }
    }
    draftStrokeRef.current = []
    setDraftStroke([])
  }

  function clearStrokes(): void {
    activePointerId.current = null
    draftStrokeRef.current = []
    setDraftStroke([])
    setCapturedStrokes([])
    setFailedAttempts(0)
    setFeedback(null)
  }

  function undoStroke(): void {
    setCapturedStrokes((current) => current.slice(0, -1))
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

  if (!getActiveUserRuntime()) {
    return (
      <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center p-6">
        <p>Sign in to practice writing.</p>
      </main>
    )
  }
  if (loading)
    return <main className="mx-auto max-w-3xl p-6" aria-busy="true" />
  if (error || !content) {
    return (
      <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center p-6">
        <p role="alert">{error ?? 'Writing practice is unavailable.'}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="text-primary text-sm underline-offset-4 hover:underline"
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
            viewBox="0 0 100 100"
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
              width="99"
              height="99"
              fill="none"
              stroke="currentColor"
              opacity="0.25"
            />
            <line
              x1="50"
              y1="0"
              x2="50"
              y2="100"
              stroke="currentColor"
              strokeDasharray="1.5 1.5"
              opacity="0.2"
            />
            <line
              x1="0"
              y1="50"
              x2="100"
              y2="50"
              stroke="currentColor"
              strokeDasharray="1.5 1.5"
              opacity="0.2"
            />
            {paths?.map((path, index) => (
              <path
                key={`${index}-${path}`}
                d={path}
                fill="currentColor"
                opacity="0.1"
                aria-hidden="true"
              />
            )) ?? (
              <text
                x="50"
                y="64"
                textAnchor="middle"
                fontSize="60"
                fill="currentColor"
                opacity="0.1"
                lang="ja"
              >
                {content.literal}
              </text>
            )}
            {validationEnabled &&
              paths?.[capturedStrokes.length] &&
              failedAttempts > 0 && (
                <path
                  d={paths[capturedStrokes.length]}
                  fill="var(--accent)"
                  opacity={failedAttempts >= 3 ? '0.28' : '0.16'}
                  aria-hidden="true"
                />
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
        <label className="text-muted-foreground flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={validationEnabled}
            onChange={(event) => toggleValidation(event.target.checked)}
          />
          Check stroke order
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
