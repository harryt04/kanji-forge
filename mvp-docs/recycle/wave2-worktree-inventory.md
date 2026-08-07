# Wave 2 Worktree Inventory

**Generated:** 2026-07-25  
**Main branch:** `t0.0-scaffold` (based on recent commits)  
**Stale base commit for all worktrees:** `4134d48` ("updated mvp docs")

## Main Repository Status

- **Active branches matching `t0.*`:**  
  - `t0.0-scaffold` (current)  
  - `t0.3-kanji-etl`  
  - `t0.4-words-etl`  
  - `t0.5-strokes-etl`  
  - `t0.6-sentences-etl`  

- All four ETL branches point to the **same commit**: `556160a` ("Fix build after merging T0.1 + T0.12...")

- `scripts/build-packs/.cache/` size: **1.2G** (contains upstream data)

- No `next` or `pnpm` dev servers running (`pgrep` returned nothing).

- Main `sources.lock.json` (131 lines, full T0.1+ sources including Tatoeba, KanjiVG, JLPT, etc.) has SHA256: `14d0917d...`

## Worktree Inventory

### 1. `.claude/worktrees/agent-a73bbe80b2d45ac5c` (T0.3 kanji)

- **Root `package.json`**: No
- **scripts/build-packs/**: Yes (builder + support files)
  - `build-kanji-pack.js` (355 lines)
  - `verify-pack.js`
  - `sources.lock.json` (7 lines, **different** — only kanjidic2, SHA256 `693139e8...`)
  - `package.json`, `package-lock.json`, `README.md`, `node_modules/`
  - `.cache/` present
- **packs/**: Yes
  - `kanji-v1.sqlite` (1.9MB)
  - `kanji-v1.manifest.json`
- **Salvageable deliverables**: Yes — complete kanji builder (`build-kanji-pack.js`), output SQLite + manifest.
- **Git status**: Uncommitted `?? packs/` and `?? scripts/`
- **node_modules**: Yes (in build-packs/)

**Status: SALVAGEABLE (strongest kanji builder)**

### 2. `.claude/worktrees/agent-a1afc5a27c2f1a4a5` (T0.4 words-core)

- **Root `package.json`**: No
- **scripts/build-packs/**: Yes
  - `build-words-core-pack.ts` (14k lines — main)
  - `build-names-pack.ts`, `build-words-full-pack.ts`
- **packs/**: Not present (empty or never built)
- **Salvageable deliverables**: Builder scripts only (no output packs)
- **Git status**: Uncommitted `?? scripts/`
- **node_modules**: No
- **sources.lock.json**: Not present

**Status: PARTIALLY SALVAGEABLE (builders only, no packs)**

### 3. `.claude/worktrees/agent-ac4755ac56f50bf21` (T0.5 strokes)

- **Root `package.json`**: No
- **scripts/build-packs/**: Yes
  - `build-strokes-pack.ts`
  - `sources.lock.json` (matches main, 6443 bytes)
  - `.cache/`
- **packs/strokes/**: Yes — substantial outputs
  - `manifest.json`
  - Multiple `strokes-*.json` files (total ~8.7MB)
- **Salvageable deliverables**: Yes — strokes builder + large JSON pack outputs
- **Git status**: Uncommitted `?? packs/` and `?? scripts/`
- **node_modules**: No

**Status: SALVAGEABLE (strokes pack + builder)**

### 4. `.claude/worktrees/agent-ad2c51f3daa68c4c4` (T0.6 sentences)

- **Root `package.json`**: No
- **scripts/build-packs/**: Yes (most complete)
  - `build-sentences-pack.ts` (511+ lines)
  - `verify-sentences-pack.ts`
  - `sources.lock.json` (matches main)
  - `package.json`, `package-lock.json`, `node_modules/`, large `.cache/`
- **packs/**: Empty (no outputs generated)
- **Salvageable deliverables**: Excellent builder scripts (`build-sentences-pack.ts` looks production-grade)
- **Git status**: Uncommitted `?? scripts/`
- **node_modules**: Yes (in build-packs/)

**Status: SALVAGEABLE (best sentences builder)**

## Summary

**Salvageable worktrees (have builders/packs):**
- **T0.3 kanji** (agent-a73bbe80b2d45ac5c) — **Highest priority** (working SQLite pack + JS builder)
- **T0.5 strokes** (agent-ac4755ac56f50bf21) — Good JSON packs + TS builder
- **T0.6 sentences** (agent-ad2c51f3daa68c4c4) — Strongest TS builder (memory-efficient streaming design)

**Mostly junk/empty:**
- **T0.4 words-core** (agent-a1afc5a27c2f1a4a5) — Only builders, no output

All four worktrees are based on the ancient commit `4134d48`. The ETL branches (`t0.3-kanji-etl` etc.) have moved forward to `556160a`. The builders in the worktrees appear to be the most valuable artifacts from the failed Wave 2 dispatch.

**Recommendation:** Extract the three strong builders (`build-kanji-pack.js`, `build-strokes-pack.ts`, `build-sentences-pack.ts` + supporting files) and the generated packs into the main `scripts/build-packs/` structure.

**Report written to:** `/Users/harry/Documents/git/kanji-forge/mvp-docs/wave2-worktree-inventory.md`
