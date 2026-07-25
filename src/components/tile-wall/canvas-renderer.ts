/**
 * Canvas 2D renderer for the tile wall.
 *
 * Implements the two-mode system from ARCHITECTURE.md §5:
 * - < ~28px/tile: colored rects + fold overlay only
 * - 28–60px/tile: rect + character from pre-rendered glyph atlas
 * - > 60px/tile: delegated to DOM (not in this module)
 */

interface Tile {
  id: number;
  char: string;
  level: number;
}

interface RendererState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tileSize: number;
  gridWidth: number;
  gridHeight: number;
  offsetX: number;
  offsetY: number;
  tiles: Tile[];
  levels: Uint8Array;
  glyphAtlas: HTMLCanvasElement | null;
  atlasCharMap: Map<string, { x: number; y: number }>;
  lastFramePixels: Uint8ClampedArray | null;
  backingBuffer: OffscreenCanvas | null;
  backingCtx: OffscreenCanvasRenderingContext2D | null;
  lastOffsetX: number;
  lastOffsetY: number;
  hitTestCallback?: (tileIndex: number) => void;
  lastIsDark?: boolean;
  levelColors: Record<number, string>;
}

/**
 * Resolve level colors from CSS custom properties (--level-0 through --level-4).
 * Caches result to avoid expensive getComputedStyle calls every frame.
 * Call only when theme actually changes (not every render).
 */
let cachedColors: Record<number, string> | null = null;
function resolveLevelColorsFromCSS(): Record<number, string> {
  if (cachedColors) return cachedColors;

  const root = document.documentElement;
  const style = getComputedStyle(root);
  const colors: Record<number, string> = {};

  for (let i = 0; i <= 4; i++) {
    const value = style.getPropertyValue(`--level-${i}`).trim();
    colors[i] = value || '#d9d2c3'; // fallback to level-0 light if missing
  }

  cachedColors = colors;
  return colors;
}

/**
 * Invalidate the color cache when theme changes (called by renderer when isDark changes).
 */
function invalidateColorCache(): void {
  cachedColors = null;
}

function getColorForLevel(level: number, state: RendererState): string {
  return state.levelColors[level] ?? state.levelColors[0] ?? '#d9d2c3';
}

/**
 * Build the glyph atlas for medium zoom (28-60px).
 * Pre-renders each unique character at 2× the current tile size into an offscreen canvas.
 */
function buildGlyphAtlas(
  tiles: Tile[],
  tileSize: number,
  state: RendererState,
): { canvas: HTMLCanvasElement; charMap: Map<string, { x: number; y: number }> } {
  const atlasSize = 1024; // offscreen canvas dimension
  const atlasTileSize = tileSize * 2; // pre-render at 2× scale
  const tilesPerRow = Math.floor(atlasSize / atlasTileSize);
  const uniqueChars = Array.from(new Set(tiles.map((t) => t.char)));

  const canvas = document.createElement('canvas');
  canvas.width = atlasSize;
  canvas.height = atlasSize;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = getColorForLevel(0, state);
  ctx.fillRect(0, 0, atlasSize, atlasSize);

  const charMap = new Map<string, { x: number; y: number }>();
  const textSize = Math.max(12, Math.min(32, tileSize * 1.2));

  uniqueChars.forEach((char, idx) => {
    if (idx >= tilesPerRow * tilesPerRow) return; // cap to atlas capacity

    const col = idx % tilesPerRow;
    const row = Math.floor(idx / tilesPerRow);
    const x = col * atlasTileSize;
    const y = row * atlasTileSize;

    // Draw character
    ctx.font = `600 ${textSize}px 'Klee One', sans-serif`;
    ctx.fillStyle = getColorForLevel(2, state); // medium level color for readability
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(char, x + atlasTileSize / 2, y + atlasTileSize / 2);

    charMap.set(char, { x, y });
  });

  return { canvas, charMap };
}

/**
 * Draw the fold-overlay shape at the top-right of a tile.
 * Encoded as two stacked triangles (shadow + highlight), sized by level.
 */
function drawFoldOverlay(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileSize: number,
  level: number,
) {
  if (level === 0) return; // no fold for level 0

  const foldSizes = [0, 6, 9, 12, 16]; // border-width per level
  const foldSize = foldSizes[level] || 0;
  if (foldSize === 0) return;

  // Shadow triangle (dark)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.moveTo(x + tileSize, y);
  ctx.lineTo(x + tileSize - foldSize, y);
  ctx.lineTo(x + tileSize, y + foldSize);
  ctx.fill();

  // Highlight triangle (light)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.moveTo(x + tileSize, y);
  ctx.lineTo(x + tileSize - (foldSize - 1), y);
  ctx.lineTo(x + tileSize, y + (foldSize - 1));
  ctx.fill();
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  tiles: Tile[],
  gridWidth: number,
  gridHeight: number,
): RendererState {
  const ctx = canvas.getContext('2d')!;

  // Initialize level array
  const levels = new Uint8Array(tiles.length);
  tiles.forEach((tile, idx) => {
    levels[idx] = tile.level;
  });

  // Create backing buffer for dirty-rect panning
  let backingBuffer: OffscreenCanvas | null = null;
  let backingCtx: OffscreenCanvasRenderingContext2D | null = null;
  try {
    backingBuffer = new OffscreenCanvas(canvas.width, canvas.height);
    backingCtx = backingBuffer.getContext('2d')!;
  } catch {
    // Fallback if OffscreenCanvas not supported
  }

  return {
    canvas,
    ctx,
    tileSize: 32,
    gridWidth,
    gridHeight,
    offsetX: 0,
    offsetY: 0,
    tiles,
    levels,
    glyphAtlas: null,
    atlasCharMap: new Map(),
    lastFramePixels: null,
    backingBuffer,
    backingCtx,
    lastOffsetX: 0,
    lastOffsetY: 0,
    levelColors: resolveLevelColorsFromCSS(),
  };
}

export function render(state: RendererState, isDark: boolean): void {
  const { tileSize } = state;

  // Refresh level colors if theme changed
  if (state.lastIsDark !== isDark) {
    invalidateColorCache();
    state.levelColors = resolveLevelColorsFromCSS();
    state.lastIsDark = isDark;
  }

  // Determine rendering mode
  if (tileSize < 28) {
    // Low zoom: colored rects + fold overlay only
    renderLowZoom(state);
  } else if (tileSize < 60) {
    // Medium zoom: rect + glyph from atlas
    renderMediumZoom(state);
  } else {
    // High zoom: delegate to DOM (this function only renders canvas modes)
    renderHighZoomFallback(state);
  }
}

function renderLowZoom(state: RendererState) {
  const isDark = state.lastIsDark;
  const { canvas, ctx, tileSize, offsetX, offsetY, tiles, levels, gridWidth, gridHeight, backingBuffer, backingCtx } =
    state;

  const panDeltaX = offsetX - state.lastOffsetX;
  const panDeltaY = offsetY - state.lastOffsetY;
  const hasPanned = Math.abs(panDeltaX) > 0 || Math.abs(panDeltaY) > 0;

  // Dirty-rect panning: if we have a backing buffer and pan delta is small, blit and draw exposed strip
  if (hasPanned && backingBuffer && backingCtx && Math.abs(panDeltaX) < canvas.width && Math.abs(panDeltaY) < canvas.height) {
    // Step 1: Draw backing buffer (last complete frame) onto main canvas, offset by pan delta
    ctx.drawImage(backingBuffer, panDeltaX, panDeltaY);

    // Step 2: Draw newly exposed vertical strip (right or left depending on pan direction)
    if (panDeltaX !== 0) {
      const stripX = panDeltaX > 0 ? 0 : canvas.width + panDeltaX;
      const stripWidth = Math.abs(panDeltaX);
      ctx.fillStyle = getColorForLevel(0, state);
      ctx.fillRect(stripX, 0, stripWidth, canvas.height);

      // Redraw tiles in the exposed vertical strip
      const startCol = Math.max(0, Math.floor((stripX - offsetX) / tileSize));
      const endCol = Math.min(gridWidth, Math.ceil((stripX + stripWidth - offsetX) / tileSize) + 1);
      const startRow = Math.max(0, Math.floor(-offsetY / tileSize));
      const endRow = Math.min(gridHeight, Math.ceil((canvas.height - offsetY) / tileSize) + 1);

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const tileIdx = row * gridWidth + col;
          if (tileIdx >= tiles.length || tileIdx >= levels.length) continue;

          const x = col * tileSize + offsetX;
          const y = row * tileSize + offsetY;
          if (x < stripX || x >= stripX + stripWidth) continue;

          const level = levels[tileIdx] ?? 0;
          ctx.fillStyle = getColorForLevel(level, state);
          ctx.fillRect(x, y, tileSize, tileSize);

          if (level === 0) {
            ctx.strokeStyle = isDark ? 'rgba(237, 233, 224, 0.35)' : 'rgba(43, 38, 32, 0.35)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tileSize, tileSize);
          }

          drawFoldOverlay(ctx, x, y, tileSize, level);
        }
      }
    }

    // Draw newly exposed horizontal strip (bottom or top depending on pan direction)
    if (panDeltaY !== 0) {
      const stripY = panDeltaY > 0 ? 0 : canvas.height + panDeltaY;
      const stripHeight = Math.abs(panDeltaY);
      ctx.fillStyle = getColorForLevel(0, state);
      ctx.fillRect(0, stripY, canvas.width, stripHeight);

      // Redraw tiles in the exposed horizontal strip
      const startCol = Math.max(0, Math.floor(-offsetX / tileSize));
      const endCol = Math.min(gridWidth, Math.ceil((canvas.width - offsetX) / tileSize) + 1);
      const startRow = Math.max(0, Math.floor((stripY - offsetY) / tileSize));
      const endRow = Math.min(gridHeight, Math.ceil((stripY + stripHeight - offsetY) / tileSize) + 1);

      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const tileIdx = row * gridWidth + col;
          if (tileIdx >= tiles.length || tileIdx >= levels.length) continue;

          const x = col * tileSize + offsetX;
          const y = row * tileSize + offsetY;
          if (y < stripY || y >= stripY + stripHeight) continue;

          const level = levels[tileIdx] ?? 0;
          ctx.fillStyle = getColorForLevel(level, state);
          ctx.fillRect(x, y, tileSize, tileSize);

          if (level === 0) {
            ctx.strokeStyle = isDark ? 'rgba(237, 233, 224, 0.35)' : 'rgba(43, 38, 32, 0.35)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, tileSize, tileSize);
          }

          drawFoldOverlay(ctx, x, y, tileSize, level);
        }
      }
    }

    // Step 3: Copy now-complete main canvas to backing for next frame
    backingCtx.drawImage(canvas, 0, 0);
  } else {
    // Full repaint (zoom or large pan)
    ctx.fillStyle = getColorForLevel(0, state);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate visible tile range
    const startCol = Math.max(0, Math.floor(-offsetX / tileSize));
    const endCol = Math.min(gridWidth, Math.ceil((canvas.width - offsetX) / tileSize) + 1);
    const startRow = Math.max(0, Math.floor(-offsetY / tileSize));
    const endRow = Math.min(gridHeight, Math.ceil((canvas.height - offsetY) / tileSize) + 1);

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const tileIdx = row * gridWidth + col;
        if (tileIdx >= tiles.length || tileIdx >= levels.length) continue;

        const x = col * tileSize + offsetX;
        const y = row * tileSize + offsetY;
        const level = levels[tileIdx] ?? 0;

        // Draw colored rect
        ctx.fillStyle = getColorForLevel(level, state);
        ctx.fillRect(x, y, tileSize, tileSize);

        // Draw border for level 0
        if (level === 0) {
          ctx.strokeStyle = isDark ? 'rgba(237, 233, 224, 0.35)' : 'rgba(43, 38, 32, 0.35)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, tileSize, tileSize);
        }

        // Draw fold overlay
        drawFoldOverlay(ctx, x, y, tileSize, level);
      }
    }

    // Copy to backing buffer for next frame
    if (backingBuffer && backingCtx) {
      backingCtx.drawImage(canvas, 0, 0);
    }
  }

  // Update last pan offset
  state.lastOffsetX = offsetX;
  state.lastOffsetY = offsetY;
}

function renderMediumZoom(state: RendererState) {
  const { canvas, ctx, tileSize, offsetX, offsetY, tiles, levels, gridWidth, gridHeight } =
    state;

  // Rebuild atlas if tileSize or theme changed
  if (!state.glyphAtlas || state.glyphAtlas.width < tileSize * 2) {
    const { canvas: atlasCanvas, charMap } = buildGlyphAtlas(tiles, tileSize, state);
    state.glyphAtlas = atlasCanvas;
    state.atlasCharMap = charMap;
  }

  // For medium zoom, do full repaint (atlas rebuild is expensive enough)
  ctx.fillStyle = getColorForLevel(0, state);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startCol = Math.max(0, Math.floor(-offsetX / tileSize));
  const endCol = Math.min(gridWidth, Math.ceil((canvas.width - offsetX) / tileSize) + 1);
  const startRow = Math.max(0, Math.floor(-offsetY / tileSize));
  const endRow = Math.min(gridHeight, Math.ceil((canvas.height - offsetY) / tileSize) + 1);

  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const tileIdx = row * gridWidth + col;
      if (tileIdx >= tiles.length || tileIdx >= levels.length) continue;

      const x = col * tileSize + offsetX;
      const y = row * tileSize + offsetY;
      const level = levels[tileIdx] ?? 0;

      // Draw colored rect
      ctx.fillStyle = getColorForLevel(level, state);
      ctx.fillRect(x, y, tileSize, tileSize);

      // Draw character from atlas
      const tile = tiles[tileIdx];
      if (!tile) continue;
      const charPos = state.atlasCharMap.get(tile.char);
      if (charPos && state.glyphAtlas) {
        ctx.drawImage(
          state.glyphAtlas,
          charPos.x,
          charPos.y,
          tileSize * 2,
          tileSize * 2,
          x,
          y,
          tileSize,
          tileSize,
        );
      }

      // Draw fold overlay
      drawFoldOverlay(ctx, x, y, tileSize, level);
    }
  }

  state.lastOffsetX = offsetX;
  state.lastOffsetY = offsetY;
}

function renderHighZoomFallback(_state: RendererState) {
  // High zoom mode is handled by DOM grid in tile-wall.tsx
  // This canvas is hidden when tileSize > 60px
}

export function updateLevels(state: RendererState, levels: Uint8Array): void {
  state.levels = levels;
}

export function panTo(state: RendererState, offsetX: number, offsetY: number): void {
  state.offsetX = offsetX;
  state.offsetY = offsetY;
}

export function setZoom(state: RendererState, tileSize: number, anchorX?: number, anchorY?: number): void {
  const oldZoom = state.tileSize;
  state.tileSize = Math.max(4, Math.min(128, tileSize)); // clamp to reasonable bounds

  // If anchor point is provided, adjust pan offset to keep content under anchor fixed
  if (anchorX !== undefined && anchorY !== undefined && state.tileSize !== oldZoom) {
    const newZoom = state.tileSize;
    const scale = newZoom / oldZoom;
    // Zoom toward anchor: newPan = anchor - (anchor - oldPan) * (newZoom / oldZoom)
    state.offsetX = anchorX - (anchorX - state.offsetX) * scale;
    state.offsetY = anchorY - (anchorY - state.offsetY) * scale;
  }
}

export function getZoom(state: RendererState): number {
  return state.tileSize;
}

/**
 * Hit test: compute which tile was hit from canvas coordinates.
 * Returns the tile index, or -1 if outside the grid.
 */
export function hitTest(state: RendererState, canvasX: number, canvasY: number): number {
  const { tileSize, offsetX, offsetY, gridWidth, gridHeight, tiles } = state;

  // Convert canvas coordinates to world coordinates
  const worldX = canvasX - offsetX;
  const worldY = canvasY - offsetY;

  // Convert to grid indices
  const col = Math.floor(worldX / tileSize);
  const row = Math.floor(worldY / tileSize);

  // Bounds check
  if (col < 0 || col >= gridWidth || row < 0 || row >= gridHeight) {
    return -1;
  }

  const tileIndex = row * gridWidth + col;
  if (tileIndex < 0 || tileIndex >= tiles.length) {
    return -1;
  }

  return tileIndex;
}

/**
 * Register a hit-test callback to be called when a tile is tapped.
 */
export function setHitTestCallback(state: RendererState, callback?: (tileIndex: number) => void): void {
  state.hitTestCallback = callback;
}

/**
 * Get viewport-relative canvas coordinates, accounting for device pixel ratio.
 */
export function getCanvasCoordinates(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  return {
    x: (clientX - rect.left) * dpr,
    y: (clientY - rect.top) * dpr,
  };
}

/**
 * Compute visible tile indices for DOM virtualization at high zoom.
 * Returns array of { tileIdx, col, row, x, y } for rendering.
 */
export function getVisibleTilesForDOM(
  state: RendererState,
  canvasWidth: number,
  canvasHeight: number,
): Array<{ tileIdx: number; col: number; row: number; x: number; y: number }> {
  const { tileSize, offsetX, offsetY, tiles, gridWidth, gridHeight } = state;

  const visible: Array<{ tileIdx: number; col: number; row: number; x: number; y: number }> = [];

  const startCol = Math.max(0, Math.floor(-offsetX / tileSize));
  const endCol = Math.min(gridWidth, Math.ceil((canvasWidth - offsetX) / tileSize) + 1);
  const startRow = Math.max(0, Math.floor(-offsetY / tileSize));
  const endRow = Math.min(gridHeight, Math.ceil((canvasHeight - offsetY) / tileSize) + 1);

  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const tileIdx = row * gridWidth + col;
      if (tileIdx >= tiles.length) continue;

      const x = col * tileSize + offsetX;
      const y = row * tileSize + offsetY;

      visible.push({ tileIdx, col, row, x, y });
    }
  }

  return visible;
}
