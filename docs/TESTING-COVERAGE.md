# Testing Coverage — current state

**As of:** 2026-08-08, after executing [`testing-coverage-plan.md`](../mvp-docs/testing-coverage-plan.md)
(Phases 0–6). This is a factual snapshot generated from a real `pnpm test:coverage` run — not a
target or an aspiration. Re-run `pnpm test:coverage` to refresh it.

---

## Headline numbers

| | |
|---|---|
| Unit/integration test files | 60 (412 test cases: 412 passing) |
| Component test files | 11 (`study-screen.test.tsx`, `home-screen.test.tsx`, `history-screen.test.tsx`, `dictionary-screen.test.tsx`, `browse-screen.test.tsx`, `detail-screen.test.tsx`, `writing-screen.test.tsx`, `settings-screen.test.tsx`, `app-navigation.test.tsx`, `help-screen.test.tsx`, `share-screen.test.tsx` — 124 cases, included above) |
| E2E spec files | 2 (`auth.spec.ts`, `offline-study.spec.ts`) — 5 passed and 1 skipped in the configured local run |
| Overall statement coverage | **86.69%** |
| `src/core/srs` coverage | **100%** (lines/branches/functions/statements) |
| CI gate | `pnpm test:coverage` runs on every push/PR; per-directory thresholds fail the build if violated |

---

## Per-directory coverage vs. gate

Thresholds are enforced in [`vitest.config.ts`](../vitest.config.ts) (`coverage.thresholds`) and are a
**ratchet**: raise a number when it's comfortably exceeded, never lower one.

| Directory | Threshold | Actual (stmts / branch / funcs / lines) | Status |
|---|---|---|---|
| `src/core/srs/**` | 100% | 100 / 100 / 100 / 100 | ✅ at the floor, mandated by `ARCHITECTURE.md` §12 |
| `src/data/**` | 85% | db 93.89 / 86.27 / 100 / 93.89 · outbox 93.29 / 81.69 / 91.66 / 93.29 · packs 98.39 / 83.16 / 100 / 98.39 · repo 99.04 / 91.27 / 100 / 99.04 · sync 90.47 / 81.81 / 77.77 / 90.47 | ✅ comfortable margin |
| `src/features/**` | 70% | browse 91.7 / 78.18 / 83.01 / 91.7 · history 100 / 100 / 87.5 / 100 · home 97.21 / 85.59 / 93.75 / 97.21 · settings 82.6 / 74.53 / 84.61 / 82.6 · study 86.6 / 83.07 / 72.41 / 86.6 | ✅ comfortable margin |
| `src/features/dictionary/**` | 70% | 94.02 / 79.68 / 89.28 / 94.02 | ✅ comfortable margin |
| `src/features/settings/**` | 70% | 84.18 / 75 / 86 / 84.18 | ✅ comfortable margin |
| Global floor | 60% | 86.6 / 81.14 / 85.95 / 86.6 | ✅ comfortable margin |

**Not yet covered / not in scope for this plan** (pulls the global average down, but doesn't affect
any directory gate above):

| Area | Coverage | Why |
|---|---|---|
| `apps/api/src/{auth,index}.ts`, `apps/api/src/db/**` | 0% | Server-side backend; not exercised by the frontend unit suite. |
| `src/auth/auth-gate.tsx` | 0% | UI shell; not one of the component-test targets. |
| `src/app/layout.tsx` | 0% | Route shell, excluded by convention (`src/app/**/page.tsx` is excluded outright; `layout.tsx` is just never imported by a test). |
| `src/lib/store.ts` | 0% | Legacy/unused file, not referenced by `testing-coverage-plan.md`. |
| `src/features/study/index.ts` | 0% | A four-line re-export barrel; the real modules it re-exports (`store.ts`, `adapters.ts`, `deck-loader.ts`, `study-screen.tsx`) are each independently covered above. |
| `src/prototype/**`, `src/core/{text,stroke,import}/**`, `src/pwa/**`, most `src/features/*/index.ts` | excluded from the coverage denominator entirely | Stubs/prototype — see the exclusion list in `vitest.config.ts` and `docs/implemented-already.md`. Removing a file from this list is part of implementing it for real. |

---

## Test inventory

### `src/core/srs` — 28 cases, 100% coverage

`srs.test.ts` and `adaptive.test.ts` — the 15 `SRS-SPEC.md` §10 transition cases plus 3 property/edge-case tests (replay
idempotency, level-domain invariants, schedule/queue/goal boundary helpers), adaptive interval growth
and difficulty response, adaptive level-zero requeueing, a fuzz-bounds case,
the progress-to-belt-rank mapping, retention-by-level aggregation with the 80%-of-stage threshold,
and leech/forecast edge cases.
Locked at 100% by the CI gate; this directory should never regress.

### `src/data` — 86 cases across 6 files

**`outbox/index.test.ts`** (9) — supported mutation batching—including annotation upserts—and acknowledgement removal,
network backoff with queue preservation, auth-expiry pause/resume, rejected-row quarantine, and
leaving local-only mutation types queued until their server contract exists.

- **`db/migrations.test.ts`** (4) — fresh v0→v3 creates all 10 tables, records `applied_at`,
  idempotent re-run, declared-version consistency.
- **`db/index.test.ts`** (6) — empty-userId rejection, per-user namespacing, concurrent-write
  serialization, OPFS persistence across close/reopen (via a fake in-memory OPFS shim), namespace
  isolation with OPFS enabled, post-close rejection.
- **`repo/index.test.ts`** (31, up from 1) — derived-deck projection, deck-scoped state listing,
  atomic multi-card reset persistence, atomic statistics reset with history/session clearing, deck metadata plus outbox persistence, atomic user-deck deletion with protected starter-deck behavior, and `recordGrade()` atomicity,
  manual level override atomicity and validation, atomic manual card-state flag persistence,
  and custom-deck membership projection, atomic bulk custom-deck composition with deck metadata and membership outbox mutations
  (mismatched id rejected, review+state+stat+outbox written together), outbox attempt/removal
  lifecycle, deck-filtered session listing, daily-stat rollup across grades, session start/end, settings round-trip with
  last-write-wins, deck membership save/list/remove, deck upsert/list-by-user, unknown-deck error,
  `reviews.list()` filtering by deck and content ref independently, and atomic sticky annotation persistence.
- **`packs/index.test.ts`** (35) — `parseContentRef` valid/malformed, deck-definition loading and
  caching against the real `packs-dev` fixture, kanji lookup hit/miss, pack-handle caching, ranked
  example-word lookup, ranked sentence lookup with furigana/attribution and empty-input limits, and
  sentence-alignment fallback/normalization, and offline KanjiVG stroke-path loading.
- **`sync/index.test.ts`** (3) — authenticated snapshot merge into the local database, review-id
  union plus metadata last-write-wins behavior, and cancellation of scheduled polling on runtime stop.

### `src/features/study` — 54 cases across 7 files

- **`store.test.ts`** (15) — the highest-value target per the plan. Queue construction from a loaded
  deck, empty-deck immediate finish, reveal, `recordGrade()` call shape, index/summary
  advancement, `wentGreen` tally, "again" requeue position matches `requeueAfterAgain()` exactly,
  session finish on last card, **persistence-failure isolation** (a rejected `recordGrade()` leaves
  the in-memory queue/index/summary untouched), no-op on an exhausted queue, undo restores the exact
  prior snapshot, undo writes a compensating manual-source review, undo no-op with nothing to undo,
  and flag/unflag persistence for the current card.
- **`adapters.test.ts`** (2) — `contentRef`↔`stickyId` round-trip in both directions.
- **`deck-loader.test.ts`** (7) — lazy deck registration against real `packs-dev` fixtures, no
  re-registration/re-fetch on a second load, unknown-definition error, tolerant handling of content
  refs missing from the pack, and loading kanji and dictionary-word memberships from user-owned decks.
- **`study-screen.test.tsx`** (20, Testing Library) — sign-in-required state, tap-to-reveal, flag/unflag,
  the
  `motion-reduce:transition-none` class is present, keyboard grading (Space then arrow keys),
  arrow keys ignored before reveal, swipe-gesture grading via synthetic `TouchEvent`s, undo restores
  the previous card and re-disables itself, session-summary totals match store state, and the
  tap-to-show elapsed timer updates while visible, persisted grey-stickies preference hides study
  colors and reloads in a later session, study-session persistence/closure on finish, and the
  persisted meaning question face, rendering only the configured answer fields, rendering the opt-in
  offline writing answer pad after reveal, dictionary-word study cards omitting that writing pad, explicit synthesized voice replay, auto-play on reveal, and
  two-tap staged reveal behavior.
- **`audio.test.ts`** (2) — browser capability detection plus Japanese utterance configuration and
  cancellation before replay.
- **`audio-pack.test.ts`** (3) — licensed manifest validation, ZIP extraction with missing-file
  rejection, and offline install/list/resolve/remove behavior.
- **`study-style.test.ts`** (3) — default answer fields, malformed/duplicate value parsing, and
  stable answer-field serialization.

### `src/features/home` — 14 cases

**`home-screen.test.tsx`** (Testing Library) — sign-in-required and loading states, deck progress
with no goal set and its accessible belt-rank label, progress bar reflects a real recorded grade
(via `recordGrade()` against a real local DB), level-distribution bar and counts include untouched
cards at level 0, total duration from completed sessions, setting a goal date drives the
on-pace/behind-pace readout, and projected completion compares recent correct-answer pace against
the goal date, and an unrealistic goal shows an accessible warning with an inline suggested-date action,
and retention by starting level excludes manual adjustments and early-interval reviews and flags low retention, leech
identification surfaces cards at six or more lapses while ignoring cards below the threshold, and
the 30-day scheduled review forecast buckets overdue and future due cards. It also verifies that
user-owned custom decks appear with offline Study and Browse links, and
custom decks are grouped on the shelf using their persisted folder labels.

### `src/features/history` — 3 cases

**`history-screen.test.tsx`** (Testing Library) — sign-in-required state, empty 30-day chart and
heatmap for a new learner, recorded daily activity plotted with review/correct/again totals and
intensity-scaled heatmap cells, and selecting either chart or heatmap day reveals shared daily
breakdown and pressed state.

### `src/features/help` — 2 cases

**`help-screen.test.tsx`** (Testing Library) — bundled offline documentation sections and links,
plus the anonymous-access message when rendered outside the authenticated app shell.

### `src/features/browse` — 26 cases

**`browse-screen.test.tsx`** (Testing Library) — anonymous access messaging, offline fixture-pack
loading into a 200-card accessible list, persisted List/Tiles view selection with a 200-card tile
wall, tile links to the selected card's offline detail route, persisted tile-content selection (kanji/reading/meaning), persisted tile zoom density, rendering persisted local level and flag state, filtering
by kanji/readings/English meanings, applying level/flag/stroke-count/JLPT filters, clearing filters,
sorting by local level with stable deck-order ties, and manually assigning a card level while
preserving review totals and omitting the manual adjustment from daily review statistics, saving
the current Browse view, tile content, and zoom as validated defaults for future decks, selecting
multiple cards in either view, and atomically bulk flagging or assigning manual levels.

`browse-filter.test.ts` covers untouched cards as level zero, inclusive stroke ranges, flagged and
level combinations, JLPT matching, and missing JLPT metadata.

**`browse-sort.test.ts`** (Vitest) — all metadata sort modes, missing metadata placement, implicit
level-zero cards, stable deck-order ties, and non-mutating deck-order output.

### `src/features/dictionary` — 10 cases

**`dictionary-screen.test.tsx`** (8, Testing Library) — offline text, wildcard, classical-radical,
and exact stroke-count search from the visible form, complete KANJIDIC2 metadata for kanji results,
saving results to the offline Saved deck, honoring the persisted ask-before-saving preference, and
user-scoped recent-search persistence with pinning, reuse, and clear behavior.

**`search-history.test.ts`** — query normalization, duplicate removal, history limits, repeat-query
promotion, and pinned-search toggling.

### `src/features/detail` — 13 cases

**`detail-screen.test.tsx`** (Testing Library) — anonymous access messaging, loading a selected kanji's readings/meanings/stroke count/local level/school grade/JLPT/frequency/name readings, rendering its offline stroke-order player and stepping/restarting it, rendering its offline radical/component section, rendering ranked example words and example sentences with accessible Japanese breakdowns, highlighted target kanji, English translation, and attribution, rendering ranked similar-looking kanji links, opening a linked kanji outside the starter deck from the offline content pack, exposing and activating the labeled synthesized-voice audio control when device speech is available, saving the selected kanji to the offline Saved deck with an outbox mutation, opening an analyzed dictionary word in the shared detail route and saving it offline, adding it to an existing custom deck with an outbox mutation, honoring the persisted ask-before-saving preference, saving per-sticky notes and normalized tags with an outbox mutation, navigating to adjacent deck cards with previous/next controls, and moving forward with a horizontal touch swipe. Community-pack playback is covered by the pure `audio-pack.test.ts` suite and shares this fallback path.

### `src/features/writing` — 6 cases

**`writing-screen.test.tsx`** (Testing Library) — anonymous access messaging, offline guide loading, pointer-stroke capture, undo, clear actions, offline persistence of the correct-strokes toggle and strict/normal/forgiving stroke-match tolerance, escalating start-dot and animated-stroke hints after rejected attempts, and a bounded standalone drill with repetition progress and completion. **`src/core/stroke/match.test.ts`** covers arc-length resampling, forward/reverse stroke order, curve similarity, and wrong-shape rejection. **`src/core/stroke/order.test.ts`** covers interchangeable first-stroke selection, strict sequencing outside exceptions, and bounds against the loaded path set.

### `src/features/navigation` — 2 cases

**`app-navigation.test.tsx`** (Testing Library) — authenticated primary routes, offline starter-deck sticky-count badge rendering, and no stale badge when the runtime is unavailable.

### `src/features/settings` — 72 cases

**`deck-export.test.ts`** covers deterministic text, escaped CSV, and versioned JSON exports including local study progress. **`deck-import.test.ts`** covers RFC-style quoted CSV parsing, BOM/newline handling, kanji-column guessing/mapping, stable parsing of one-per-line, compact, tab-separated, commented, non-kanji, and multi-character word input, versioned KanjiForge JSON deck import validation, best-effort Anki `.apkg` SQLite note extraction and malformed-archive rejection, plus non-mutating matched/already-in-target/not-found preview classification. The Settings component test also verifies exact offline dictionary-word enrichment and word content-reference persistence alongside kanji imports.

**`theme.test.ts`** covers persisted-value validation, the 21:00–06:00 local night window, device-theme resolution, and document/browser-chrome theme application. **`settings-screen.test.tsx`** covers anonymous access, offline persistence of a dark preference, restoration of a saved night preference, offline persistence of the study question, independently selected study answer fields including the writing pad, two-tap study mode, adaptive scheduler mode, synthesized-voice autoplay, the inline stroke-animation visibility toggle, restoring the default study style, app-icon badge preferences, storage-protection denial/retry messaging, the Saved deck direct-vs-confirm preference, validated RSS link-out sources with offline persistence and removal, the one-click attributed Japanese Wikinews preset, renaming and restoring the starter deck name with an outbox mutation, creating a custom deck with an outbox mutation, assigning offline folders to decks, deleting the Saved deck after confirmation while preserving the built-in deck, resetting starter-deck colors while preserving review totals, resetting starter-deck statistics while preserving flags, copying the starter deck as tab-separated text, previewing and confirming matched and unknown input from text, CSV, JSON, and Anki package imports, appending imported cards to an existing custom deck without touching Saved, transferring studied starter-deck progress to matching Saved cards while preserving Saved flags, backup restore, and the stale-backup warning with its recovery action. **`rss-feeds.test.ts`** covers URL safety, label derivation, malformed-data cleanup, de-duplication, list limits, add/remove behavior, and the attributed Japanese Wikinews preset. **`deck-folders.test.ts`** covers folder-label normalization and deterministic grouping. **`deck-progress.test.ts`** covers shared-card selection, SRS-field copying, destination-flag preservation, and idempotent no-op planning. **`auto-backup.test.ts`** covers persistent-folder capability detection, chosen-folder storage, complete backup writes, and the once-per-day write interval.

**`backup.test.ts`** covers the locked v1 backup schema, malformed/cross-account rejection, complete export metadata including sticky annotations, non-destructive restore with review-log replay, and the 30-day backup-reminder threshold. The Settings component test covers restoring a same-account JSON file through the file picker and showing the stale-backup warning.

**`deck-combine.test.ts`** covers source-order de-duplication, first-N truncation after de-duplication, and invalid-limit rejection. The Settings component test covers composing a selected source deck into a custom deck with a first-N limit and sync-ready membership mutations.

### `src/features/share` — 11 cases

**`share-screen.test.tsx`** covers parsing the PWA GET share-target payload, safe external article URL link-out, previewing shared Japanese text against the offline dictionary, automatically analyzing shared article text offline with readings/furigana, analyzing pasted Japanese text with offline readings/meanings and links to offline word details, bulk-saving deduplicated unsaved dictionary words with atomic membership and outbox mutations, and importing matched kanji into Saved with atomic membership and outbox mutations.
It also covers validating a content-only deck URL, previewing the shared deck name, and importing its matched cards.

**`analyzer-settings.test.ts`** covers persisted furigana, rōmaji, and inline/on-tap gloss
preferences, malformed-value defaults, and reading romanization. The share-screen suite verifies
that these preferences load offline and that tap-to-reveal glosses remain hidden until requested.

**`src/features/settings/deck-share.test.ts`** covers deterministic content-only URL payloads, omission of SRS progress, and malformed/empty payload rejection.

**`src/pwa/daily-reminder.test.ts`** covers daily reminder time validation, next-occurrence rollover, and due-card counting. **`storage-persistence.test.ts`** covers unsupported browsers, a granted request, and the once-only post-session request marker. The Settings component test covers saving a permissioned daily reminder and its local time offline.

### `src/pwa` — 10 cases

**`index.test.tsx`** covers client registration of the build-generated `/sw.js` worker and the browser-safe fallback when service-worker registration is unavailable or rejected. **`app-badge.test.tsx`** covers due/new versus total/off count semantics and the supported-browser badge update/clear lifecycle. **`daily-reminder.test.ts`** covers reminder time validation, next-occurrence rollover, and due-card counting; the Settings component test covers permissioned offline persistence.

### `src/auth` — 11 cases across 3 files

- **`client.test.ts`** (6, new) — request origin with `NEXT_PUBLIC_API_URL` unset vs. set (the exact
  bug diagnosed in `MVP-STATUS.md`), offline fallback to a cached session, cache cleared when the
  server reports no user, `signOut()` clears the cache and calls the endpoint, `signIn()` caches on
  success and throws on failure.
- **`runtime.test.ts`** (2, pre-existing) — anonymous rejection, account-switch teardown.
- **`no-anonymous.test.ts`** (3, pre-existing, parameterized) — every user-data entry point
  (`openLocalUserDatabase`, `startOutboxFlusher`, `startShapeSubscription`) rejects an empty user id.

### `src/lib` — 5 cases

**`device-id.test.ts`** (new) — stability across calls, localStorage persistence, reuse of an
existing id, safe `'server'` placeholder without `window`, generation via `crypto.randomUUID()`.

### `apps/api` — 10 cases across 5 files

`mutations.test.ts` covers complete review, metadata, and sticky-annotation mutation validation, removal of
body-supplied user identity, review/mutation id matching, supported-type handling, and the
batch-size limit. `env.test.ts` and `schema.contract.test.ts` continue to cover backend
configuration and the server projection schema. `sync.test.ts` covers the authenticated snapshot
projection against a contract-shaped database double. `electric.test.ts` covers the authenticated
shape URL's table allow-list, parameterized tenant filter, cursor forwarding, and request-header
boundary; database integration coverage remains deferred until the local Postgres stack is
available in CI.

### `scripts/build-packs`

`fetch-sources.test.ts` (1), `build-names-pack.test.ts` (2), `build-decks.test.ts`
(5), `build-similar-pack.test.ts` (3) all pass. `pipeline.test.mjs` (7 cases, 5 failing) — see
[Known issues](#known-issues).

`src/core/text/analyzer.test.ts` (4) covers the offline analyzer's indexed written-form and kana
reading matches, longest-word preference, unknown-text preservation, token limits, and common
inflected surfaces resolving to dictionary lemmas with surface readings. `inflect.test.ts` (3)
covers ichidan, godan, and i-adjective surface generation. A full IPADIC/UniDic morphological
tokenizer remains a separate optional-pack follow-up.

---

## E2E (Playwright)

`playwright.config.ts` runs Chromium + WebKit (WebKit matters — OPFS/iOS storage eviction is a named
architecture risk) against a `pnpm dev` web server, with the `predev` pack-copy step confirmed to run
first.

| Spec | What it covers | Status in this environment |
|---|---|---|
| `e2e/auth.spec.ts` | Sign-up through the real form, sign-out returns to the auth screen | 4 browser passes (Chromium + WebKit) in the configured local run |
| `e2e/offline-study.spec.ts` | Sign in → start a session → go offline → grade a card → **reload while offline** → assert the grade survived (remaining-count check, plus a best-effort direct OPFS file check where the browser supports it) → back online | 1 Chromium/WebKit pass and 1 skip in the configured local run; requires the Postgres/better-auth stack when `NEXT_PUBLIC_API_URL` is unavailable |
| `e2e/fixtures.ts` | Shared `registerUser()` (via API request, not the UI) and an `authedUser` fixture so specs don't each re-drive the sign-up form | n/a (helper, not a spec) |

**To actually run these:** start the API stack (`deploy/docker-compose.yml`), set
`NEXT_PUBLIC_API_URL`, then:

```bash
pnpm exec playwright install --with-deps chromium webkit
pnpm test:e2e
```

---

## CI gates

- **`.github/workflows/ci.yml`** — runs on every push/PR: build, lint (`format:check` +
  `eslint`), `pnpm test:coverage` (thresholds enforced here), Playwright install + `pnpm test:e2e`,
  then the existing pack-pipeline verification. Coverage and Playwright HTML reports upload as
  artifacts on failure.
- **`.github/workflows/pr-validation.yml`** — a fast, single-Node PR gate: `format:check`, `build`,
  `test:coverage`. Not yet wired into GitHub branch protection as a *required* check — that repo-settings
  change needs a maintainer with admin rights.

---

## Known issues

No known unit-test failures in the current local run. The E2E specs still skip when the auth
backend is not configured or running; see [E2E](#e2e-playwright) for the required setup.

---

## Running it yourself

```bash
pnpm test              # fast run, no coverage
pnpm test:coverage      # full run with the coverage table + threshold gate
pnpm test:watch         # watch mode
pnpm format:check       # prettier --check .
pnpm lint               # eslint
pnpm exec playwright install --with-deps chromium webkit && pnpm test:e2e
```
