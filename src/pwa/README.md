# `src/pwa/`

Service worker registration, offline storage protection, and the notification/badge surfaces.
`docs/ARCHITECTURE.md` §7 is the design rationale (persistence, update flow, iOS caveats).

## `sw.ts` — the service worker, and its one hard rule

Built with Serwist. Precaches build assets and caches visited navigations for offline reloads.

**Never hot-swap mid-session.** The code's own comment: *"Leave updated workers waiting so a
study session is never hot-swapped."* An updated worker sits in `waiting` state rather than
calling `skipWaiting()` automatically. If you touch the update flow, preserve this — reloading
mid-study-session and losing the in-progress queue is called out in `docs/ARCHITECTURE.md` §7.1
as the single most infuriating possible bug this app could ship.

## `index.ts`

Registers the build-generated worker in the browser. Mounted once, high in the tree (see
`src/auth/auth-gate.tsx`).

## `storage-persistence.ts`

Requests durable browser storage (`navigator.storage.persist()`) after the first non-empty
completed study session — deliberately not on cold load, per `docs/ARCHITECTURE.md` §7.2. This
is the app's mitigation for the highest-severity data-loss risk in the product: iOS storage
eviction. Settings surfaces a warning when persistence is denied or unavailable.

## `app-badge.ts`

Controls the installed-PWA app-icon badge (due/new cards, total cards, or none), with a
tab-title/favicon-badge fallback for browsers without the Badging API. Driven by
`AppBadgeController`, mounted in `auth-gate.tsx`.

## `daily-reminder.ts` / `push.ts` / `push-payload.ts`

Foreground daily reminder (service-worker notification when installed, page notification
otherwise) plus the background Web Push path: subscription storage, VAPID-signed sends, and
payload shape. Driven by `DailyReminderController`, also mounted in `auth-gate.tsx`. The
server side (cron-driven send, subscription CRUD) is `src/server/push.ts` — see
[`src/server/README.md`](../server/README.md).

## `install-guidance.ts`

iOS-specific "Add to Home Screen" instructions, since iOS Safari has no install prompt event —
detection is by user agent and display-mode.

## `events.ts`

Shared event-bus glue between the worker and the app (e.g. triggering a badge refresh after a
grade or undo).

## Where this connects

Every controller here is mounted from `src/auth/auth-gate.tsx` — see
[`src/auth/README.md`](../auth/README.md) for the full list and why it's centralized there.
