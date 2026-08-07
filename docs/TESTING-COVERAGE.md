# Testing Coverage — current state

**As of:** 2026-08-07, after executing [`testing-coverage-plan.md`](../mvp-docs/testing-coverage-plan.md)
(Phases 0–6). This is a factual snapshot generated from a real `pnpm test:coverage` run — not a
target or an aspiration. Re-run `pnpm test:coverage` to refresh it.

---

## Headline numbers

| | |
|---|---|
| Unit/integration test files | 19 (121 test cases: 121 passing) |
| Component test files | 2 (`study-screen.test.tsx`, `home-screen.test.tsx` — 18 cases, included above) |
| E2E spec files | 2 (`auth.spec.ts`, `offline-study.spec.ts`) — both skip cleanly without a running auth backend |
| Overall statement coverage | **77.58%** |
| `src/core/srs` coverage | **100%** (lines/branches/functions/statements) |
| CI gate | `pnpm test:coverage` runs on every push/PR; per-directory thresholds fail the build if violated |

---

## Per-directory coverage vs. gate

Thresholds are enforced in [`vitest.config.ts`](../vitest.config.ts) (`coverage.thresholds`) and are a
**ratchet**: raise a number when it's comfortably exceeded, never lower one.

| Directory | Threshold | Actual (stmts / branch / funcs / lines) | Status |
|---|---|---|---|
| `src/core/srs/**` | 100% | 100 / 100 / 100 / 100 | ✅ at the floor, mandated by `ARCHITECTURE.md` §12 |
| `src/data/**` | 85% | db 93.2 / 85.4 / 100 / 93.2 · packs 97.3 / 75 / 100 / 97.3 · repo 97.3 / 87.8 / 93.5 / 97.3 | ✅ comfortable margin |
| `src/features/**` | 70% | home 99.3 / 86.2 / 100 / 99.3 · study 97.9 / 79.8 / 77.3 / 97.9 | ✅ comfortable margin |
| Global floor | 60% | 77.58 / 85.49 / 86.88 / 77.58 | ✅ comfortable margin |

**Not yet covered / not in scope for this plan** (pulls the global average down, but doesn't affect
any directory gate above):

| Area | Coverage | Why |
|---|---|---|
| `apps/api/src/{auth,index}.ts`, `apps/api/src/db/**` | 0% | Server-side backend; not exercised by the frontend unit suite. Not part of this plan's Phase 2 list. |
| `src/auth/auth-gate.tsx` | 0% | UI shell; not one of the two Phase 3 component-test targets (`study-screen.tsx`, `home-screen.tsx`). |
| `src/app/layout.tsx` | 0% | Route shell, excluded by convention (`src/app/**/page.tsx` is excluded outright; `layout.tsx` is just never imported by a test). |
| `src/lib/store.ts` | 0% | Legacy/unused file, not referenced by `testing-coverage-plan.md`. |
| `src/features/study/index.ts` | 0% | A four-line re-export barrel; the real modules it re-exports (`store.ts`, `adapters.ts`, `deck-loader.ts`, `study-screen.tsx`) are each independently covered above. |
| `src/prototype/**`, `src/core/{text,stroke,import}/**`, `src/data/{sync,outbox}/**`, `src/pwa/**`, most `src/features/*/index.ts` | excluded from the coverage denominator entirely | Stubs/prototype — see the exclusion list in `vitest.config.ts` and `docs/implemented-already.md`. Removing a file from this list is part of implementing it for real. |

---

## Test inventory

### `src/core/srs` — 19 cases, 100% coverage

`srs.test.ts` — the 15 `SRS-SPEC.md` §10 transition cases plus 3 property/edge-case tests (replay
idempotency, level-domain invariants, schedule/queue/goal boundary helpers) plus a fuzz-bounds case
and the progress-to-belt-rank mapping.
Locked at 100% by the CI gate; this directory should never regress.

### `src/data` — 33 cases across 4 files

- **`db/migrations.test.ts`** (4) — fresh v0→v1 creates all 9 tables, records `applied_at`,
  idempotent re-run, declared-version consistency.
- **`db/index.test.ts`** (6) — empty-userId rejection, per-user namespacing, concurrent-write
  serialization, OPFS persistence across close/reopen (via a fake in-memory OPFS shim), namespace
  isolation with OPFS enabled, post-close rejection.
- **`repo/index.test.ts`** (16, up from 1) — derived-deck projection, `recordGrade()` atomicity
  and atomic manual card-state flag persistence
  (mismatched id rejected, review+state+stat+outbox written together), outbox attempt/removal
  lifecycle, deck-filtered session listing, daily-stat rollup across grades, session start/end, settings round-trip with
  last-write-wins, deck membership save/list/remove, deck upsert/list-by-user, unknown-deck error,
  `reviews.list()` filtering by deck and content ref independently.
- **`packs/index.test.ts`** (7) — `parseContentRef` valid/malformed, deck-definition loading and
  caching against the real `packs-dev` fixture, kanji lookup hit/miss, pack-handle caching.

### `src/features/study` — 32 cases across 4 files

- **`store.test.ts`** (15) — the highest-value target per the plan. Queue construction from a loaded
  deck, empty-deck immediate finish, reveal, `recordGrade()` call shape, index/summary
  advancement, `wentGreen` tally, "again" requeue position matches `requeueAfterAgain()` exactly,
  session finish on last card, **persistence-failure isolation** (a rejected `recordGrade()` leaves
  the in-memory queue/index/summary untouched), no-op on an exhausted queue, undo restores the exact
  prior snapshot, undo writes a compensating manual-source review, undo no-op with nothing to undo,
  and flag/unflag persistence for the current card.
- **`adapters.test.ts`** (2) — `contentRef`↔`stickyId` round-trip in both directions.
- **`deck-loader.test.ts`** (4) — lazy deck registration against real `packs-dev` fixtures, no
  re-registration/re-fetch on a second load, unknown-definition error, tolerant handling of content
  refs missing from the pack.
- **`study-screen.test.tsx`** (11, Testing Library) — sign-in-required state, tap-to-reveal, flag/unflag,
  the
  `motion-reduce:transition-none` class is present, keyboard grading (Space then arrow keys),
  arrow keys ignored before reveal, swipe-gesture grading via synthetic `TouchEvent`s, undo restores
  the previous card and re-disables itself, session-summary totals match store state, and the
  tap-to-show elapsed timer updates while visible, and study-session persistence/closure on finish.

### `src/features/home` — 7 cases

**`home-screen.test.tsx`** (Testing Library) — sign-in-required and loading states, deck progress
with no goal set and its accessible belt-rank label, progress bar reflects a real recorded grade
(via `recordGrade()` against a real local DB), total duration from completed sessions, setting
a goal date drives the on-pace/behind-pace readout, and projected completion compares recent
correct-answer pace against the goal date.

### `src/auth` — 13 cases across 3 files

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

### `apps/api` and `scripts/build-packs` — pre-existing, unchanged by this plan

`env.test.ts` (2), `schema.contract.test.ts` (1), `fetch-sources.test.ts` (1), `build-decks.test.ts`
(5), `build-similar-pack.test.ts` (3) all pass. `pipeline.test.mjs` (7 cases, 5 failing) — see
[Known issues](#known-issues).

---

## E2E (Playwright)

`playwright.config.ts` runs Chromium + WebKit (WebKit matters — OPFS/iOS storage eviction is a named
architecture risk) against a `pnpm dev` web server, with the `predev` pack-copy step confirmed to run
first.

| Spec | What it covers | Status in this environment |
|---|---|---|
| `e2e/auth.spec.ts` | Sign-up through the real form, sign-out returns to the auth screen | Skips via `test.skip(!API_URL, …)` — no `NEXT_PUBLIC_API_URL` / running auth backend here |
| `e2e/offline-study.spec.ts` | Sign in → start a session → go offline → grade a card → **reload while offline** → assert the grade survived (remaining-count check, plus a best-effort direct OPFS file check where the browser supports it) → back online | Same skip guard — this is the priority test per `ARCHITECTURE.md` §12 but requires the Postgres/better-auth stack, which isn't running in this environment |
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
