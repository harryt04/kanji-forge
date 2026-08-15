'use client'

import { useEffect, useRef, useState } from 'react'
import { getKanjiStrokes } from '@/data/packs'
import { STROKE_CANVAS } from '@/core/stroke/match'
import { Button } from '@/ui/button'

interface Point {
  readonly x: number
  readonly y: number
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

/** Compact, ephemeral writing practice for the answer side of a study card. */
export function StudyWritingAnswer({
  literal,
}: {
  literal: string
}): React.ReactElement {
  const [paths, setPaths] = useState<readonly string[] | null | undefined>(
    undefined,
  )
  const [strokes, setStrokes] = useState<readonly Point[][]>([])
  const [draft, setDraft] = useState<readonly Point[]>([])
  const surfaceRef = useRef<SVGSVGElement>(null)
  const activePointerId = useRef<number | null>(null)
  const draftRef = useRef<readonly Point[]>([])

  useEffect(() => {
    let active = true
    setPaths(null)
    setStrokes([])
    setDraft([])
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
    draftRef.current = [pointFromEvent(event, surfaceRef.current)]
    setDraft(draftRef.current)
  }

  function continueStroke(event: React.PointerEvent<SVGSVGElement>): void {
    if (
      !surfaceRef.current ||
      activePointerId.current !== event.pointerId ||
      draftRef.current.length === 0
    )
      return
    draftRef.current = [
      ...draftRef.current,
      pointFromEvent(event, surfaceRef.current),
    ]
    setDraft(draftRef.current)
  }

  function endStroke(event: React.PointerEvent<SVGSVGElement>): void {
    if (activePointerId.current !== event.pointerId) return
    activePointerId.current = null
    if (draftRef.current.length > 1) {
      setStrokes((current) => [...current, [...draftRef.current]])
    }
    draftRef.current = []
    setDraft([])
  }

  function clear(): void {
    activePointerId.current = null
    draftRef.current = []
    setDraft([])
    setStrokes([])
  }

  const complete =
    paths !== undefined &&
    (!paths || !paths.length || strokes.length >= paths.length)

  return (
    <section
      className="border-border bg-background w-full max-w-sm rounded-md border p-3"
      aria-labelledby="study-writing-answer-heading"
      data-writing-complete={complete}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 id="study-writing-answer-heading" className="font-semibold">
          Writing answer
        </h3>
        <span className="text-muted-foreground text-xs">
          {paths === undefined
            ? 'Loading guide…'
            : paths?.length
              ? `${strokes.length}/${paths.length} strokes`
              : 'Draw freely'}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">
        Trace the guide, then grade yourself with the buttons below.
      </p>
      <svg
        ref={surfaceRef}
        className="bg-card mt-3 aspect-square w-full touch-none select-none"
        viewBox={`0 0 ${STROKE_CANVAS} ${STROKE_CANVAS}`}
        role="application"
        aria-label={`Writing answer canvas for ${literal}`}
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
            fill="currentColor"
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
        {strokes.map((stroke, index) => (
          <polyline
            key={`captured-${index}`}
            points={pointsAttribute(stroke)}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label={`Writing answer stroke ${index + 1}`}
          />
        ))}
        {draft.length > 0 && (
          <polyline
            points={pointsAttribute(draft)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          />
        )}
      </svg>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-sm" role="status">
          {paths === undefined
            ? 'Loading writing guide…'
            : complete
              ? 'Writing answer ready.'
              : 'Keep drawing.'}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          Clear writing
        </Button>
      </div>
    </section>
  )
}
