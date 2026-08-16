# `src/server/`

The backend: better-auth, Postgres/Drizzle, the mutation write API, Electric proxy, and Web
Push. Runs as route handlers inside this same Next.js app (see `src/app/api/`, documented in
[`src/app/README.md`](../app/README.md)) — not a separate service. `docs/ARCHITECTURE.md` §2
and §10 are the design rationale; this file is the "what's actually in here" map.

## The one rule that matters most: `getServerContext()` must stay lazy

`context.ts`'s `getServerContext()` builds and memoizes the env/database/auth trio **on first
call inside a route handler** — never at module scope. Next.js imports every route module
during `next build`, which has no database available. `readEnv()` throws without
`DATABASE_URL` and `createDatabase()` opens a real connection pool; doing either at module
scope breaks the build and CI. Every route handler under `src/app/api/` calls
`getServerContext()` inside its handler function, not at the top of the file — follow that
pattern for any new route.

## Files

| File | What it does |
|---|---|
| `context.ts` | `getServerContext()` (see above), plus `jsonResponse()`/`readSessionUser()`/error helpers shared by every route handler. |
| `auth.ts` | Wraps better-auth with the Drizzle adapter. `buildAuth`'s return type is deliberately left inferred/unexported. |
| `env.ts` | Environment validation — safe network defaults, `BETTER_AUTH_SECRET` must be ≥32 chars. |
| `db/client.ts` | Drizzle + `postgres` client factory. |
| `db/schema.ts` | Postgres schema: better-auth's own tables (`user`, `session`, `account`, `verification`) plus the syncable app projections (`reviews`, `decks`, `settings`, `deck_membership`, `sticky_annotations`). **Deliberately excludes** local-only tables like `card_states` — enforced by `schema.contract.test.ts`. |
| `db/migrate.ts` | Standalone migration script run by `pnpm start` before the server accepts traffic. Skips gracefully when `DATABASE_URL` is unset (build/CI without a database). |
| `mutations.ts` | Applies a validated mutation batch. `review.append` uses `onConflictDoNothing` (append-only, idempotent insert by review id); deck/settings/membership/annotation upserts use `onConflictDoUpdate` (last-write-wins). This split is the whole conflict policy — see `docs/ARCHITECTURE.md` §10.4. |
| `electric.ts` | Server-side allowlist for the Electric shape proxy. `ELECTRIC_TABLES` names the five syncable tables; the proxy replaces any client `where` clause with a parameterized `user_id = $1` predicate so a client can't widen its shape query to another user's rows. **Duplication landmine:** this same table list is repeated as a literal array in `src/data/sync/electric-shape.ts` with no shared constant — see [`src/data/README.md`](../data/README.md). |
| `sync.ts` | The authenticated `/api/sync` snapshot transport (the fallback when Electric isn't configured). |
| `push.ts` | Web Push subscription storage and the `/api/push/reminders` cron-driven send path (VAPID). |

## Authorization pattern

Every route reads the session via `readSessionUser()`, then **forces `user_id` from the
token** — request bodies never supply their own `user_id`. The same pattern applies to the
Electric proxy (`electric.ts`) and the mutation batch (`mutations.ts`). Don't add a new
authenticated table or route without threading this through.

## Where this connects

Route handlers in `src/app/api/*/route.ts` are the thin layer that calls into this directory —
see [`src/app/README.md`](../app/README.md) for the route-to-module map. Client-side
counterparts (`data/outbox`, `data/sync`) are in [`src/data/README.md`](../data/README.md).
