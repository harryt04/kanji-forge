'use client'

import { useEffect, useRef, useState } from 'react'
import { getKanjiStrokes } from '@/data/packs'
import {
  matchStroke,
  STROKE_CANVAS,
  type StrokeLeniency,
} from '@/core/stroke/match'
import { nextStrokeIndexes } from '@/core/stroke/order'
import { flattenSvgPath } from '@/core/stroke/resample'
import { Button } from '@/ui/button'

interface Point {
  readonly x: number
  readonly y: number
}

/**
 * Rejected attempts allowed before the next stroke is taken regardless. A
 * learner stuck on stroke 7 of 14 closes the app, so the trainer never blocks.
 */
const ASSIST_AFTER_FAILURES = 3

/** How long the finished character stays on screen before the canvas resets. */
const AUTO_CLEAR_DELAY_MS = 500

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

export interface WritingPadProps {
  readonly literal: string
  readonly validationEnabled: boolean
  readonly leniency: StrokeLeniency
  /** Fires once every stroke for the character has been captured. */
  readonly onComplete?: () => void
  /** Clear the canvas automatically after completion. Defaults to true. */
  readonly autoClear?: boolean
  /** Tighter chrome for placement inside a study card. */
  readonly compact?: boolean
}

/** A single character's stroke-order canvas, with optional order/shape validation. */
export function WritingPad({
  literal,
  validationEnabled,
  leniency,
  onComplete,
  autoClear = true,
  compact = false,
}: WritingPadProps): React.ReactElement {
  const [paths, setPaths] = useState<readonly string[] | null | undefined>(
    undefined,
  )
  const [capturedStrokes, setCapturedStrokes] = useState<readonly Point[][]>([])
  const [capturedStrokeIndexes, setCapturedStrokeIndexes] = useState<
    readonly number[]
  >([])
  const [draftStroke, setDraftStroke] = useState<readonly Point[]>([])
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  const surfaceRef = useRef<SVGSVGElement>(null)
  const activePointerId = useRef<number | null>(null)
  const draftStrokeRef = useRef<readonly Point[]>([])
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  // Load the character's stroke guide and reset the canvas whenever the
  // active character changes, so the previous character's strokes never
  // bleed into the next one.
  useEffect(() => {
    let active = true
    setPaths(undefined)
    clearStrokes()
    void getKanjiStrokes(literal)
      .then((nextPaths) => {
        if (active) setPaths(nextPaths)
      })
      .catch(() => {
        if (active) setPaths(null)
      })
    return () => {
      active = false
    }
  }, [literal])

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
        literal,
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

  // Finishing the character just leaves it filled in with no way to go again
  // short of clicking a button. Notify the caller and, unless disabled,
  // clear the canvas automatically after a pause long enough to see the
  // result.
  useEffect(() => {
    if (!paths || paths.length === 0 || capturedStrokes.length < paths.length)
      return
    onCompleteRef.current?.()
    if (!autoClear) return
    setFeedback('Nicely drawn — clearing the canvas so you can try again.')
    const timeout = window.setTimeout(() => {
      clearStrokes()
    }, AUTO_CLEAR_DELAY_MS)
    return () => window.clearTimeout(timeout)
  }, [capturedStrokes.length, paths, autoClear])

  function clearStrokes(): void {
    activePointerId.current = null
    draftStrokeRef.current = []
    setDraftStroke([])
    setCapturedStrokes([])
    setCapturedStrokeIndexes([])
    setFailedAttempts(0)
    setFeedback(null)
  }

  function undoStroke(): void {
    setCapturedStrokes((current) => current.slice(0, -1))
    setCapturedStrokeIndexes((current) => current.slice(0, -1))
    setFailedAttempts(0)
    setFeedback(null)
  }

  const expectedStrokeIndexes = nextStrokeIndexes(
    literal,
    capturedStrokeIndexes,
    paths?.length ?? 0,
  )
  const expectedStrokeIndex = expectedStrokeIndexes[0]

  return (
    <div className="grid gap-3">
      <div
        className={
          compact
            ? 'border-border bg-card mx-auto w-full max-w-xs rounded-xl border p-2'
            : 'border-border bg-card mx-auto w-full max-w-[28rem] rounded-xl border p-3 shadow-[var(--shadow-card)]'
        }
      >
        <svg
          ref={surfaceRef}
          className="bg-background aspect-square w-full touch-none select-none"
          viewBox={`0 0 ${STROKE_CANVAS} ${STROKE_CANVAS}`}
          role="application"
          aria-label={`Writing canvas for ${literal}`}
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
              {literal}
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
                    const start = flattenSvgPath(paths[expectedStrokeIndex]!)[0]
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
            size={compact ? 'sm' : 'default'}
            onClick={undoStroke}
            disabled={capturedStrokes.length === 0}
          >
            Undo stroke
          </Button>
          <Button
            type="button"
            variant="outline"
            size={compact ? 'sm' : 'default'}
            onClick={clearStrokes}
            disabled={capturedStrokes.length === 0 && draftStroke.length === 0}
          >
            Clear all
          </Button>
        </div>
      </div>
      <p className="text-muted-foreground text-xs" role="status">
        {feedback ??
          (validationEnabled
            ? 'Draw the highlighted strokes in order. Incorrect strokes are rejected.'
            : 'Stroke checks are off; every captured stroke is kept.')}
      </p>
    </div>
  )
}
