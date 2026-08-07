# Testing Coverage Plan — kanji-forge

## Context

KanjiForge has good testing *intentions* and thin testing *reality*. `docs/ARCHITECTURE.md` §12
already specifies the target strategy, and `docs/ORCHESTRATION.md` makes "new logic has tests"
part of the definition of done for every block. But the repo currently has **10 test files / ~21
test cases** covering a codebase where the first end-to-end study loop just landed (commit `8475b74`).

The audit found four distinct problems:

1. **Infrastructure gaps.** `vitest.config.ts` configures no coverage, no setup file, and forces
   `jsdom` on every test including Node-only pipeline scripts. `@testing-library/jest-dom` is
   installed but never loaded. `@vitest/coverage-v8` is installed but never invoked.
2. **A broken E2E harness.** `playwright.config.ts` points at `./e2e`, which does not exist, and
   imports `@playwright/test` — which is **not in `devDependencies`** (only bare `playwright` is).
   The E2E suite cannot run today. ARCHITECTURE.md §12 calls the offline-study E2E "the one that
   matters most. Write it in Phase 1." Phase 1 is now.
3. **Coverage gaps in exactly the code that just shipped.** `src/features/study/store.ts` (223 LOC,
   the largest piece of stateful logic in the app), `study-screen.tsx`, `home-screen.tsx`,
   `deck-loader.ts`, `auth/client.ts`, and the `data/db` migration/persistence layer have **zero
   tests**. `src/data/repo/index.test.ts` has a single test case.
4. **No PR gate.** `.github/workflows/ci.yml` runs on `push` and `pull_request`, but nothing in
   this repo's branch configuration requires it to pass before a PR can merge, and it does not run
   a formatting check even though `prettier` + `prettier-plugin-tailwindcss` are already installed
   and a `prettify` (write) script exists — there is no `check`-mode equivalent.

Meanwhile `src/core/srs/` is genuinely well tested (14 spec cases + property tests) and should be
locked in at 100% rather than allowed to drift.

**Intended outcome:** a test suite that matches ARCHITECTURE.md §12, gated in CI with per-directory
coverage thresholds and a required PR-validation workflow, so that Phase 2+ feature work cannot land
untested or unformatted.

### Decisions taken (confirmed with user)

- Implement the **full §12 strategy**: infrastructure + unit gaps + Testing Library component tests
  + the offline Playwright E2E.
- CI **hard-fails on per-directory coverage thresholds**: 100% on `src/core/srs`, a lower global
  floor that ratchets up over time. Stubs and `src/prototype/` are excluded from the denominator.
- Add a **required PR-validation GitHub Action** that runs `build`, `test`, and a `prettier --check`
  formatting check, and blocks merge on failure.

### Scope note — stubs are not coverage targets

The audit confirmed `src/core/text/*`, `src/core/stroke/*`, `src/core/import/*`,
`src/data/sync/index.ts`, and most of `src/features/*/index.ts` are 8–18 line `TODO(Tx.x)`
placeholders exporting a single constant. Writing tests for these is busywork. They are **excluded
from coverage**, and the exclusion list is the mechanism that forces a test when each is really
implemented (removing a file from the exclusion list is part of that block's work).

---

## Phase 0 — Write `docs/implemented-already.md`

The user separately asked for a written record of what is actually implemented today.
`docs/MVP-STATUS.md` covers similar ground but is **dated 2026-08-02 and now stale** — it still
lists "Study screen: Not started", "Home and simple goals: Not started", and "Authentication
backend: Partial", all of which were superseded by commits `831840d` and `8475b74`.

`docs/implemented-already.md` is a current, evidence-based snapshot covering:

- **Implemented & tested:** `core/srs` (all 5 modules + types), `data/db` (SQLite-WASM, OPFS,
  migrations, schema v1 / 10 tables), `data/repo` (7 repositories + atomic `recordGrade()`),
  `auth/runtime.ts` (user-scoped isolation, no-anonymous enforcement at 3 entry points),
  `apps/api` env validation + schema contract, `scripts/build-packs` ETL (6 pack builders + CI
  pipeline + reproducibility check).
- **Implemented, untested:** `features/study` (store, screen, deck-loader, adapters),
  `features/home/home-screen.tsx`, `auth/client.ts`, `auth/auth-gate.tsx`, `data/packs/index.ts`,
  `lib/device-id.ts`, `src/prototype/tile-wall/` (Phase 0 perf prototype).
- **Stubs / seams only:** `data/outbox` (no-op), `data/sync` (no-op), `core/text`, `core/stroke`,
  `core/import`, browse/detail/dictionary/history/settings/writing features, `POST /api/mutations`
  (returns 501), `src/pwa/index.ts`.
- **Corrections to MVP-STATUS.md** called out explicitly, with the commit that superseded each row.

This doc is a prerequisite for Phase 5 (it defines which files are legitimately exempt from
coverage) and should be cross-linked from `docs/README.md`.

---

## Phase 1 — Test infrastructure

**Files:** `vitest.config.ts`, new `test/setup.ts`, new `test/factories.ts`, `package.json`

1. **Split Vitest into projects by environment.** Today `environment: 'jsdom'` is applied globally,
   including to `scripts/build-packs/*.test.ts` and `apps/api/src/*.test.ts`, which are Node code.
   Use `test.projects` (Vitest 2 API):
   - `unit-node` → `scripts/**`, `apps/api/**`, `src/core/**` — `environment: 'node'`
   - `unit-dom` → `src/{data,features,auth,lib,ui}/**` — `environment: 'jsdom'`

   This also enforces the `core/` purity rule at runtime: if `core/` ever reaches for a browser
   global, the Node project fails, complementing the existing `eslint.config.js`
   `no-restricted-imports` rule for `src/core/**`.

2. **Add `test/setup.ts`** wired via `setupFiles`, importing `@testing-library/jest-dom/vitest`
   (already a devDependency, currently unused) and registering a global `afterEach(cleanup)`.

3. **Enable coverage** in `vitest.config.ts`: `provider: 'v8'`, `reporter: ['text', 'lcov',
   'json-summary']`, with an explicit `exclude` list covering the stub files enumerated in Phase 0,
   `src/prototype/**`, `src/types/**`, `*.config.*`, and `src/app/**/page.tsx` route shells.

4. **Extract shared fixture factories to `test/factories.ts`.** `srs.test.ts` and
   `data/repo/index.test.ts` each define their own local `state()` / `card()` / `review()` helpers.
   Consolidate these — reuse them rather than writing new ones in every new test file. Keep the
   existing naming and the `fuzzPercent: 0` determinism convention from `srs.test.ts`.

5. **Add scripts:** `test:coverage` (`vitest run --coverage`), `test:e2e`
   (`playwright test`), `test:e2e:ui`, and `format:check` (`prettier --check .`) — the check-mode
   counterpart to the existing `prettify` write script, needed by Phase 5's PR-validation workflow.

---

## Phase 2 — Fill unit/integration gaps

Match the existing conventions: fixture-builder helpers, real SQLite-WASM (not mocks) for the data
layer as `src/data/repo/index.test.ts` already does, and `afterEach` lifecycle cleanup.

| Target | New test file | What to cover |
|---|---|---|
| `src/core/srs/goal.ts` | extend `src/core/srs/srs.test.ts` | `goalTarget()`, `projectedCompletion()`, `progress()` — needed to hit the 100% `core/srs` gate |
| `src/core/srs/schedule.ts` | extend `srs.test.ts` | `seededRandom()` determinism, `intervalDays()` per level, `dueAt` monotonicity property |
| `src/data/db/migrations.ts` + `schema.ts` | `src/data/db/migrations.test.ts` | Idempotent re-run, version bookkeeping, fresh-DB v0→v1, all 10 tables created |
| `src/data/db/index.ts` | `src/data/db/index.test.ts` | Write-chain serialization under concurrent writes, close/reopen persistence, per-`userId` namespace isolation |
| `src/data/repo/index.ts` | expand `index.test.ts` (1 → ~12 cases) | `recordGrade()` atomicity + rollback, outbox row shape, daily-stat rollup, session lifecycle, settings round-trip, each repo's happy path |
| `src/features/study/store.ts` | `src/features/study/store.test.ts` | **Highest value.** `start()`/`reveal()`/`grade()`/`undo()`/`finish()`; undo snapshot restores prior card state; "Again" requeue matches `requeueAfterAgain()`; session summary tallies; persistence failure does not corrupt in-memory queue |
| `src/features/study/adapters.ts` | `src/features/study/adapters.test.ts` | `contentRef` ↔ `stickyId` round-trip in both directions |
| `src/features/study/deck-loader.ts` | `src/features/study/deck-loader.test.ts` | Loads from `packs-dev` fixtures, lazy deck registration, missing-deck and missing-kanji handling |
| `src/auth/client.ts` | `src/auth/client.test.ts` | `getSession()` offline fallback to cached localStorage identity; `signOut()` clears cache; `NEXT_PUBLIC_API_URL` unset → correct base URL (the exact bug diagnosed in MVP-STATUS.md) |
| `src/data/packs/index.ts` | `src/data/packs/index.test.ts` | `parseContentRef()` valid/malformed input, `getKanjiByLiterals()` against `packs-dev`, pack cache behavior |
| `src/lib/device-id.ts` | `src/lib/device-id.test.ts` | Stable across calls, persists to localStorage, returns safely under `typeof window === 'undefined'` |

`data/outbox` is intentionally **not** listed — it is a no-op stub. ARCHITECTURE.md §12 requires
"enqueue, idempotent flush, auth failure retry, offline buffer" tests, and ORCHESTRATION.md T1.4
already assigns them. Those tests belong to the T1.4 block that implements it, not to this plan.

---

## Phase 3 — Component tests (Testing Library)

ARCHITECTURE.md §12 requires "Study keyboard/swipe/tap + undo". `@testing-library/react` is already
installed; Phase 1's setup file makes it usable.

**Files:** `src/features/study/study-screen.test.tsx`, `src/features/home/home-screen.test.tsx`

- **Study screen:** reveal-on-tap; keyboard grading (each key → correct grade dispatched); swipe
  gestures via synthetic pointer events; undo button restores the previous card; session-summary
  screen renders correct totals; `prefers-reduced-motion` path (ORCHESTRATION.md T1.7 done-check).
- **Home screen:** progress bar reflects store state; goal-date input drives ahead/behind
  calculation via `core/srs/goal`; empty/loading/error states.

Drive these through the real Zustand store with a seeded fixture deck rather than mocking it — the
store's interaction with the screen is the thing worth testing.

---

## Phase 4 — Playwright E2E

**This phase has a hard blocker: `@playwright/test` is not installed.** `package.json` lists only
`playwright@^1.48.2`, but `playwright.config.ts` imports `@playwright/test`. Add
`@playwright/test` to `devDependencies` first — the E2E suite has never been runnable.

**Files:** new `e2e/` directory (does not exist), `playwright.config.ts`

1. `e2e/auth.spec.ts` — sign-in smoke (MVP-STATUS.md "Remaining Build Sequence" step 1). Requires
   the API stack; guard with `test.skip()` when `NEXT_PUBLIC_API_URL` is unset so it degrades
   gracefully instead of failing CI.
2. `e2e/offline-study.spec.ts` — **the priority test.** Sign in → start a session → `context.
   setOffline(true)` → grade N cards → reload → assert grades persisted in OPFS → back online.
   ARCHITECTURE.md §12: "The offline study E2E is the one that matters most. Write it in Phase 1."
3. `e2e/fixtures.ts` — auth storage-state fixture so specs don't each re-drive the login form.

Update `playwright.config.ts`: keep Chromium + WebKit (WebKit matters — OPFS/iOS storage eviction is
a named risk in the docs), and confirm the `webServer` block works with the `predev` pack-copy step.

**Defer:** the two-context sync smoke (needs T1.4 mutation API + T4.0 Electric — both stubs today)
and the §12 visual-screenshot suite for the tile wall (Phase 0 prototype, not a shipping surface).
Note both as follow-ups rather than attempting them now.

---

## Phase 5 — CI gating and coverage thresholds

**Files:** `.github/workflows/ci.yml`, `vitest.config.ts`

1. **Per-directory coverage thresholds** in `vitest.config.ts` via `coverage.thresholds`:
   - `src/core/srs/**` → **100%** on lines/functions/branches/statements (ARCHITECTURE.md §12
     mandates this explicitly)
   - `src/data/**` → 85%
   - `src/features/**` → 70%
   - global floor → **60%**, documented as a ratchet: raise it whenever it is comfortably exceeded,
     never lower it.

   Set the initial numbers *after* Phase 2/3 land and the real figures are known — do not guess
   thresholds and then write tests to them.

2. **`ci.yml` changes (this is the existing `push`/`pull_request` workflow, kept as-is in role):**
   - Replace `pnpm test` with `pnpm test:coverage` so thresholds actually gate.
   - Add a Playwright job: `pnpm exec playwright install --with-deps chromium webkit` + `pnpm
     test:e2e`, running only on Node 20 (browser installs are slow; the Node 18/20 matrix adds
     nothing for E2E).
   - Upload the coverage report and Playwright HTML report as artifacts on failure.
   - Keep the existing `packs:verify && packs:test` step unchanged — it works.

3. **Node matrix note:** CI tests Node 18 and 20 while `engines` requires `>=18.17.0`; the
   `setup-node` step pins bare `'18'`, which can resolve below 18.17. Pin to `18.17` or drop 18 —
   worth confirming with the user rather than silently changing the support matrix.

---

## Phase 6 — Dedicated PR-validation GitHub Action (required check)

**New file:** `.github/workflows/pr-validation.yml`. **Modified:** `package.json` (adds
`format:check`, from Phase 1).

The existing `ci.yml` already runs on `pull_request`, but there is currently **no branch protection
requiring it to pass**, and it does not check formatting. Per the user's explicit request, add a
standalone, clearly-named PR-validation workflow so it can be wired into branch protection as a
required status check independently of the broader CI workflow's evolution:

```yaml
name: PR Validation

on:
  pull_request:
    branches: [master, main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - name: Format check
        run: pnpm format:check
      - name: Build
        run: pnpm build
      - name: Test
        run: pnpm test:coverage
```

Key points:

- **`pnpm format:check`** runs `prettier --check .` (new script from Phase 1). `prettier.config.js`
  and `prettier-plugin-tailwindcss` already exist in this repo but are only ever invoked in
  write-mode (`prettify`) — nothing currently fails a PR for unformatted code. This closes that gap.
- **`pnpm build`** and **`pnpm test:coverage`** run exactly what the user asked for ("build tests").
  `test:coverage` (not bare `test`) so the same coverage thresholds from Phase 5 apply here too.
- **The job must fail the PR, not just report.** Because each step is a plain non-`continue-on-error`
  `run:`, any non-zero exit fails the job, which GitHub already surfaces as a failing PR check. To
  make it **block merging** rather than merely show red, branch protection on `master` must list
  `PR Validation / validate` as a **required status check** — this repo-settings change cannot be
  made from a plan file and needs the user (or a maintainer with admin rights) to enable it in
  GitHub's branch protection settings after this workflow first runs successfully once.
- This workflow intentionally does **not** duplicate `ci.yml`'s pack-pipeline verification or
  multi-Node matrix — it is a fast, single-Node PR gate. `ci.yml` continues to run its fuller matrix
  on `push` and `pull_request` for defense in depth; the two are complementary, not redundant.

---

## Verification

Each phase is independently verifiable; run these in order.

```bash
pnpm test:coverage
```

- Phase 1: all 10 existing test files still pass under the new project split; coverage table prints.
- Phase 2: `src/core/srs` reports 100%; `data/` and `features/study` coverage rises materially.
- Phase 3: component tests pass in the `unit-dom` project.

```bash
pnpm exec playwright install --with-deps chromium webkit && pnpm test:e2e
```

- Phase 4: `offline-study.spec.ts` passes on both Chromium and WebKit. Manually confirm it *fails*
  when offline persistence is deliberately broken — an E2E that cannot fail is not a test.

```bash
pnpm lint && pnpm format:check && pnpm build
```

- Must stay clean; `eslint src --max-warnings 0`, the `src/core/**` import restriction, and
  formatting all still hold.

Finally, push a branch and open a PR to confirm both workflows gate as intended:

- Temporarily deleting a `core/srs` test case should turn `ci.yml` red on the 100% threshold.
- Temporarily un-formatting a file (e.g. inconsistent indentation) should turn `PR Validation` red
  on `pnpm format:check`, and — once branch protection is configured per Phase 6 — should block the
  merge button.
