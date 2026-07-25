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
  resizeBackingBuffer,
} from './canvas-renderer';
import FpsOverlay from './fps-overlay';

interface Tile {
  id: number;
  char: string;
  level: number;
}

interface TileWallProps {
  tiles: Tile[];
}

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

  const [highZoomTiles, setHighZoomTiles] = useState<Array<{ tileIdx: number; x: number; y: number; tile: Tile; tileSize: number }>>([]);

  const renderDOMGrid = useCallback(() => {
    if (!rendererRef.current) return;

    const zoom = getZoom(rendererRef.current);
    if (zoom <= 60) {
      setHighZoomTiles([]);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;
    const visibleTiles = getVisibleTilesForDOM(rendererRef.current, cssW, cssH);
    const tileSize = zoom;

    const items = visibleTiles
      .map(({ tileIdx, x, y }) => {
        const tile = tiles[tileIdx];
        if (!tile) return null;
        return { tileIdx, x, y, tile, tileSize };
      })
      .filter((t): t is { tileIdx: number; x: number; y: number; tile: Tile; tileSize: number } => t !== null);
    setHighZoomTiles(items);
  }, [tiles]);

  const renderScheduledRef = useRef(false);
  const scheduleRender = useCallback(() => {
    if (renderScheduledRef.current) return;
    renderScheduledRef.current = true;
    requestAnimationFrame(() => {
      renderScheduledRef.current = false;
      if (rendererRef.current) {
        render(rendererRef.current, isDarkRef.current);
        renderDOMGrid();
      }
    });
  }, [renderDOMGrid]);

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
          resizeBackingBuffer(rendererRef.current);
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

    if (pointersRef.current.size === 1) {
    }
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointersRef.current.get(e.pointerId);
    if (!pointer) return;

    if (pointersRef.current.size === 1) {
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;

      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        pointerMovedRef.current = true;
      }

      panStateRef.current.x += dx;
      panStateRef.current.y += dy;

      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (rendererRef.current) {
        panTo(rendererRef.current, panStateRef.current.x, panStateRef.current.y);
        scheduleRender();
      }
    } else if (pointersRef.current.size === 2) {
      const it = pointersRef.current.values();
      const p1 = it.next().value;
      const p2 = it.next().value;
      if (!p1 || !p2) return;
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (lastDistanceRef.current > 0) {
        const scale = distance / lastDistanceRef.current;
        const newZoom = getZoom(rendererRef.current!) * scale;

        const centroidX = (p1.x + p2.x) / 2;
        const centroidY = (p1.y + p2.y) / 2;

        const canvas = canvasRef.current;
        if (canvas) {
          const coords = getCanvasCoordinates(canvas, centroidX, centroidY);
          setZoom(rendererRef.current!, newZoom, coords.x, coords.y);
        } else {
          setZoom(rendererRef.current!, newZoom);
        }

        scheduleRender();
      }

      lastDistanceRef.current = distance;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
  }, [scheduleRender]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerMovedRef.current && pointersRef.current.size === 1 && rendererRef.current) {
      const canvas = canvasRef.current;
      if (canvas) {
        const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY);
        const tileIdx = hitTest(rendererRef.current, coords.x, coords.y);
        if (tileIdx >= 0) {
          console.log(`Tile hit at index ${tileIdx}: ${rendererRef.current.tiles[tileIdx]?.char || '?'}`);

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

  // Wheel zoom via native listener (React onWheel is passive; must use {passive:false} to allow preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      if (!rendererRef.current) return;

      const zoomSpeed = 0.1;
      const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
      const newZoom = getZoom(rendererRef.current) * (1 + delta);

      const coords = getCanvasCoordinates(canvas, e.clientX, e.clientY);
      setZoom(rendererRef.current, newZoom, coords.x, coords.y);

      scheduleRender();
    };
    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheelNative);
  }, [scheduleRender]);

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
        className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none"
        role="application"
        aria-label="Tile wall canvas with pinch to zoom and drag to pan"
      />
      <div
        ref={domGridRef}
        className="absolute inset-0 pointer-events-auto"
        style={{ display: highZoomTiles.length > 0 ? 'block' : 'none', overflow: 'hidden', position: 'relative' }}
      >
        {highZoomTiles.map(({ tileIdx, x, y, tile, tileSize }) => (
          <div
            key={tileIdx}
            className={`tile-dom-item sticky-shape l${tile.level}`}
            style={{
              position: 'absolute',
              left: `${x}px`,
              top: `${y}px`,
              width: `${tileSize}px`,
              height: `${tileSize}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: `${Math.max(12, Math.min(32, tileSize * 0.6))}px`,
              fontFamily: "'Klee One', sans-serif",
              fontWeight: 600,
              backgroundColor: `var(--level-${tile.level})`,
              color: `var(--level-${tile.level}-foreground)`,
              border: '1px solid transparent',
            }}
            onClick={() => {
              console.log(`Tile hit at index ${tileIdx}: ${tile.char || '?'} (Level: ${tile.level || 0})`);
            }}
          >
            {tile.char}
          </div>
        ))}
      </div>
      <FpsOverlay canvasRef={canvasRef} />
    </div>
  );
}
