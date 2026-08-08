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
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `PUSH_CRON_SECRET`, then run a
  scheduler every minute with `curl -fsS -X POST http://localhost:3000/api/push/reminders -H
  "x-kanjiforge-push-secret: $PUSH_CRON_SECRET"`. The endpoint only sends to authenticated users
  who enabled reminders and whose configured local time matches the scheduler minute.
