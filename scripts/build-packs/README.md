# `scripts/build-packs/`

The ETL pipeline: turns pinned upstream Japanese-dictionary sources into the SQLite content
packs shipped under `packs/` and the small fixture set under `packs-dev/`. Read
`docs/DATA-SOURCES.md` before changing anything here — it's the license/attribution contract
this pipeline has to keep.

**`index.ts` is not the entry point.** It's an unused leftover with no importers — don't start
here. The real entry points are the `build-*.ts` scripts below plus `pipeline.mjs`.

## What produces each pack

| Script | Produces |
|---|---|
| `fetch-sources.ts` | Downloads and pins upstream sources (KANJIDIC2, JMdict, KanjiVG, Tatoeba, JmdictFurigana) into `.cache/`, recording SHA-256 hashes into `sources.lock.json`. Run with `--refresh` to re-pin. |
| `build-kanji-pack.ts` | `kanji-v*.sqlite` |
| `build-words-core-pack.ts` | `words-core-v*.sqlite` (FTS5 search) |
| `build-words-full-pack.ts` | `words-full-v*.sqlite` — optional full-JMdict tier, same schema as words-core |
| `build-names-pack.ts` | Optional JMnedict names pack |
| `build-strokes-pack.ts` | Chunked KanjiVG stroke-path JSON |
| `build-sentences-pack.ts` | `sentences-v*.sqlite` (Tatoeba example sentences) |
| `build-similar-pack.ts` | Visually-similar-kanji index |
| `build-decks.ts` | Deck definitions: JLPT, school grades, jōyō, top 500, kana, all 12 Kanji Kentei levels |

Each has a matching `npm run build:*` script (see root `package.json`).

## `pipeline.mjs` — the shared assertion/publishing layer

- `--mode ci` (→ `pnpm packs:verify`) validates only the small, committed `packs-dev/` fixture
  set — fast, no network, what CI runs on every push.
- `--mode full` (→ `pnpm packs:full`) validates the full locked sources and writes
  deterministic Brotli-compressed artifacts to `packs/` — what the monthly refresh runs.

`reproducibility.mjs` (→ `pnpm packs:repro`) checks that a rebuild from the same locked sources
produces byte-identical output.

## Budget and drift files

- `pack-budgets.json` — max byte size per pack, for both the full build (`maxBytes`) and the
  committed fixtures (`fixtureMaxBytes`). The pipeline fails the build if a pack exceeds its
  budget.
- `pack-baselines.json` — expected record counts per pack (`counts`/`fixtureCounts`) with
  `maxDriftPercent: 5`. Catches an upstream source silently changing shape/size between
  refreshes.
- `sources.lock.json` — pinned upstream URLs, hashes, and license text hashes. Only
  `fetch-sources.ts --refresh` should touch this.

## Running it

```sh
pnpm fetch:sources          # pin/refresh upstream sources
pnpm packs:refresh          # fetch + build every pack + full pipeline validation
pnpm packs:verify           # fixture-only validation (what CI runs)
pnpm packs:test             # pipeline.test.mjs, fetch-sources.test.ts, strokes-pack.test.ts, build-words-full-pack.test.ts
pnpm packs:repro            # reproducibility check on the locked full sources
```

`packs:test` runs a specific subset of test files — not every `build-*.test.ts` in this
directory is included (e.g. `build-decks.test.ts` runs separately via `pnpm test:decks`,
because it depends on gitignored `packs/*.sqlite` output that only exists after a full refresh,
not in CI's fixture-only mode). If you add a new `build-*.test.ts`, decide deliberately whether
it belongs in `packs:test`, `test:decks`, or neither, rather than assuming it runs somewhere.

## `.cache/`

Downloaded upstream artifacts (gzip/zip, license text) live here. Not meant to be committed —
it's pipeline working state, not pack output.

## Where this connects

Output packs are read by [`src/data/`](../../src/data/README.md) (see `data/packs/` there).
The committed dev fixture set has its own docs: `packs-dev/README.md`.
