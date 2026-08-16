# `src/features/`

Feature-sliced React. Most features are plain functions/hooks reading and writing
`src/data/repo` directly from screen components — there is no per-feature state-management
layer by default.

**`src/features/study/store.ts` is the only Zustand store in the app.** Every other feature
manages state with plain React state plus direct `data/repo` calls. Don't reach for Zustand in
a new feature just because `study/` uses it — that's a study-loop-specific choice (see below),
not the house pattern.

## Feature map

| Feature | Route | Key files | Notes |
|---|---|---|---|
| `study` | `/study` | `store.ts` (the Zustand session-queue store), `study-screen.tsx`, `study-writing-answer.tsx`, `deck-loader.ts`, `adapters.ts`, `audio.ts`/`audio-pack.ts`, `study-style.ts` | The core loop: reveal, keyboard/swipe grading, undo, session summary. `adapters.ts` is the single translation point between `core/srs`'s `stickyId`-keyed state and `data/repo`'s `contentRef`-keyed state — they're the same shape under a different key name. |
| `writing` | `/writing` | `writing-screen.tsx`, `writing-queue.ts`, `settings.ts` | Standalone stroke-order drill: an SRS-ordered queue over a whole deck, independent of a study session. |
| `browse` | `/browse` | `browse-screen.tsx`, `browse-filter.ts`, `browse-sort.ts`, `browse-bulk.ts`, `browse-virtual.ts` | List/tile views, search/filter, bulk flag/level operations, virtualized rendering above 500 cards. |
| `detail` | `/detail` | `detail-screen.tsx`, `stroke-animation.tsx`, `save-behavior.ts` | Kanji/word metadata, stroke playback, examples, similar kanji, Saved/custom-deck membership actions. |
| `dictionary` | `/dictionary` | `dictionary-screen.tsx`, `search-history.ts` | Offline dictionary search over the installed packs. |
| `history` | `/history` | `history-screen.tsx` | 30-day rolling study-activity chart from `daily_stats`. |
| `home` | `/home` | `home-screen.tsx` | Dashboard: deck progress, goal date, leeches, retention, projected completion. |
| `settings` | `/settings` | `settings-screen.tsx`, `theme*.ts`, `auto-backup.ts`, `backup.ts`, `deck-{combine,export,folders,import,progress,share}.ts`, `names-pack.ts`, `rss-feeds.ts`, `words-pack.ts` | The largest feature by file count: theme, backup/restore, deck management, optional content packs, RSS reading-source links. |
| `share` | `/analyze`, `api/share-target` | `share-screen.tsx`, `share-target.ts`, `analyzer-history.ts`, `analyzer-settings.ts` | Web Share Target handling and the offline text analyzer. |
| `navigation` | n/a (shell component) | `app-navigation.tsx` | Primary nav, mounted by `src/auth/auth-gate.tsx`; sidebar on tablet/desktop, compact header on mobile. |
| `help` | `/help` | `help-screen.tsx` | Static offline help content, no data dependency. |
| `marketing` | `(marketing)/` route group | `hero.tsx`, `feature-highlights.tsx`, `marketing-tile-wall.tsx`, `install-pwa.tsx`, `licensing-honesty.tsx`, `offline-ownership.tsx`, `signed-in-redirect.tsx`, etc. | Public landing-page sections. |

## Coverage gap in the product docs

`docs/FEATURE-PARITY.md` and `docs/ux-backlog.md` are organized around study-loop concepts
(SRS, decks, dictionary, sync, platform/settings) and don't have dedicated sections for
`home`, `navigation`, `help`, or `marketing`. If you're changing one of those four and can't
find a backlog item to anchor to, that's expected — check `docs/implemented-already.md`
instead, and update it directly rather than searching for a backlog entry that doesn't exist.

## Where this connects

Features call [`src/data/repo`](../data/README.md) for persistence and
[`src/core`](../core/README.md) for pure logic (SRS queue/grading, stroke matching). Shared
visual primitives live in [`src/ui/README.md`](../ui/README.md). Route wiring is in
[`src/app/README.md`](../app/README.md).
