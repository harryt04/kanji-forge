# KanjiForge

**A free, open-source, offline-first Japanese kanji and vocabulary study PWA.**
An open alternative to StickyStudy Japanese, for every platform.

---

## The idea in one paragraph

Every study item is a **sticky** with a **color**. Red means new, green means mastered, and the three colors in between are visible progress. Answer a card correctly four times in a row and it turns green. Zoom out and your whole deck is a wall of color turning from red to green over weeks. That legibility — spaced repetition you can *see* rather than a black box of ease factors — is what makes StickyStudy special, and it's what KanjiForge reproduces, as an installable web app with data you own.

---

## Document set

Read in this order.

| Doc | What it covers | Read it when |
|---|---|---|
| **[PRD.md](./PRD.md)** | Product requirements. Users, principles, every MVP feature with priority labels, screen inventory, design direction, success criteria, delivery phases, risks. | Start here. It's the spec. |
| **[FEATURE-PARITY.md](./FEATURE-PARITY.md)** | Complete StickyStudy feature inventory mapped to KanjiForge status, plus the gaps we accept and the places we're better. | To check nothing was missed. |
| **[SRS-SPEC.md](./SRS-SPEC.md)** | The scheduling algorithm in implementable detail: state, config, transitions, queue construction, goal math, statistics, merge semantics, 14 test cases. | Before writing `core/srs`. |
| **[DATA-SOURCES.md](./DATA-SOURCES.md)** | Every dataset, its license, its size, its extraction plan, and what we legally cannot have. Build pipeline requirements. | Before writing anything — Phase 0 depends on it. |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Stack, Next.js static-export config, storage split, tile-view rendering, fonts, PWA hardening, stroke matching, import enrichment, sync design, testing. | When you start building. |

---

## Build order

Phase 0 is the data pipeline. Nothing else can be trusted until it's reproducible.

```
0.  Data pipeline + content packs + tile-view perf prototype
1.  Study loop — data model, SRS engine, review log, one deck
2.  Decks + browse (tile & list)
3.  Reference depth — detail view, strokes, examples, dictionary
4.  Import / export / backup
5.  Goals, history, writing trainer
6.  PWA polish, offline hardening, accessibility, perf   ← MVP ships here
7.  Text analyzer + audio tiering                        ← v1.1, with optional sync
```

**Dogfood Phase 1 for two weeks before starting Phase 2.** Feature-parity ambition is the main risk to this project ever shipping.

---

## The three things most likely to go wrong

1. **iOS evicts your users' data.** IndexedDB and OPFS can be cleared after ~7 days of non-use unless persistence is granted. This is a data-loss bug that will look like the app being broken. Handle it explicitly — ARCHITECTURE §7.2.
2. **The tile view isn't fast enough.** It's the signature feature and it's a 2,500-element 60fps rendering problem. Prototype it in Phase 0, before committing to anything else.
3. **Scope.** StickyStudy is fifteen years of one person's work. The phase list exists to stop you building the dictionary before the study loop works.

---

## Licensing at a glance

**This project is dual-licensed. The code and the data are not under the same terms.**

| What | License | File |
|---|---|---|
| Application and pipeline code (`src/`, `scripts/`) | **MIT** | `LICENSE` |
| Content packs and derived datasets (`packs/`) | **CC BY-SA 4.0** | `LICENSE-DATA` |

The code is permissive on purpose — fork it, close it, sell it, no permission needed. The data is share-alike by obligation, because upstream EDRDG and KanjiVG sources are, and that obligation travels with any redistribution including a proprietary fork's.

- **Attribution:** required in-repo (`ATTRIBUTION.md`), in-app (Settings → About → Data sources, working offline), and in each pack manifest.
- **Not usable at all:** SKIP codes, Heisig RTK, commercial audio libraries, NHK news text. Details and substitutes in DATA-SOURCES §6, §8, §13.
- Full rationale and consequences in PRD §9.1.

---

## Name

**KanjiForge** — a forge is where raw material becomes something durable through repeated, deliberate work. That's the study loop: the same character, hammered at daily, until it holds.
