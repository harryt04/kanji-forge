'use client'

import { useEffect, useState, type ReactNode } from 'react'
import TileWall from '@/prototype/tile-wall/tile-wall'
import AccessibilityTileList from '@/prototype/tile-wall/accessibility-tile-list'

/**
 * Phase 0 tile-view performance prototype.
 *
 * Demonstrates a two-mode renderer:
 * - Canvas 2D for low/medium zoom (< 28px/tile and 28-60px/tile)
 * - DOM virtualized for large zoom (> 60px/tile)
 *
 * With pinch/wheel zoom, dirty-rect panning, glyph atlas pre-rendering,
 * and accessibility fallbacks (keyboard nav, reduced-motion detection).
 *
 * See docs/ARCHITECTURE.md §5 for the full spec.
 */

interface Tile {
  id: number
  char: string
  level: number
}

function generateSyntheticTiles(count: number): Tile[] {
  const tiles: Tile[] = []
  // Use a mix of kanji-like characters and indices
  const chars = [
    '漢',
    '字',
    '学',
    '生',
    '日',
    '本',
    '語',
    '文',
    '書',
    '読',
    '話',
    '思',
    '考',
    '知',
    '見',
    '聞',
    '作',
    '用',
    '食',
    '飲',
    '走',
    '歩',
    '来',
    '去',
    '入',
    '出',
    '上',
    '下',
    '左',
    '右',
  ]

  for (let i = 0; i < count; i++) {
    tiles.push({
      id: i,
      char: chars[i % chars.length] || String.fromCharCode(0x4e00 + (i % 100)),
      level: Math.floor(Math.random() * 5), // 0-4
    })
  }
  return tiles
}

export default function TilesPrototypePage(): ReactNode {
  const [tiles] = useState<Tile[]>(() => generateSyntheticTiles(2500))
  const [useAccessibilityMode, setUseAccessibilityMode] = useState(false)

  // Detect reduced motion (screen-reader branch removed: was dead code, never true)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      if (mq.matches) setUseAccessibilityMode(true)
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  if (useAccessibilityMode) {
    return (
      <div className="bg-background min-h-screen p-4">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-2 text-3xl font-bold">Tile Wall — List View</h1>
          <p className="text-muted-foreground mb-6">
            Accessibility mode: reduced-motion detected. Showing list view
            instead of canvas. (manual switch always available)
          </p>
          <AccessibilityTileList tiles={tiles} />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="bg-card border-border border-b px-4 py-3">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold">
            Tile Wall Performance Prototype
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {tiles.length} tiles • Pinch to zoom • Drag to pan • Watch FPS
            counter
          </p>
        </div>
      </header>

      <main className="relative flex flex-1 overflow-hidden">
        <TileWall tiles={tiles} />
      </main>

      <aside className="bg-card border-border border-t px-4 py-3">
        <div className="text-muted-foreground mx-auto max-w-7xl text-xs">
          <p>
            Prototype controls: mouse wheel to zoom, drag to pan, pinch on
            mobile
          </p>
          <button
            onClick={() => setUseAccessibilityMode(true)}
            className="bg-primary text-primary-foreground mt-2 rounded px-3 py-1 text-xs hover:opacity-90"
          >
            Switch to list view
          </button>
        </div>
      </aside>
    </div>
  )
}
