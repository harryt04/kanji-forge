# KanjiForge — Build Orchestration Playbook

**Audience:** an orchestrating Claude Code session that will implement the MVP by dispatching
work to user-level subagents. **Not** a human runbook — each task block is written so a *cold*
subagent can execute it with only the block + the named spec sections in front of it.

**Build contract:** [`TRD.md`](TRD.md) (binding). Depth specs: [`SRS-SPEC.md`](../SRS-SPEC.md),
[`DATA-SOURCES.md`](../DATA-SOURCES.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md),
[`BRAND-DESIGN-LANGUAGE.md`](../BRAND-DESIGN-LANGUAGE.md). Vision (never the MVP cut list):
[`FEATURE-PARITY.md`](../FEATURE-PARITY.md).

**Scope of this doc:** Phase 0 and Phase 1 are fully decomposed into dispatchable task blocks.
Phases 2–5 are outlined at task-block granularity and are **expanded only when reached** — the
docs' own rule is *don't over-plan past the Phase 1 dogfood gate* (`TRD.md §7`), because the
Phase 0 tile-perf outcome and Phase 1 dogfood learnings will reshape them.

> **Contract state:** the TRD/ARCHITECTURE/SRS-SPEC were amended in the 2026-07-23 scoping
> follow-up (lazy cardStates + derived stickies, sync = reviews+metadata only, Sync Contract
> §15, backup union-by-id, `Saved`-deck `deckMembership`, JLPT pinned-list rule, tile-perf
> fallback ladder). Build against the docs as they stand now.

---

## 1. How to use this playbook

### 1.1 The orchestration loop (per implementation task)

```
dispatch → implement → review (parallel) → consolidate → fix → verify → GATE
```

1. **Dispatch.** Send the task block verbatim to its **named agent** (§2). Blocks list their
   dependencies; respect them. Independent blocks in the same phase may run in parallel.
2. **Implement.** `code-implementor` (or `generic-chore-agent` for mechanical blocks) produces
   the deliverables. **Agents do not commit or push** — they leave a working tree + a summary.
3. **Review.** Run the review agents named in the block's **Review** line **in parallel**
   (`correctness-reviewer`, `architecture-reviewer`, `security-reviewer`,
   `code-quality-reviewer`, `test-coverage-reviewer`). High-stakes blocks (marked ⚠) also get
   `adversarial-review`.
4. **Consolidate.** `consolidation-reviewer` merges all review outputs into one deduped,
   severity-ranked list.
5. **Fix.** `code-implementor` applies the consolidated findings (bounded list → targeted edits).
6. **Verify.** `generic-chore-agent` runs the block's **Done-check** (build/test/lint/assert)
   and reports pass/fail with output. Re-loop on failure.
7. **Gate.** At phase boundaries, stop for the **human gate** (§5). Do not cross a gate
   autonomously.

### 1.2 Task-block contract

Every block has: **Agent**, **Depends on**, **Inputs** (spec sections — the agent reads these,
nothing else needed), **Goal**, **Deliverables** (concrete paths), **Done-check** (a command or
assertion an agent can run to prove completion), **Review** (which reviewers run after).

### 1.3 Global conventions (every agent must honor)

- **Branch, never commit to `master` directly.** One feature branch per task block
  (`t0.3-kanji-etl`); the orchestrator opens PRs after the human gate. `code-implementor`
  leaves the tree dirty; `generic-chore-agent` does the git once approved.
- **`core/` is pure** (`ARCHITECTURE.md §3`) — no React, no DOM, no I/O in `core/srs`,
  `core/text`, `core/stroke`. Testable headless. This is the most important structural rule.
- **TypeScript strict; no `any` in `core/`.** Tailwind v4 + CSS custom-property tokens only
  (`BRAND-DESIGN-LANGUAGE.md §8`) — never hardcode ramp/theme colors.
- **Licenses:** app/pipeline code = MIT (`LICENSE`); every generated pack + deck def +
  `similar.json` = CC BY-SA 4.0 (`LICENSE-DATA`); `ATTRIBUTION.md` at root (`PRD.md §9.1`).
- **Definition of done for any code block:** builds, its Done-check passes, new logic has tests,
  no reviewer CONFIRMED finding left unaddressed.

---

## 2. Agent roster (user-level subagents)

| Agent | Use for | In this build |
|---|---|---|
| **`generic-chore-agent`** | mechanical, well-specified, no-judgment work | repo/backend scaffold, fetch+checksum upstream sources, run ETL/builds/tests/lint, wire fixtures, git/PR ops after gates, collect Done-check output |
| **`code-implementor`** | bounded implementation from a spec or a findings list; targeted minimal edits; **does not commit** | every code deliverable — ETL transforms, `core/srs`, DB schema, write path, study/home UI, E2E tests; also applies consolidated review fixes |
| **`Explore`** | read-only fan-out search | locate patterns/prior art before a block; confirm a spec detail's every reference |
| **`Plan`** | design an implementation approach for a fuzzy block | expanding Phase 2–5 blocks when reached; decomposing the tile renderer |
| **`general-purpose`** | multi-step research/execution | JLPT community-list research (T0.2); Electric shape-auth spike research (T1.5-spike) |
| **`correctness-reviewer`** | logic/edge/async/null defects | after every `core/` and write-path block |
| **`architecture-reviewer`** | structure, dependency direction, repo conventions | after schema, `core/` boundary, sync blocks |
| **`security-reviewer`** | authz, data exposure, injection | after auth, write API, shape-auth, backup/restore |
| **`test-coverage-reviewer`** | missing tests, weak assertions, spec-to-test traceability | after `core/srs` (the 14 cases), outbox, E2E |
| **`code-quality-reviewer`** | style, naming, readability | after UI blocks |
| **`consolidation-reviewer`** | merge reviewer outputs → one triage list | step 4 of every loop with ≥2 reviewers |
| **`adversarial-review`** ⚠ | stress-test high-stakes artifacts | SRS engine, Sync Contract impl, backup/restore, tile renderer |

---

## 3. Phase 0 — Data pipeline + tile-perf prototype  *(GATE 0)*

> Nothing downstream can be trusted until the pipeline is reproducible in CI (`TRD.md §7`,
> `README` build order). No study UI in this phase.

### T0.0 — Repo & client scaffold
- **Agent:** `generic-chore-agent` (init) → `code-implementor` (conventions)
- **Depends on:** —
- **Inputs:** `ARCHITECTURE.md §2, §3, §13`; `TRD.md §5.1`
- **Goal:** Next.js 15 App Router as **static export** (`output:'export'`), React 19, TS strict,
  Tailwind v4, Zustand, Serwist; folder layout per `ARCHITECTURE.md §3`; shadcn/ui **vendored**
  into `src/ui/`; `LICENSE` (MIT) + `LICENSE-DATA` (CC BY-SA 4.0) placeholders; empty `core/`,
  `data/`, `features/`, `scripts/build-packs/` trees; Vitest + Playwright configured.
- **Deliverables:** buildable skeleton, `next.config.js` per §2, `tsconfig` strict, CI workflow stub.
- **Done-check:** `pnpm build` produces a static export; `pnpm test` runs (zero tests OK); lint clean.
- **Review:** `architecture-reviewer`, `code-quality-reviewer`.

### T0.1 — Upstream source acquisition + lockfile
- **Agent:** `generic-chore-agent`
- **Depends on:** T0.0
- **Inputs:** `DATA-SOURCES.md §1–§4, §11`
- **Goal:** Fetch and pin each upstream source to a tagged release/dated snapshot: KANJIDIC2,
  JMdict(_e), JMnedict, KRADFILE/RADKFILE, KanjiVG (tagged release, **not** `main`),
  Tatoeba (`sentences.csv`+`links.csv`+indices), JmdictFurigana. Record `sha256` + license-file
  hash of each in `scripts/build-packs/sources.lock.json`.
- **Deliverables:** `sources.lock.json`, a `fetch-sources` script, cached raw inputs (gitignored).
- **Done-check:** re-running fetch reproduces identical checksums; every source has a recorded license hash.
- **Review:** `security-reviewer` (verify no disallowed source; SKIP/Heisig/Forvo absent — `DATA-SOURCES.md §6, §13`).

### T0.2 — JLPT community-list selection  *(human-approved data decision)*
- **Agent:** `general-purpose` (research) → present recommendation to human → `generic-chore-agent` (pin)
- **Depends on:** T0.1
- **Inputs:** `DATA-SOURCES.md §5`; `TRD.md §4.5` (JLPT rule)
- **Goal:** Identify candidate **openly-licensed** community JLPT kanji+vocab lists, compare
  license/coverage/maintenance, recommend one. **Human picks.** Then pin its version/commit in
  `sources.lock.json` and record provenance for the pack manifest.
- **Deliverables:** a short comparison note; the pinned list in the lockfile; provenance string.
- **Done-check:** chosen list has a verified open license recorded; deck-description caveat text drafted ("community estimate — not official").
- **Review:** `security-reviewer` (license), human sign-off (provenance).

### T0.3 — ETL: KANJIDIC2 → `kanji` pack
- **Agent:** `code-implementor`
- **Depends on:** T0.1
- **Inputs:** `DATA-SOURCES.md §2.1, §6, §11.1`; `ARCHITECTURE.md §4.1`
- **Goal:** Transform KANJIDIC2 → `packs/kanji-vN.sqlite` (literal, codepoint, radicals,
  grade, stroke counts, freq, readings on/kun/nanori with okurigana markers, EN meanings).
  **Strip every `qc_type="skip"` and `qc_type="misclass"` field** and add a pipeline assertion
  that fails the build if any SKIP field survives.
- **Deliverables:** kanji pack builder + output pack + manifest (`id,version,schemaVersion,sha256,sizeBytes,license,attribution,sources[]`).
- **Done-check:** assertion "no SKIP fields in output" passes; kanji count within 5% of prior/expected; pack ≤ size budget.
- **Review:** `correctness-reviewer`, `security-reviewer` (SKIP strip).

### T0.4 — ETL: JMdict → `words-core` pack
- **Agent:** `code-implementor`
- **Depends on:** T0.1
- **Inputs:** `DATA-SOURCES.md §2.2, §2.3, §11.1`; `ARCHITECTURE.md §4.1` (schema sketch, FTS5)
- **Goal:** Build `words-core` (entries with any `*_pri` tag, ~30k) as SQLite with
  `entries/forms/glosses_fts`, packed-JSON BLOB per entry, a derived `commonScore`. `words-full`
  and `names` builders stubbed but **not** bundled.
- **Deliverables:** words-core builder + pack + manifest; FTS5 search verified.
- **Done-check:** offline FTS lookup returns ranked results; `words-core` ≤ ~6 MB compressed.
- **Review:** `correctness-reviewer`, `architecture-reviewer`.

### T0.5 — ETL: KanjiVG → strokes (paths + start points + components)
- **Agent:** `code-implementor`
- **Depends on:** T0.1
- **Inputs:** `DATA-SOURCES.md §3`; `ARCHITECTURE.md §5` (atlas note), `§8` (validation is post-MVP)
- **Goal:** Three derived assets — normalized ordered stroke `d`-strings (109×109), precomputed
  stroke start points, and the `kvg:element` component tree. Chunk stroke JSON by Unicode block.
  Keep in a **separate pack file** with CC BY-SA **3.0** attribution (do not merge with 4.0 data).
- **Deliverables:** stroke builder + chunked outputs + manifest with correct 3.0 attribution.
- **Done-check:** a sample kanji's stroke count/order matches KanjiVG; component tree non-empty for jōyō sample.
- **Review:** `correctness-reviewer`.

### T0.6 — ETL: Tatoeba → `sentences` pack
- **Agent:** `code-implementor`
- **Depends on:** T0.1
- **Inputs:** `DATA-SOURCES.md §4.1, §4.2`
- **Goal:** JA sentences with ≥1 EN translation, length 6–30, ≤5 per word ranked by readability,
  sense-linked via the indices file; JmdictFurigana alignment applied. CC BY 2.0 FR attribution
  (no share-alike) in its own manifest.
- **Deliverables:** sentences builder + pack + manifest; furigana alignment table.
- **Done-check:** target-word highlight + furigana render correctly on a sample; content spot-check note produced.
- **Review:** `correctness-reviewer`.

### T0.7 — `similar.json` generator  *(+ human curation note)*
- **Agent:** `code-implementor`
- **Depends on:** T0.3, T0.5
- **Inputs:** `DATA-SOURCES.md §7`
- **Goal:** Generate visually-confusable sets (component overlap + stroke proximity + radical +
  64×64 pixel similarity), top 6 per char above threshold. Emit `packs/similar.json` (CC BY-SA 4.0,
  ours) + the generator script. Flag the top-200 frequent kanji for human curation (do not block).
- **Deliverables:** generator + `similar.json` + a "curate these 200" checklist.
- **Done-check:** known pairs present (未/末, 己/已/巳); output valid JSON; generator reproducible.
- **Review:** `correctness-reviewer`.

### T0.8 — Built-in deck definitions
- **Agent:** `code-implementor`
- **Depends on:** T0.2, T0.3, T0.4
- **Inputs:** `TRD.md §4.5`; `DATA-SOURCES.md §5.1`; `PRD.md §4.7`
- **Goal:** Emit ordered deck definitions (contentRefs, teaching/frequency order) for the full
  catalog: JLPT K/V N5–N1 (pinned list, caveat in description), School 1–9 (grade 8 split into
  three tiers by freq), Jōyō 1981/2010 (with the 196/5 diff data file + citation), Top 500
  (freq 1–500), Kana (hiragana/katakana/kana-words). Decks are JSON, not SQLite.
- **Deliverables:** `packs/decks/*.json` + the 1981/2010 diff data file with citation.
- **Done-check:** Jōyō-2010 def has 2,136 entries; every JLPT deck description carries the caveat; all contentRefs resolve against kanji/words packs.
- **Review:** `correctness-reviewer`, `architecture-reviewer`.

### T0.9 — Attribution deliverables
- **Agent:** `generic-chore-agent`
- **Depends on:** T0.3–T0.8
- **Inputs:** `DATA-SOURCES.md §12`; `PRD.md §9.1`
- **Goal:** `ATTRIBUTION.md` (full license text + per-source what/how-modified), per-pack manifest
  metadata (already emitted by each builder — verify present), and the source data for the in-app
  "Data sources" screen (offline). 
- **Deliverables:** `ATTRIBUTION.md`; a machine-readable `attribution.json` for the app.
- **Done-check:** every shipped pack appears in `ATTRIBUTION.md` with a verified license (acceptance #10).
- **Review:** `security-reviewer`.

### T0.10 — `packs-dev` fixture
- **Agent:** `generic-chore-agent`
- **Depends on:** T0.3–T0.8
- **Inputs:** `ARCHITECTURE.md §13`
- **Goal:** Tiny committed fixture set (~200 kanji / 500 words / 100 sentences + a couple of
  small decks) so `pnpm dev` works with zero downloads.
- **Deliverables:** `packs-dev/` committed to the repo.
- **Done-check:** fresh clone → `pnpm dev` runs with no network fetch.
- **Review:** `code-quality-reviewer`.

### T0.11 — Pipeline CI + assertions
- **Agent:** `code-implementor`
- **Depends on:** T0.3–T0.9
- **Inputs:** `DATA-SOURCES.md §11`
- **Goal:** One CI-runnable pipeline: reproducible (same lock → byte-identical packs), assertive
  (fails on surviving SKIP field, changed license hash, >5% count drift, over-budget pack, or a
  pack missing `license`/`attribution`), versioned, Brotli-compressed outputs. Scheduled
  monthly-refresh workflow opening a PR with the diff.
- **Deliverables:** `scripts/build-packs` CI entry + assertion suite + refresh workflow.
- **Done-check:** two clean builds diff byte-identical; each assertion demonstrably fails on an injected violation.
- **Review:** `architecture-reviewer`, `security-reviewer`, `test-coverage-reviewer`.

### T0.12 — Tile-view perf prototype  ⚠ *(the GATE-0 measurement)*
- **Agent:** `code-implementor` (build) → **human** (on-device measurement)
- **Depends on:** T0.0
- **Inputs:** `ARCHITECTURE.md §5`; `TRD.md §4.6, §5.5, §9`
- **Goal:** Standalone prototype of the two-mode renderer (canvas ≤28px, glyph-atlas 28–60px,
  DOM >60px) over **synthetic 2,500 tiles**: pinch/wheel zoom, dirty-rect pan, `Uint8Array` level
  array, centroid-anchored zoom. Measure pan fps. If it misses on target hardware, walk the
  **§5.5 fallback ladder** (WebGL → cap workload → list-default) and record the rung reached.
- **Deliverables:** prototype route + a perf report (device, fps, chosen rung).
- **Done-check:** **≥50fps** pan @ ~2,500 tiles on a mid-range 2021 Android **or** a documented
  fallback rung with rationale (`TRD.md §8 #4`).
- **Review:** `adversarial-review` (try to make it jank), `architecture-reviewer`.

**➡ GATE 0 (human):** pipeline reproducible in CI · `ATTRIBUTION.md` complete & verified ·
JLPT list chosen & pinned · tile prototype passes a rung. Only then start Phase 1.

---

## 4. Phase 1 — Auth + local study loop  *(GATE 1: dogfood ≥2 weeks)*

> Goal: a **daily-driver-quality** single-deck study loop, local-first, before any more UI
> surface exists. Everything here is `M0`.

### T1.0 — Backend scaffold (Coolify)
- **Agent:** `generic-chore-agent` (infra) → `code-implementor` (auth/schema)
- **Depends on:** GATE 0
- **Inputs:** `ARCHITECTURE.md §10.5`; `TRD.md §5.2, §15`
- **Goal:** Coolify-deployable services: Postgres 16 (logical replication for Electric),
  better-auth (Drizzle adapter), a write-API service skeleton, and the Electric service pointed
  at Postgres behind TLS. Env per §10.5. Static-host target for the export.
- **Deliverables:** `deploy/` compose/templates, better-auth config, server Drizzle schema (auth + app tables), pinned Electric image/version.
- **Done-check:** stack boots locally; better-auth issues a session; Electric serves a trivial shape.
- **Review:** `security-reviewer`, `architecture-reviewer`.

### T1.1 — Auth gate (no anonymous)
- **Agent:** `code-implementor`
- **Depends on:** T1.0
- **Inputs:** `TRD.md §4.1`; `PRD.md §1.2`; `ARCHITECTURE.md §10.3`
- **Goal:** Sign-in/register shell; unauthenticated users see only marketing/sign-in; on sign-in,
  open the local user DB scoped to `user_id` and start (stub) shape subscription + outbox flusher;
  sign-out clears in-memory session; account-switch never leaks another user's local DB.
- **Deliverables:** auth screens + session→local-DB bootstrap + account-switch isolation.
- **Done-check:** **no guest/anonymous code path exists in the production build** (acceptance #9).
- **Review:** `security-reviewer` ⚠, `correctness-reviewer`.

### T1.2 — Local user DB (engine chosen) + schema
- **Agent:** `code-implementor`
- **Depends on:** T1.1
- **Inputs:** `ARCHITECTURE.md §4.2, §4.3`; `TRD.md §5.1.1, §12 open #1`
- **Goal:** Resolve PGlite vs SQLite-WASM (pick one, document). Schema: `decks`, `deckMembership`
  (Saved-only), **lazy** `cardStates` keyed `(deckId, contentRef)`, append-only `reviews`,
  `sessions`, `settings`, `dailyStats`, `outbox`. **No `stickies` table** — cards derive from
  pack+deck-def. Migrations + repository interfaces (`data/repo`).
- **Deliverables:** schema, migrations, repos, the chosen-engine decision note.
- **Done-check:** a derived deck lists its cards with no per-card rows; a first grade creates exactly one `cardState`.
- **Review:** `architecture-reviewer` ⚠, `correctness-reviewer`.

### T1.3 — `core/srs` pure engine  ⚠
- **Agent:** `code-implementor`
- **Depends on:** T1.2
- **Inputs:** **`SRS-SPEC.md` in full** (§2–§7, §10)
- **Goal:** Pure, headless: `grade.ts` (transitions incl. `redCount<10` forced pass-is-−1,
  `easy`→4), `schedule.ts` (`nextDue`+fuzz-on-write), `queue.ts` (pools, build order,
  interleaving, never-block, deterministic seed), `replay.ts` (log→state, idempotent),
  `goal.ts` (daily target math §6), `types.ts`. Zero React/DOM/I/O.
- **Deliverables:** `src/core/srs/*` + full unit suite.
- **Done-check:** **all 14 `SRS-SPEC.md §10` cases pass** + property tests (replay-twice
  idempotent; level ∈ 0–4; fuzz within ±10%). 100% coverage of `core/srs`.
- **Review:** `correctness-reviewer` ⚠, `test-coverage-reviewer` ⚠, `adversarial-review`.

### T1.4 — Local-first write path
- **Agent:** `code-implementor`
- **Depends on:** T1.2, T1.3
- **Inputs:** `ARCHITECTURE.md §4.3`; `TRD.md §5.3`
- **Goal:** One local transaction per answer — append `review`, upsert lazy `cardState`, bump
  `dailyStat`, enqueue `outbox` row (UUIDv7 = `review.id`) — then advance UI **without awaiting
  network**. Must complete <20 ms locally.
- **Deliverables:** `data/` write path + timing harness.
- **Done-check:** grade→next-card <100 ms p95 local (acceptance #5); airplane mode persists grades.
- **Review:** `correctness-reviewer`, `architecture-reviewer`.

### T1.5 — Outbox worker + write API ingest
- **Agent:** `code-implementor` (impl) — preceded by **T1.5-spike** (`general-purpose`) ⚠
- **Depends on:** T1.0, T1.4
- **Inputs:** **`TRD.md §15` (Sync Contract)**; `ARCHITECTURE.md §10.2–§10.4`
- **Goal:** *Spike first* — confirm the better-auth→Electric **shape-auth** mechanism (§15.4,
  prefer the auth-proxy that server-enforces `where user_id`) against the real Electric image;
  record the choice in §15.4. Then implement: `POST /api/mutations` (idempotent by `review.id`,
  **server forces `user_id` from token**, insert-only reviews / LWW metadata) + the client
  outbox flusher behavior table (§15.5: offline-queue, 401 re-auth, 403 poison, 5xx backoff).
- **Deliverables:** spike note → write API + outbox worker + tests.
- **Done-check:** `data/outbox` tests — offline enqueue, online idempotent flush, replay-safe, auth-failure retry (`ARCHITECTURE.md §12`).
- **Review:** `security-reviewer` ⚠, `correctness-reviewer`, `test-coverage-reviewer`.

### T1.6 — Study screen
- **Agent:** `code-implementor`
- **Depends on:** T1.3, T1.4
- **Inputs:** `TRD.md §4.3`; `PRD.md §4.2`; `BRAND-DESIGN-LANGUAGE.md §3.2–§3.3, §6.2, §7`
- **Goal:** Full-bleed `Sticky` card; tap-to-reveal; three grades via **tap / swipe / keyboard**
  (StickyStudy bindings); color strip + fold overlay + flag; remaining count, timer toggle,
  finish→session summary; **grey stickies** setting; **in-session undo**; `prefers-reduced-motion`
  honored. Study-loop state in Zustand with selective subscriptions (no app-wide re-render).
- **Deliverables:** `features/study/*`, `ui/Sticky`, `ui/LevelChip`.
- **Done-check:** keyboard/swipe/tap + undo covered by Testing-Library tests; reduced-motion path verified.
- **Review:** `correctness-reviewer`, `code-quality-reviewer`, `test-coverage-reviewer`.

### T1.7 — Home + simple goal
- **Agent:** `code-implementor`
- **Depends on:** T1.3, T1.6
- **Inputs:** `TRD.md §4.4, §4.8`; `SRS-SPEC.md §6`
- **Goal:** Current deck, progress % + belt-color encoding (denominator = deck-def size, missing
  cardState = level 0), last studied, big Start; simple goal — target date, days left, **correct
  answers required today**, ahead/behind (recompute daily, missed days redistribute).
- **Deliverables:** `features/home/*` + goal UI wired to `core/goal`.
- **Done-check:** goal shows a sane "correct today" and ahead/behind (acceptance #8); progress % matches SRS-SPEC §7.
- **Review:** `correctness-reviewer`, `code-quality-reviewer`.

### T1.8 — Wire one built-in deck end-to-end
- **Agent:** `generic-chore-agent`
- **Depends on:** T1.6, T1.7
- **Inputs:** T0.8 outputs
- **Goal:** Load one starter deck (e.g. Hiragana or JLPT N5 Kanji) from packs through derived
  stickies into the study loop and home progress.
- **Deliverables:** starter deck selectable and studyable.
- **Done-check:** pick deck → study 20 cards → home progress updates; all offline after first load.
- **Review:** `correctness-reviewer`.

### T1.9 — Offline study E2E  ⚠ *(the one that matters most)*
- **Agent:** `code-implementor`
- **Depends on:** T1.1–T1.8
- **Inputs:** `ARCHITECTURE.md §12`; `TRD.md §10`
- **Goal:** Playwright (Chromium + WebKit): sign-in → study **offline** → grades persist locally →
  reopen → state intact. Two-context sync smoke when API+Electric are up.
- **Deliverables:** `e2e/offline-study.spec`, `e2e/sync-smoke.spec`.
- **Done-check:** offline E2E green on both engines; sync smoke shows device B receiving device A's reviews.
- **Review:** `test-coverage-reviewer` ⚠, `correctness-reviewer`.

**➡ GATE 1 (human):** dogfood the single-deck loop **daily for ≥2 weeks** until it is
daily-driver quality (`TRD.md §7`). Do **not** start Phase 2 until the human confirms.

---

## 5. Human gates (never crossed autonomously)

| Gate | Condition | Who decides |
|---|---|---|
| **G0** | Pipeline reproducible in CI; attribution complete; JLPT list chosen; tile prototype passes a §5.5 rung | Human, after T0.12 report |
| **G0-data** | JLPT community list choice (license/provenance) | Human, in T0.2 |
| **G1** | Phase 1 loop is daily-driver quality after **≥2 weeks** dogfood | Human |
| **G-device** | On-device ≥50fps (or documented fallback) confirmed on real mid-range 2021 Android | Human |
| **G-ship** | Phase 5 complete; acceptance §8 #1–#11 all pass | Human |

---

## 6. Phases 2–5 — outline *(expand with a `Plan` agent when reached)*

Each becomes full task blocks (§1.2 contract) at the top of its phase. Assign implementation to
`code-implementor`, mechanical wiring to `generic-chore-agent`, and the review fleet per §2.

- **Phase 2 — Decks & Browse** (`TRD.md §4.5, §4.6`): all built-in decks in the chooser; deck
  reset/restore/rename; **list view** (virtualized, the §4.6 shipped sort/filter set, inline
  level edit); **tile view** productionized from the T0.12 prototype (⚠ `adversarial-review`);
  manual level override; long-press set-level/flag. *Gate: real-device perf (G-device).*
- **Phase 3 — Reference depth** (`TRD.md §4.7`): kanji/word detail (full fields, hyperlink stack,
  swipe prev/next), `StrokePlayer` (KanjiVG animation, play/pause/step), example words/sentences,
  similar-kanji compare, **dictionary** (auto input-type detect, wildcards, `RadicalGrid`
  multi-radical, stroke/JLPT/grade/freq filters, offline FTS), **Save→`Saved` deck**
  (`deckMembership`), content-pack manager (download/update/delete/resumable).
- **Phase 4 — Sync hardening** (`TRD.md §15`, `ARCHITECTURE.md §10`): Electric read path
  (reviews+metadata shapes, user-filtered) + write API hardened; **multi-device E2E** (acceptance
  #2); ⚠ `security-reviewer` + `adversarial-review` on shape authz and the trust boundary.
- **Phase 5 — Backup + PWA polish + a11y/perf** (`TRD.md §4.9, §4.11`): backup file (locked
  schema) + **union-by-id restore** (acceptance #3); persistence prompt + backup nag; Serwist
  precache + update toast (never mid-session `skipWaiting`); storage `persist()`; safe-areas;
  belt-ramp a11y audit (CVD sim, WCAG AA, 44px, keyboard, reduced-motion, `lang="ja"`);
  Lighthouse-CI perf budgets (`PRD.md §7.2`). *Gate: G-ship.*

---

## 7. Parking lot (do NOT build in MVP)

Writing-trainer validation, history charts/forecast/retention, import/enrichment, custom-deck
CRUD (beyond the `Saved` substrate), text analyzer + tokenizer pack, Anki apkg, Web Push,
UI 日本語, deck folders/sharing, human/neural audio packs, FSRS mode. Tracked only in
`FEATURE-PARITY.md`. Keep `core/` boundaries (import, stroke, text) valid so these drop in later
without a schema break.
```
