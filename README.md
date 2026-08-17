# KanjiForge

KanjiForge is a free, offline-first Japanese kanji and vocabulary study PWA for learners who want their progress to remain visible and under their control. It uses spaced repetition; every card moves through belt-like levels as you answer it, so a deck's progress is easy to understand at a glance. It is built for independent learners on desktop, Android, and iOS who want offline study with optional account sync when they are back online.

## What is included

- Local-first study sessions with a five-level color SRS and an undo-last-answer action.
- Built-in kanji and vocabulary decks, Browse tile/list views, dictionary/detail pages, examples, and stroke animation.
- Offline SQLite-backed user data, with authenticated sync and an outbox when a backend is configured.
- Writing practice, history, deck management, import/export, optional audio/name packs, and a PWA shell. Some of these surfaces are still under active development; see [`docs/implemented-already.md`](docs/implemented-already.md) for the evidence-based status snapshot.

The application and pipeline code are MIT licensed. Content packs and derived datasets are CC BY-SA 4.0; see [`LICENSE`](LICENSE), [`LICENSE-DATA`](LICENSE-DATA), and [`ATTRIBUTION.md`](ATTRIBUTION.md).

## Prerequisites

- Git
- Node.js 22 or newer (the package supports Node.js 18.17+)
- pnpm 9, matching [`pnpm-lock.yaml`](pnpm-lock.yaml)
- Docker Desktop or another Docker-compatible runtime if you want to run the local Postgres auth backend
- Chromium and WebKit dependencies for the full Playwright suite

The repository uses pnpm as its canonical package manager. With a recent Node.js installation, enable Corepack and activate pnpm 9:

```sh
corepack enable
corepack prepare pnpm@9 --activate
```

## Clone and run locally

```sh
git clone https://github.com/harryt04/kanji-forge.git
cd kanji-forge
pnpm install
pnpm dev
```

The development server can run without environment variables. It uses the committed `packs-dev/` fixtures for local content, and is sufficient for working on the public shell and offline UI. Copy [`.env.example`](.env.example) to `.env.local` only when you need to configure an API, database, or optional service; never commit `.env.local`.

### Optional local authentication and sync backend

The app and its API are one Next.js server. To exercise sign-up, sign-in, authenticated routes, and server-backed sync locally:

1. Create the local backing-service configuration and replace its placeholders:

   ```sh
   cp deploy/.env.example deploy/.env
   ```

2. Start Postgres:

   ```sh
   docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d postgres
   ```

3. Create `.env.local` at the repository root. A minimal same-origin configuration is:

   ```dotenv
   DATABASE_URL=postgresql://kanjiforge:<password>@localhost:5432/kanjiforge
   BETTER_AUTH_SECRET=<at-least-32-character-random-secret>
   BETTER_AUTH_URL=http://localhost:3000
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

   Leave `NEXT_PUBLIC_API_URL` empty for the normal same-origin setup. The root server reads runtime secrets when requests arrive; `pnpm start` applies Drizzle migrations before starting the production server.

4. Start the production-shaped app and check its liveness endpoint:

   ```sh
   pnpm build && pnpm start
   curl -fsS http://localhost:3000/api/healthz
   ```

For the optional Electric live-read path, see [`deploy/README.md`](deploy/README.md). The app works without Electric by polling its authenticated sync snapshot. Do not expose Postgres or Electric directly to browsers, and do not put server secrets in variables beginning with `NEXT_PUBLIC_`.

## Environment variables

[`.env.example`](.env.example) lists the variables used by the application. The required runtime variables are:

| Variable | Required when | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Running authenticated server routes or migrations | PostgreSQL connection URL. Not needed for the public shell or offline-only build. |
| `BETTER_AUTH_SECRET` | Running authentication | Must be at least 32 characters and unique per environment. |
| `BETTER_AUTH_URL` | Running authentication | The app's own public origin, for example `http://localhost:3000`. |

Optional server variables are `ELECTRIC_URL` and `ELECTRIC_SECRET` for live reads, plus `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `PUSH_CRON_SECRET` for Web Push reminders. See the production variable list and scheduler example in [`deploy/README.md`](deploy/README.md).

Optional public variables are:

- `NEXT_PUBLIC_SITE_URL` — canonical site origin; defaults to `http://localhost:3000`. Used to build canonical URLs, Open Graph tags, and the sitemap, and it is a **build-time** value (`NEXT_PUBLIC_` prefix), so it must be set in the build environment, not only at runtime. Production must set this to `https://kanjiforge.app` exactly — `robots.ts` blocks indexing on any other host to avoid duplicate-content competition with production.
- `NEXT_PUBLIC_API_URL` — an alternate authenticated API origin. Leave it empty for the recommended same-origin deployment. The auth-dependent E2E tests are skipped when it is empty.
- `NEXT_PUBLIC_ELECTRIC_URL` — build-time client gate for the optional Electric read path.
- `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` — PostHog analytics project key and host. Both are build-time values. The client initializes PostHog only in production, with autocaptured text and element attributes masked and session recording disabled; production builds must provide the key. Requests are proxied through `/ingest` (see `next.config.js`) so ad blockers targeting `posthog.com` don't drop them. In Coolify, changing either value requires a new image build and redeploy — changing the runtime environment alone does not update an already-built client bundle.

## Tests and CI

Install Playwright browsers once before running browser tests:

```sh
pnpm exec playwright install chromium webkit
```

Useful checks:

```sh
pnpm test                 # unit tests
pnpm test:coverage        # unit tests with coverage
pnpm test:e2e             # Chromium and WebKit browser tests
pnpm test:e2e:ui          # Playwright's interactive UI runner
pnpm packs:verify         # fixture-only pack validation (what CI runs)
pnpm packs:test           # content-pipeline unit tests
pnpm ci                   # complete local CI sequence
```

`npm run ci` is also supported for contributors who use npm to invoke package scripts. Without `NEXT_PUBLIC_API_URL`, the public E2E checks run without requiring Postgres and auth-dependent cases (including the offline-study flow) skip. With an API origin configured, make sure that backend is reachable and that any same-origin database has been migrated.

To run the authenticated Browse Workbench check locally, keep Postgres running and set the
following in the root .env.local (the auth and database variables are described above):

    DATABASE_URL=postgresql://kanjiforge:<password>@localhost:5432/kanjiforge
    BETTER_AUTH_SECRET=<at-least-32-character-random-secret>
    BETTER_AUTH_URL=http://localhost:3000
    NEXT_PUBLIC_API_URL=http://localhost:3000

The non-empty NEXT_PUBLIC_API_URL enables auth-gated E2E cases, including this one; the
existing e2e/fixtures.ts registers a fresh test user for each case, so TEST_ACCOUNT_EMAIL
and TEST_ACCOUNT_PASSWORD are not required. Run the focused check with:

    pnpm test:e2e e2e/browse-workbench.spec.ts

### Content pipeline scripts

These aren't part of `pnpm ci` (they touch network/upstream sources or gitignored full-size
packs) but are used to regenerate content — see
[`scripts/build-packs/README.md`](scripts/build-packs/README.md) for the full pipeline map:

```sh
pnpm fetch:sources         # pin/refresh upstream dictionary sources
pnpm build:kanji           # and build:words-core, build:words-full, build:names,
                            # build:strokes-pack, build:sentences-pack, build:similar,
                            # build:decks — one script per content pack
pnpm packs:refresh         # fetch + build every pack + full pipeline validation
pnpm packs:full            # full-source pipeline validation only
pnpm packs:repro           # reproducibility check on the locked full sources
pnpm test:decks            # build-decks.test.ts, run separately (depends on gitignored packs/*.sqlite)
```

### Database scripts

```sh
pnpm db:generate           # drizzle-kit generate — after changing src/server/db/schema.ts
pnpm db:migrate            # applies migrations; also runs automatically before `pnpm start`
```

The full CI definition is [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It runs a fast smoke job (format check, lint/type-check, production build, and pack-fixture verification), unit coverage, and Chromium/WebKit Playwright jobs in parallel, followed by a compatibility aggregator named `build-and-test`. Each Playwright job also performs the production build required by the service-worker tests. If a check fails, include the failing command and relevant output in the pull request rather than hiding or weakening the check.

## Contributing

Small fixes, documentation improvements, test coverage, accessibility work, and Japanese-learning improvements are welcome. Before starting a larger feature, read [`AGENTS.md`](AGENTS.md) and the relevant documents in [`docs/`](docs/); the MVP scope and architecture are deliberate, and the long-term feature inventory in [`docs/FEATURE-PARITY.md`](docs/FEATURE-PARITY.md) is not the MVP ship list.

### Create a branch

The default branch is `master`. If you are not a maintainer, fork the repository first and clone your fork:

```sh
git clone https://github.com/<your-github-name>/kanji-forge.git
cd kanji-forge
git remote add upstream https://github.com/harryt04/kanji-forge.git
git fetch upstream
git switch -c fix/short-description upstream/master
```

Use a focused branch name such as `fix/e2e-startup`, `feat/dictionary-search`, or `docs/contributing`. Keep unrelated work out of the branch. Before opening a PR, bring it up to date with the current base branch:

```sh
git fetch upstream
git rebase upstream/master
```

If you cloned the main repository directly, replace `upstream` with `origin` in these commands.

### Open a pull request

1. Make the smallest complete change that solves the problem. Add or update tests for behavior changes, and update documentation or attribution when the change affects either.
2. Run `pnpm ci` (or `npm run ci`) locally. For UI changes, manually check the affected route at desktop and mobile widths; for offline behavior, test a reload while offline.
3. Commit with a short, imperative message, for example `Fix E2E startup without Postgres`.
4. Push your branch and open a pull request against `master`:

   ```sh
   git push -u origin fix/short-description
   ```

5. In the PR description, explain the user or developer problem, summarize the change, list the verification commands you ran, call out environment/deployment changes, and attach screenshots or recordings for visual changes. Link a related issue when one exists.
6. Keep the PR focused and respond to review feedback. All required CI checks must pass before merge; do not commit secrets, generated production packs, or unrelated formatting churn.

### Data and licensing contribution notes

Do not add data from proprietary dictionaries, SKIP codes, Heisig RTK, commercial audio, or restricted text sources. New content-pack inputs and derived data need an attribution/license update in the pack manifest and [`ATTRIBUTION.md`](ATTRIBUTION.md). See [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) before changing the ETL pipeline.

## Project guide

- [`AGENTS.md`](AGENTS.md) — repository working agreements and documentation index
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, storage, PWA, sync, and deployment design
- [`docs/SRS-SPEC.md`](docs/SRS-SPEC.md) — implementable scheduler behavior
- [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md) — datasets, licenses, and pipeline rules
- [`docs/implemented-already.md`](docs/implemented-already.md) — current implementation snapshot
- [`deploy/README.md`](deploy/README.md) — Postgres, Electric, and Coolify setup

Every major `src/` subtree and `scripts/build-packs/` also has its own `README.md` with the
invariants, test files, and gotchas for that area — start with the one for whatever you're
touching: [`src/core/`](src/core/README.md), [`src/data/`](src/data/README.md),
[`src/server/`](src/server/README.md), [`src/app/`](src/app/README.md),
[`src/features/`](src/features/README.md), [`src/auth/`](src/auth/README.md),
[`src/pwa/`](src/pwa/README.md), [`src/ui/`](src/ui/README.md),
[`src/prototype/tile-wall/`](src/prototype/tile-wall/README.md),
[`scripts/build-packs/`](scripts/build-packs/README.md).

## License

Application and pipeline code are licensed under the [MIT License](LICENSE). Content packs and derived datasets are licensed under [CC BY-SA 4.0](LICENSE-DATA).
