'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/ui/button'

export const STROKE_ANIMATION_SETTING = 'detail.stroke-animation'

export function isStrokeAnimationEnabled(value: string | undefined): boolean {
  return value !== 'false'
}

interface StrokeAnimationProps {
  readonly character: string
  readonly paths: readonly string[]
}

/** A small, offline KanjiVG player for detail pages. */
export function StrokeAnimation({
  character,
  paths,
}: StrokeAnimationProps): React.ReactElement {
  const [visibleStrokes, setVisibleStrokes] = useState(0)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    setVisibleStrokes(0)
    setPlaying(false)
  }, [paths])

  useEffect(() => {
    if (!playing) return
    if (visibleStrokes >= paths.length) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      setVisibleStrokes((current) => Math.min(paths.length, current + 1))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [paths.length, playing, visibleStrokes])

  function play(): void {
    if (visibleStrokes >= paths.length) setVisibleStrokes(0)
    setPlaying(true)
  }

  function restart(): void {
    setPlaying(false)
    setVisibleStrokes(0)
  }

  function nextStroke(): void {
    setPlaying(false)
    setVisibleStrokes((current) => Math.min(paths.length, current + 1))
  }

  return (
    <div className="grid gap-4" data-testid="stroke-animation">
      <div className="border-border bg-background mx-auto rounded-md border p-3">
        <svg
          className="text-foreground h-48 w-48 sm:h-56 sm:w-56"
          viewBox="0 0 109 109"
          role="img"
          aria-label={`Stroke order animation for ${character}`}
        >
          {paths.map((path, index) => (
            <path
              key={`${index}-${path}`}
              d={path}
              fill="currentColor"
              opacity={index < visibleStrokes ? 1 : 0}
              style={{
                transition: 'opacity var(--duration-reveal) var(--ease-out)',
              }}
              aria-hidden="true"
            />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={play} disabled={playing}>
          Play
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPlaying(false)}
          disabled={!playing}
        >
          Pause
        </Button>
        <Button type="button" variant="outline" onClick={restart}>
          Restart
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={nextStroke}
          disabled={visibleStrokes >= paths.length}
        >
          Next stroke
        </Button>
        <span className="text-muted-foreground text-sm tabular-nums">
          {visibleStrokes} of {paths.length} strokes
        </span>
      </div>
    </div>
  )
}
