# KanjiForge — Technical Requirements Document (MVP)

**Product:** KanjiForge  
**Doc version:** 1.0 — MVP implementation contract  
**Status:** Approved from scoping session (2026-07-22)  
**Supersedes for build order:** conflicting MVP scope in older PRD phase notes where this doc is more specific  
**Does not supersede:** `FEATURE-PARITY.md` (long-term vision inventory — leave intact)

---

## 1. Purpose

This TRD defines what **ships as the first usable KanjiForge MVP**: enough of StickyStudy’s value to dogfood daily study (legible SRS + color wall + reference depth + multi-device continuity), without custom decks, import UX, writing trainer, or history charts.

Implementers should treat this document as the build contract. Use companion specs for depth:

| Doc | Role |
|---|---|
| `PRD.md` | Product principles, full feature catalog with P0/P1/P2 (updated for MVP vs later) |
| `FEATURE-PARITY.md` | StickyStudy inventory → eventual parity target (unchanged) |
| `SRS-SPEC.md` | Scheduler algorithm |
| `DATA-SOURCES.md` | Packs, licenses, ETL |
| `ARCHITECTURE.md` | Stack, storage, tile renderer, Electric sync |
| `BRAND-DESIGN-LANGUAGE.md` | Visual system |

---

## 2. Product framing (MVP)

### 2.1 One-sentence MVP

**Sign in once, study pre-built JLPT/kanji decks offline with a five-level color SRS, see the whole deck as a zoomable color wall, look anything up in a full offline dictionary, keep a simple exam goal, and pick up on another signed-in device when online — with a full file backup as escape hatch.**

### 2.2 Primary persona

**JLPT candidate** — commute-sized sessions, built-in level decks, goal date, reliable offline after first load.

Secondary personas (classroom import, completionist writing, Anki migration) are **acknowledged but not served** in MVP beyond what falls out of shared infrastructure.

### 2.3 Non-goals for this MVP

Explicitly out of scope (see `FEATURE-PARITY.md` for eventual intent):

- Anonymous / guest use
- Custom decks, empty decks, combine/first-N, transfer progress, remove duplicates
- Import (paste/CSV/Anki) and import enrichment UX
- Writing trainer / stroke validation / writing-as-answer
- History bar charts, forecast, retention diagnostics, heatmap
- Text analyzer, share target, news
- Human audio packs (device TTS optional stub only if cheap)
- FSRS mode, social, monetization, native stores, hanzi
- Maintainer-run multi-tenant public SaaS (self-host only)

### 2.4 Value thesis (what “80%” means here)

| Slice | MVP investment |
|---|---|
| Color wall + level SRS | Full |
| Daily study loop | Full |
| Multi-device account continuity | Full (Electric + local-first) |
| Reference / dictionary | Full PRD depth |
| Simple exam goal | In |
| Pre-built decks | Full catalog |
| Custom content / import | Deferred (v2) |
| Writing trainer | Deferred |
| History analytics | Deferred |

---

## 3. Locked decisions

| # | Decision | Choice |
|---|---|---|
| D1 | App name | **KanjiForge** only |
| D2 | Sync stack | **ElectricSQL** (Coolify) + **better-auth** + **Postgres** + **local SQLite/PGlite** + **write outbox/API** |
| D3 | Auth | **No anonymous.** Sign-in required before study. Every user row has `user_id` from creation |
| D4 | Local-first | Study reads/writes hit **local DB first**; network never blocks grading |
| D5 | Built-in decks | **Full PRD set** day one. JLPT decks use one **pinned, openly-licensed community list** labeled "community estimate," selected in Phase 0 (§4.5) |
| D6 | Pack delivery | **Starter bundled** (enough for first session); remaining packs **on-demand download** |
| D7 | Custom cards/decks | **v2** |
| D8 | Import | **Deferred** with custom decks |
| D9 | Export / backup | **Full backup/restore + per-deck export** in MVP |
| D10 | Writing | **Defer trainer**; **stroke-order animation** in detail remains |
| D11 | Goals | **Simple goal** (date, today’s correct target, ahead/behind) |
| D12 | History | **Home progress + goal only**; charts later |
| D13 | Dictionary / detail | **Full** PRD §4.5–4.9 depth |
| D14 | Tile view | **Full hybrid** canvas→DOM; Phase 0 perf gate |
| D15 | Platforms | **iOS Safari PWA, Android Chrome, desktop** browsers |
| D16 | Hosting | Maintainer **Coolify** stack; static client + mandatory backend services |
| D17 | Undo | **In-session undo last answer** |
| D18 | Long-term vision doc | `FEATURE-PARITY.md` **not edited** this session |

---

## 4. Functional requirements (MVP)

Priority: **M0** = ship blocker · **M1** = ship with MVP unless schedule breaks · **M2** = specified for architecture only / post-MVP.

### 4.1 Accounts and session

- **[M0]** Email/password or other better-auth methods as configured; no guest path in UI or API.
- **[M0]** Unauthenticated users only see marketing/sign-in shell.
- **[M0]** After sign-in, client opens local user DB scoped to `user_id` and starts Electric shape subscriptions + outbox flusher.
- **[M0]** Sign-out clears in-memory session; local encrypted/scoped data handling per ARCHITECTURE (do not leak user A’s rows to user B on shared device).

### 4.2 SRS engine

Implement `SRS-SPEC.md` in full for core transitions:

- **[M0]** Levels 0–4, three grades, pass-is−1 (+ force when &lt;10 reds), stage intervals + time-to-green UI, recycle, new-per-session, fuzz, never-block queue, manual level override.
- **[M0]** Append-only `reviews` log; `cardStates` via `replay()`.
- **[M0]** In-session **undo** last answer (append compensating review or tombstone per SRS-SPEC/ARCHITECTURE — pick one approach and test).

### 4.3 Study screen

- **[M0]** Full-bleed card, reveal, grade via tap / swipe / keyboard (StickyStudy bindings).
- **[M0]** Per-deck study style: at least word / reading / meaning on Q and A (writing pad field hidden until writing ships).
- **[M0]** Color strip, flag, remaining count, timer toggle, finish → session summary.
- **[M0]** Grey stickies setting.
- **[M1]** Two-tap study mode.
- **[M1]** Device TTS playback control if trivial; label “Synthesized voice”; no human audio pack required.

### 4.4 Home

- **[M0]** Current deck, progress % + color encoding, last studied, big Start.
- **[M0]** Simple goal: target date, days left, **correct answers required today**, ahead/behind.
- **[M0]** Deck chooser entry (pre-built decks only).

### 4.5 Decks (pre-built only)

- **[M0]** Deck chooser: name, progress %, color bar, last studied.
- **[M0]** All built-in decks from PRD §4.7 (JLPT K/V N5–N1, school 1–9, jōyō old/new, top 500, kana set).
  - **JLPT deck source (resolved mechanism; specific list selected in Phase 0).** The 10 JLPT decks have **no official source** (`DATA-SOURCES.md §5` — the Japan Foundation stopped publishing lists in 2010). Phase 0 must: (1) select **one** openly-licensed community JLPT list, (2) **pin its exact version/commit in `sources.lock.json`** and record provenance in the pack manifest, (3) make **every JLPT deck description state "community estimate — not an official list"**, and (4) allow **local per-sticky JLPT-tag correction**. Do **not** present JLPT levels as fact. School-grade / jōyō / top-500 decks are unambiguous (straight from KANJIDIC2 `grade`/`freq`) and carry no such caveat.
- **[M0]** Rename display name (optional), reset colors, restore built-in to original, per-deck SRS + study style + goal overrides.
- **[M0]** No create-custom, combine, transfer, import-append in MVP UI.

### 4.6 Browse

- **[M0]** Tile view: pinch/wheel zoom, pan **≥50fps** at ~2,500 tiles (Phase 0 gate — the single tile-perf number across all docs; see §5.5 for the miss-path fallback ladder), configurable tile content, tap → detail.
- **[M0]** List view: virtualized; inline level edit. **Shipped MVP sort set:** deck order, level, JLPT level, stroke count, frequency, alphabetical (kana), last reviewed. **Shipped MVP filter set:** level/color, flagged, stroke-count range, JLPT level, text search within deck. (Remaining PRD §4.4 sorts/filters — grade, times reviewed, date added, has-audio, contains-radical — are post-MVP.)
- **[M1]** Multi-select bulk level/flag (nice; cut if late).
- **[M0]** Long-press / overflow: set level, flag (no “move to deck” until custom decks).

### 4.7 Detail + dictionary (full depth)

- **[M0]** Kanji detail: readings (on/kun/nanori), meanings, stroke count, radical, components, grade, JLPT, freq, jōyō, stroke animation play/pause/step, example words, example sentences, similar-looking kanji, hyperlink stack, swipe prev/next in deck, **save to deck → the per-user `Saved` system deck** (§5.1.1 `deckMembership`; built-in decks are NOT save targets since their membership is derived). The PRD "save to Saved vs. always ask" setting is post-MVP — with only one user-writable deck there is nothing to ask.
- **[M0]** Word detail: forms, furigana, POS, senses, common tag, kanji breakdown links.
- **[M1]** Audio button on word/kanji detail: **present only if device-TTS ships** (§4.3 — TTS is M1 "if trivial"). When no TTS and no recorded pack, the button is **hidden** (PRD §4.13 tiered resolution). This makes PRD §4.13's "P0 audio" concrete for MVP: the *tiered-resolution logic* is in, but device-TTS (the only MVP source) is M1, so audio is effectively M1. No human audio pack in MVP.
- **[M0]** Dictionary: kanji/kana/rōmaji/English, wildcards, multi-radical, stroke/JLPT/grade/freq filters, offline once packs installed, save to deck.
- **[M0]** Names pack optional download (JMnedict), not required for core study.

### 4.8 Goals (simple)

- **[M0]** Set/clear target date per deck.
- **[M0]** Compute today’s required correct count; show ahead/behind; recompute daily; missing days redistribute (per SRS-SPEC §6 simplified path).
- **[M1]** Unrealistic-pace warning (&gt;200/day) with suggest extend date.
- **[M2]** Rest days / weekday-only.

### 4.9 Backup and export (no import)

- **[M0]** **Full backup file (locked schema).** A single JSON file:
  ```jsonc
  {
    "format": "kanjiforge-backup",
    "version": 1,                 // schema version; restore rejects unknown major
    "exportedAt": 1690000000000,
    "user": { "id": "…", "email": "…" },   // metadata only, no secrets
    "decks":         [ /* deck metadata + per-deck settings/overrides */ ],
    "settings":      [ /* global settings key/value */ ],
    "deckMembership":[ /* Saved-deck rows: contentRef, order, addedAt */ ],
    "reviews":       [ /* the COMPLETE append-only review log */ ]
  }
  ```
  **`cardStates` are deliberately NOT in the file** — they are derived by `replay(reviews)` on restore. The review log + deck/settings/membership is the whole of study state.
- **[M0]** **Restore = union-by-id then replay (non-destructive).** Import unions `reviews` by `review.id` with whatever already exists, LWW-merges `decks`/`settings`/`deckMembership` by `updatedAt`, then re-runs `replay()`. **Reuses the exact §5.4 merge machinery.** Restoring a stale backup can never destroy newer history. The acceptance-criteria "wipe → restore → identical" path (§8 #3) is simply the special case where the existing set is empty. No destructive "replace" mode in MVP.
- **[M0]** Per-deck export CSV/JSON (progress + content refs).
- **[M0]** Backup nag if none in 30 days; stronger copy if storage persistence denied.
- **[M0]** **No** import UI in MVP (restore of KanjiForge's own backup file is not "import" — it is the escape hatch of principle 4).

### 4.10 Settings (MVP slice)

- **[M0]** Theme light/dark/auto (+ 21:00–06:00 night).
- **[M0]** SRS defaults, grey stickies, session summary, tile defaults, font scaling.
- **[M0]** Content pack manager (download/update/delete/sizes).
- **[M0]** Data: backup, restore, delete all local+server user data, storage persistence status.
- **[M0]** About → data sources / licenses (offline).
- **[M1]** Auto-play TTS; inline stroke animations toggle.

### 4.11 PWA / platform

- **[M0]** Installable manifest; SW precache shell; offline study after packs present.
- **[M0]** `navigator.storage.persist()` after first completed session; Settings warning if denied.
- **[M0]** Safe areas, standalone, theme-color, update toast (never mid-session swap).
- **[M0]** a11y: level not color-only; belt-rank ramp; 44px targets; keyboard; reduced-motion; WCAG AA; `lang="ja"` on Japanese text.

### 4.12 Explicitly deferred (do not build in MVP)

Writing trainer validation, history charts, import/enrichment, custom deck CRUD, text analyzer, Anki apkg, Web Push, UI 日本語, deck folders/sharing.

---

## 5. Technical architecture (MVP contract)

Detail lives in `ARCHITECTURE.md`. Non-negotiables:

### 5.1 Client

- Next.js static export SPA, React 19, TypeScript strict, Tailwind v4, Zustand, Serwist PWA.
- **UI primitives:** **shadcn/ui vendored (copied into `src/ui/`, not an npm dependency)** on **Radix** primitives — see `BRAND-DESIGN-LANGUAGE.md` §0/§6. This is compatible with the "no heavy component library" stance (`ARCHITECTURE.md` §1.1) and is not relitigated; a TRD-only reader should know Radix is in the dependency set.
- **Content:** SQLite-WASM (or equivalent) over OPFS for packs.
- **User data:** local SQLite/PGlite (OPFS) — source of truth for study loop.
- **`core/` pure:** srs, replay, goal math, (stroke match deferred with writing).

#### 5.1.1 Card data model (locked)

- **Stickies for built-in decks are derived, not stored.** A deck's card set is computed at
  read time from `(content pack + deck definition)`. There are **no per-user sticky rows** for
  built-in decks and therefore none to sync.
- **`cardState` rows are created lazily — only on first touch** (first grade / manual level
  set / flag). An untouched card is **implicitly level 0**. This keeps a fresh account's user
  DB near-empty regardless of how many built-in decks exist.
- **Progress math consequence:** `SRS-SPEC.md §7` `progress = Σ(level) / (4 × cardCount)` uses
  `cardCount` = the **deck-definition size** (not a row count), and any card with no `cardState`
  contributes level 0. State this so the denominator is never mistaken for "touched cards."
- **The one exception — the `Saved` system deck.** A single per-user `Saved` deck has
  **user-writable membership** (the destination for Detail/Dictionary "Save to deck", §4.7).
  Its membership lives in a `deckMembership` table
  `{ user_id, deckId:'saved', contentRef, order, addedAt, updatedAt }`, synced like other user
  metadata. It is the **only** user-mutable-membership deck in MVP and is explicitly the minimal
  substrate that v2 custom decks generalize — **not** a reopening of custom-deck scope (D7).

### 5.2 Backend (Coolify)

| Service | Role |
|---|---|
| Postgres 16 | better-auth + app tables (system of record when online) |
| better-auth | Accounts, sessions, JWT for Electric proxy/auth |
| API (write path) | Authenticated ingest of outbox mutations → Postgres |
| Electric | **Read-path** sync: Postgres shapes → clients |
| Static host | Exported web app |

### 5.3 Local-first write path (critical)

```
UI grade → local DB transaction (review + cardState + dailyStat)
        → enqueue outbox row
        → advance UI (do not await network)

Outbox worker (online) → POST /api/... → Postgres
Electric shape → other devices / refresh local projection
```

- Airplane mode: study fully works; outbox drains later.
- **Rocicorp Zero is rejected** (no offline writes).
- **PowerSync is not the chosen engine** (Electric + custom write path is).

### 5.4 Sync semantics (locked)

**What crosses the wire is only an immutable, id-keyed log plus metadata — so "merge" is a set-union and clobbering local optimistic writes is impossible by construction.**

- **Electric streams `reviews` (filtered to the signed-in `user_id`) + deck/settings/`deckMembership` metadata only.** `cardStates` are **never synced** — every device derives them locally via `replay()`.
- Incoming Electric rows land in a **sync-inbox**, then a merge step **unions `reviews` by `review.id`** into the local append-only log and **re-runs `replay()`**; deck/settings/`deckMembership` resolve **LWW per field via `updatedAt`**.

| Data | Merge |
|---|---|
| `reviews` | Append-only; **set-union by `review.id`**; never mutate. Sync-inbox → union → replay |
| `cardStates` | **Never synced. Always derived via `replay()`** (no LWW cache in MVP) |
| decks / settings / `deckMembership` | LWW per field via `updatedAt` |
| outbox | Idempotent server apply by mutation id (= `review.id` for review appends) |

> **Scaling note (post-MVP):** the `reviews` log is unbounded and now fully replicated to every device, and `replay()` is O(reviews). Fine at MVP volumes (tens of thousands). A replay **checkpoint/snapshot** (periodic materialized state + tail replay) is a documented post-MVP scaling item — do not build it now, but keep `replay()` pure so it can be added without a schema break.

### 5.5 Tile view

Two-mode renderer per ARCHITECTURE §5; Phase 0 prototype is a **gate** before Phase 2 browse polish. Target: **≥50fps** pan at ~2,500 tiles on mid-range 2021 Android (§4.6, §9).

**The gate has a defined miss-path — it is not "hit 50fps or stop."** If the Phase 0 canvas prototype misses on target hardware, descend this fallback ladder and pick the highest rung that passes; record which rung in the Phase 0 report:

1. **Try WebGL** before conceding (ARCHITECTURE §5 already permits it for the low-zoom mode).
2. **Cap the workload:** reduce the maximum zoomed-out tile count shown at once, and/or raise the DOM↔canvas threshold so fewer tiles are ever live.
3. **Last resort:** default Browse to the **list view**, with the tile wall demoted to a capped "overview" rather than the primary browse surface.

The signature feature **degrades gracefully**; it never blocks the rest of the MVP. Only a total failure of all three rungs is a product-rescope trigger.

### 5.6 Packs

- Bundled: minimal shell assets + starter pack (N5-capable study + words-core subset as defined in DATA-SOURCES).
- On demand: remaining JLPT decks’ backing data, full words, sentences, strokes chunks, names.
- Explicit install UI; resumable; never silent multi‑hundred‑MB cache.

---

## 6. Screen inventory (MVP)

| # | Screen | MVP? |
|---|---|---|
| 0 | Sign-in / register | Yes |
| 1 | Onboarding (pick starter deck, optional goal, later persistence prompt) | Yes |
| 2 | Home | Yes |
| 3 | Deck chooser | Yes |
| 4 | New/custom deck | **No** |
| 5 | Study | Yes |
| 6 | Session summary | Yes |
| 7 | Browse tiles | Yes |
| 8 | Browse list | Yes |
| 9 | Detail | Yes (full) |
| 10 | Writing trainer | **No** |
| 11 | Dictionary | Yes (full) |
| 12 | Text analyzer | **No** |
| 13 | History charts | **No** |
| 14 | Settings | Yes |
| 15 | Import | **No** |
| 15b | Export / backup / restore | Yes |
| 16 | Content packs | Yes |

**Nav:** Study · Browse · Dictionary · Settings (History tab omitted until charts ship; goal lives on Home).

---

## 7. Delivery phases (MVP)

```
0  Data pipeline + ATTRIBUTION + tile perf prototype (gate)
1  Auth + local DB + SRS + study loop + one deck + outbox skeleton
   → dogfood ≥2 weeks
2  All built-in decks + home + simple goals + browse tiles/list
3  Full detail + dictionary + packs manager
4  Electric read sync + write API hardened + multi-device E2E
5  Backup/export + persistence UX + PWA polish + a11y/perf
   → MVP ship
```

**Post-MVP (not this TRD’s ship list):** import/custom decks (v2), writing trainer, history charts, text analyzer, audio packs, richer goals.

Dogfood rule: **do not start Phase 2 until Phase 1 is daily-driver quality.**

---

## 8. Acceptance criteria (MVP done when)

1. New user can register/sign in, install PWA, pick JLPT N5 Kanji, finish 20 cards in &lt;90s after first content ready, then airplane-mode another session with grades persisted locally.
2. Second device, same account, online: receives reviews and matching levels after sync (no manual export).
3. Full backup → wipe local → restore → identical review history and levels.
4. Jōyō-sized deck tile wall pans ≥50fps on mid-range 2021 Android (or documented waiver only if hardware unavailable — prefer real device).
5. Card grade → next card visible &lt;100ms p95 (local path).
6. Dictionary offline search ≤150ms p95 on words-core once installed.
7. Undo reverses last grade in-session.
8. Simple goal shows a sane “correct today” number and ahead/behind.
9. No guest/anonymous code path in production build.
10. Every shipped pack listed in ATTRIBUTION with verified license.
11. Stroke **animation** works for kanji with KanjiVG data; no requirement for stroke **validation**.

---

## 9. Performance budgets

Unchanged from PRD §7.2 unless measured otherwise:

| Metric | Budget |
|---|---|
| App shell JS (gzipped) | ≤200 KB |
| Initial install (shell + starter) | ≤5 MB |
| TTI mid mobile cold | ≤2.5 s |
| Card flip | ≤100 ms p95 |
| Dict search offline | ≤150 ms p95 |
| Tile pan | ≥50 fps @ ~2,500 cards |
| Full dict pack optional | ≤40 MB compressed |

---

## 10. Testing requirements

| Layer | Must cover |
|---|---|
| `core/srs` | SRS-SPEC cases + undo + replay idempotence |
| Outbox | Offline enqueue, online flush, idempotent replay, auth failure |
| E2E | Sign-in → study offline → backup → restore; two-context sync smoke |
| Tile | Perf harness or Playwright scroll/zoom smoke |
| a11y | Keyboard study path; contrast; reduced motion |

Import tests deferred with import feature. Writing matcher tests deferred with writing.

---

## 11. Risks (MVP-specific)

| Risk | Mitigation |
|---|---|
| Electric write-path under-built | Spec outbox + API in Phase 1; multi-device E2E before polish |
| Scope creep back to FEATURE-PARITY | This TRD kill list; parity doc is vision only |
| iOS storage eviction | Persistence prompt + backup nag + install guidance |
| Tile perf | Phase 0 gate |
| Full dict pack size | Tiered packs; starter only bundled |
| Coolify ops | Document compose/template; single maintainer instance |

---

## 12. Open implementation choices (non-blocking)

Resolve during build without reopening product scope:

1. Exact better-auth providers (email magic link vs password).

**Resolved (moved out of “open” — see body):**
- ~~cardStates synced as rows vs derived~~ → **derived only, never synced** (§5.1.1, §5.4).
- ~~Saved-deck mechanism~~ → **`Saved` system deck + `deckMembership` table** (§5.1.1).
- ~~PGlite vs SQLite-WASM for user DB~~ → **SQLite-WASM (`sql.js`) with user-scoped OPFS
  persistence**; it reuses the project’s existing SQLite-WASM dependency/model and avoids adding
  an otherwise-unused PGlite runtime. See `src/data/db/DECISION.md`.

---

## 13. Document maintenance

When implementing:

1. Prefer this TRD for **MVP scope disputes**.
2. Prefer `FEATURE-PARITY.md` for **eventual** feature questions.
3. Prefer `SRS-SPEC.md` / `DATA-SOURCES.md` for algorithm and data truth.
4. Update `ARCHITECTURE.md` if Electric/outbox details change in code.

---

## 14. Summary checklist for implementers

- [ ] No anonymous  
- [ ] Local-first grades + outbox  
- [ ] Electric read sync + Coolify Postgres/auth/API  
- [ ] Full pre-built decks; no custom/import  
- [ ] Full dictionary/detail; stroke play not write  
- [ ] Simple goals; no history charts  
- [ ] Tile hybrid + Phase 0 gate  
- [ ] Undo; backup/export; persistence UX  
- [ ] Dogfood Phase 1 before expanding UI surface  

---

## 15. Sync Contract (write path + shape authorization)

> **Status: M0 for Phase 4; gates acceptance criterion #2.** This appendix replaces the
> "per Electric + app conventions" hand-wave. `ARCHITECTURE.md §10` covers topology; this
> section is the **contract the client and server must agree on**.
>
> **Spike first.** The one genuinely uncertain part is the **better-auth → Electric shape
> authorization** mechanism (§15.4). Prototype *only that* against the real Electric image in
> Phase 1 before Phase 4, then confirm the choice here. Everything else below is buildable
> from this spec.

### 15.1 Write endpoint

Single authenticated ingest endpoint for outbox drains:

```
POST /api/mutations
Authorization: Bearer <better-auth session/JWT>
Content-Type: application/json

{ "mutations": [ Mutation, ... ] }      // batch; ordered; ≤N per request
```

Response: `200 { "applied": [mutationId, ...], "rejected": [{id, reason}] }`.
Batch is **all-or-nothing per mutation**, never per-batch — a rejected mutation must not
block its siblings.

### 15.2 Mutation payload schema

Mirrors the local `outbox` row (`ARCHITECTURE.md §4.2`). MVP mutation types:

```jsonc
// mutType: "review.append"  — the hot path
{ "id": "<UUIDv7>",           // == review.id; the idempotency key
  "mutType": "review.append",
  "payload": { /* full Review record, SRS-SPEC §2.2 */ } }

// mutType: "deck.upsert" | "settings.upsert" | "deckMembership.upsert"
{ "id": "<UUIDv7>", "mutType": "…", "payload": { /* row */, "updatedAt": <ms> } }
```

- **Idempotency key = `mutation.id`.** For `review.append` this is `review.id`. The server
  applies each id **at most once**; re-sending an already-applied id returns success (so an
  outbox that flushed but lost the ack is safe to retry).
- `reviews` are **insert-only** server-side (`ON CONFLICT (id) DO NOTHING`). Metadata upserts
  are **LWW by `updatedAt`** (`DO UPDATE … WHERE excluded.updatedAt > existing.updatedAt`).

### 15.3 Trust boundary (non-negotiable)

- The server **derives `user_id` from the verified session/JWT and stamps it onto every row**.
  It **never** reads `user_id` from the request body. A body that references another user's
  deck/sticky is rejected.
- No anonymous route creates study data (D3). Unauthenticated `POST /api/mutations` → `401`.

### 15.4 Read path / shape authorization

- **Electric shapes are filtered to the caller's `user_id`.** A client receives **only its own**
  `reviews` + deck/settings/`deckMembership` rows.
- Mechanism to confirm in the Phase 1 spike, in order of preference:
  1. **Auth proxy in front of Electric** — the app API validates the better-auth session, then
     issues/injects the shape request with a server-enforced `where user_id = <token uid>`,
     so the filter cannot be tampered with client-side. *(Preferred: keeps trust server-side.)*
  2. **Signed shape params / JWT claims** consumed by Electric's gatekeeper, if the deployed
     Electric version supports it cleanly.
- Whichever wins, the client **must not** be able to widen its own shape to another user.

### 15.5 Outbox flusher behavior (client)

| Condition | Behavior |
|---|---|
| Offline / network error | Keep rows queued; retry with backoff; **never block the study loop** |
| `200 applied` | Delete acked outbox rows |
| `200` for an already-applied id | Treat as success; delete the row (idempotent) |
| `401` (session expired) | Pause flush, trigger silent re-auth; on failure surface "sign in again," keep queue intact |
| `403` (row not owned) | **Poison row** — quarantine, do not infinite-retry, log for diagnostics |
| `5xx` | Backoff + retry |

### 15.6 What is explicitly out of the write contract (MVP)

- No server-side scheduler/`replay()` — the server stores the log; **clients derive state**.
- No real-time presence, no partial-shape pagination tuning, no multi-tenant SaaS quota.
