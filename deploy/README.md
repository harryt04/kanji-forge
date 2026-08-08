# KanjiForge backend deployment

This directory deploys the mandatory backend separately from the static Next export. It does not
make the Next client a server: `apps/api` is an independent Node/TypeScript service.

## Local start

1. `cp deploy/.env.example deploy/.env`, then replace both secret placeholders. `BETTER_AUTH_SECRET`
   and `ELECTRIC_SECRET` must be at least 32 characters.
2. Run `docker compose --env-file deploy/.env -f deploy/docker-compose.yml up --build`.
3. Verify `curl -fsS http://localhost:3001/healthz` returns `{"ok":true}`.
4. Register through better-auth (after the stack starts):
   `curl -i -X POST http://localhost:3001/api/auth/sign-up/email -H 'content-type: application/json' -d '{"name":"Local User","email":"local@example.test","password":"a-long-local-password"}'`.
5. Verify the pinned Electric service has a reachable trivial shape once an application table has
   rows: `source deploy/.env && curl -i "http://localhost:3010/v1/shape?table=reviews&offset=-1&secret=${ELECTRIC_SECRET}"`.
   The secret is only for this local operator check; never send it to a browser.

The compose ports bind to loopback only. For Coolify, attach API and Electric to its TLS-enabled
proxy and set `BETTER_AUTH_URL`, `CORS_ORIGIN`, and the static client's public API/Electric URLs to
their HTTPS origins. Do not expose Postgres or Electric's dashboard publicly. The shape endpoint
must remain private until the T1.5 shape-auth proxy spike enforces `user_id` filtering.

## Production notes

- Postgres 16 starts with `wal_level=logical`, replication slots, and WAL senders required by
  Electric. Persist the `postgres-data` volume and back it up.
- The Electric image is deliberately pinned to `electricsql/electric:1.7.8`. It is read-only sync;
  mutations are not sent to Electric.
- API startup runs Drizzle migrations before serving traffic. Use one API replica during migration
  rollout, or run `pnpm --dir apps/api db:migrate` as a separate Coolify deployment command.
- `POST /api/mutations` authenticates a better-auth session and applies the supported write contract.
  `GET /api/sync` returns only that session user's reviews and metadata projections for the local
  client read-sync fallback. Direct Electric shapes remain private until the shape-auth proxy
  route (`GET /api/electric/shape`) is used; it enforces an allow-listed `user_id` filter and keeps
  the Electric secret server-side.
- Background Web Push is opt-in. Generate VAPID keys with `npx web-push generate-vapid-keys`, set
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `PUSH_CRON_SECRET`, then run a
  scheduler every minute with `curl -fsS -X POST http://localhost:3001/api/push/reminders -H
  "x-kanjiforge-push-secret: $PUSH_CRON_SECRET"`. The endpoint only sends to authenticated users
  who enabled reminders and whose configured local time matches the scheduler minute.
