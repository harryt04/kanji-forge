# Handoff: Browse → Wall Workbench redesign

**Branch:** `feat/browse-wall-workbench` (forked from `gnhf` at `da7abf5`, **not pushed**, **not merged**)
**Status:** All 6 planned commits landed. `npm run ci` green locally (see caveats below).
**Read this file, then delete it** — it's scaffolding for the next agent, not permanent project documentation. Once the branch is reviewed/merged, this file should not survive into `gnhf`.

## Intent

The landing page sells "your whole deck, as a wall of color," but a signed-in user landed on a form-heavy list view every time — the tile wall existed in the code but was opt-in, buried below ~400px of controls, and only ever showed one hard-coded deck. Harry reviewed three redesign proposals (rendered as a Lavish HTML artifact, see `.lavish/browse-reimagined.html` if it still exists — it's gitignored) and approved **Proposal B, "Wall Workbench,"** with Proposal A's deck gallery folded in as its empty state.

Full design rationale and the six-commit implementation plan (with exact line-number references, contract lists, and cross-cutting solutions) are preserved at `~/.claude/plans/please-build-a-full-tranquil-dolphin.md` on this machine — that plan is the authoritative source if anything here is ambiguous. It also documents three things this session discovered that weren't in the original design brief: a `deckMembership.list()` argument-count footgun, the missing `isCardDue` shared predicate, and a `<details>`/jsdom testing quirk.

## What changed (6 commits, oldest first)

1. **`34dd528` — default the deck view to the tile wall.** Flips `useState<BrowseView>` from `'list'` to `'tiles'`. Adds a stable `data-testid="browse-cards"` wrapper around the whole results region (list, tiles, and both empty states) so e2e specs have a ready-selector that survives either view. Updates the four e2e specs that previously waited on `browse-card-list`.
2. **`778bb88` — stacked level ramp with per-level counts.** New `src/features/decks/deck-summary.ts`: pure `countCardsByLevel`/`summarizeDeckCards`, lifted verbatim out of Home's private `summarizeDeck` so Home and Browse compute identical numbers from one source. `home-screen.tsx` now imports from it; **`home-screen.test.tsx` was never edited** — that's a deliberate gate (see below). New `LevelRamp` component (`src/features/browse/level-ramp.tsx`) renders the 0–4 belt distribution as a stacked bar.
3. **`be7d021` — in-page deck picker.** Adds `loadDeckSummaries()` to `deck-summary.ts` — reads every deck's progress in ~10–15 queries total instead of the ~1,400 a naive approach would cost, by reading built-in content refs from the pack manifest (zero DB reads) and calling `deckMembership.list(deckId)` once per custom deck explicitly. New `DeckRail` component. Browse's layout becomes a three-pane grid (`nav` rail / `section` wall / `aside` inspector), dropping the old max-width clamp.
4. **`459f4d6` — chip bar + contextual bulk bar.** Collapses the always-visible filter form into a wrapping chip row; stroke-range and JLPT move into a native `<details>`/`<summary>` disclosure (closed by default, children only rendered when open — load-bearing for the touch-target/font-size e2e sweeps, which measure anything mounted regardless of visual collapse). Consolidates two separate status paragraphs into one `role="status"` region. Adds a "Select cards" mode: per-card checkboxes only exist in the DOM once it's on, which also fixes a pre-existing defect (44px checkboxes overhanging 42px tiles at 0.75× zoom).
5. **`fc5aa2b` — ramp segments as level filters.** Wires `LevelRamp`'s click handler (built in commit 2 but unused until now) to the same `filters.level` state the `Filter by level` select writes, so both controls can never disagree.
6. **`e94989b` — due-today count per deck.** Extracts `isCardDue()` into `src/core/srs/schedule.ts` (previously this predicate was duplicated between `src/pwa/app-badge.ts` and inlined again in `src/core/srs/queue.ts`). Refactors `countAppBadgeCards` to use it. Adds `dueCount` to `DeckSummary`, threads a pinnable `now` through `loadDeckSummaries` for deterministic tests.

Diff vs. the fork point: 15 files, +1844/−684. Full stat: `git diff gnhf..HEAD --stat` (see caveat below about what "gnhf" means right now).

## Load-bearing invariants the next agent must not break

- **`home-screen.test.tsx` has zero edits across the whole branch.** `DeckShelfItem` is now a type alias for the shared `DeckSummary`. If you ever need to touch that test, the refactor changed behavior — treat that as a bug, not a reason to update the test.
- **`src/core/srs/**` must stay at 100% coverage.** It already does; `isCardDue` has 4 boundary-case tests in `src/core/srs/srs.test.ts` (there is no separate `schedule.test.ts` — this repo keeps one combined `srs.test.ts` per the existing convention, don't split it).
- **The `<details>` filter panel's children must stay conditionally rendered** (`{filtersOpen && (...)}`), not just visually hidden by the closed `<details>`. A closed-but-mounted `<details>` leaves children at `display: block` with a 0×0 rect, which the touch-target and font-size e2e sweeps measure and fail.
- **Every new/edited test in this branch was mutation-checked** (break the code, confirm red, restore) per this repo's testing convention — see `docs/gnhf-ux-prompt.md`. If you add more Browse tests, keep doing this.

## What's verified vs. what isn't

- `npm run build`, `npm run lint`, `npm run test:coverage` (unit-dom + unit-node, 634 tests), `packs:verify`, `packs:test` all ran clean, repeatedly, throughout this session.
- `npm run test:e2e` ran 108 tests: 26 passed (the ones that don't need the auth backend), 82 skipped. **The skip is expected, not a gap I introduced** — every auth-gated spec in this repo does `test.skip(!API_URL)`, and no `NEXT_PUBLIC_API_URL` was configured in this environment. This means **the actual authenticated Browse UI has never been visually verified in a real browser this session** — only through jsdom-rendered unit tests (which do exercise the real component tree and real accessible names, just not real layout/paint). If you have a Postgres + better-auth stack available (`deploy/.env.example` has the shape), running `npx playwright test e2e/ux-layout.spec.ts e2e/ux-touch-targets.spec.ts e2e/ux-form-controls.spec.ts e2e/ux-language.spec.ts e2e/ux-level-labels.spec.ts e2e/ux-fold-overlay.spec.ts` against `/browse` would close that gap.
- No manual/visual QA at 375/768/1440px in both themes was performed (the plan's final-verification step 6 asks for this). Worth doing before merge.

## Important: this branch is now behind `gnhf`

`gnhf` had 10 more commits land on it (two merged PRs: an SEO/discoverability page set and a docs/agent-documentation-overhaul) **during this session**, after `feat/browse-wall-workbench` was forked. None of it touches the same files as this branch (confirmed via diff — the overlap is zero), so a rebase should be conflict-free, but **do that rebase before opening a PR**:

```bash
git checkout feat/browse-wall-workbench
git rebase gnhf
```

### Why this matters / a caution about this working directory

This repo directory (`/Users/harry/Documents/git/kanji-forge`) is the **primary worktree** — `git worktree list` also shows `kanji-forge-docs-worktree` and `kanji-forge-seo` as separate directories for the two branches above. Those are separate directories and could not have touched files here directly. What actually happened: **this same directory's checked-out branch changed underneath the session more than once** — most likely the user (or another process) ran `git checkout` / merged PRs into `gnhf` in this same directory while this session was working. That produced a long stretch of this session seeing unrelated files (`AGENTS.md`, `docs/implemented-already.md`, `src/lib/site.ts`, `deploy/README.md`, `HANDOFF-WRITING-PRACTICE.md`, etc.) flip between modified/deleted/renamed with no action taken by this session. **None of that was this session's doing** — every commit here was made with an explicit file pathspec (never `git add -A`) specifically to avoid sweeping in that unrelated churn, and it was verified after every commit via `git diff gnhf..HEAD --stat` that only this session's intended files were included.

If you're picking this up: run `git status` and `git branch --show-current` before assuming anything about what's checked out in this directory — it may not be what you expect.

## Suggested next steps

1. `git rebase gnhf` on this branch (see above), re-run `npm run ci` after.
2. Get a Postgres + better-auth stack running locally and run the full authenticated e2e suite against `/browse` — this is the one thing the plan asked for that couldn't be done this session.
3. Manual visual pass at 375/768/1440px, both themes, per `docs/ARCHITECTURE.md`'s requirement to check the tile view at three zoom levels in both themes.
4. Open a PR. Six commits, each independently `npm run ci`-clean, conventional-commit messages — should read cleanly top to bottom.
5. Delete this file once it's served its purpose (it's a handoff note, not project documentation — don't let it rot into `docs/archived/` alongside the real historical docs).
