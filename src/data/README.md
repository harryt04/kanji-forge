# `src/data/`

The persistence layer. Two separate stores — don't conflate them (see `docs/ARCHITECTURE.md`
§4 for the full rationale):

- **Content packs** (`data/packs/`) — immutable, shared, read-only SQLite-WASM files under
  `packs/`/`packs-dev/`, built by `scripts/build-packs/`.
- **User data** (`data/db/`, `data/repo/`, `data/outbox/`, `data/sync/`) — small, mutable,
  per-account, local-first. The study loop reads and writes this and only this.

## `data/db/` — the local per-user database

SQLite-WASM (`sql.js`), persisted to the browser's Origin Private File System with an
in-memory fallback when OPFS is unavailable (e.g. private browsing). See
[`DECISION.md`](db/DECISION.md) for why `sql.js` over PGlite.

- `schema.ts` — versioned migrations (currently 10 tables: `decks`, `deck_membership`,
  `card_states`, `reviews`, `sessions`, `settings`, `daily_stats`, `outbox`, plus
  `schema_migrations`).
- `index.ts` — opens/persists the database, namespaced per `userId` (opening with an empty id
  throws — this is what backs the no-anonymous invariant at the storage layer). Writes are
  serialized through a promise chain so two concurrent grades can't interleave.
- `migrations.ts` — the migration runner.

**Invariant: `card_states` never leaves this database.** It's a local materialized projection
derived from `reviews` via `core/srs/replay`, and is never placed in the outbox or synced —
see `DECISION.md` and `src/server/db/schema.contract.test.ts`, which asserts the Postgres
schema excludes it.

## `data/repo/` — typed CRUD over the local database

`index.ts` (1000+ lines, the largest file in `data/`) is the only place the rest of the app
should touch the local database directly. Decks, card states, reviews, sessions, settings,
daily stats, outbox rows.

- `recordGrade()` performs one atomic transaction: review insert + derived card-state write +
  daily-stat increment + outbox row, per `docs/ARCHITECTURE.md` §4.3's write-path contract.
- **Invariant:** `deck.kind === 'derived'` decks throw on membership writes — a built-in deck's
  card set comes from the content pack + deck definition, not a stored `deck_membership` row
  ("no per-card membership is stored for derived decks"). Only `saved`/`custom` decks persist
  membership rows.

## `data/outbox/` — flushing local mutations to the server

`index.ts` drives the client outbox worker: batches `SYNCABLE_MUTATION_TYPES` (review/deck/
settings/membership/annotation upserts), removes only rows the server acknowledged, retries
network/5xx failures with bounded exponential backoff, and **pauses entirely on 401** via an
`onAuthRequired` callback. Rejected mutations are quarantined in an **in-memory poison set for
the session** — not persisted, so a reload will retry a previously-poisoned mutation. Mutation
types not yet in `SYNCABLE_MUTATION_TYPES` stay queued indefinitely rather than being dropped.

## `data/packs/` — read-only content-pack access

`index.ts` (~900 lines) opens the installed SQLite content packs and exposes deck-definition
loading, kanji/word/name lookup (exact/prefix/substring/wildcard), and `type:key` content-ref
parsing (`kanji:日`, `word:1234567`, `name:5000000`). Process-wide cached handle since packs
are shared and read-only.

## `data/sync/` — client-side authenticated read sync

- `electric-shape.ts` — parses Electric shape messages (JSON/NDJSON/SSE) for the five synced
  projections.
- `index.ts` — materializes parsed changes into the local database, or falls back to the
  authenticated `/api/sync` snapshot transport when Electric isn't configured. Merge policy:
  set-union for `reviews`, last-write-wins by `updatedAt` for `settings`/deck metadata, and
  `card_states` is always re-derived via `core/srs/replay` rather than synced directly (see the
  `data/db/` invariant above).

**Landmine:** the list of syncable table names (`reviews`, `decks`, `settings`,
`deck_membership`, `sticky_annotations`) is duplicated verbatim as a literal array in both
`src/data/sync/electric-shape.ts` and `ELECTRIC_TABLES` in `src/server/electric.ts`, with no
shared constant between client and server code. If you add or rename a synced table, update
**both** files and grep for the old name to be sure you got every occurrence.

## Where this connects

`data/repo` and `data/packs` are what `src/features/*` actually calls — features never open
`data/db` directly. `data/outbox`/`data/sync` are driven by `src/auth/runtime.ts`'s
`bootstrapUserRuntime()`. Server-side counterparts live in [`src/server/README.md`](../server/README.md).
