# What's Actually Implemented (current snapshot)

**Status date:** 2026-08-08 — based on a direct read of the source tree, not committed history
alone. This supersedes the stale rows in [`MVP-STATUS.md`](./MVP-STATUS.md) (dated 2026-08-02),
which predates commits `831840d` ("Fix auth stack so login actually works end-to-end") and
`8475b74` ("Build the first end-to-end local study loop (T1.6-T1.8)"). See "Corrections to
MVP-STATUS.md" below for the specific rows that changed.

This is a factual inventory, not a roadmap. For what's planned next, see
[`MVP-STATUS.md`](./MVP-STATUS.md) → "Remaining Build Sequence" and
[`ORCHESTRATION.md`](./ORCHESTRATION.md).

---

## Implemented and tested

Code with real logic and an existing test file exercising it.

| Area | Files | What exists |
|---|---|---|
| SRS engine | `src/core/srs/{grade,schedule,queue,replay,goal,retention,types}.ts` | Pure functions for the five-level spaced-repetition system: grading state transitions, next-due scheduling with seeded fuzz, queue building/interleaving, requeue-after-lapse, idempotent review-log replay, goal/progress math, and study-answer retention by starting level. Zero I/O, zero React — enforced by `eslint.config.js`'s `no-restricted-imports` rule on `src/core/**`. Covered by `src/core/srs/srs.test.ts`. |
| Local database | `src/data/db/{index,migrations,schema}.ts` | SQLite-WASM (`sql.js`) per-user local database, persisted to the browser's Origin Private File System with a graceful in-memory fallback if OPFS is unavailable (e.g. private browsing). Serializes writes through a chain so concurrent grades can't interleave. Versioned migrations create 10 tables: `decks`, `deck_membership`, `card_states`, `reviews`, `sessions`, `settings`, `daily_stats`, `outbox`, plus `schema_migrations`. Database name is namespaced per `userId`; opening with an empty id throws. |
| Local repositories | `src/data/repo/index.ts` | Typed CRUD over the local database: decks, card states, reviews, sessions, settings, daily stats, outbox rows. Sessions support start/end/list for local study-time totals. `recordGrade()` writes a review, its derived card state, a daily-stat increment, and an outbox row in one atomic transaction. Covered by `src/data/repo/index.test.ts`. |
| Auth runtime isolation | `src/auth/runtime.ts` | `bootstrapUserRuntime(userId)` opens a user-scoped local database and starts the outbox worker plus Electric sync lifecycle seam; `clearUserRuntime()` tears everything down on sign-out; switching accounts closes the old database before opening the new one. Every entry point rejects an empty `userId`. Covered by `runtime.test.ts`, `index.test.ts`, and `no-anonymous.test.ts`. |
| Backend env + schema contract | `src/server/env.ts`, `src/server/db/schema.ts` | Environment validation (safe network defaults, `BETTER_AUTH_SECRET` must be ≥32 chars) and a contract test asserting the Postgres migration includes better-auth's tables plus the syncable app projections (`user`, `session`, `account`, `verification`, `reviews`, `decks`, `settings`, `deck_membership`, `sticky_annotations`) while excluding local-only tables. Covered by `env.test.ts` and `schema.contract.test.ts`. |
| Authenticated sync transport | `src/server/{mutations,sync,index}.ts`, `src/data/sync/{index,electric-shape}.ts` | The self-hosted API validates authenticated mutation batches and exposes both a user-scoped read snapshot and an authenticated Electric shape proxy. When configured, the client parses and materializes Electric JSON/NDJSON/SSE changes for reviews, decks, settings, memberships, and annotations; it falls back to the snapshot transport with review union and metadata last-write-wins semantics. Covered by mutation, shape-adapter, and sync tests. |
| Outbox worker | `src/data/outbox/index.ts` | The authenticated runtime flushes supported local mutations in batches, including annotation upserts, removes only acknowledged rows, retries network/5xx failures with bounded exponential backoff, pauses on `401`, quarantines rejected rows in-memory for the session, and keeps unsupported local-only mutation types queued. Covered by `index.test.ts`. |
| Content pipeline (ETL) | `scripts/build-packs/*.ts`, `scripts/build-packs/pipeline.mjs` | Fetches and pins upstream sources (KANJIDIC2, JMdict, KanjiVG, Tatoeba, JmdictFurigana) with recorded SHA-256 hashes; builds SQLite content packs for kanji, words (with FTS5 search), strokes, sentences, and a visually-similar-kanji index; builds deck definitions (JLPT, School grades, Jōyō, Top 500, Kana, and all 12 Kanji Kentei levels from the pinned attributable level-list derivative); builds the optional full-JMdict tier with the same words schema; `pipeline.mjs` verifies reproducibility and produces deterministic Brotli-compressed artifacts. Committed stroke chunk sizes/checksums are independently checked by `strokes-pack.test.ts`. Covered by `fetch-sources.test.ts`, `build-decks.test.ts`, `build-similar-pack.test.ts`, `pipeline.test.mjs`, and driven in CI via `pnpm packs:verify && pnpm packs:test`. |
| Writing practice | `src/features/writing/{writing-screen,settings,index}.ts`, `src/core/stroke/{match,resample}.ts`, `src/app/writing/page.tsx` | Authenticated `/writing` practice surface loads an offline KanjiVG guide and captures finger, stylus, or mouse strokes with Pointer Events. The persisted Check stroke order toggle validates the next stroke with configurable strict, normal, or forgiving start/end/shape/direction matching, rejects mismatches, highlights the expected stroke after repeated failures, and supports free-draw mode when disabled. Captured strokes can be undone or cleared. Covered by `writing-screen.test.tsx` and `match.test.ts`. |

---

## Implemented, but not yet tested

Real implementations with no corresponding test file today — see
[`testing-coverage-plan.md`](./testing-coverage-plan.md) Phase 2/3 for the plan to close this.

| Area | Files | What exists |
|---|---|---|
| Study session state | `src/features/study/store.ts` (223 LOC) | A Zustand store driving the whole study loop: `start()` builds the session queue via `core/srs/queue`, `reveal()` flips the answer face, `toggleFlag()` atomically persists a flag change and updates the current card, `grade()` applies a grade through `core/srs`, atomically persists it via `repo.recordGrade()`, and re-queues "again" cards; `undo()` writes a compensating manual review and restores the prior in-memory queue/summary snapshot; `finish()` ends the session. This is the largest single piece of stateful application logic in the repo. |
| Study screen | `src/features/study/study-screen.tsx` | The `/study` route. Wires the store to UI: tap-to-reveal, flag/unflag, keyboard grading (Space to reveal, ←/→/↑ for again/good/easy), touch swipe grading (left/right past a 60px threshold), undo and finish buttons, persisted question and independently selected answer-field preferences, a persisted grey-stickies preference, an opt-in elapsed timer, session start/end persistence, a session-summary dialog (seen/correct/incorrect/went-green/went-red), and word-card-only audio controls/auto-play matching StickyStudy's kanji-only audio behavior. |
| Deck loading | `src/features/study/deck-loader.ts` | `loadStarterDeck()` resolves a `packs-dev` deck definition, lazily registers the deck in the local database on first load, fetches kanji and dictionary-word content from the installed packs, and assembles the `LoadedDeck` the store and screens consume. |
| SRS/repo adapters | `src/features/study/adapters.ts` | The single translation point between `core/srs`'s `stickyId`-keyed `CardState` and `data/repo`'s `contentRef`-keyed `CardState` (they're the same shape under a different key name). |
| Home screen | `src/features/home/home-screen.tsx` | The `/` route. Loads the starter deck's card states, computes percent-complete via `core/srs/goal`, shows last-studied and total completed-session time, renders a level-distribution stacked bar and count legend (with untouched cards treated as level 0), reports study-answer retention by starting level, surfaces cards with six or more lapses as leeches, projects completion from correct answers per active day over the trailing 14 days, and lets the user set/persist a goal date that drives a "days left / cards needed today / on pace vs. behind / projected completion" readout. Every bundled deck now appears in an offline chooser with independent progress, belt color, last-studied metadata, and Study/Browse links. User-owned custom decks appear as offline Study/Browse cards grouped by their persisted folder labels. |
| Browse list | `src/features/browse/browse-screen.tsx`, `src/features/browse/browse-filter.ts`, `src/features/browse/browse-bulk.ts`, `src/features/browse/browse-virtual.ts`, `src/app/browse/page.tsx` | The `/browse` route loads the authenticated user's built-in deck from the local database and renders an accessible list with each card's kanji, readings, meanings, level/belt label, and flag state. The list has offline text search across kanji, kana readings, and English meanings plus level/color, flagged, stroke-count range, and JLPT filters. Tile view is persisted per user and can show kanji, reading, or first meaning content at a persisted 75%, 100%, or 150% zoom ratio; users can explicitly save those three Browse choices as defaults for future decks, with deck-specific choices taking precedence. List and tile views support selecting visible cards and atomically bulk flagging/unflagging or assigning manual levels. Lists above 500 cards render an overscanned fixed-row viewport with accessible set size/position metadata. Selecting a card keeps Browse visible and opens its offline Detail in a responsive two-pane layout on large screens. |
| Detail view and audio packs | `src/features/detail/detail-screen.tsx`, `src/features/detail/stroke-animation.tsx`, `src/features/study/{audio,audio-pack}.ts` | The `/detail` route renders offline kanji metadata and dictionary-word metadata, exposes labeled playback on both detail types, prefers matching licensed community recordings installed from Settings—including alternate valid readings—and falls back to labeled device-synthesized Japanese audio. It also provides ordered KanjiVG stroke playback with accessible play/pause/restart/step controls, ranked examples and similar kanji, membership actions for Saved and existing custom decks, and previous/next navigation through the loaded deck with horizontal touch swiping. Browse and Dictionary can embed the same detail surface beside their list/results on wide screens. Study word cards expose an installed recording only when the pack contains the current writing/reading pair, including on browsers without SpeechSynthesis. |
| Authenticated navigation | `src/features/navigation/app-navigation.tsx`, `src/auth/auth-gate.tsx` | Protected screens share primary links for Home, Study, Browse, History, Dictionary, Writing, and bundled offline Help. Tablet/desktop widths use a persistent left sidebar with account controls; smaller screens use a compact horizontal header. Browse displays a locally loaded sticky-count badge from the installed starter deck and keeps the link usable if pack loading fails. Writing opens the standalone offline drill route, which defaults to 日 when no Detail card is selected. |
| In-app Help | `src/features/help/help-screen.tsx`, `src/app/help/page.tsx` | The authenticated `/help` route bundles offline guidance for the study loop, level/color system, Browse/Dictionary, backup, and privacy; it has no network or database dependency. Covered by `src/features/help/help-screen.test.tsx`. |
| Web Share Target and deck sharing | `src/features/share/share-screen.tsx`, `src/features/settings/deck-share.ts`, `src/app/analyze/page.tsx`, `public/manifest.json` | The installed PWA can receive shared article text at `/analyze`, immediately analyze it offline with readings/furigana, preserve a safe external source URL, and import matched cards to Saved without changing SRS progress. Content-only deck links/files use a versioned mixed-card payload for stable kanji and dictionary-word references, with legacy kanji-only links preserved. Covered by `src/features/share/share-screen.test.tsx` and `src/features/settings/deck-share.test.ts`. |
| Offline text analyzer | `src/features/share/{share-screen.tsx,analyzer-history.ts}`, `src/data/packs/index.ts`, `src/core/text/{analyzer,tokenizer}.ts` | Authenticated `/analyze` accepts pasted Japanese text and displays Kuromoji/IPADIC-bounded dictionary tokens, inflection-aware and particle/copula grammar tokens, ruby readings, English meanings, links to offline word/kanji details, and explicit unknown-character fallback. The optional tokenizer dictionary is lazy-loaded and failure-safe. The last ten successful texts persist per user for one-tap reuse and can be cleared without affecting study data. Covered by `share-screen.test.tsx`, `analyzer-history.test.ts`, `analyzer.test.ts`, and `packs/index.test.ts`. |
| History screen | `src/features/history/history-screen.tsx` | The `/history` route. Reads local daily-stat rollups and renders an accessible 30-day rolling study-activity bar chart with review, correct, again, and active-day summaries; selecting a bar shows that day's breakdown. |
| Auth client | `src/auth/client.ts` | `signIn()`, `register()`, `signOut()`, `getSession()` against the better-auth backend (`NEXT_PUBLIC_API_URL` + `/api/auth/*`). `getSession()` falls back to a cached `localStorage` identity when the network is unreachable, deliberately, so offline reloads don't lock the user out. |
| Auth gate | `src/auth/auth-gate.tsx` | The sign-in/register UI shell and the no-anonymous-access gate that wraps protected routes. |
| Content-pack access and optional names manager | `src/data/packs/index.ts`, `src/features/settings/names-pack.ts`, `scripts/build-packs/build-names-pack.ts` | Read-only SQLite-WASM access to the `packs-dev` fixture packs: loads deck definitions from `decks.json`, looks up kanji by literal or classical radical, searches core JMdict plus an optional indexed JMnedict names pack when installed, supports exact/prefix/substring and wildcard matching, and parses `type:key` content refs (e.g. `kanji:日`, `word:1234567`, `name:5000000`). `npm run build:names` produces the optional names artifact; Settings validates and installs the raw SQLite file or a manifest-bearing ZIP into browser-local storage, and Dictionary reopens the optional pack after replacement/removal. |
| Device id | `src/lib/device-id.ts` | A stable per-browser id (persisted in `localStorage`, generated via `crypto.randomUUID()`) used to attribute reviews and outbox rows to a device; returns a safe placeholder when `window` is undefined. |
| Tile-wall prototype | `src/prototype/tile-wall/*`, `src/app/prototype/tiles/page.tsx` | A Phase 0 performance spike: canvas/DOM-hybrid renderer for a 2,500-tile grid with pan/zoom, an accessible list fallback, and an FPS overlay. Not a shipping surface — it validates the rendering approach for the future Browse experience. |
| Theme, text scaling, study style, news links, optional dictionary/audio packs, automatic backup, and iOS retention guidance settings | `src/features/settings/{theme,theme-controller,settings-screen,auto-backup,rss-feeds,names-pack,words-pack}.ts*`, `src/features/study/{study-style,audio-pack}.ts`, `src/pwa/install-guidance.ts` | Authenticated users can choose light, dark, device, or StickyStudy-compatible 21:00–06:00 night mode, choose default/large/extra-large app text, choose the study question face, independently select answer fields, enable two-tap word → readings → details reveals, maintain up to 12 validated RSS source links for external reading, add a one-click Japanese Wikinews (CC BY 4.0) preset, install the optional JMnedict names or full JMdict SQLite packs and licensed community audio packs, and choose a desktop backup folder. RSS content is never fetched or reproduced. The folder handle is stored per account; when permission remains granted, a complete JSON backup is written at most once per day as the app opens or returns to the foreground. On non-standalone iPhone/iPad Safari, Settings explains that Add to Home Screen improves offline-data retention. Choices and optional packs are stored locally and applied offline. Settings also deletes user-owned Saved and custom decks with confirmation and atomic local cleanup. |

---

## Stubs and explicit seams (no real implementation yet)

Every file in this section is a small (typically 8–20 line) placeholder with a `TODO(Tx.x)` comment
naming the future milestone. They are intentionally excluded from test-coverage targets in
[`testing-coverage-plan.md`](./testing-coverage-plan.md) — writing tests against a constant export
is busywork, and each stub's real implementation work is the trigger to add real tests.

| Area | Files | Target milestone |
|---|---|---|
| Electric sync | `src/data/sync/{index,electric-shape}.ts`, `src/server/electric.ts` | The authenticated read path consumes the proxied Electric shape stream when configured, materializes rows through the shared local merge contract, and falls back to the API snapshot; the server proxy injects the authenticated `user_id` predicate and forwards the stream. | T4.0 |
| Mutation write API | `src/server/index.ts` (`POST /api/mutations`) | Authenticated route validates and applies supported review/deck/settings/membership mutations with idempotency and LWW metadata semantics. | T1.4 |
| Text processing | `src/core/text/{detect,furigana,romaji}.ts` | Input-type detection now classifies kanji, kana, romaji, English, mixed-script, and other queries for the dictionary UI. Furigana alignment parsing is implemented and shared by sentence-pack access, with malformed-data fallback and focused tests. `romaji.ts` is implemented and used by dictionary search. | |
| Import/enrichment | `src/core/import/{parse,enrich,apkg}.ts` | Pure CSV/TSV/line parsers handle quoted cells, multiline values, BOMs, comments, and compact kanji lists. Pure enrichment helpers deduplicate content identities and classify matched, already-in-target, and unresolved entries; Anki `.apkg` parsing preserves Japanese word runs and individual kanji for the offline dictionary preview. Covered by `src/core/import/import.test.ts` and `deck-import.test.ts`. | Anki scheduling/tags/templates remain intentionally unmigrated |
| PWA registration, storage protection, app badge, and reminders | `src/pwa/index.ts`, `src/pwa/{app-badge,daily-reminder,events,storage-persistence}.ts`, `src/pwa/sw.ts`, `next.config.js` | Registers the build-generated Serwist worker in the browser; the worker precaches build assets and caches visited navigations for offline reloads. Updated workers wait rather than interrupting an active study session. After the first non-empty completed study session, the app requests durable browser storage and Settings warns when the browser cannot protect local data. On supported installed browsers, a persisted per-user setting controls an app-icon badge showing due/new cards, total cards, or no badge; local study grades and undo operations request an immediate refresh, and browsers without the Badging API get the same count in both the browser-tab title and a reversible favicon badge. The foreground daily reminder prefers a service-worker notification for installed PWAs and falls back to a page notification in ordinary browser tabs; both paths open Study, while configured background Web Push uses the service worker click-through. On non-standalone iOS Safari, Settings now explains that the PWA must be installed before reminders can be delivered reliably. | T5.0 |
| Detail / Settings routes | `src/app/{detail,settings}/…`, `src/features/{detail,settings}/index.ts` | Detail and Settings are real authenticated offline screens; Detail includes kanji metadata, ranked similar-kanji links, ranked example words, and ranked Tatoeba example sentences with furigana breakdown from the installed packs. | Phases 2–3 |

---

## Corrections to `MVP-STATUS.md`

`MVP-STATUS.md` is dated 2026-08-02. The following rows in its Implementation Matrix are stale as of
this snapshot:

| MVP-STATUS.md row | Its status | Current reality | Superseding commit |
|---|---|---|---|
| Study screen | "Not started... currently renders a TODO" | Fully wired: reveal, keyboard/swipe grading, undo, session summary (see table above) | `8475b74` |
| Home and simple goals | "Not started... still a shell" | Fully wired: deck progress, last-studied, goal date input, on-pace/behind readout | `8475b74` |
| Authentication backend | "Partial... backend must be running and wired" | Frontend/backend origin wiring is documented and working per `831840d`'s commit message ("login actually works end-to-end"); the underlying auth route and Postgres schema were already correct — the gap was configuration, not code, and that gap is now closed | `831840d` |
| Atomic local grade transaction | "not yet called by a study screen" | Now called on every grade via `useStudyStore.grade()` → `repo.recordGrade()` | `8475b74` |

All other rows in `MVP-STATUS.md` — Electric stub, pack-manager stub,
Browse inline-edit follow-up — remain accurate as of this
snapshot and are restated in the "Stubs and explicit seams" table above for a single source of truth.

---

## What a user can actually do today

Consistent with the code above, not aspirational:

- Sign in or register against a running API backend, or continue offline on a cached identity.
- Land on Home, see the starter deck's name, percent-complete, and last-studied time; set a goal
  date and see days-left / cards-needed-today / on-pace feedback.
- Open Browse to inspect and filter the installed deck as a local-first list of colored cards with
  readings, meanings, levels, flags, and metadata filters.
- Open a kanji Detail view to see offline metadata, example words, example sentences with furigana,
  English translations, and source attribution.
- Add a kanji from Detail to Saved or any existing custom deck; the membership is persisted locally
  and queued for sync.
- Open Writing practice from Detail to trace a kanji over its offline guide, undo a stroke, or clear
  the practice surface.
- Start a study session on the `dev-kanji` starter deck, reveal cards by tap/click/Space, grade by
  keyboard/swipe/button, undo the last grade, and see a session summary.
- Have every grade persisted locally (SQLite-WASM/OPFS) atomically, surviving a reload.
- On supported installed browsers, choose whether the app icon shows cards to study, total cards,
  or no badge; the count is derived from the local deck and remains offline. Browsers without the
  Badging API show the same count temporarily in the browser tab title.

What still does not work end-to-end: local-only mutation types do not yet have a server projection, writing
validation, backup/export, and full pack management.
