# `src/core/`

Pure logic. No React, no DOM, no Node built-ins, no I/O. Everything here is plain functions
over plain data, which is what lets the SRS engine be exhaustively unit tested and reasoned
about without a browser.

**This boundary is enforced, not just convention.** `eslint.config.js` applies a
`no-restricted-imports` rule to `src/core/**/*.ts` that blocks `react`/`react-dom`, Node
built-ins (`fs`, `path`, `os`, `process`, …), and browser globals (`document`, `window`,
`navigator`, `localStorage`, …). If a change to `core/` needs any of those, the logic belongs
in `src/data/` or `src/features/` instead, called with `core/` as a pure function underneath.

The one deliberate exception: `core/text/tokenizer.ts` branches its `kuromoji` import path on
`NODE_ENV === 'test'` (package entry point in tests, browser bundle path otherwise). That's an
environment branch on which module to import, not on Node/browser APIs themselves, so it stays
within the spirit of the rule — don't copy the pattern casually elsewhere in `core/`.

Read `docs/SRS-SPEC.md` before touching `core/srs/`; it's the spec these files implement.

## `core/srs/` — the five-level spaced-repetition engine

| File | What it does |
|---|---|
| `types.ts` | Shared types (`CardState`, `Review`, `Grade`, `SrsConfig`, `CardLevel`) — the source of truth every other file in this directory imports from. |
| `grade.ts` | `applyGrade()` — the state transition for one answer. Deliberately excludes scheduling (see `schedule.ts`); grading and scheduling are two different concerns kept in two files on purpose. |
| `schedule.ts` | `nextDue()` and `seededRandom()` — next-due-date math with fuzz applied at write time. The seeded random source makes writes and tests reproducible; also exports `DAY_MS`. |
| `queue.ts` | Session queue construction and interleaving. A card with no `CardState` is a lazy, brand-new card (never explicitly created) — this is the "lazy-card-state invariant" referenced elsewhere in the docs. |
| `replay.ts` | Projects an append-only review log into current `CardState`s. Dedupes review IDs before sorting, which makes it **idempotent and union-safe** — replaying a merged log from multiple devices produces the same state as replaying it once. |
| `goal.ts` | Daily-target / days-left / on-pace math for the Home screen's goal readout. |
| `retention.ts` | Study-answer retention by the level a review started at. Manual corrections and imported history are excluded — they aren't answers. |
| `adaptive.ts` | An optional adaptive `dueAt`-only scheduling mode layered on the same level model. It only changes the due date, never the level, so toggling it on or off never rewrites study history. |
| `leeches.ts` | Flags cards with `lapses >= LEECH_LAPSE_THRESHOLD` (6) for the Home screen's leech callout. |

Spec/behavior tests: `srs.test.ts` (the core suite — all cases from `docs/SRS-SPEC.md` §10 plus
property tests: replay is idempotent, level stays in 0–4, `dueAt` is monotonic per level) and
`adaptive.test.ts`. `src/core/srs/**` is held to 100% coverage per `docs/ARCHITECTURE.md` §12 —
treat that as a hard floor when touching this directory.

## `core/stroke/` — handwriting stroke matching (Writing feature)

| File | What it does |
|---|---|
| `resample.ts` | Resamples a polyline (KanjiVG guide stroke or user-drawn stroke) to N=32 arc-length points, in raw KanjiVG canvas units (109×109) — see `docs/ARCHITECTURE.md` §8 for why canvas units and not a normalized box. |
| `match.ts` | Scores a drawn stroke against the expected KanjiVG stroke: hard gates (length ratio, reversed direction, centroid/start offset) then a weighted score (start/end distance, chamfer shape distance, length ratio, direction cosine) against a strict/normal/forgiving threshold profile. |
| `order.ts` | The curated exceptions table for characters with accepted alternate stroke orders (e.g. 上, 必, 田-family, 右/左), keyed by zero-based stroke index. |

Tests: `match.test.ts`, `order.test.ts`, `resample.test.ts`. Changes to `match.ts` must be
measured against `scripts/stroke-match-benchmark.ts`, not eyeballed — see
`docs/ARCHITECTURE.md` §8.

## `core/text/` — Japanese text processing

| File | What it does |
|---|---|
| `detect.ts` | Classifies a search-box query as kanji / kanji compound / kana / romaji / English / mixed-script / other, for the dictionary search UI. |
| `furigana.ts` | Parses furigana alignment data shared by sentence-pack access, with fallback for malformed data. |
| `romaji.ts` | Romaji conversion used by dictionary search. |
| `inflect.ts` | Japanese inflection handling used by the offline text analyzer's grammar tokens. |
| `analyzer.ts` | Turns tokenizer output into the analyzer's dictionary-backed, inflection-aware, particle/copula-aware token stream. |
| `tokenizer.ts` | Kuromoji/IPADIC wrapper. Lazy-loaded and failure-safe — see the `NODE_ENV` exception noted above. |

Tests: `analyzer.test.ts`, `detect.test.ts`, `furigana.test.ts`, `inflect.test.ts`,
`romaji.test.ts`, `tokenizer.test.ts`.

## `core/import/` — CSV/TSV/Anki import parsing and enrichment

| File | What it does |
|---|---|
| `parse.ts` | RFC4180-ish CSV/TSV/line parsing: quoted cells, multiline values, BOMs, comments, compact kanji lists. |
| `enrich.ts` | Deduplicates content identities, merges duplicate tags, classifies rows as matched / already-in-target / unresolved. |
| `apkg.ts` | Parses Anki `.apkg` files (via `sql.js` + `fflate`) to preserve Japanese word runs, individual kanji, and note tags for offline preview/import. Anki scheduling and card templates are intentionally not migrated — only content. |

Tests: `import.test.ts` (parse/enrich), plus consumers in `src/data/packs/index.test.ts` and
`deck-import.test.ts` exercise `apkg.ts` end-to-end.

## Where this connects

`core/` is called from `src/data/repo/` and `src/features/*` — it never calls back into either.
See [`src/data/README.md`](../data/README.md) for how `core/srs` results get persisted, and
[`src/features/README.md`](../features/README.md) for which screens drive `core/srs/queue` and
`core/stroke/match`.
