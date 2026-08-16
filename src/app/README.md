# `src/app/`

Next.js App Router. Routes are thin shells — screen logic lives in `src/features/*`; a page
component here typically just renders the matching feature's screen component. See
`docs/ARCHITECTURE.md` §2–3 for the "why" (single deployable, client-rendered pages, no server
components doing data work).

## Route groups

- **`(marketing)/`** — public landing page (`page.tsx`). No auth required, indexable.
- **`(auth)/`** — `sign-in/`, `sign-up/`. The signed-out UI shell.
- **`(app)/`** — every authenticated screen: `home/`, `study/`, `browse/`, `detail/`,
  `dictionary/`, `history/`, `writing/`, `settings/`, `help/`, `analyze/`, plus
  `prototype/tiles/`. `(app)/layout.tsx` wraps all of it in `AuthGate`
  (see [`src/auth/README.md`](../auth/README.md)) and sets `robots: { index: false }` —
  authenticated routes render a sign-in form to anyone without a session, so there's nothing
  worth indexing and a bare `noindex` avoids confusing search users.
- **`api/`** — route handlers, thin wrappers over `src/server/*`. See the table below.

## `api/` routes → server module

| Route | Calls into |
|---|---|
| `api/auth/[...all]/route.ts` | `src/server/auth.ts` (better-auth catch-all) |
| `api/mutations/route.ts` | `src/server/{context,mutations}.ts` — the write API |
| `api/sync/route.ts` | `src/server/sync.ts` — authenticated snapshot read (Electric fallback) |
| `api/electric/shape/route.ts` | `src/server/electric.ts` — allowlisted, `user_id`-scoped Electric proxy |
| `api/push/{config,subscription,reminders,test}/route.ts` | `src/server/push.ts` — Web Push subscription CRUD, cron-driven reminder send, and an authenticated manual test-send |
| `api/healthz/route.ts` | Liveness check — no server-context dependency, used by deployment health checks |
| `api/share-target/route.ts` | Adapts the native Web Share Target POST into `(app)/analyze` |

Every handler follows the `getServerContext()` lazy-init rule described in
[`src/server/README.md`](../server/README.md) — call it inside the handler function, never at
module scope.

## `(app)/prototype/tiles/`

Mounts the tile-wall performance spike (`src/prototype/tile-wall/`, see that directory's
`README.md`). Not linked from primary navigation — it's a standalone route for profiling, not
a shipping surface.

## Where this connects

Feature screens: [`src/features/README.md`](../features/README.md). Auth gating:
[`src/auth/README.md`](../auth/README.md). Backend implementation:
[`src/server/README.md`](../server/README.md).
