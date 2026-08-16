# KanjiForge repository guidance

**KanjiForge** is a free, open-source, offline-first Japanese kanji and vocabulary study PWA—an open alternative to StickyStudy Japanese for every platform.

### The idea in one paragraph

Every study item is a **sticky** with a **color** (belt-rank ramp). New through mastered is visible progress. Answer a card correctly four times in a row and it advances to mastered. Zoom out and your whole deck is a wall of color turning over weeks. That legibility—spaced repetition you can *see* rather than a black box of ease factors—is what makes StickyStudy special, and it is what KanjiForge reproduces as an installable web app with data you own and **account sync** across devices when online.

## Documentation set

**The MVP shipped.** Work now is driven by [`docs/FEATURE-PARITY.md`](docs/FEATURE-PARITY.md) (feature backlog) and [`docs/ux-backlog.md`](docs/ux-backlog.md) (UX loop queue), not by the old TRD/PRD phase plan. Read the **Live** docs below for current work; the **Archived** docs are historical context only — read them to understand *why* something was decided, not to find out what to do next.

Every subtree under `src/` and `scripts/build-packs/` also has its own `README.md` — read the one for the area you're touching before making changes; it names the invariants and test files an exploration would otherwise have to re-derive.

### Live

| Document | What it covers | Read it when |
|---|---|---|
| [`docs/implemented-already.md`](docs/implemented-already.md) | Current, evidence-based snapshot of what is implemented, tested, or stubbed | First — before trusting any other doc's claims about current state |
| [`docs/FEATURE-PARITY.md`](docs/FEATURE-PARITY.md) | StickyStudy inventory → **long-term vision and current feature backlog** | Picking up the next feature to build |
| [`docs/ux-backlog.md`](docs/ux-backlog.md) | GNHF UX loop queue (Loops A–E), driven by [`docs/gnhf-ux-prompt.md`](docs/gnhf-ux-prompt.md) | Working a UX/accessibility/responsive fix |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Short decision log from MVP scoping | When something feels "already decided" |
| [`docs/BRAND-DESIGN-LANGUAGE.md`](docs/BRAND-DESIGN-LANGUAGE.md) | Palette, belt-rank ramp, type, components, motion, a11y | Before `src/ui/` or any styling change |
| [`docs/SRS-SPEC.md`](docs/SRS-SPEC.md) | Scheduler in implementable detail | Before `src/core/srs` |
| [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) | Datasets, licenses, ETL | Before `scripts/build-packs/` |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, storage, tiles, PWA, **Electric + outbox** sync | When building |

### Archived (historical context only — paths moved under `docs/archived/`)

| Document | What it covers |
|---|---|
| [`docs/archived/TRD.md`](docs/archived/TRD.md) | The binding MVP ship list, locked decisions, acceptance criteria — MVP is shipped, this is now a historical record |
| [`docs/archived/PRD.md`](docs/archived/PRD.md) | Original product requirements and full P0/P1/P2 catalog predating the MVP cut |
| [`docs/archived/ORCHESTRATION.md`](docs/archived/ORCHESTRATION.md) | The subagent build playbook that implemented the TRD |
| [`docs/archived/MVP-STATUS.md`](docs/archived/MVP-STATUS.md) | Superseded by `docs/implemented-already.md` — do not trust its dates |
| [`docs/archived/TESTING-COVERAGE.md`](docs/archived/TESTING-COVERAGE.md), [`docs/archived/testing-coverage-plan.md`](docs/archived/testing-coverage-plan.md) | Historical testing-coverage planning |
| [`docs/archived/PHASE0-HANDOFF.md`](docs/archived/PHASE0-HANDOFF.md) | Phase 0 data-pipeline handoff notes |

## Documentation maintenance contract

Documentation here is load-bearing: this repo is built largely by autonomous agent loops that read `AGENTS.md` first and follow its links with no human in the loop to notice a 404. Keep the graph correct:

- When you touch a directory that has a `README.md`, update it if your change affects what it describes (a new invariant, a moved file, a changed contract). Don't leave the next agent to discover the change by diffing.
- When you change observable behavior, update the relevant row in [`docs/implemented-already.md`](docs/implemented-already.md).
- If you notice a broken link, a stale path, or a claim that no longer matches the code — anywhere in `docs/`, `AGENTS.md`, or a module `README.md` — fix it in the same session, even if it's unrelated to your task. It costs one edit now versus a wasted exploration for every future agent.

## MVP in one breath

Sign in (no guests) → study **pre-built** decks with level/color SRS → **tile wall** + full dictionary/detail → **simple exam goal** → **local-first** grades with **Electric** multi-device sync when online → **full backup** file.

**Not in first ship:** custom decks, import, writing trainer validation, history charts, text analyzer. See [`docs/TRD.md`](docs/TRD.md).

## Build order (MVP)

Phase 0 is the data pipeline. Nothing else can be trusted until it is reproducible.

```text
0.  Data pipeline + content packs + tile-view perf prototype (gate)
1.  Auth + local DB + SRS + study loop + outbox skeleton + one deck
    → dogfood ≥ 2 weeks
2.  All built-in decks + home + simple goals + browse (tile & list)
3.  Full detail + dictionary + content pack manager
4.  Electric read sync + write API hardened + multi-device E2E
5.  Backup/export + PWA polish, persistence, a11y, perf   ← MVP ships
─── post-MVP ───
v2. Custom decks + import/enrichment
.  History charts, writing trainer, text analyzer, audio packs
```

**Dogfood Phase 1 before Phase 2.** Feature-parity ambition is the main risk to shipping—`docs/FEATURE-PARITY.md` is the north star, and [`docs/TRD.md`](docs/TRD.md) is the runway.

## Sync stance

- **Local database** is the source of truth for grading (works on a plane).
- **Read path** is the authenticated `/api/sync` snapshot, polled while online. **ElectricSQL** is an optional upgrade to live streaming, off by default (`docs/ARCHITECTURE.md` §10.5).
- **Write API + outbox** pushes local mutations to Postgres when online.
- **better-auth**—account required, no anonymous. It and the write API are route handlers in this same Next.js app (`src/server/` + `src/app/api/`), not a separate service: one deployable per environment.
- **Rocicorp Zero** is not used (no offline writes).
- Details: `docs/ARCHITECTURE.md` §10, `docs/TRD.md` D2–D4.

## The three things most likely to go wrong

1. **iOS evicts your users' data.** Request persistent storage; nag for backups; surface denial in Settings—`docs/ARCHITECTURE.md` §7.2.
2. **The tile view is not fast enough.** Prototype in Phase 0 before committing the rest of browse.
3. **Scope.** Do not build import/writing/history charts before the study loop is a daily driver (`docs/TRD.md` kill list).

## Licensing at a glance

**This project is dual-licensed. The code and the data are not under the same terms.**

| What | License | File |
|---|---|---|
| Application and pipeline code (`src/`, `scripts/`) | **MIT** | `LICENSE` |
| Content packs and derived datasets (`packs/`) | **CC BY-SA 4.0** | `LICENSE-DATA` |

- **Attribution:** in-repo (`ATTRIBUTION.md`), in-app (Settings → About → Data sources, offline), and pack manifests.
- **Not usable:** SKIP codes, Heisig RTK, commercial audio, NHK news text—see `docs/DATA-SOURCES.md`.
- Full rationale: PRD §9.1.

## Name

**KanjiForge**—a forge is where raw material becomes something durable through repeated, deliberate work. That is the study loop: the same character, hammered at daily, until it holds.
