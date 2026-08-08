# KanjiForge repository guidance

**KanjiForge** is a free, open-source, offline-first Japanese kanji and vocabulary study PWA—an open alternative to StickyStudy Japanese for every platform.

### The idea in one paragraph

Every study item is a **sticky** with a **color** (belt-rank ramp). New through mastered is visible progress. Answer a card correctly four times in a row and it advances to mastered. Zoom out and your whole deck is a wall of color turning over weeks. That legibility—spaced repetition you can *see* rather than a black box of ease factors—is what makes StickyStudy special, and it is what KanjiForge reproduces as an installable web app with data you own and **account sync** across devices when online.

## Documentation set

Read in this order when working on the project:

| Document | What it covers | Read it when |
|---|---|---|
| [`docs/TRD.md`](docs/TRD.md) | **Binding MVP ship list**, locked decisions, acceptance criteria, phases | Start here for implementation |
| [`docs/ORCHESTRATION.md`](docs/ORCHESTRATION.md) | **Build playbook**—subagent task blocks and gates that implement the TRD | When actually building |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Short decision log from MVP scoping | When something feels “already decided” |
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, principles, full feature catalog (P0/P1/P2), screens | Product context; MVP cuts point at TRD |
| [`docs/BRAND-DESIGN-LANGUAGE.md`](docs/BRAND-DESIGN-LANGUAGE.md) | Palette, belt-rank ramp, type, components, motion, a11y | Before `src/ui/` |
| [`docs/FEATURE-PARITY.md`](docs/FEATURE-PARITY.md) | StickyStudy inventory → **long-term vision** (not the MVP cut list) | Eventual parity planning |
| [`docs/SRS-SPEC.md`](docs/SRS-SPEC.md) | Scheduler in implementable detail | Before `core/srs` |
| [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) | Datasets, licenses, ETL | Phase 0 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, storage, tiles, PWA, **Electric + outbox** sync | When building |
| [`docs/implemented-already.md`](docs/implemented-already.md) | Current, evidence-based snapshot of what is implemented, tested, or stubbed | Before trusting `MVP-STATUS.md` dates |

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
