'use client';

import { useEffect, useState, type ReactNode } from 'react';
import TileWall from '@/components/tile-wall/tile-wall';
import FpsOverlay from '@/components/tile-wall/fps-overlay';
import AccessibilityTileList from '@/components/tile-wall/accessibility-tile-list';

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
 * See mvp-docs/ARCHITECTURE.md §5 for the full spec.
 */

interface Tile {
  id: number;
  char: string;
  level: number;
}

function generateSyntheticTiles(count: number): Tile[] {
  const tiles: Tile[] = [];
  // Use a mix of kanji-like characters and indices
  const chars = ['漢', '字', '学', '生', '日', '本', '語', '文', '書', '読',
    '話', '思', '考', '知', '見', '聞', '作', '用', '食', '飲',
    '走', '歩', '来', '去', '入', '出', '上', '下', '左', '右'];

  for (let i = 0; i < count; i++) {
    tiles.push({
      id: i,
      char: chars[i % chars.length] || String.fromCharCode(0x4e00 + (i % 100)),
      level: Math.floor(Math.random() * 5), // 0-4
    });
  }
  return tiles;
}

export default function TilesPrototypePage(): ReactNode {
  const [tiles] = useState<Tile[]>(() => generateSyntheticTiles(2500));
  const [useAccessibilityMode, setUseAccessibilityMode] = useState(false);

  // Detect reduced motion or screen reader
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hasScreenReader = navigator.userAgent.includes('Screen') ||
      (document.body.getAttribute('role') === 'application' &&
       'ScreenReaderAnnounce' in window);

    if (prefersReduced || hasScreenReader) {
      setUseAccessibilityMode(true);
    }
  }, []);

  if (useAccessibilityMode) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Tile Wall — List View</h1>
          <p className="text-muted-foreground mb-6">
            Accessibility mode: reduced motion or screen reader detected.
            Showing list view instead of canvas.
          </p>
          <AccessibilityTileList tiles={tiles} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">Tile Wall Performance Prototype</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tiles.length} tiles • Pinch to zoom • Drag to pan • Watch FPS counter
          </p>
        </div>
      </header>

      <main className="flex-1 relative overflow-hidden flex">
        <TileWall tiles={tiles} />
        <FpsOverlay />
      </main>

      <aside className="bg-card border-t border-border px-4 py-3">
        <div className="max-w-7xl mx-auto text-xs text-muted-foreground">
          <p>Prototype controls: mouse wheel to zoom, drag to pan, pinch on mobile</p>
          <button
            onClick={() => setUseAccessibilityMode(true)}
            className="mt-2 px-3 py-1 bg-primary text-primary-foreground rounded text-xs hover:opacity-90"
          >
            Switch to list view
          </button>
        </div>
      </aside>
    </div>
  );
}
