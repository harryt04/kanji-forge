'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

interface MarketingTile {
  readonly id: number
  readonly level: 0 | 1 | 2 | 3 | 4
}

/** Deterministic mulberry32 PRNG so the seeded distribution is identical on the
 * server render and the client hydration — a `Math.random()` distribution would
 * mismatch and either warn or flash on hydration. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Weighted toward the lower belts, like a deck that's actually being studied —
 * mostly white/yellow, a decent slab of green, less blue, a little black. */
function weightedLevel(random: number): 0 | 1 | 2 | 3 | 4 {
  const weights = [0.34, 0.26, 0.2, 0.13, 0.07]
  let acc = 0
  for (let level = 0; level < weights.length; level++) {
    acc += weights[level] ?? 0
    if (random < acc) return level as 0 | 1 | 2 | 3 | 4
  }
  return 4
}

function buildTiles(count: number, seed: number): MarketingTile[] {
  const random = mulberry32(seed)
  return Array.from({ length: count }, (_, id) => ({
    id,
    level: weightedLevel(random()),
  }))
}

const DESKTOP_COUNT = 20 * 12
const MOBILE_COUNT = 10 * 16

/**
 * Ambient, non-interactive belt-rank wall for the landing hero. Deliberately not
 * the canvas `TileWall` prototype (`src/prototype/tile-wall/`): that component
 * captures wheel/pointer input for pan-zoom, which would hijack page scroll on a
 * marketing page. This is plain CSS grid — cheap, theme-aware via the same
 * `--level-*` tokens, and inert to input.
 */
export function MarketingTileWall({
  className,
  columns = 20,
}: {
  readonly className?: string
  readonly columns?: number
}): React.ReactElement {
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)')
    const sync = (): void => setIsDesktop(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const tiles = useMemo(
    () => buildTiles(isDesktop ? DESKTOP_COUNT : MOBILE_COUNT, 20260808),
    [isDesktop],
  )

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
      aria-hidden="true"
    >
      <div
        className="grid h-full w-full gap-[3px] p-[3px]"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {tiles.map((tile) => (
          <span
            key={tile.id}
            className={cn(
              'sticky-shape marketing-tile aspect-square rounded-[3px]',
              `l${tile.level}`,
            )}
            data-level={tile.level}
            style={{
              background: `var(--level-${tile.level})`,
              boxShadow:
                tile.level === 0
                  ? 'inset 0 0 0 1px var(--level-0-border)'
                  : tile.level === 4
                    ? 'inset 0 0 0 1px var(--level-4-border)'
                    : undefined,
              animationDelay: `${(tile.id % 37) * 140}ms, ${(tile.id % 23) * 260}ms`,
            }}
          />
        ))}
      </div>
      <div
        className="from-background via-background/70 absolute inset-0 bg-gradient-to-t to-transparent"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 42%, transparent 0%, var(--background) 92%)',
        }}
      />
    </div>
  )
}
