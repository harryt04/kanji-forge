# KanjiForge MVP Status

**Status date:** 2026-08-02  
**Scope source:** [`TRD.md`](TRD.md)  
**Long-term vision:** [`FEATURE-PARITY.md`](../FEATURE-PARITY.md)

This document answers three questions:

1. What are we building in the KanjiForge MVP?
2. What exists in the repository today?
3. What remains before the MVP is usable?

The status is based on the current source tree, not only on committed history. Some implementation work is present in the working tree and may not yet be committed.

## MVP Definition

KanjiForge MVP is an account-required, local-first Japanese study PWA:

1. A user signs in; anonymous study is not supported.
2. The user studies pre-built kanji and vocabulary decks using the five-level SRS.
3. Grades are written to a local SQLite-WASM database first, so study works offline.
4. An outbox later sends mutations to the backend; ElectricSQL synchronizes committed data back to connected devices.
5. The user can see progress through the home screen and tile wall, use the dictionary/detail experience, set a simple goal, and export a backup.

The first MVP deliberately excludes custom cards and decks, import, writing validation, history charts, and the text analyzer. Those remain part of the eventual product vision.

## Status Legend

| Status | Meaning |
|---|---|
| **Implemented** | Source exists for the requirement; it may still need integration or end-to-end verification. |
| **Partial** | A scaffold, data, prototype, or isolated slice exists, but the user-facing requirement is not complete. |
| **Not started** | No usable implementation exists yet. |
| **Deferred** | Intentionally excluded from this MVP; not a current blocker. |

## Implementation Matrix

| TRD area | Status | Evidence | What this means |
|---|---|---|---|
| Repository and Next.js scaffold | **Implemented** | `src/app/`, `src/ui/`, `package.json`, `tsconfig.json` | The application shell, TypeScript configuration, Tailwind tokens, and basic UI primitives exist. |
| Brand/design tokens | **Implemented** | `src/app/globals.css`, `docs/BRAND-DESIGN-LANGUAGE.md` | The Washi visual system, typography, themes, and belt-rank level tokens are present. |
| Content ETL pipeline | **Partial** | `scripts/build-packs/`, `packs/`, `ATTRIBUTION.md`, `.github/workflows/` | Generated packs and pipeline scripts exist. Reproducibility and CI still need final verification. |
| Development content fixtures | **Implemented** | `packs-dev/` | A small offline fixture set exists for local development: kanji, words, sentences, and deck definitions. |
| Built-in deck definitions | **Partial** | `packs/decks/`, `packs-dev/decks.json` | The full catalog is represented in generated JSON, but the application does not yet load and present these decks. |
| SRS state transitions | **Implemented** | `src/core/srs/grade.ts`, `schedule.ts`, `queue.ts`, `replay.ts`, `types.ts` | The five levels, grades, forced pass-is-minus-one rule, scheduling, queue construction, replay, and goal calculations are implemented as pure code. |
| SRS test suite | **Implemented** | `src/core/srs/srs.test.ts` | The repository contains the specified transition and property tests. A fresh test run should still be recorded as an implementation gate. |
| Local user database | **Implemented** | `src/data/db/index.ts`, `schema.ts`, `migrations.ts`, `DECISION.md` | SQLite-WASM with user-scoped OPFS snapshots, migrations, and account isolation exists. |
| Local repositories | **Implemented** | `src/data/repo/index.ts`, `index.test.ts` | Deck, card-state, review, session, settings, daily-stat, and outbox repository interfaces exist. |
| Atomic local grade transaction | **Implemented** | `src/data/repo/index.ts:81` | A grade can write the review, projected state, daily statistic, and outbox row in one local transaction. It is not yet called by a study screen. |
| Authentication UI | **Implemented** | `src/auth/auth-gate.tsx`, `src/auth/client.ts` | The app has sign-in/register forms, sign-out, and a no-anonymous gate. |
| Authentication runtime isolation | **Implemented** | `src/auth/runtime.ts`, `src/auth/runtime.test.ts`, `src/auth/no-anonymous.test.ts` | User-specific local database namespaces and account switching boundaries are implemented and tested. |
| Authentication backend | **Partial** | `apps/api/src/auth.ts`, `apps/api/src/index.ts`, `apps/api/src/db/`, `deploy/docker-compose.yml` | Better-auth, Postgres schema, migrations, and an API route exist, but the backend must be running and wired to the frontend before registration works end to end. |
| ElectricSQL deployment | **Partial** | `deploy/docker-compose.yml`, `deploy/README.md` | A pinned Electric service is defined, but shape authentication/filtering and client subscriptions are not complete. |
| Electric client synchronization | **Not started** | `src/data/sync/index.ts` | The module is an explicit stub; it validates `userId` but does not initialize Electric or apply shapes. |
| Local outbox worker | **Not started** | `src/data/outbox/index.ts` | The outbox table and repository exist, but `startOutboxFlusher()` is a no-op. |
| Mutation write API | **Partial** | `apps/api/src/index.ts:57-64` | The authenticated endpoint exists, but deliberately returns `501 mutation_ingest_not_implemented`. |
| Tile-wall performance prototype | **Implemented** | `src/app/prototype/tiles/`, `src/prototype/tile-wall/` | The synthetic 2,500-tile canvas/DOM hybrid prototype, zoom, pan, glyph atlas, accessibility list, and FPS overlay exist. Real-device gate results still need recording. |
| Production browse experience | **Not started** | `src/app/browse/page.tsx`, `src/features/browse/index.ts` | The route is a placeholder; it does not yet load real deck cards or provide production tile/list browsing. |
| Study screen | **Not started** | `src/app/study/page.tsx`, `src/features/study/index.ts` | The route currently renders a TODO. No user can complete a study session yet. |
| Home and simple goals | **Not started** | `src/app/page.tsx`, `src/core/srs/goal.ts` | Goal math exists, but the home screen is still a shell and does not display a deck, progress, or goal. |
| Dictionary and detail UI | **Not started** | `src/app/dictionary/page.tsx`, `src/features/dictionary/`, `src/features/detail/` | Dictionary/detail route and feature modules are placeholders, although the underlying content packs exist. |
| Runtime content-pack manager | **Not started** | `src/data/packs/index.ts` | The content access layer is explicitly marked as a stub. |
| Backup and export | **Not started** | No implementation under `src/` | Full JSON backup/restore and per-deck export remain to be built. |
| PWA service worker and offline shell | **Partial** | `public/manifest.json`, `src/pwa/index.ts` | The manifest exists, but Serwist registration, precaching, update flow, and persistence UX are not implemented. |
| Settings | **Not started** | `src/app/settings/page.tsx`, `src/features/settings/index.ts` | The route is a placeholder; SRS, pack, theme, storage, and backup settings are not wired. |
| Offline E2E coverage | **Not started** | No `e2e/` directory | The required sign-in → offline study → restore and two-device sync tests do not exist yet. |
| Custom cards/decks | **Deferred** | TRD D7 | Intentionally postponed until the pre-built-card study UX is validated. |
| Import and enrichment | **Deferred** | TRD D8; `src/core/import/` stubs | Intentionally postponed with custom cards/decks. |
| Writing trainer | **Deferred** | TRD D10; `src/features/writing/` stubs | Stroke animation belongs in MVP detail; stroke validation is post-MVP. |
| History charts and diagnostics | **Deferred** | TRD D12; `src/features/history/` stub | Home progress and simple goals come first. |

## Authentication 404 Diagnosis

The reported request was:

```text
http://localhost:3000/api/auth/sign-up/email
```

That is the frontend's origin. `src/auth/client.ts` uses this logic:

```ts
const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
```

When `NEXT_PUBLIC_API_URL` is unset, the browser calls the current Next.js origin. The Next.js app does not expose `/api/auth`, so it correctly returns 404.

The backend route is implemented separately in `apps/api/src/index.ts` and is configured for port `3001` by `deploy/docker-compose.yml`. During the status inspection, nothing was listening on `localhost:3001`, while the Next.js development server was listening on `localhost:3000`.

For local end-to-end authentication testing, the environment must provide:

```text
# Next.js client
NEXT_PUBLIC_API_URL=http://localhost:3001

# API service
BETTER_AUTH_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000
```

The Postgres/API/Electric stack must also be running, and the API migrations must have completed. This is a configuration/deployment gap, not a product decision gap.

## What Is Actually Usable Today?

The following can be exercised in isolation:

- Pure SRS transitions and queue/replay logic through unit tests.
- Local SQLite-WASM database creation, migrations, repository operations, and atomic grade persistence through tests.
- The synthetic tile-wall prototype at `/prototype/tiles`.
- The authentication shell visually, although account creation requires the API configuration above.
- Pack and attribution verification through the existing pipeline/fixture scripts.

The following cannot yet be completed as a user flow:

- Register or sign in against the current running frontend without backend configuration.
- Select a real deck from the application.
- Start and complete a study session.
- See real progress on Home or Browse.
- Search the dictionary or inspect a detail page.
- Sync a review to another device.
- Export or restore a backup.
- Install a fully offline-capable production PWA.

## Remaining Build Sequence

### 1. Make the auth stack runnable

- Start Postgres, API, and Electric through the deployment stack.
- Configure the frontend API origin and API CORS origin.
- Verify registration, session lookup, sign-in, and sign-out.
- Add a browser-level auth smoke test.

### 2. Finish the local-first transport seam

- Implement the authenticated mutation API with server-stamped `user_id`.
- Implement outbox flushing, retry/backoff, idempotency, and auth-expiry behavior.
- Implement Electric shape authentication/filtering and client application.
- Keep local grading independent of all network operations.

### 3. Build the first usable study loop

- Load one development deck from `packs-dev`.
- Build the study queue and card/reveal/grade interaction.
- Wire tap, swipe, keyboard, session summary, and undo.
- Call the atomic local `recordGrade()` path for every answer.

### 4. Build Home and simple goal UX

- Show the current deck, progress, last studied time, and Start action.
- Wire the existing goal math to target date, today’s target, and ahead/behind state.

### 5. Add the offline and sync acceptance tests

- Sign in, study offline, reload, and verify state.
- Run two signed-in browser contexts and verify review propagation.
- Verify local backup/restore once that feature exists.

### 6. Expand to the remaining MVP surfaces

- All built-in deck chooser and content-pack manager.
- Production tile/list Browse.
- Full dictionary/detail and stroke animation.
- Backup/export.
- PWA service worker, persistence request, update flow, accessibility, and performance gates.

## Current Blockers

| Blocker | Impact | Resolution |
|---|---|---|
| Frontend API origin is unset or points at the frontend origin | Registration returns 404 | Set `NEXT_PUBLIC_API_URL` to the API origin. |
| API service is not running on port 3001 | Auth cannot reach better-auth | Start the backend stack and verify `/healthz`. |
| Mutation endpoint returns 501 | Offline grades cannot sync | Implement and test mutation ingestion. |
| Outbox flusher is a no-op | Local grades cannot leave the device | Implement authenticated retrying flush. |
| Electric client is a stub | Other devices cannot receive updates | Implement user-scoped shape subscriptions and apply logic. |
| Study and pack UI are placeholders | No complete product flow exists | Build the single-deck study loop first. |

## Definition of “MVP Ready”

The MVP is not ready when the individual foundations merely compile. It is ready when a signed-in user can:

1. Choose a real bundled development/pre-built deck.
2. Complete a 20-card study session.
3. Grade cards while offline and reload without losing progress.
4. See progress and a simple goal on Home.
5. Reconnect and have the review log sync to another device.
6. Browse the deck through the production tile/list experience.
7. Search dictionary/detail content offline.
8. Export and restore a complete backup.

The highest-value next milestone is therefore **not more infrastructure**. It is the first end-to-end local study session, using the foundations that already exist.
