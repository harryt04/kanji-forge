# KanjiForge — Decision log (MVP scoping)

**Date:** 2026-07-22  
**Binding detail:** [`TRD.md`](./TRD.md)  
**Long-term vision (unchanged):** [`FEATURE-PARITY.md`](./FEATURE-PARITY.md)

This log captures product/architecture choices from the MVP scoping session so they are not re-litigated casually. Prefer TRD for implementation requirements.

| ID | Decision | Choice | Notes |
|---|---|---|---|
| D1 | Product name | **KanjiForge** | No internal codenames in docs/UI |
| D2 | Sync stack | **ElectricSQL** (Coolify) + better-auth + Postgres + local SQLite/PGlite + **write outbox/API** | Local-first; Electric is read-path; we own offline writes |
| D3 | Auth | **No anonymous / no guest** | Sign-in required before study; every row has `user_id` |
| D4 | Offline study | Local DB first; network never blocks grade | Outbox flushes when online |
| D5 | Built-in decks | **Full PRD catalog** day one | JLPT, school, jōyō, top 500, kana |
| D6 | Content packs | **Starter bundled**, rest on-demand download | |
| D7 | Custom cards/decks | **v2** | Dogfood pre-built study UX first |
| D8 | Import (paste/CSV/Anki) | **Deferred with D7** | |
| D9 | Export / backup | **In MVP** | Full backup/restore + per-deck export |
| D10 | Writing trainer | **Deferred**; stroke **animation** on detail stays | |
| D11 | Goals | **Simple** (date, today’s correct target, ahead/behind) | |
| D12 | History charts | **Deferred** | Home progress + goal only in MVP |
| D13 | Dictionary / detail | **Full** PRD depth | |
| D14 | Tile view | **Full canvas→DOM hybrid** | Phase 0 perf gate |
| D15 | Platforms | iOS Safari PWA, Android Chrome, desktop | |
| D16 | Hosting | Maintainer **Coolify**; **one app deployable per environment** (UI + `/api/*` in one Next.js server) + a Postgres resource. Superseded the original static-client-plus-separate-backend split, which cost two deployables per environment. Electric is optional; without it sync polls `/api/sync` | No multi-tenant public SaaS requirement, so static-host portability was not worth the extra deployables |
| D17 | Undo last answer | **In MVP** (in-session) | |
| D18 | FEATURE-PARITY.md | **Not edited** in scoping | Remains final-vision inventory |
| — | Rocicorp Zero | **Rejected** | No offline writes |
| — | PowerSync | **Not chosen** | Electric preferred for Coolify/template path |

## Explicit non-goals for first ship

Custom decks, import, writing validation, history analytics, text analyzer, human audio packs, FSRS, social, native stores, hanzi, guest mode.

## Related doc updates from this session

- Added `TRD.md`
- Updated `PRD.md`, `ARCHITECTURE.md`, `README.md` to match
- Left `FEATURE-PARITY.md` intact by request
