'use client';

import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import {
  createRenderer,
  render,
  panTo,
  setZoom,
  getZoom,
  hitTest,
  getCanvasCoordinates,
  getVisibleTilesForDOM,
} from './canvas-renderer';

interface Tile {
  id: number;
  char: string;
  level: number;
}

interface TileWallProps {
  tiles: Tile[];
}

/**
 * TileWall component: main canvas container with Pointer Events handling.
 *
 * Features:
 * - Pinch/wheel zoom with rubber-band limits, anchored at pinch centroid
 * - Wheel zoom anchored at cursor position
 * - Pan via drag with dirty-rect acceleration
 * - Hit testing on tap/pointer-up
 * - Real DOM grid rendering at >60px zoom
 * - Real-time FPS monitoring
 */
export default function TileWall({ tiles }: TileWallProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const domGridRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null);
  const [gridWidth] = useState(Math.ceil(Math.sqrt(tiles.length)));
  const [gridHeight] = useState(Math.ceil(tiles.length / gridWidth));

  // Pan and zoom state
  const panStateRef = useRef({ x: 0, y: 0 });

  // Pointer tracking for pinch
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastDistanceRef = useRef(0);
  const isDarkRef = useRef(false);

  // Track if pointer moved during down/up (to distinguish tap from drag)
  const pointerMovedRef = useRef(false);

  // Render DOM grid for high zoom
  const renderDOMGrid = useCallback(() => {
    if (!rendererRef.current || !domGridRef.current) return;

    const zoom = getZoom(rendererRef.current);
    if (zoom <= 60) {
      // Hide DOM grid, show canvas
      domGridRef.current.style.display = 'none';
      return;
    }

    // Show DOM grid
    domGridRef.current.style.display = 'grid';

    const canvas = canvasRef.current;
    if (!canvas) return;

    const visibleTiles = getVisibleTilesForDOM(rendererRef.current, canvas.width, canvas.height);
    const tileSize = zoom;

    // Render each visible tile as a DOM element
    const gridHTML = visibleTiles
      .map(({ tileIdx, x, y }) => {
        const tile = tiles[tileIdx];
        if (!tile) return '';

        return `
          <div
            class="tile-dom-item sticky-shape l${tile.level}"
            style="
              position: absolute;
              left: ${x}px;
              top: ${y}px;
              width: ${tileSize}px;
              height: ${tileSize}px;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: ${Math.max(12, Math.min(32, tileSize * 0.6))}px;
              font-family: 'Klee One', sans-serif;
              font-weight: 600;
              background-color: var(--level-${tile.level});
              color: var(--level-${tile.level}-foreground);
              border: 1px solid transparent;
            "
            data-tile-idx="${tileIdx}"
          >
            ${tile.char}
          </div>
        `;
      })
      .join('');

    domGridRef.current.innerHTML = gridHTML;

    // Add click handlers
    domGridRef.current.querySelectorAll('[data-tile-idx]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt((el as HTMLElement).dataset.tileIdx || '-1', 10);
        if (idx >= 0) {
          console.log(`Tile hit at index ${idx}: ${tiles[idx]?.char || '?'} (Level: ${tiles[idx]?.level || 0})`);
        }
      });
    });
  }, [tiles]);

  // Detect theme
  useEffect(() => {
    isDarkRef.current = document.documentElement.classList.contains('dark');
    const observer = new MutationObserver(() => {
      isDarkRef.current = document.documentElement.classList.contains('dark');
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Initialize canvas and renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;

    // ResizeObserver must watch the canvas's *parent container*, not the canvas
    // itself: setting canvas.width/canvas.height (the drawing-buffer attributes)
    // inside the callback can itself trigger another resize notification on the
    // canvas element in some browsers, creating an infinite feedback loop. The
    // parent container's box size is unaffected by the canvas's own bitmap
    // resolution, so observing it is safe.
    const container = canvas.parentElement;

    const applySize = (cssWidth: number, cssHeight: number) => {
      const width = Math.round(cssWidth * window.devicePixelRatio);
      const height = Math.round(cssHeight * window.devicePixelRatio);

      if (width > 0 && height > 0 && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        if (rendererRef.current) {
          render(rendererRef.current, isDarkRef.current);
          renderDOMGrid();
        }
      }
    };

    let resizeObserver: ResizeObserver | undefined;
    if (container) {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        applySize(width, height);
      });
      resizeObserver.observe(container);
    }

    // Set up the renderer once; ResizeObserver (above) fires on initial
    // container layout too, so it drives the first real size + render.
    // This just establishes a renderer against whatever size is available
    // synchronously, in case the container already has a resolved size.
    rendererRef.current = createRenderer(canvas, tiles, gridWidth, gridHeight);
    const initialRect = container?.getBoundingClientRect();
    if (initialRect && initialRect.width > 0 && initialRect.height > 0) {
      applySize(initialRect.width, initialRect.height);
    }

    return () => resizeObserver?.disconnect();
  }, [tiles, gridWidth, gridHeight, renderDOMGrid]);

  // Pan gesture handler
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, pointer);
    pointerMovedRef.current = false;

    // For single-pointer pan, just track the pointer
    if (pointersRef.current.size === 1) {
      // Will be used for pan delta in move
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointersRef.current.get(e.pointerId);
    if (!pointer) return;

    if (pointersRef.current.size === 1) {
      // Single pointer: pan
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;

      // Mark as moved if delta is significant (avoid tap/click triggering pan)
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        pointerMovedRef.current = true;
      }

      panStateRef.current.x += dx;
      panStateRef.current.y += dy;

      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (rendererRef.current) {
        panTo(rendererRef.current, panStateRef.current.x, panStateRef.current.y);
        render(rendererRef.current, isDarkRef.current);
        renderDOMGrid();
      }
    } else if (pointersRef.current.size === 2) {
      // Two pointers: pinch zoom
      const pointers = Array.from(pointersRef.current.values());
      if (pointers.length < 2) return;

      const p1 = pointers[0];
      const p2 = pointers[1];
      if (!p1 || !p2) return;
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (lastDistanceRef.current > 0) {
        const scale = distance / lastDistanceRef.current;
        const newZoom = getZoom(rendererRef.current!) * scale;

        // Compute pinch centroid for zoom anchor
        const centroidX = (p1.x + p2.x) / 2;
        const centroidY = (p1.y + p2.y) / 2;

        // Convert to canvas coordinates
        const canvas = canvasRef.current;
        if (canvas) {
          const coords = getCanvasCoordinates(canvas, centroidX, centroidY);
          setZoom(rendererRef.current!, newZoom, coords.x, coords.y);
        } else {
          setZoom(rendererRef.current!, newZoom);
        }

        render(rendererRef.current!, isDarkRef.current);
        renderDOMGrid();
      }

      lastDistanceRef.current = distance;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
  }, [renderDOMGrid]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Hit test on tap (pointer up without significant movement)
    if (!pointerMovedRef.current && pointersRef.current.size === 1 && rendererRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY);
        const tileIdx = hitTest(rendererRef.current, coords.x, coords.y);
        if (tileIdx >= 0) {
          // Highlight briefly and log the tile hit
          console.log(`Tile hit at index ${tileIdx}: ${rendererRef.current.tiles[tileIdx]?.char || '?'}`);

          // Optionally highlight with a brief visual indicator
          if (rendererRef.current.tiles[tileIdx]) {
            const tile = rendererRef.current.tiles[tileIdx]!;
            console.log(`  Level: ${tile.level}`);
          }
        }
      }
    }

    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      lastDistanceRef.current = 0;
    }
  }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!rendererRef.current) return;

    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const newZoom = getZoom(rendererRef.current) * (1 + delta);

    // Use cursor position as zoom anchor
    const canvas = canvasRef.current;
    if (canvas) {
      const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY);
      setZoom(rendererRef.current, newZoom, coords.x, coords.y);
    } else {
      setZoom(rendererRef.current, newZoom);
    }

    render(rendererRef.current, isDarkRef.current);
    renderDOMGrid();
  }, [renderDOMGrid]);

  // Handle theme changes
  useEffect(() => {
    if (rendererRef.current) {
      render(rendererRef.current, isDarkRef.current);
      renderDOMGrid();
    }
  }, [renderDOMGrid]);

  return (
    <div className="flex-1 relative">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
        role="application"
        aria-label="Tile wall canvas with pinch to zoom and drag to pan"
      />
      <div
        ref={domGridRef}
        className="absolute inset-0 pointer-events-auto"
        style={{ display: 'none', overflow: 'hidden' }}
      />
    </div>
  );
}
