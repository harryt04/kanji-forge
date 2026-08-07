# What's Actually Implemented (current snapshot)

**Status date:** 2026-08-06 — based on a direct read of the source tree, not committed history
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
| SRS engine | `src/core/srs/{grade,schedule,queue,replay,goal,types}.ts` | Pure functions for the five-level spaced-repetition system: grading state transitions, next-due scheduling with seeded fuzz, queue building/interleaving, requeue-after-lapse, idempotent review-log replay, and goal/progress math. Zero I/O, zero React — enforced by `eslint.config.js`'s `no-restricted-imports` rule on `src/core/**`. Covered by `src/core/srs/srs.test.ts` (14 cases matching `SRS-SPEC.md` §10 plus property tests). |
| Local database | `src/data/db/{index,migrations,schema}.ts` | SQLite-WASM (`sql.js`) per-user local database, persisted to the browser's Origin Private File System with a graceful in-memory fallback if OPFS is unavailable (e.g. private browsing). Serializes writes through a chain so concurrent grades can't interleave. Versioned migrations create 10 tables: `decks`, `deck_membership`, `card_states`, `reviews`, `sessions`, `settings`, `daily_stats`, `outbox`, plus `schema_migrations`. Database name is namespaced per `userId`; opening with an empty id throws. |
| Local repositories | `src/data/repo/index.ts` | Typed CRUD over the local database: decks, card states, reviews, sessions, settings, daily stats, outbox rows. `recordGrade()` writes a review, its derived card state, a daily-stat increment, and an outbox row in one atomic transaction. Covered by `src/data/repo/index.test.ts` (currently thin — one case). |
| Auth runtime isolation | `src/auth/runtime.ts` | `bootstrapUserRuntime(userId)` opens a user-scoped local database and starts the (stub) outbox/sync lifecycle seams; `clearUserRuntime()` tears everything down on sign-out; switching accounts closes the old database before opening the new one. Every entry point rejects an empty `userId`. Covered by `runtime.test.ts` and `no-anonymous.test.ts` (parameterized: db, outbox, and sync all reject anonymous callers). |
| Backend env + schema contract | `apps/api/src/env.ts`, `apps/api/src/db/schema.ts` | Environment validation (safe network defaults, `BETTER_AUTH_SECRET` must be ≥32 chars) and a contract test asserting the Postgres migration includes better-auth's tables plus the syncable app projections (`user`, `session`, `account`, `verification`, `reviews`, `decks`, `settings`, `deck_membership`) while excluding local-only tables. Covered by `env.test.ts` and `schema.contract.test.ts`. |
| Content pipeline (ETL) | `scripts/build-packs/*.ts`, `scripts/build-packs/pipeline.mjs` | Fetches and pins upstream sources (KANJIDIC2, JMdict, KanjiVG, Tatoeba, JmdictFurigana) with recorded SHA-256 hashes; builds SQLite content packs for kanji, words (with FTS5 search), strokes, sentences, and a visually-similar-kanji index; builds deck definitions (JLPT, School grades, Jōyō, Top 500, Kana). `pipeline.mjs` verifies reproducibility and produces deterministic Brotli-compressed artifacts. Covered by `fetch-sources.test.ts`, `build-decks.test.ts`, `build-similar-pack.test.ts`, `pipeline.test.mjs`, and driven in CI via `pnpm packs:verify && pnpm packs:test`. |

---

## Implemented, but not yet tested

Real implementations with no corresponding test file today — see
[`testing-coverage-plan.md`](./testing-coverage-plan.md) Phase 2/3 for the plan to close this.

| Area | Files | What exists |
|---|---|---|
| Study session state | `src/features/study/store.ts` (223 LOC) | A Zustand store driving the whole study loop: `start()` builds the session queue via `core/srs/queue`, `reveal()` flips the answer face, `grade()` applies a grade through `core/srs`, atomically persists it via `repo.recordGrade()`, and re-queues "again" cards; `undo()` writes a compensating manual review and restores the prior in-memory queue/summary snapshot; `finish()` ends the session. This is the largest single piece of stateful application logic in the repo. |
| Study screen | `src/features/study/study-screen.tsx` | The `/study` route. Wires the store to UI: tap-to-reveal, keyboard grading (Space to reveal, ←/→/↑ for again/good/easy), touch swipe grading (left/right past a 60px threshold), undo and finish buttons, and a session-summary dialog (seen/correct/incorrect/went-green/went-red). |
| Deck loading | `src/features/study/deck-loader.ts` | `loadStarterDeck()` resolves a `packs-dev` deck definition, lazily registers the deck in the local database on first load, fetches card content from the kanji pack, and assembles the `LoadedDeck` the store and screens consume. |
| SRS/repo adapters | `src/features/study/adapters.ts` | The single translation point between `core/srs`'s `stickyId`-keyed `CardState` and `data/repo`'s `contentRef`-keyed `CardState` (they're the same shape under a different key name). |
| Home screen | `src/features/home/home-screen.tsx` | The `/` route. Loads the starter deck's card states, computes percent-complete via `core/srs/goal`, shows last-studied time, and lets the user set/persist a goal date that drives a "days left / cards needed today / on pace vs. behind" readout. |
| Auth client | `src/auth/client.ts` | `signIn()`, `register()`, `signOut()`, `getSession()` against the better-auth backend (`NEXT_PUBLIC_API_URL` + `/api/auth/*`). `getSession()` falls back to a cached `localStorage` identity when the network is unreachable, deliberately, so offline reloads don't lock the user out. |
| Auth gate | `src/auth/auth-gate.tsx` | The sign-in/register UI shell and the no-anonymous-access gate that wraps protected routes. |
| Content-pack access | `src/data/packs/index.ts` | Read-only SQLite-WASM access to the `packs-dev` fixture packs: loads deck definitions from `decks.json`, looks up kanji by literal, and parses `type:key` content refs (e.g. `kanji:日`). Explicitly documented as a dev fixture, pending the full pack manager (`T2.2`). |
| Device id | `src/lib/device-id.ts` | A stable per-browser id (persisted in `localStorage`, generated via `crypto.randomUUID()`) used to attribute reviews and outbox rows to a device; returns a safe placeholder when `window` is undefined. |
| Tile-wall prototype | `src/prototype/tile-wall/*`, `src/app/prototype/tiles/page.tsx` | A Phase 0 performance spike: canvas/DOM-hybrid renderer for a 2,500-tile grid with pan/zoom, an accessible list fallback, and an FPS overlay. Not a shipping surface — it validates the rendering approach for the future Browse experience. |

---

## Stubs and explicit seams (no real implementation yet)

Every file in this section is a small (typically 8–20 line) placeholder with a `TODO(Tx.x)` comment
naming the future milestone. They are intentionally excluded from test-coverage targets in
[`testing-coverage-plan.md`](./testing-coverage-plan.md) — writing tests against a constant export
is busywork, and each stub's real implementation work is the trigger to add real tests.

| Area | Files | Target milestone |
|---|---|---|
| Outbox flush | `src/data/outbox/index.ts` | `startOutboxFlusher()` validates `userId` and returns a no-op `stop()`. No enqueue, flush, retry, or idempotency logic exists yet. | T1.4 |
| Electric sync | `src/data/sync/index.ts` | `startShapeSubscription()` validates `userId` and returns a no-op `stop()`. No Electric client or shape application exists. | T4.0 |
| Mutation write API | `apps/api/src/index.ts` (`POST /api/mutations`) | Route exists and is authenticated, but deliberately returns `501 mutation_ingest_not_implemented`. | T1.4 |
| Text processing | `src/core/text/{detect,furigana,romaji}.ts` | Each exports a single `*_STUB` constant. | `furigana.ts` → T1.1; `detect.ts`/`romaji.ts` → T3.0 (dictionary search) |
| Stroke processing | `src/core/stroke/{match,resample}.ts` | Each exports a single `*_STUB` constant. | T6.0 (writing trainer) |
| Import/enrichment | `src/core/import/{parse,enrich}.ts` | Each exports a single `*_STUB` constant. | T8.0 (v2, deferred with custom decks) |
| PWA registration | `src/pwa/index.ts` | Exports `PWA_STUB`; no Serwist registration or precache strategy wired despite `serwist` being a dependency and a `public/manifest.json` existing. | T5.0 |
| Browse / Detail / Dictionary / History / Settings / Writing routes | `src/app/{browse,detail,dictionary,history,settings,writing}/…`, `src/features/{browse,detail,dictionary,history,settings,writing}/index.ts` | Route + feature-module placeholders; no real UI or data wiring. | Phases 2–3, or Deferred for Writing/History per TRD |

---

## Corrections to `MVP-STATUS.md`

`MVP-STATUS.md` is dated 2026-08-02. The following rows in its Implementation Matrix are stale as of
this snapshot:

| MVP-STATUS.md row | Its status | Current reality | Superseding commit |
|---|---|---|---|
| Study screen | "Not started... currently renders a TODO" | Fully wired: reveal, keyboard/swipe grading, undo, session summary (see table above) | `8475b74` |
| Home and simple goals | "Not started... still a shell" | Fully wired: deck progress, last-studied, goal date input, on-pace/behind readout | `8475b74` |
| Authentication backend | "Partial... backend must be running and wired" | Frontend/backend origin wiring is documented and working per `831840d`'s commit message ("login actually works end-to-end"); the underlying `apps/api` auth route and Postgres schema were already correct — the gap was configuration, not code, and that gap is now closed | `831840d` |
| Atomic local grade transaction | "not yet called by a study screen" | Now called on every grade via `useStudyStore.grade()` → `repo.recordGrade()` | `8475b74` |

All other rows in `MVP-STATUS.md` — outbox stub, Electric stub, mutation-API 501, pack-manager stub,
Browse/Detail/Dictionary/History/Settings/Writing placeholders, PWA stub — remain accurate as of this
snapshot and are restated in the "Stubs and explicit seams" table above for a single source of truth.

---

## What a user can actually do today

Consistent with the code above, not aspirational:

- Sign in or register against a running API backend, or continue offline on a cached identity.
- Land on Home, see the starter deck's name, percent-complete, and last-studied time; set a goal
  date and see days-left / cards-needed-today / on-pace feedback.
- Start a study session on the `dev-kanji` starter deck, reveal cards by tap/click/Space, grade by
  keyboard/swipe/button, undo the last grade, and see a session summary.
- Have every grade persisted locally (SQLite-WASM/OPFS) atomically, surviving a reload.

What still does not work end-to-end: multi-device sync (outbox + Electric are stubs), Browse beyond
the Phase-0 prototype, Dictionary/Detail, Settings, backup/export, and offline installability (no
service worker registered yet).
