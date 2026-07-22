# KanjiForge — Technical Architecture

Implementation guidance for the PRD. Opinionated where a decision would otherwise be relitigated; open where genuine trade-offs exist.

---

## 1. Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15+, App Router** | Requested. Use it as a static-export SPA, not as an SSR app — see §2. |
| Language | **TypeScript, strict** | Non-negotiable for a data model this shaped. |
| Runtime | React 19 | |
| Styling | **Tailwind CSS v4** + CSS custom properties for the level ramp and theme tokens | The ramp must be swappable at runtime for CVD modes, which means CSS variables, not compiled classes. |
| Client state | **Zustand** | Small, no provider tree, easy to persist slices. Avoid Redux; avoid Context for high-frequency study state. |
| Local database | **SQLite-WASM over OPFS** for content; **Dexie (IndexedDB)** for user data | See §4. |
| Service worker | **Serwist** | Actively maintained successor to `next-pwa`; first-class Next.js App Router support. |
| Charts | **uPlot** or hand-rolled SVG | Recharts/Chart.js are too heavy for a 200 KB budget and we only need bars. |
| Animation | **Motion** (framer-motion successor) for card transitions; raw `requestAnimationFrame` for stroke animation and tile pan | |
| Tokenizer | Kuromoji.js or Lindera-WASM, lazy-loaded (v1.1) | See DATA-SOURCES §10. |
| Testing | Vitest (unit), Playwright (e2e incl. offline), Testing Library | The SRS engine must be pure and 100%-covered. |

### 1.1 Explicit non-choices

- **No SSR, no server components doing data work.** All user data is on-device. Server components are used only for the static shell.
- **No ORM.** The queries are few and hand-written SQL over SQLite-WASM is clearer and faster.
- **No component library.** shadcn/ui-style copy-in primitives at most. A flashcard app has ~12 unique components and a design that must not look templated.
- **No analytics SDK.** See PRD §7.3.

---

## 2. Next.js configuration

Deploy as a **fully static export** (`output: 'export'`) so the app can be hosted on GitHub Pages, Cloudflare Pages, Netlify, or a user's own static host with zero backend. This is a hard requirement for "self-hostable FOSS."

Consequences to design around:
- No API routes. Anything that looks like a backend must be optional and external (v1.1 sync server).
- Dynamic routes need `generateStaticParams` or must be client-routed. **Client-route everything below the shell**: `/study`, `/browse`, `/detail/[id]`, `/dictionary` are all client-side routes over a static shell. Use a single catch-all page with a client router if the App Router's static export fights you on deep links.
- Content packs are static assets served from `/packs/`, or from a CDN/GitHub Release URL configurable at build time.

```js
// next.config.js
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  reactStrictMode: true,
  experimental: { optimizePackageImports: ['motion'] },
};
```

---

## 3. Application structure

```
src/
  app/                      # Next routes — thin shells only
    layout.tsx
    page.tsx                # Home / study status
    study/page.tsx
    browse/page.tsx
    dictionary/page.tsx
    history/page.tsx
    settings/page.tsx
  core/                     # PURE, no React, no DOM, fully unit-tested
    srs/
      grade.ts              # level transitions
      schedule.ts           # nextDue, fuzz
      queue.ts              # queue construction + interleaving
      replay.ts             # review log -> state projection
      goal.ts               # daily target math
      types.ts
    stroke/
      resample.ts
      match.ts              # stroke similarity scoring
    text/
      furigana.ts
      romaji.ts
      detect.ts             # input type detection for search
    import/
      parse.ts              # CSV/TSV/line formats
      enrich.ts             # bare list -> full stickies
  data/
    db/                     # Dexie schema + migrations (user data)
    packs/                  # SQLite-WASM content access layer
    repo/                   # Repository interfaces used by UI
  features/                 # Feature-sliced React
    study/ browse/ detail/ writing/ dictionary/ history/ settings/
  ui/                       # Primitives: Sticky, ColorChip, Sheet, Slider…
  pwa/                      # SW registration, install prompt, persistence
scripts/
  build-packs/              # The ETL pipeline (DATA-SOURCES §11)
```

**The `core/` boundary is the most important structural decision.** The scheduler, stroke matcher, and importers are pure functions over plain data. They can be tested exhaustively without a browser, ported to a future native client, and reasoned about by contributors who don't know React.

---

## 4. Storage architecture

Two stores with different characteristics. Do not merge them.

### 4.1 Content — SQLite-WASM over OPFS

Immutable, large, shared, replaceable, queried with indexes and FTS.

```
packs/kanji-v3.sqlite       ~4 MB
packs/words-core-v3.sqlite  ~6 MB
packs/words-full-v3.sqlite   optional, ~25 MB
packs/names-v3.sqlite        optional, ~15 MB
packs/sentences-v3.sqlite   ~12 MB
packs/strokes-*.json        chunked
```

Use the official `@sqlite.org/sqlite-wasm` build with the **OPFS VFS**. This gives:
- Real indexed queries and FTS5 for dictionary search, offline, at ~150 ms for a full-text lookup
- No need to load 25 MB into JS heap
- Files persist in Origin Private File System, which is not subject to the same eviction pressure as some other stores (though still request persistence — §7)

Fallback path: if OPFS or SQLite-WASM is unavailable (older iOS, some embedded browsers), fall back to a **reduced JSON index** covering only `words-core` and the installed decks, loaded into memory. Study must still work; dictionary search degrades to prefix-only. Detect and tell the user once, plainly.

Schema sketch (`words-core`):

```sql
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  common_score INTEGER,        -- derived from *_pri tags
  data BLOB                    -- packed JSON for the full entry
);
CREATE TABLE forms (
  entry_id INTEGER, form TEXT, kind TEXT,  -- 'kanji' | 'kana'
  is_common INTEGER
);
CREATE INDEX idx_forms_form ON forms(form);
CREATE VIRTUAL TABLE glosses_fts USING fts5(entry_id UNINDEXED, gloss);
```

Keep the full entry as packed JSON in a BLOB rather than normalizing every sense and gloss into tables. We read whole entries; we never query across sense fields relationally. This halves the database size and simplifies the pipeline.

### 4.2 User data — Dexie / IndexedDB

Small, mutable, precious, syncable.

```ts
db.version(1).stores({
  decks:       'id, name, updatedAt',
  stickies:    'id, deckId, [deckId+order], contentRef',
  cardStates:  '[deckId+stickyId], deckId, level, dueAt, flagged',
  reviews:     'id, [deckId+at], stickyId, at',      // append-only
  sessions:    'id, deckId, startedAt',
  settings:    'key',
  textHistory: 'id, at',
});
```

Notes:
- `stickies.contentRef` points into a content pack (`kanji:未` or `word:1234567`) rather than duplicating dictionary data. A user-created sticky with no dictionary match stores its own inline content instead.
- `[deckId+stickyId]` compound primary key on `cardStates` makes "same kanji in two decks, independent progress" natural — which is what StickyStudy's "transfer progress" feature implies.
- `reviews` is the only unbounded table. At 200 reviews/day for 5 years that's ~365k rows — trivial for IndexedDB, but paginate the history queries and precompute daily aggregates into a `dailyStats` table on write.

### 4.3 The write path

Every answer performs one transaction:

```ts
await db.transaction('rw', db.reviews, db.cardStates, db.dailyStats, async () => {
  await db.reviews.add(review);
  await db.cardStates.put(nextState);
  await bumpDailyStat(day, review);
});
```

Must complete in <20 ms. Do **not** await this before advancing the UI to the next card — optimistically advance, queue the write, and reconcile. A dropped write is recoverable (re-derive from the log); a 200 ms stall between cards is not forgivable in a rapid-review loop.

---

## 5. Tile view rendering

The signature feature and the hardest performance problem. Requirement: 2,500 tiles, 60fps pan, pinch zoom.

**Two-mode renderer, switched on zoom level:**

| Zoom | Renderer | Content |
|---|---|---|
| < ~28 px/tile | **Canvas 2D** (or WebGL if profiling demands it) | Colored rects only, no text |
| 28–60 px/tile | Canvas 2D | Rect + the single character, drawn from a pre-rendered glyph atlas |
| > 60 px/tile | **DOM**, virtualized | Full tile: character, reading, meaning, flag, level chip — accessible and interactive |

Implementation notes:

- **Glyph atlas.** At medium zoom, drawing 2,500 individual `fillText` calls per frame is too slow. Pre-render each deck's characters once into an offscreen canvas atlas at 2× the current tile size, then `drawImage` sub-rects. Rebuild the atlas on zoom-band change, not per frame.
- **Dirty-rect panning.** During pan, blit the previous frame offset and only draw the newly exposed strip.
- **Level colors as a Uint8Array.** Keep an array of `level` indexed by tile position, updated on state change, so the render loop never touches the database or React state.
- **Zoom gesture.** Use Pointer Events with two-pointer distance tracking. Do not use a library. Rubber-band at the limits. Anchor the zoom at the pinch centroid, not the viewport center — getting this wrong makes the whole feature feel cheap.
- **Hit testing** is arithmetic on the grid, not a spatial index.
- **Accessibility.** The canvas modes are not accessible. Provide a `role="application"` canvas with keyboard grid navigation announcing the focused sticky via a live region, and make list view the announced equivalent alternative. When a screen reader is detected or `prefers-reduced-motion` is set, default to list view.

Prototype this in Phase 0 with synthetic data before committing to the rest of the design.

---

## 6. Fonts and Japanese text rendering

- Subset and chunk per DATA-SOURCES §9. Load the display face for the card character with `font-display: block` (a flash of fallback kanji is worse than a brief blank, because fallback fonts render simplified or Chinese-variant forms).
- Set `lang="ja"` on Japanese text nodes. Without it, browsers may pick a Chinese font for CJK Unified Ideographs and render structurally wrong glyphs (直, 骨, 者 differ meaningfully).
- Use native `<ruby><rb>漢<rt>かん</rt></ruby>` for furigana, not absolutely-positioned spans. It's accessible, it reflows, and screen readers handle it. Control size with `ruby-text` styling and `ruby-position: over`.
- Add `text-rendering: optimizeLegibility` only where measured to help; it can be costly on long lists.
- Vertical text (`writing-mode: vertical-rl`) is out of scope for MVP but don't structurally preclude it.

---

## 7. PWA specifics

### 7.1 Service worker strategy (Serwist)

| Asset class | Strategy |
|---|---|
| App shell (HTML/JS/CSS) | Precache, cache-first, versioned by build hash |
| Fonts | Cache-first, 1 year |
| Content packs | **Explicit install**, not opportunistic caching. Downloaded on user action into Cache Storage / OPFS with a visible progress UI and a resumable-on-retry flow. |
| Sync API (v1.1) | Network-only, with a background queue |

**Update flow:** on `waiting`, show a persistent-but-dismissible toast. Never `skipWaiting()` automatically — reloading mid-study-session and losing the queue would be the single most infuriating possible bug.

### 7.2 Storage persistence — treat as a first-class feature

```ts
if (navigator.storage?.persist) {
  const already = await navigator.storage.persisted();
  if (!already) {
    // Ask only after the user has completed their first session,
    // framed as "Keep my progress on this device", never on cold load.
    const granted = await navigator.storage.persist();
    settings.set('persistGranted', granted);
  }
}
```

If persistence is denied or unavailable:
- Show a **standing warning in Settings** with an explanation and a "Back up now" button.
- After 14 days without a backup, show a one-time non-blocking banner.
- On iOS specifically, note that installing to the Home Screen materially improves storage retention, and offer the install instructions.

This is the highest-severity data-loss risk in the whole product. Budget real UX effort for it.

### 7.3 Manifest

```json
{
  "name": "KanjiForge — Japanese kanji study",
  "short_name": "KanjiForge",
  "start_url": "/?source=pwa",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#0d0d0f",
  "theme_color": "#0d0d0f",
  "icons": [ /* 192, 512, maskable 512 */ ],
  "shortcuts": [
    { "name": "Study",     "url": "/study" },
    { "name": "Dictionary","url": "/dictionary" }
  ],
  "share_target": {
    "action": "/analyze",
    "method": "GET",
    "params": { "text": "text", "title": "title", "url": "url" }
  },
  "file_handlers": [
    { "action": "/import", "accept": { "application/json": [".kanjiforge", ".json"] } }
  ]
}
```

### 7.4 iOS caveats to design around

- No install prompt event — must show manual "Add to Home Screen" instructions, detected by user agent and display-mode.
- Web Push only when installed, iOS 16.4+. Feature-detect; never assume.
- No Background Sync API. Any deferred work must run on next foreground.
- `100vh` is still unreliable; use `100dvh` with a `-webkit-fill-available` fallback and `env(safe-area-inset-*)`.
- Audio and haptics require a user gesture on first invocation per page load.

---

## 8. Stroke-order validation

Given the user's drawn polyline and KanjiVG's expected path for stroke *i*:

```
1. Sample the expected SVG path into N=32 evenly-spaced points
   (getPointAtLength on an offscreen path, done once and cached).
2. Resample the user's raw pointer polyline to the same N points by arc length.
3. Normalize both to the character's bounding box, [0,1]².
4. Score four components:
     startDist  = |u[0]  - e[0]|
     endDist    = |u[N-1]- e[N-1]|
     shapeDist  = mean over i of |u[i] - e[i]|        // point-to-point after resampling
     dirCos     = cosine similarity of the two chord-direction sequences
5. accept = startDist < 0.22
         && endDist   < 0.22
         && shapeDist < 0.14
         && dirCos    > 0.70
   (thresholds scaled by the leniency setting: strict 0.8×, forgiving 1.4×)
```

Additional rules:
- **Order matters.** Only compare against the expected *next* stroke, not any unwritten stroke. That's the whole point.
- **But be forgiving about genuinely ambiguous order.** A small set of characters have accepted alternate stroke orders (e.g. 上, 必, 田-family variations, and the 右/左 first-stroke split). Maintain a curated exceptions table mapping character → sets of interchangeable stroke indices.
- **Handle short strokes.** Dots (点) resample badly and produce noisy direction vectors. If the expected path length is below a threshold, score on start-point distance and length only.
- **Never hard-block.** After 3 failures, animate the correct stroke and let the user trace it, then continue. A user stuck on stroke 7 of 14 will close the app.

Point-to-point distance after arc-length resampling is essentially a cheap approximation of DTW and is sufficient here — real DTW is available if the simple version proves too strict in testing, but measure first.

---

## 9. Import enrichment

The requirement: paste 40 bare kanji or words, get 40 complete stickies.

```
For each input line:
  1. Detect type: single kanji | kanji compound | kana | mixed | English | CSV row
  2. Look up:
       single kanji  -> kanji table, exact
       word          -> forms table, exact match on kanji or kana form
       kana only     -> forms table, kana match; may be many entries
       English       -> glosses_fts, ranked
  3. Classify the result:
       exactly one match          -> 'matched'
       multiple plausible matches -> 'ambiguous'
       zero                       -> 'not found'
  4. Rank ambiguous candidates by common_score and show a picker.
```

The preview table shows every row with its status and lets the user resolve ambiguities before committing. "Not found" rows can still be added as free-form stickies with user-entered fields — never silently drop a user's input.

Do this in a Web Worker; 500 rows against SQLite-WASM should not block the main thread.

---

## 10. Sync design (v1.1, but constrains MVP)

**MVP constraint that must be honored now:** every `Review` carries a UUIDv7 `id` and a `deviceId`, and the review log is append-only. Nothing else is required in MVP.

**v1.1 server** (optional, self-hostable, ~300 lines):

```
POST /sync
  body: { deviceId, since: cursor, reviews: Review[], decks: Deck[], settings: Setting[] }
  resp: { cursor, reviews: Review[], decks: Deck[], settings: Setting[] }
```

- Reviews: server stores the union, deduped by `id`. Returns everything the client hasn't seen. No conflict resolution needed — a set union of immutable facts cannot conflict.
- Client then runs `replay()` over the merged log to recompute all `cardStates`. Deterministic, no merge logic in the scheduler.
- Decks and settings: last-write-wins per field via `updatedAt`, which is acceptable for low-contention metadata.
- Auth: email magic link or OIDC. Storage: Postgres or SQLite. Deployable as a single container.

The same `replay()` function powers offline backup restore, which means it gets tested continuously from Phase 4 onward rather than being written under pressure in v1.1.

---

## 11. Performance practices

- **The study loop never re-renders the app.** Keep session queue state in a Zustand store with selective subscriptions; the card component subscribes to the current sticky only.
- **Prefetch the next card's content** (and pre-decode its audio and stroke data) while the current card is showing.
- **Web Workers** for: import parsing/enrichment, tokenization, similar-kanji lookups on large sets, statistics aggregation over the full log.
- **Code-split hard.** The writing trainer (canvas + stroke matching), the text analyzer (tokenizer), and the charts are all lazy routes. None should be in the initial bundle.
- **Content-visibility: auto** on off-screen list rows.
- **Measure on real hardware.** A mid-range Android from three years ago, not a MacBook. Keep a Lighthouse CI budget in the pipeline that fails the build on regression.

---

## 12. Testing strategy

| Layer | Tool | What |
|---|---|---|
| `core/srs` | Vitest | 100% coverage. All 14 cases in SRS-SPEC §10, plus property tests: replaying any log twice yields the same state; level never leaves 0–4; `dueAt` monotonic per level. |
| `core/stroke` | Vitest | Fixture set of 50 recorded human strokes (correct and deliberately wrong) with expected accept/reject. |
| `core/import` | Vitest | Every supported format + malformed input + BOM + CRLF + full-width commas. |
| Data pipeline | Node test | Assertions from DATA-SOURCES §11. |
| Components | Testing Library | Study screen keyboard/swipe/tap grading paths. |
| E2E | Playwright | Install → study → go offline → study → backup → wipe → restore → verify identical state. Run against Chromium and WebKit. |
| Visual | Playwright screenshots | Tile view at three zoom levels; both themes; both color ramps. |

The offline E2E test is the one that matters most and is the one most likely to be skipped. Write it in Phase 1.

---

## 13. Repository conventions

- Monorepo not required; a single Next.js app plus `scripts/` is enough.
- Conventional commits, changesets for release notes.
- `CONTRIBUTING.md` must explain how to run the pack pipeline locally, since a contributor cannot do anything useful without content packs.
- Ship a `packs-dev` tiny fixture set (200 kanji, 500 words, 100 sentences) committed to the repo so `pnpm dev` works with zero downloads.
- Licenses: application code under the chosen OSS license; `packs/` and `scripts/build-packs/` output under CC BY-SA 4.0; `ATTRIBUTION.md` at the root.
