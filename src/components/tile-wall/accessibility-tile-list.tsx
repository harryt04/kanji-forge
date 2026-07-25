'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';

interface Tile {
  id: number;
  char: string;
  level: number;
}

interface AccessibilityTileListProps {
  tiles: Tile[];
}

const LEVEL_NAMES = ['白 (Shiro)', '黄 (Ki)', '緑 (Midori)', '青 (Ao)', '黒 (Kuro)'];
const LEVEL_COLORS = ['bg-level-0', 'bg-level-1', 'bg-level-2', 'bg-level-3', 'bg-level-4'];

/**
 * Accessible fallback list view for the tile wall.
 * Keyboard navigation with grid semantics and screen-reader-friendly announcements.
 */
export default function AccessibilityTileList({ tiles }: AccessibilityTileListProps): ReactNode {
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [gridWidth] = useState(Math.ceil(Math.sqrt(tiles.length)));
  const announceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const current = focusedIdx;
      let next = current;

      switch (e.key) {
        case 'ArrowRight':
          next = Math.min(tiles.length - 1, current + 1);
          e.preventDefault();
          break;
        case 'ArrowLeft':
          next = Math.max(0, current - 1);
          e.preventDefault();
          break;
        case 'ArrowDown':
          next = Math.min(tiles.length - 1, current + gridWidth);
          e.preventDefault();
          break;
        case 'ArrowUp':
          next = Math.max(0, current - gridWidth);
          e.preventDefault();
          break;
        default:
          return;
      }

      setFocusedIdx(next);
      const tile = tiles[next];
      if (announceRef.current && tile) {
        announceRef.current.textContent = `Tile ${next + 1}, character: ${tile.char}, level: ${LEVEL_NAMES[tile.level]}`;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIdx, tiles, gridWidth]);

  const focusedTile = tiles[focusedIdx];

  return (
    <div role="application" className="space-y-4">
      {/* Live region for screen reader announcements */}
      <div ref={announceRef} role="status" aria-live="polite" aria-atomic className="sr-only">
        {focusedTile && `Tile ${focusedIdx + 1}, character: ${focusedTile.char}, level: ${LEVEL_NAMES[focusedTile.level]}`}
      </div>

      {/* Instructions */}
      <div className="bg-card border border-border rounded-lg p-4 text-sm">
        <p className="font-semibold mb-2">Keyboard navigation (grid mode):</p>
        <ul className="space-y-1 text-muted-foreground list-disc list-inside">
          <li>Arrow keys to navigate</li>
          <li>Current focus broadcasts via screen reader</li>
        </ul>
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-auto gap-2" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(64px, 1fr))` }}>
        {tiles.map((tile, idx) => (
          <div
            key={tile.id}
            className={`
              aspect-square flex items-center justify-center rounded font-bold text-lg
              cursor-pointer transition-all border-2
              ${LEVEL_COLORS[tile.level]}
              ${idx === focusedIdx
              ? 'ring-2 ring-offset-2 ring-primary scale-110'
              : 'hover:ring-2 hover:ring-offset-2 hover:ring-primary opacity-80 hover:opacity-100'
            }
            `}
            onClick={() => setFocusedIdx(idx)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                console.log(`Selected tile ${idx}: ${tile.char} (level ${tile.level})`);
              }
            }}
            tabIndex={idx === focusedIdx ? 0 : -1}
            role="button"
            aria-label={`Tile ${idx + 1}: ${tile.char}, level ${tile.level}, ${LEVEL_NAMES[tile.level]}`}
          >
            {tile.char}
          </div>
        ))}
      </div>

      {/* Details for focused tile */}
      {focusedTile && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h2 className="text-lg font-bold mb-2">Selected Tile Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex">
              <dt className="font-semibold min-w-[100px]">Index:</dt>
              <dd>{focusedIdx}</dd>
            </div>
            <div className="flex">
              <dt className="font-semibold min-w-[100px]">Character:</dt>
              <dd className="text-2xl">{focusedTile.char}</dd>
            </div>
            <div className="flex">
              <dt className="font-semibold min-w-[100px]">Level:</dt>
              <dd>{focusedTile.level} - {LEVEL_NAMES[focusedTile.level]}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
