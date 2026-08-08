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
| Local database | **SQLite-WASM over OPFS** for content packs; **local SQLite-WASM or PGlite (OPFS)** for user data | See §4. User DB is the study source of truth; sync is layered on top (§10). |
| Service worker | **Serwist** | Actively maintained successor to `next-pwa`; first-class Next.js App Router support. |
| Accounts | **better-auth**, Postgres-backed via Drizzle | **No anonymous** — account required before study (PRD §1.2, TRD D3). |
| Sync | **ElectricSQL** (read-path shapes from Postgres) + **authenticated write API + client outbox** | Local-first offline writes; Electric keeps devices current when online. Coolify-friendly. Zero ruled out (§10). |
| Server database | **Postgres 16** | better-auth, app tables, Electric source. Self-hosted via Coolify. |
| Charts | **uPlot** or hand-rolled SVG | Recharts/Chart.js are too heavy for a 200 KB budget and we only need bars. |
| Animation | **Motion** (framer-motion successor) for card transitions; raw `requestAnimationFrame` for stroke animation and tile pan | |
| Tokenizer | Kuromoji.js or Lindera-WASM, lazy-loaded (v1.1) | See DATA-SOURCES §10. |
| Testing | Vitest (unit), Playwright (e2e incl. offline), Testing Library | The SRS engine must be pure and 100%-covered. |

### 1.1 Explicit non-choices

- **No SSR, no server components doing data work — with one deliberate exception.** All *study* data is on-device and derived by client-side `replay()`; server components render only the static shell. The exception is accounts and sync: better-auth, the write API, and Electric are a real, mandatory backend. §2's "fully static export" describes the client app only. Backend services are always-required deployables (Coolify — see §10).
- **No ORM for content packs.** Hand-written SQL over SQLite-WASM. Server Postgres uses Drizzle via better-auth / app migrations.
- **No heavy component library.** shadcn/ui-style copy-in primitives (`BRAND-DESIGN-LANGUAGE.md`).
- **No analytics SDK.** See PRD §7.3.
- **No Rocicorp Zero.** Offline writes are rejected by design — disqualifying (see §10).
- **No PowerSync** as the chosen engine (Electric + outbox is the locked stack per TRD D2).

---

## 2. Next.js configuration

Deploy the **client app** as a **fully static export** (`output: 'export'`) so it can be hosted on GitHub Pages, Cloudflare Pages, Netlify, or a user's own static host, with the backend (better-auth + write API + Electric + Postgres, §10) run as separate, mandatory services the client is configured to talk to. An account is required before study begins — no anonymous mode. Self-hosters run the backend themselves (e.g. via Coolify Electric template + app services).

Consequences to design around:
- No API routes in the Next.js app itself. Accounts and sync are handled entirely by the separate server (§10) over its own origin, configured by URL at build/runtime.
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
    db/                     # Local user SQLite/PGlite schema + migrations
    outbox/                 # Pending mutations toward Postgres write API
    packs/                  # SQLite-WASM content access layer
    sync/                   # Electric shape subscriptions + apply
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

### 4.2 User data — local SQLite / PGlite (OPFS)

Small, mutable, precious, **local-first**. The study loop reads and writes this database only. A client **outbox** table records mutations to flush to Postgres when online; **Electric** streams authoritative rows back for multi-device (§10). Pick **one** embedded engine (SQLite-WASM or PGlite) in implementation and document it in the TRD open choices.

```ts
// Logical tables (local + Postgres counterparts)
decks:        { id, user_id, name, updatedAt, ... }
// NO `stickies` table for built-in decks in MVP — a deck's card set is DERIVED at read time
// from (content pack + deck definition). contentRef = `kanji:未` | `word:1234567`.
deckMembership:{ user_id, deckId, contentRef, order, addedAt, updatedAt } // Saved + user-created custom decks
cardStates:   { user_id, deckId, contentRef, level, dueAt, flagged, ... }  // LAZY: created on first touch only
reviews:      { id, user_id, deckId, contentRef, at, ... }  // append-only (SRS-SPEC §2.2)
sessions:     { id, user_id, deckId, startedAt }
settings:     { user_id, key, value, updatedAt }
dailyStats:   { user_id, day, ... }                       // pre-aggregated
outbox:       { id, user_id, mutType, payload, createdAt, attempts }
// textHistory: post-MVP (analyzer)
```

Notes:
- **Stickies are derived, not stored** (TRD §5.1.1). Built-in deck membership comes from the
  pack + deck definition; user-writable `Saved` and custom decks use `deckMembership`.
  Custom deck creation is a post-MVP parity slice; user-authored free-form stickies remain v2.
- **`cardStates` are lazy** — a row exists only after the card is first graded/flagged/overridden.
  An untouched card is **implicitly level 0**. Key on `(deckId, contentRef)`; per-deck progress
  stays independent. Progress denominator = deck-definition size, not row count (SRS-SPEC §7).
- `reviews` is the only unbounded table — paginate history; maintain `dailyStats` on write.
- Every synced table is scoped by `user_id`. **No rows without a real user** (no anonymous).
- **`cardStates` are never synced** — always re-derived via `replay()` after merging remote
  `reviews`, eliminating dual-write divergence (TRD §5.4). Electric streams `reviews` +
  deck/settings/`deckMembership` only.

### 4.3 The write path

Every answer performs one **local** transaction, then enqueues sync work:

```ts
await db.transaction(async (tx) => {
  await tx.reviews.add(review);
  await tx.cardStates.put(nextState);
  await bumpDailyStat(tx, day, review);
  await tx.outbox.add({
    id: mutationId, // UUIDv7
    mutType: 'review.append',
    payload: review,
  });
});
// Do not await outbox flush / network here.
```

Must complete in <20 ms locally. Advance the UI immediately. The outbox worker flushes when online (idempotent server apply by mutation/review id). A dropped network flush is recoverable; a 200 ms stall between cards is not forgivable.

---

## 5. Tile view rendering

The signature feature and the hardest performance problem. Requirement: 2,500 tiles, **≥50fps pan** (the `TRD.md` §4.6 gate — one tile-perf number across all docs; 60fps aspirational on capable hardware), pinch zoom.

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
| Sync / API (Electric + write API) | Local-first: reads/writes hit local SQLite immediately; outbox flushes to write API when online; Electric shapes pull peers' commits (§10) |

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
  "background_color": "#f7f4ec",
  "theme_color": "#f7f4ec",
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

> **Post-MVP (v2).** Custom decks and import UX are deferred (`TRD.md` D7–D8). Keep the design note so the dictionary packs and `core/import` boundary remain valid later.

The eventual requirement: paste 40 bare kanji or words, get 40 complete stickies.

```
For each input line:
  1. Detect type: single kanji | kanji compound | kana | mixed | English | CSV row
  2. Look up in content packs (exact / kana / FTS)
  3. Classify: matched | ambiguous | not found
  4. Rank ambiguous by common_score; picker before commit
```

Run in a Web Worker when built. Never silently drop user input.

---

## 10. Sync design

**Status: MVP-scope, mandatory.** Local-first study + account multi-device continuity. Binding product decisions: `TRD.md` D2–D4. Every `Review` carries a UUIDv7 `id` and a `deviceId`; the review log is append-only — that makes `replay()`, backup/restore, and future scheduler migration tractable.

### 10.1 Rejected options

| Option | Why not |
|---|---|
| **Rocicorp Zero** | Offline writes are **rejected** in `disconnected` / `error` / `needs-auth` ([docs](https://zero.rocicorp.dev/docs/offline)). Disqualifying for airplane study. |
| **PowerSync** | Strong offline story, but not chosen — maintainer Coolify path and intent lock **Electric + custom write path** (TRD D2). |
| **Anonymous-then-upgrade** | Forbidden. No guest data, no merge-from-local-anonymous. |

### 10.2 Chosen stack: Electric (read) + write API (outbox)

**[ElectricSQL](https://electric-sql.com)** syncs data **out of Postgres into clients** (shapes). It does **not** own the write path. KanjiForge therefore:

1. Commits all study mutations to **local SQLite/PGlite** immediately (§4.3).
2. Appends an **outbox** row for each mutation.
3. When online, an **authenticated write API** applies outbox payloads to Postgres (idempotent by review/mutation id).
4. **Electric** streams committed rows to this and other devices; the client applies them into the local DB (set-union for `reviews`; LWW for settings/decks; prefer `replay()` for `cardStates`).

This matches Electric’s documented pattern of “read-path sync + your existing API for writes,” with persistence of optimistic/local state in an embedded DB rather than ephemeral React state ([Electric writes guide](https://electric-sql.com/docs/sync/guides/writes)).

```
┌─────────────┐     local tx + outbox      ┌──────────────┐
│  Study UI   │ ─────────────────────────► │ Local SQLite │
└─────────────┘                            └──────┬───────┘
                                                  │ flush when online
                                                  ▼
                                           ┌──────────────┐
                                           │  Write API   │
                                           │ (better-auth)│
                                           └──────┬───────┘
                                                  ▼
                                           ┌──────────────┐
                     shapes                │   Postgres   │
┌─────────────┐ ◄─────────────────────────┤  + Electric  │
│ Other device│                            └──────────────┘
└─────────────┘
```

### 10.3 Authz and tenancy

- **better-auth** on Postgres (Drizzle adapter). Sign-in required; no anonymous routes that create study data.
- Write API verifies session/JWT and **forces `user_id` from the token** (never trust body `user_id`).
- Electric shapes are filtered so a client only receives **that user’s** rows.
- The API exposes an authenticated `/api/electric/shape` proxy for the five sync projections. It
  validates the better-auth session, allow-lists the table, replaces any client `where` clause with
  a parameterized `user_id = $1` predicate, and keeps the Electric secret server-side. The client
  materializes the proxied Electric shape stream when `NEXT_PUBLIC_ELECTRIC_URL` is configured,
  with the authenticated `/api/sync` snapshot retained as a transport fallback.
- **The exact write-path and shape-authorization contract is `TRD.md §15` (Sync Contract).** The
  authenticated proxy server-enforces `where user_id = <token uid>` and the client only uses the
  allow-listed shape route; the API snapshot remains available when Electric is unavailable.
- Background reminders use the same authenticated API: the browser stores a user-owned Web Push
  subscription, while an operator-scheduled `POST /api/push/reminders` call signs and sends the
  configured local-time reminder with VAPID. The service worker validates the app-relative target
  before opening Study. Set `VAPID_*` and `PUSH_CRON_SECRET` only on the backend.
- Shared device: switching accounts must not show the previous user’s local DB (per-user local DB name/path or wipe-on-switch).

### 10.4 Conflict policy

| Table | Policy |
|---|---|
| `reviews` | Immutable append; union by primary key |
| `cardStates` | Derive via `replay(reviews)` after merge when practical |
| `settings`, deck metadata | LWW on `updatedAt` per field/row |
| `outbox` | Client-only; acked rows deleted after confirmed apply |

### 10.5 Deployment (Coolify)

Typical services:

1. **Postgres 16** (logical replication / slots as required by the Electric version you deploy).
2. **Electric** — Coolify template acceptable; point at Postgres; expose shape endpoint behind TLS.
3. **App API** — better-auth + write routes + any pack URL config (can be Node/Bun service; not the static export).
4. **Static web** — Next `output: 'export'` artifacts.

Illustrative env (names may match your template):

```
# Postgres
POSTGRES_DB=kanjiforge
POSTGRES_USER=kanjiforge
POSTGRES_PASSWORD=<secret>
DATABASE_URL=postgres://kanjiforge:<secret>@postgres:5432/kanjiforge

# better-auth / API
BETTER_AUTH_SECRET=<32+ char random>
BETTER_AUTH_URL=https://app.example.com
# public URLs the static client uses:
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_ELECTRIC_URL=https://electric.example.com
```

The repo pins the Electric image/version and shape proxy contract in `deploy/` and `apps/api/src/electric.ts`.

### 10.6 Backup remains mandatory

Live sync does not replace **full JSON backup/restore** (PRD principle 4, iOS eviction risk). Backup includes the complete review log and settings.

---

## 11. Performance practices

- **The study loop never re-renders the app.** Keep session queue state in a Zustand store with selective subscriptions; the card component subscribes to the current sticky only.
- **Prefetch the next card's content** (and pre-decode its audio and stroke data) while the current card is showing.
- **Web Workers** for: tokenization (post-MVP), similar-kanji lookups on large sets, statistics aggregation, import parsing (v2).
- **Code-split hard.** Writing trainer, text analyzer, and history charts are post-MVP lazy routes — do not ship them in the MVP bundle.
- **Content-visibility: auto** on off-screen list rows.
- **Measure on real hardware.** A mid-range Android from three years ago, not a MacBook. Keep a Lighthouse CI budget in the pipeline that fails the build on regression.

---

## 12. Testing strategy

| Layer | Tool | What |
|---|---|---|
| `core/srs` | Vitest | 100% coverage. All 14 cases in SRS-SPEC §10, plus property tests: replaying any log twice yields the same state; level never leaves 0–4; `dueAt` monotonic per level. |
| `core/stroke` | Vitest | Post-MVP with writing trainer. |
| `data/outbox` | Vitest | Enqueue, idempotent flush, auth failure retry, offline buffer. |
| Data pipeline | Node test | Assertions from DATA-SOURCES §11. |
| Components | Testing Library | Study keyboard/swipe/tap + undo. |
| E2E | Playwright | Sign-in → study offline → backup → wipe → restore; two-context sync smoke when API+Electric up. Chromium + WebKit. |
| Visual | Playwright screenshots | Tile view at three zoom levels; both themes. |

The offline study E2E is the one that matters most. Write it in Phase 1.

---

## 13. Repository conventions

- Monorepo not required; a single Next.js app plus `scripts/` is enough.
- Conventional commits, changesets for release notes.
- `CONTRIBUTING.md` must explain how to run the pack pipeline locally, since a contributor cannot do anything useful without content packs.
- Ship a `packs-dev` tiny fixture set (200 kanji, 500 words, 100 sentences) committed to the repo so `pnpm dev` works with zero downloads.
- Licenses: application code under the chosen OSS license; `packs/` and `scripts/build-packs/` output under CC BY-SA 4.0; `ATTRIBUTION.md` at the root.
