# `src/auth/`

Client-side auth: the sign-in/sign-up gate and the per-user local-runtime bootstrap. Backend
auth (better-auth config, Postgres) is in [`src/server/README.md`](../server/README.md).

## `auth-gate.tsx` — the single mount point for every authenticated route

`(app)/layout.tsx` wraps its entire route group in `<AuthGate>` (see
[`src/app/README.md`](../app/README.md)). This one component is where:

- The session is resolved (`getSession()` from `client.ts`) and, on sign-in, the per-user
  local runtime is bootstrapped via `bootstrapUserRuntime(session.id)` — this is what opens
  the user's local SQLite database and starts the outbox worker (see
  [`src/data/README.md`](../data/README.md)).
- `AppNavigation` (the shell nav) mounts.
- Four cross-cutting controllers mount alongside the gated content:
  `AutoBackupController`, `ThemeMigration` (both from `src/features/settings`),
  `AppBadgeController`, `DailyReminderController` (both from `src/pwa`, see
  [`src/pwa/README.md`](../pwa/README.md)).
- Sign-out calls `clearUserRuntime()` **before** the network sign-out call, so the local
  database/outbox are torn down even if the network request fails offline — the comment in the
  code is explicit about this: the server session will simply expire.

If you're adding something that must run for every signed-in user regardless of which screen
they're on, this is almost always where it goes — not into an individual feature screen.

## `auth-shell.tsx`

The signed-out UI: the sign-in/register form shown by `AuthGate` when there's no session.

## `client.ts`

`signIn()`, `register()`, `signOut()`, `getSession()` against the better-auth backend.
`getSession()` deliberately falls back to a cached `localStorage` identity when the network is
unreachable, so an offline reload doesn't lock a signed-in user out of their local data.

## `runtime.ts` — per-user local runtime lifecycle

`bootstrapUserRuntime(userId)` opens the user-scoped local database and starts the outbox
worker plus the Electric sync lifecycle seam. `clearUserRuntime()` tears all of that down.
Switching accounts closes the previous database before opening the new one — this is what
prevents a shared device from showing the previous user's local data (the no-anonymous /
per-user-isolation invariant, see `docs/ARCHITECTURE.md` §10.3). Every entry point rejects an
empty `userId`; there is no anonymous/guest path anywhere in this layer.

Tests: `runtime.test.ts`, `client.test.ts`, `no-anonymous.test.ts` (the last one specifically
asserts no code path can create study data without a real signed-in user).

## Where this connects

See [`src/data/README.md`](../data/README.md) for what `bootstrapUserRuntime` actually opens,
and [`src/server/README.md`](../server/README.md) for the backend auth/session implementation.
