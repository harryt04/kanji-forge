# `src/prototype/tile-wall/`

The Phase 0 tile-view performance spike from `docs/ARCHITECTURE.md` §5. **Not a shipping
surface** — it validates the canvas/DOM-hybrid rendering approach for the future Browse
tile view before that design commitment gets made for real, and is intentionally kept
separate from `src/features/browse/`.

- `canvas-renderer.ts` — the Canvas 2D renderer (glyph atlas, dirty-rect panning) for 2,500+
  tiles with pan/zoom.
- `tile-wall.tsx` — the component wiring pan/zoom gesture handling to the renderer.
- `accessibility-tile-list.tsx` — the accessible list-view fallback (screen readers,
  `prefers-reduced-motion`), since the canvas modes themselves are not accessible.
- `fps-overlay.tsx` — an on-screen FPS readout for measuring pan/zoom performance against the
  ≥50fps gate in `docs/ARCHITECTURE.md` §5.

Mounted only at the standalone `(app)/prototype/tiles` route (see
[`src/app/README.md`](../../app/README.md)) — not linked from primary navigation. If you're
building the real Browse tile view, start by reading this code and
`docs/ARCHITECTURE.md` §5, not by reimplementing pan/zoom from scratch.
