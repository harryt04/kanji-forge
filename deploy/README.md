# KanjiForge deployment dependencies

This directory holds the **backing services** the app needs locally: Postgres, and optionally
Electric. The app itself is not here. It is the Next.js application at the repo root, which
serves the UI and its own API under `/api/*` in one process — a single deployable. See
`docs/ARCHITECTURE.md` §2 and §10.5.

## Local start

1. `cp deploy/.env.example deploy/.env`, then replace the secret placeholders. `BETTER_AUTH_SECRET`
   and `ELECTRIC_SECRET` must be at least 32 characters.
2. Start Postgres: `docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d postgres`.
3. Point the app at it via `.env.local` at the repo root (`DATABASE_URL`, `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL=http://localhost:3000`).
4. Run the app: `pnpm build && pnpm start` (this applies migrations first), or `pnpm dev`.
5. Verify `curl -fsS http://localhost:3000/api/healthz` returns `{"ok":true}`.
6. Register through better-auth:
   `curl -i -X POST http://localhost:3000/api/auth/sign-up/email -H 'content-type: application/json' -d '{"name":"Local User","email":"local@example.test","password":"a-long-local-password"}'`.

To run the optional background reminder scheduler from the same Compose project, set
`KANJIFORGE_APP_URL` in `deploy/.env` to the app URL reachable from the container, then start:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml --profile push up -d push-cron
```

The scheduler calls `POST /api/push/reminders` once per minute. On Linux, replace the example
`host.docker.internal` value with an address resolvable from the container (for example, the
deployment's HTTPS origin or a host-gateway address).

### Optional: Electric

Sync works without Electric — the client polls the authenticated `/api/sync` snapshot. To try the
live read path, start it with `docker compose --env-file deploy/.env -f deploy/docker-compose.yml --profile electric up -d`,
set `ELECTRIC_URL` and `ELECTRIC_SECRET` on the app, and rebuild with `NEXT_PUBLIC_ELECTRIC_URL`
set so the client uses the shape route. Check it directly with
`source deploy/.env && curl -i "http://localhost:3010/v1/shape?table=reviews&offset=-1&secret=${ELECTRIC_SECRET}"`.
That secret is only for this local operator check; never send it to a browser.

The compose ports bind to loopback only. On Coolify, attach the app to the TLS proxy and set
`BETTER_AUTH_URL` to its public HTTPS origin. Do not expose Postgres or Electric publicly — the
browser reaches Electric only through the authenticated `/api/electric/shape` proxy, which keeps
the secret server-side and pins the shape filter to the session user.

## Coolify checklist (per environment)

The app is one Coolify application per environment (beta, prod) — not two. Each needs its own
Postgres resource; do not share one Postgres between beta and prod, and do not reuse a
`BETTER_AUTH_SECRET` across environments (a beta secret would validate prod sessions).

For each environment's app, in Coolify:

1. Create a dedicated Postgres database resource for that environment.
2. Set these variables on the app (see `docs/ARCHITECTURE.md` §10.5 for the full list including
   optional Web Push / Electric vars):
   ```
   NIXPACKS_NODE_VERSION=22
   DATABASE_URL=<internal connection string to that environment's Postgres>
   BETTER_AUTH_SECRET=<generate below — unique to this environment>
   BETTER_AUTH_URL=<this app's own public HTTPS origin, e.g. https://beta.kanjiforge.app>
   ```
   Generate a secret with:
   ```bash
   openssl rand -base64 48
   ```
3. **Do not set `NEXT_PUBLIC_API_URL`.** It is a leftover from the old two-deployment split, where
   it pointed the client at a separate backend origin. The client now calls its own origin, and
   this is a build-time value — leaving it set bakes a stale/self-referential origin into the
   build.
4. Set the health check path to `/api/healthz` (method GET, expect 200) and enable it.

This replaced an earlier setup with two Coolify apps per environment (a static export plus a
separate `apps/api` service) — see `docs/DECISIONS.md` D16 for why.

## Production notes

- Postgres 16 starts with `wal_level=logical`, replication slots, and WAL senders required by
  Electric. Persist the `postgres-data` volume and back it up.
- The Electric image is deliberately pinned to `electricsql/electric:1.7.8`. It is read-only sync;
  mutations are not sent to Electric.
- `pnpm start` runs Drizzle migrations before the server accepts traffic, so a deploy is a single
  step. Keep one replica during a migration rollout, or run `pnpm db:migrate` on its own first.
- `POST /api/mutations` authenticates a better-auth session and applies the supported write contract.
  `GET /api/sync` returns only that session user's reviews and metadata projections for the local
  client read-sync fallback. Configure `NEXT_PUBLIC_ELECTRIC_URL` at build time to consume
  the authenticated `GET /api/electric/shape` proxy; it enforces an allow-listed `user_id` filter
  and keeps the Electric secret server-side.
- Background Web Push is opt-in. Generate VAPID keys with `npx web-push generate-vapid-keys`, set
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_CRON_SECRET`, and
  `KANJIFORGE_APP_URL`, then start the optional `push-cron` Compose profile. It calls the reminder
  endpoint every minute and can be replaced by an external scheduler when preferred. The endpoint
  only sends to authenticated users who enabled reminders and whose configured local time matches
  the scheduler minute.
