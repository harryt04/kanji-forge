# KanjiForge — Product Requirements Document

**Name:** KanjiForge
**Type:** Free & open-source Japanese kanji + vocabulary study PWA
**Target:** Feature-complete open alternative to StickyStudy Japanese (iOS)
**Doc version:** 1.0 — MVP definition
**Status:** Draft for implementation

---

## 1. Summary

KanjiForge is an offline-first, installable Progressive Web App for studying Japanese kanji and vocabulary using a **level-based spaced repetition system with visual color state** — the mechanic that makes StickyStudy uniquely legible compared to Anki-style interval math.

The defining idea: every card is a **sticky** that has a **color**. Red means new, green means mastered, and the colors in between are visible progress. A user can zoom out and see their entire deck as a wall of colored tiles turning from red to green over weeks. That single visualization is the product's emotional core and the number one thing to get right.

KanjiForge must run entirely in the browser, work offline after first load, install to a phone home screen, and be usable on tablet, laptop, and desktop. Signing in is required (see §1.2) so progress can follow a user across devices from day one — but there is no tracking and no paywall.

### 1.1 Why this exists

StickyStudy is excellent but: iOS-only, closed-source, single-maintainer, last meaningful update in 2021, iCloud-locked sync, and users' study history is trapped in a proprietary format. There is no comparable open web app. Anki is powerful but its Japanese support is a pile of community add-ons and its UX is hostile to beginners. WaniKani is a subscription with a fixed curriculum you cannot change.

KanjiForge's wedge: **StickyStudy's UX and SRS legibility, delivered as an open, portable, cross-platform web app with data you own.**

### 1.2 Product principles

1. **The color is the interface.** Progress must be visible at a glance, at every zoom level, on every screen.
2. **Sign in once, then it's zero-friction.** An account is required before studying — this is a deliberate trade against instant anonymous use, made so that cross-device sync (picking up on a phone where you left off on a laptop) works from the very first session, with no later "upgrade" step and no local-data-merge edge case. After that one sign-in, picking a deck and starting a session takes under 60 seconds.
3. **Offline is the default, not a mode.** Every study feature works on a plane, including recording answers — writes queue locally and sync when back online (see `ARCHITECTURE.md` §10). Network is required only for initial sign-in, content packs, and sync.
4. **Your data is a file.** Everything exportable to open formats at any time.
5. **Mobile-first, not mobile-only.** Thumb-reachable one-handed study on a phone; genuinely better on a large screen, not just stretched.
6. **Honest licensing.** Every bundled byte has a documented, compatible open license. See `DATA-SOURCES.md`.

### 1.3 Non-goals for MVP

- Chinese/hanzi support (architecture should not preclude it; feature is out of scope)
- Social features, leaderboards, streaks-as-gamification, friends
- Grammar lessons, conjugation drills, listening comprehension exercises
- Monetization of any kind
- Native app store distribution (PWA install only)

---

## 2. Users

### 2.1 Primary persona — "The JLPT candidate"
Self-studying adult, N5–N1, has an exam date. Needs a deck scoped to a level, a daily quota that guarantees they finish in time, and confidence that the algorithm won't waste their time. Studies in 5–15 minute bursts on a phone during commutes.

**Key needs:** goal scheduler, JLPT decks, reliable offline, fast card flip, honest progress %.

### 2.2 Secondary persona — "The classroom student"
University/high-school Japanese student. Needs to build custom decks from textbook chapter lists by pasting or importing a word list. Studies on a laptop at a desk and a phone elsewhere.

**Key needs:** paste/CSV import, custom decks, desktop keyboard study, cross-device continuity.

### 2.3 Tertiary persona — "The kanji completionist"
Working through jōyō or Kanji Kentei. Cares about stroke order, radical decomposition, similar-looking kanji disambiguation, and detailed reference data.

**Key needs:** writing trainer, kanji detail view, similar-kanji comparison, dictionary depth.

### 2.4 Fourth persona — "The Anki refugee"
Has years of review history in another tool. Will not adopt without an import path and an export escape hatch.

**Key needs:** import from CSV/Anki export, export everything, no lock-in.

---

## 3. Core concepts and vocabulary

Establish this vocabulary in code and UI. Do not drift.

| Term | Definition |
|---|---|
| **Sticky** | A single study item. Has content + a per-deck SRS state. UI-facing name for "card". |
| **Level** | Integer 0–4. The sticky's mastery state. Drives its color. |
| **Color** | The visual encoding of level. Red (0) → Green (4). |
| **Deck** | An ordered, named collection of stickies. Owns its own settings. |
| **Content pack** | A downloadable, versioned, immutable bundle of dictionary/kanji/sentence/audio data. |
| **Session** | One continuous study run, from "Start" to "Finish". Produces a summary. |
| **Goal** | An optional target date. Drives the daily quota. |
| **Recycle** | The return of a green (mastered) sticky to the review queue after a long interval. |
| **Flag** | A user-set marker on a sticky, independent of level. |
| **Study style** | Per-deck configuration of what appears on the question side vs. the answer side. |

---

## 4. Feature requirements — MVP

Requirements are labeled `[P0]` (MVP blocker), `[P1]` (MVP, cut only under schedule pressure), `[P2]` (post-MVP, spec'd here so the architecture accommodates it).

### 4.1 The SRS engine

> Full algorithm specification lives in **`SRS-SPEC.md`**. This section states the product requirements the engine must satisfy.

- **[P0]** Five levels: 0 New (red) → 1 → 2 → 3 → 4 Mastered (green). A sticky requires **four consecutive correct answers** to go from red to green.
- **[P0]** Three answer buttons during study:
  - **I don't know** — sends the sticky back to red (level 0).
  - **I know** — advances one level.
  - **No problem** — jumps straight to green (level 4).
- **[P0]** *Pass is −1* setting: when enabled, "I don't know" demotes by one level instead of resetting to red. Must be **automatically forced on when the deck contains fewer than 10 red stickies**, mirroring StickyStudy's behavior (prevents an endgame where one slip resets a nearly-finished deck).
- **[P0]** Per-level intervals are **user-configurable via sliders**, presented as "days waited before this sticky is asked again." The UI must show the derived **total time to green** as the sum of stages (e.g. `3 + 9 + 30 = 42 days`), because that's the number users actually reason about.
- **[P0]** Green stickies are **recycled** at a configurable long interval so mastery is maintained rather than assumed.
- **[P0]** A **new-cards-per-session** control (StickyStudy's "red slider") caps how many level-0 stickies are introduced in a run.
- **[P0]** Intervals are **guidelines, not hard gates.** If the due queue is empty, the session continues with the next-most-valuable stickies rather than telling the user "come back tomorrow." Never block a user who wants to study.
- **[P0]** Interval **fuzz** of ±10% to prevent review pile-ups on a single day.
- **[P0]** Levels are **manually overridable** — a user can tap a sticky's color in list/detail view and set it directly.
- **[P0]** Every answer writes an **append-only review record** (sticky, deck, timestamp, grade, prior level, new level, response ms). This log is the source of truth; level state is a derived projection. This is what makes sync, undo, stats, and algorithm migration tractable.
- **[P1]** Undo last answer within a session.
- **[P2]** Optional **FSRS mode** as an alternative scheduler behind a setting, sharing the same review log. Do not build this in MVP but do not design the log so it's impossible.

### 4.2 Study screen

- **[P0]** Full-bleed card. Question side → tap/click anywhere to reveal → answer side → grade.
- **[P0]** **Study style configuration (per deck).** The user chooses which fields appear on the question side and which on the answer side. Available fields:
  `Kanji/Word` · `Kana reading` · `English meaning` · `Writing pad` · `Audio` · `Example words` · `Example sentences` · `Related kanji`
  Constraint (inherited from StickyStudy): the word and the writing pad cannot both be the question.
- **[P0]** **Two-tap study mode**: word → tap → readings → tap → everything. Overrides the field config when enabled.
- **[P0]** Answer input methods, all three available simultaneously:
  - **Tap** the three buttons.
  - **Swipe** — left = incorrect, right = correct.
  - **Keyboard** — `←` incorrect, `→` correct, `↑` perfect, `↓` scroll, `Space` reveal/flag, `A` audio. Explicitly support external Bluetooth keyboards on tablets.
- **[P0]** A color strip / border showing the sticky's **current level**, tappable to flag.
- **[P0]** Session header: cards remaining today, goal progress, elapsed timer (tap to toggle), finish button.
- **[P0]** *Grey stickies* setting — hide the color during study so the user isn't primed by seeing "this one's nearly green."
- **[P0]** *Session summary* dialog on finish: cards seen, correct/incorrect, levels changed, time, cards that went green, cards that went red.
- **[P1]** *Hide related answers* — when studying a kanji, blur the kana/English of the "Related" example words until tapped.
- **[P1]** Auto-play audio during study (per study style).
- **[P1]** Haptic feedback on grade (Vibration API where available; silently no-op on iOS).

### 4.3 Browse — Tile view

This is the signature feature. Budget real engineering time here.

- **[P0]** A **zoomable grid** of every sticky in the deck, each rendered as a colored tile. Pinch-zoom on touch, scroll-wheel/⌘± on desktop.
- **[P0]** At maximum zoom-out, an entire 2,000-card deck fits on one screen as a wall of color. This must render and pan at 60fps. Implementation guidance in `ARCHITECTURE.md` (canvas/WebGL at low zoom, DOM at high zoom).
- **[P0]** Tile content is **configurable**: kanji only / kanji + reading / kanji + meaning / word + reading, etc.
- **[P0]** Tap a tile → detail popover; long-press → quick actions (set level, flag, move to deck, remove).
- **[P0]** Zoom ratio setting for large decks.
- **[P1]** Tile view honors the current filter/sort from list view.

### 4.4 Browse — List view

- **[P0]** Virtualized scrolling list of stickies with color chip, primary field, reading, meaning.
- **[P0]** **Sort** by: deck order, level, stroke count, frequency, JLPT level, grade, times reviewed, last reviewed, alphabetical (kana), date added.
- **[P0]** **Filter** by: level/color, flagged, has audio, JLPT level, school grade, stroke count range, contains-radical, text search within deck.
- **[P0]** **Multi-select** with bulk actions: set level, flag, move, copy to deck, delete.
- **[P0]** Inline level editing (tap the color chip to cycle/pick).

### 4.5 Detail view

- **[P0]** For a **kanji**: character (large, in a proper Japanese serif/gothic face), on'yomi, kun'yomi, nanori, English meanings, stroke count, radical, component elements, school grade, JLPT level, frequency rank, jōyō status.
- **[P0]** For a **word**: written form, reading with furigana, part of speech, all senses with glosses, common/frequency tag, kanji breakdown linking to each constituent kanji's detail.
- **[P0]** **Stroke-order animation** rendered from KanjiVG paths, with play/pause/step and numbered stroke start-points.
- **[P0]** **Example words** containing this kanji, ranked by frequency, each tappable.
- **[P0]** **Example sentences** with the target word highlighted, furigana, and English translation. Sentence source attributed.
- **[P0]** **Similar-looking kanji** row — visually confusable characters, with a side-by-side compare mode. (Derived dataset; see `DATA-SOURCES.md` §7.)
- **[P0]** Everything is a hyperlink. Tapping any kanji, word, or reading anywhere in the app navigates to its detail. Maintain a navigation stack with back.
- **[P0]** Swipe left/right to move to the previous/next sticky in the current deck without leaving detail view.
- **[P0]** **Save** button — add this item to a deck. Setting controls whether it goes straight to a default "Saved" deck or prompts for a destination.
- **[P1]** Per-sticky user **notes** and **tags**.
- **[P1]** Audio playback of the word.

### 4.6 Writing trainer

- **[P0]** Full-screen writing canvas with a light guide grid (田-style 十字 crosshair).
- **[P0]** Stroke input via Pointer Events — finger, stylus, mouse, Apple Pencil. Pressure/tilt ignored; position only.
- **[P0]** **Stroke-order validation** against KanjiVG paths. Grade each stroke on start point, end point, direction, and shape similarity. See `ARCHITECTURE.md` §8 for the matching algorithm.
- **[P0]** *Correct pen strokes* setting: when on, an incorrect stroke is rejected immediately with a shake and the correct stroke is hinted. When off, the character is graded only after all strokes are drawn (harder).
- **[P0]** Hint escalation: after 2 failed attempts on a stroke, show the stroke's start dot; after 3, animate the stroke.
- **[P0]** Undo last stroke, clear all.
- **[P0]** Writing can be used as the **answer side of a study card** — the writing result feeds the grade.
- **[P1]** Leniency slider (strict / normal / forgiving) for people with shaky hands or small screens.
- **[P1]** Practice mode outside of study: pick a kanji, drill it N times.

### 4.7 Deck management

- **[P0]** **Deck chooser**: list of all decks with name, progress %, progress color bar, last studied. Swipe to delete. Rename.
- **[P0]** **Built-in decks**, available immediately, matching StickyStudy's set:
  - JLPT Kanji N5, N4, N3, N2, N1
  - JLPT Vocabulary N5, N4, N3, N2, N1
  - School Grade 1–6
  - School Grade 7 / 8 / 9 (the secondary-school jōyō remainder)
  - Jōyō Kanji (1981 list) and Jōyō Kanji (2010 revision)
  - Top 500 Kanji by frequency
  - Kana — Hiragana, Katakana, Kana Words
- **[P0]** **Create a new deck** from scratch (empty) or **by combining existing decks**, with an option to take only the first *N* stickies from the combination. This is how StickyStudy lets you build "the next 50 kanji I need."
- **[P0]** **Reset options** per deck: reset colors only / reset statistics only / restore built-in deck to original.
- **[P0]** **Remove duplicates** — delete stickies sharing the same question + reading.
- **[P0]** **Transfer progress** between two decks that share stickies, so a user moving from "JLPT N3 Kanji" to a custom deck doesn't lose their colors.
- **[P0]** Per-deck settings that override globals: study style, SRS intervals, goal date.
- **[P1]** Deck folders / grouping.
- **[P2]** Deck sharing via exported file or URL.

### 4.8 Goal scheduler

- **[P0]** Set a **target date** for a deck. The app computes and displays:
  - Days remaining
  - **Correct answers required today** to stay on pace
  - Whether the user is ahead or behind
- **[P0]** The home screen shows this prominently. The study screen shows live progress toward today's number.
- **[P0]** Recompute daily; missing a day redistributes the load across the remaining days rather than silently failing.
- **[P0]** Warn if the required daily volume becomes unrealistic (define threshold, e.g. >200 answers/day) and offer to extend the date.
- **[P1]** Rest days / weekday-only schedules.

### 4.9 Dictionary

- **[P0]** Unified search box accepting **kanji, kana, rōmaji, or English**. Detect input type automatically.
- **[P0]** Search words (JMdict), kanji (KANJIDIC2), and names (JMnedict).
- **[P0]** Results ranked by commonality, exact-match first, then prefix, then substring.
- **[P0]** **Wildcard search** (`*`, `?`) on Japanese forms.
- **[P0]** **Multi-radical search** — pick component radicals from a grid, get matching kanji. (Replaces StickyStudy's SKIP search, which we cannot license. See `DATA-SOURCES.md` §6.)
- **[P0]** Search by stroke count, JLPT level, grade, frequency band, individually or combined.
- **[P0]** Any result → detail view → save to deck.
- **[P0]** **Works fully offline** once the dictionary content pack is downloaded.
- **[P1]** Search history and pinned searches.
- **[P2]** SKIP code search, only if written permission is obtained from the rights holder.

### 4.10 Text analyzer

StickyStudy's "Translation" feature: paste Japanese, get furigana and glosses, harvest cards.

- **[P0]** Paste or type arbitrary Japanese text into a box.
- **[P0]** **Morphological tokenization** in-browser (no server round-trip), splitting the text into words with base forms.
- **[P0]** Render the text with **ruby furigana** above kanji.
- **[P0]** Tap any word → detail view → save to deck.
- **[P0]** **Add all unknown words** — bulk-add every word in the text that isn't already in a chosen deck.
- **[P0]** Options: furigana on/off, furigana only above non-N5 kanji, rōmaji toggle, per-word gloss inline vs. on-tap.
- **[P1]** **Web Share Target** registration — share Japanese text from any app on the phone directly into KanjiForge's analyzer.
- **[P1]** Text history (last N analyzed texts, stored locally).

### 4.11 History and statistics

- **[P0]** **Rolling bar chart** of study activity over time. Each bar = one day. Tap a bar for that day's detail (cards seen, correct %, time, level changes).
- **[P0]** Selectable range: 2 weeks / 3 months / 1 year / all.
- **[P0]** Per-deck and all-decks views.
- **[P0]** Headline stats: total time studied, last studied, current progress %, level distribution (a stacked bar of red→green counts).
- **[P0]** **Projected completion date** based on recent pace, shown against the goal date.
- **[P1]** Forecast chart: how many reviews are due on each of the next 30 days.
- **[P1]** Retention rate per level (what % of level-3 cards survive their review) — this is the diagnostic that tells a user their intervals are too aggressive.
- **[P1]** Heatmap calendar.

### 4.12 Import and export

- **[P0]** **Import** by pasting text directly into an import box, or by file upload. Supported formats:
  - CSV / TSV with a **column mapping UI** (don't guess; let the user map columns to fields)
  - One-per-line plain kanji or word lists
  - KanjiForge's own JSON deck format
- **[P0]** Import must **enrich**: given a bare list of kanji or words, look them up in the dictionary and populate readings, meanings, stroke data automatically. A user pasting 40 kanji from a textbook should get 40 complete stickies.
- **[P0]** Import preview with a per-row "matched / ambiguous / not found" status before committing. Ambiguous rows get a disambiguation picker.
- **[P0]** **Export** the current deck to clipboard as text, and to file as CSV and JSON.
- **[P0]** **Full backup export** — all decks, all settings, the complete review log — as a single JSON file. **Full restore** from that file.
- **[P1]** Anki `.apkg` import (read-only, best-effort field mapping).
- **[P1]** Anki-compatible CSV export.

### 4.13 Audio

- **[P0]** Playback control on word detail and optionally during study.
- **[P0]** **Tiered audio source resolution**, in order:
  1. Recorded audio from an installed audio content pack, if present
  2. Device **speech synthesis** (`SpeechSynthesis` with a `ja-JP` voice) as universal fallback
  3. Nothing (button hidden)
- **[P0]** Audio must not require network at study time when a pack is installed.
- **[P1]** User-importable audio packs (drop in a zip of `word.mp3` files + a manifest).
- **[P2]** Optional self-hosted neural TTS pre-rendering pipeline for a project-official audio pack.

> **Licensing note:** we cannot ship StickyStudy's human-recorded 8,000-word audio set or any commercial equivalent. See `DATA-SOURCES.md` §8. Set expectations in the UI honestly: synthesized audio is labeled as such.

### 4.14 Settings

**Per-deck**
- **[P0]** Study style (question/answer field config, two-tap mode)
- **[P0]** SRS intervals + new-cards-per-session
- **[P0]** Pass is −1
- **[P0]** Grey stickies
- **[P0]** Session summary on/off
- **[P0]** Correct pen strokes
- **[P0]** Hide related answers
- **[P0]** Goal date
- **[P0]** Import / Export / Reset / Remove duplicates / Transfer progress / Restore to original

**Global**
- **[P0]** Theme: light / dark / auto, plus an "auto between 21:00 and 06:00" option matching StickyStudy's night mode
- **[P0]** Auto-play audio
- **[P0]** Inline stroke animations instead of static glyphs
- **[P0]** Tile view zoom ratio and default tile content
- **[P0]** "Save to Saved deck" vs. "always ask"
- **[P0]** Font size / text scaling
- **[P0]** Content pack manager (download, update, delete, see sizes)
- **[P0]** Data & privacy: export everything, delete everything, storage usage
- **[P1]** Daily study reminder notification time
- **[P1]** UI language (English / 日本語)

### 4.15 PWA and platform

- **[P0]** Valid web app manifest; installable to home screen on iOS Safari, Android Chrome, and desktop Chrome/Edge.
- **[P0]** Service worker with precached app shell; **full study functionality offline** after first visit.
- **[P0]** Content packs cached in Cache Storage; user data in IndexedDB.
- **[P0]** **Request persistent storage** (`navigator.storage.persist()`) on first meaningful use, with an explanatory prompt — otherwise iOS may evict everything after 7 days of non-use. This is a real data-loss risk and must be handled explicitly, including a warning in Settings if persistence was denied.
- **[P0]** Safe-area insets respected (notch, home indicator). Standalone display mode. Correct theme-color for both schemes.
- **[P0]** Update flow: when a new service worker is waiting, show a non-blocking "Update available" toast; never hot-swap mid-session.
- **[P1]** Web Push daily reminder (works on iOS 16.4+ only when installed; degrade gracefully).
- **[P1]** Web Share Target for the text analyzer.
- **[P1]** File handler registration for `.kanjiforge` backup files.

### 4.16 Sync and backup

- **[P0] MVP:** account-based, real-time cross-device sync via a self-hosted PowerSync + Postgres + better-auth server (see `ARCHITECTURE.md` §10). Sign-in is required (§1.2), so sync is live from a user's first session — not an opt-in add-on. Offline writes are queued locally and flushed on reconnect; the study loop never blocks on network state.
- **[P0]** Manual full-backup export/import as a JSON file, plus per-deck export, kept as an independent escape hatch even though live sync exists — this is what makes the data genuinely portable and un-lockable-in (PRD §1.2 principle 4). Clearly surfaced, with a nag if no backup has been taken in 30 days.
- **[P1]** File System Access API on desktop: pick a backup folder once, auto-write a backup on a schedule.
- Design constraint honored by the server design: **the review log is append-only and each record carries a stable UUID + device ID + timestamp**, so the same `replay()` projection that powers sync also powers backup/restore and any future scheduler migration. Deck/settings conflicts resolve last-write-wins per field.

### 4.17 Accessibility

- **[P0]** Color is never the *only* signal for level — every color chip carries a numeric level or label available to screen readers, and there is a "shapes + color" mode for color-vision deficiency.
- **[P0]** Palette verified against protanopia/deuteranopia/tritanopia simulation. The default red→green ramp is the worst possible choice for the most common CVD; ship an alternate ramp (e.g. purple→yellow) and let users switch. **Do not skip this.**
- **[P0]** All interactive targets ≥44×44 CSS px.
- **[P0]** Full keyboard operability; visible focus rings.
- **[P0]** `prefers-reduced-motion` respected — card flips and stroke animations become instant transitions.
- **[P0]** WCAG AA contrast on all text.
- **[P0]** Correct `lang="ja"` on Japanese text so screen readers and font selection behave.
- **[P1]** Adjustable furigana size; dyslexia-friendly Latin font option.

---

## 5. Screen inventory

| # | Screen | Purpose | Notes |
|---|---|---|---|
| 1 | Onboarding | Pick a starting deck, optionally set a goal, request storage persistence | ≤3 steps, skippable |
| 2 | Home / Study status | Current deck, progress ring + %, days to goal, today's remaining, last studied, total time, big Start button | The app's front door |
| 3 | Deck chooser | All decks, progress, last studied, rename/delete/new | Modal sheet from Home |
| 4 | New deck | Name, combine-from-decks checklist, take-first-N | Modal |
| 5 | Study | The card, reveal, three grades | Full-screen, chrome-minimal |
| 6 | Session summary | What just happened | Dismissible sheet |
| 7 | Browse — tiles | Zoomable color wall | The signature screen |
| 8 | Browse — list | Sort, filter, multi-select, bulk edit | Toggle from tiles |
| 9 | Detail | Kanji or word reference, hyperlinked | Push/pop navigation stack |
| 10 | Writing | Stroke practice + validation | Full-screen |
| 11 | Dictionary | Search + results | Tab-level destination |
| 12 | Text analyzer | Paste → furigana → harvest | Tab-level destination |
| 13 | History | Bar chart, stats, forecast | Tab-level destination |
| 14 | Settings | Global + per-deck | Tab-level destination |
| 15 | Import / Export | Paste box, file picker, column mapping, preview | From Settings |
| 16 | Content packs | Download/update/delete data bundles | From Settings |

### 5.1 Navigation model

- **Mobile:** bottom tab bar with 5 destinations — **Study · Browse · Dictionary · History · Settings**. Text analyzer lives under Dictionary. Detail views push over the tab.
- **Tablet / desktop:** persistent left sidebar for the same 5 destinations, plus a two-pane layout where Browse (list) and Detail sit side by side. Dictionary results and detail also become two-pane. Study stays centered and full-bleed with a max width — do not stretch a flashcard to 2,560px.
- The deck chooser is global and reachable from any screen via the header.

---

## 6. Design direction

> **The concrete, shipped decisions — palette, ramp, type, components, motion, identity assets — live in [`BRAND-DESIGN-LANGUAGE.md`](./BRAND-DESIGN-LANGUAGE.md).** This section states the *requirements* that document must satisfy; treat the reference ramp and font suggestions below as the brief, not the final answer.

### 6.1 The core visual metaphor

Physical sticky notes / paper slips. Cards should feel like objects: subtle drop shadow, slight paper texture at high zoom, a satisfying flip. The color ramp is the brand. Everything else stays quiet so the color can shout.

### 6.2 Color ramp

The level ramp is the most important design decision in the product. Requirements:

- Five distinguishable steps that read as a clear *progression*, not five arbitrary colors.
- Legible as small tiles (12px) and as full-screen backgrounds.
- Works in light and dark themes.
- At least one alternate ramp for color-vision deficiency.

Reference default ramp (adjust in design, but keep the perceptual spacing):

| Level | Name | Light | Dark |
|---|---|---|---|
| 0 | New | `#E5484D` | `#E5484D` |
| 1 | Seen | `#F76B15` | `#FF8B3D` |
| 2 | Learning | `#FFC53D` | `#FFD75E` |
| 3 | Known | `#99D52A` | `#B0E64A` |
| 4 | Mastered | `#30A46C` | `#3DD68C` |

Alternate CVD-safe ramp: a single-hue lightness/chroma ramp (deep purple → pale yellow) so progression survives any form of color blindness.

**Shipped decision:** the chosen ramp is not this reference table — see `BRAND-DESIGN-LANGUAGE.md` §3 for the belt-rank ramp (白 → 黄 → 緑 → 青 → 黒) that replaced it, built on strictly increasing perceptual lightness so it satisfies every requirement above without a separate CVD mode.

### 6.3 Typography

- **Japanese:** a proper Japanese face at large sizes. Noto Sans JP for UI, Noto Serif JP or Klee One for the large card character (Klee's textbook-style forms match how kanji are actually taught to write). Subset aggressively — see `ARCHITECTURE.md` §6.
- **Latin:** one characterful face for headings/numbers and one highly legible face for body and glosses. Avoid the defaults; the type is doing brand work here.
- Furigana at ~50% of base size with tight leading, never clipped.

### 6.4 Motion

- Card reveal: a fast crossfade or flip, ≤180ms.
- Grading: the card exits in the direction of the swipe; the color strip animates to the new level.
- Tile view: momentum pan, pinch zoom with rubber-banding.
- Stroke animation: draw at a speed calibrated to real handwriting, not instant.
- Everything above collapses to instant under `prefers-reduced-motion`.

### 6.5 Copy

Plain, direct, in the user's frame. "4 correct answers to master this" not "SRS interval stage 4/5." Errors say what broke and what to do. Empty states invite an action ("This deck is empty — import a word list or add from the dictionary").

---

## 7. Success criteria

### 7.1 Functional acceptance (MVP is done when)

- A new user can sign in, install, pick JLPT N5 Kanji, and complete a 20-card session in under 90 seconds from first tap after sign-in, with no further network needed after initial load.
- Airplane mode: every feature in §4.1–4.8 and §4.11–4.14 works.
- A 2,136-card jōyō deck renders in tile view and pans at ≥50fps on a mid-range 2021 Android phone.
- Answering a card (tap → next card visible) completes in <100ms at p95.
- A full backup export → wipe → import restores byte-identical study state and review history.
- Pasting 100 kanji into import produces 100 complete stickies with readings and meanings.
- Stroke validation accepts correct strokes ≥95% of the time and rejects wrong-order strokes ≥95% of the time in a 50-kanji manual test.
- Every bundled data file appears in `ATTRIBUTION.md` with a verified license.

### 7.2 Performance budgets

| Metric | Budget |
|---|---|
| App shell JS (gzipped) | ≤200 KB |
| Initial install (shell + one starter deck) | ≤5 MB |
| Time to interactive, mid-range mobile, cold | ≤2.5 s |
| Card flip | ≤100 ms p95 |
| Dictionary search response (offline) | ≤150 ms p95 |
| Tile view pan | ≥50 fps at 2,500 cards |
| Full dictionary pack (optional download) | ≤40 MB compressed |

### 7.3 Product metrics (privacy-preserving, opt-in only)

If any telemetry exists it must be opt-in, anonymous, and self-hostable. Suggested: D7/D30 return rate, sessions per week, cards per session, % of users who set a goal, % who complete a goal, crash-free rate. **No content, no card data, no text ever leaves the device.**

---

## 8. Delivery phases

### Phase 0 — Data pipeline (before any UI)
Build the ETL that turns upstream open dictionaries into KanjiForge's content packs. Nothing else can be trusted until this is reproducible in CI. Deliverable: versioned `kanji`, `words`, `sentences`, `radicals`, `strokes` packs + the built-in deck definitions + `ATTRIBUTION.md`.

### Phase 1 — Study loop
Data model, SRS engine, review log, study screen, three grade buttons, one built-in deck, home screen. Nothing else. Ship this to yourself and use it daily.

### Phase 2 — Decks and browse
Deck chooser, all built-in decks, list view, tile view, filters/sorts, manual level editing.

### Phase 3 — Reference depth
Detail view, stroke animations, example words/sentences, similar kanji, dictionary search, multi-radical search.

### Phase 4 — Input and output
Import (paste/CSV/enrichment/preview), export, full backup/restore, deck combining, transfer progress, reset options.

### Phase 5 — Goals, history, writing
Goal scheduler, history charts, statistics, forecast, writing trainer with stroke validation.

### Phase 6 — PWA polish
Install prompts, offline hardening, storage persistence, content pack manager, update flow, theming, accessibility audit, performance pass.

### Phase 7 — Text analyzer + audio
Tokenizer integration, furigana rendering, bulk harvest, share target, audio tiering.

**MVP = Phases 0–6.** Phase 7 ships as v1.1 alongside optional sync.

---

## 9. Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| iOS evicts IndexedDB after 7 days idle | Catastrophic data loss | Request persistent storage early; nag for backups; surface persistence status in Settings |
| Full JMdict/JMnedict is too large for mobile storage | Feature unusable | Ship as optional tiered packs (core words → full words → names); never required for study |
| Tile view perf at 2,000+ cards | Signature feature feels broken | Canvas rendering at low zoom, DOM only at high zoom; virtualize; prototype in Phase 0 |
| JLPT level lists have no official source post-2010 | Deck accuracy questioned | Use openly-licensed community lists, cite them explicitly in the deck description, allow user correction |
| SKIP indexing is not openly licensable | Lost search feature | Replace with multi-radical + stroke count search; pursue permission separately |
| No openly-licensed human audio at scale | Weaker than StickyStudy | Tiered fallback to device TTS; label honestly; leave the pack format open for community contribution |
| Stroke-order validation false negatives frustrate users | Feature abandoned | Leniency setting; hint escalation; never block progress on a failed stroke |
| Scope creep from feature-parity ambition | Never ships | Phase discipline; Phase 1 must be dogfooded before Phase 2 starts |

**Resolved:**
1. ~~Code license~~ → **MIT.** Rationale: enforcement of a copyleft license is not realistically available to a solo maintainer, and permissive licensing lowers the barrier to contribution. Note that this decision applies to the *code only* — bundled and derived data remains CC BY-SA 4.0 by obligation, which already forecloses a fully-closed fork of the content packs. See §9.1.
2. ~~Is a hosted instance offered at all, or is it strictly self-host?~~ → **Strictly self-host, account required.** The maintainer self-hosts their own instance (Postgres + better-auth + PowerSync) via Coolify; there is no maintainer-run hosted service in scope. The client app remains a static deploy (`ARCHITECTURE.md` §2), but it is not usable without a running account/sync server — that server is a mandatory deployable for anyone running KanjiForge, not an optional v1.1 extra. See `ARCHITECTURE.md` §10 for the full stack and env vars.

**Open questions for the maintainer:**
3. Should the built-in decks be bundled in the initial install or downloaded as packs on first run? Trade-off: install size vs. offline-from-zero.

### 9.1 Licensing structure

Two licenses, in two files, stated plainly in the README's first screenful. Dual-licensed repositories are misread routinely, and the misreading always goes in the permissive direction.

| Path | License | File |
|---|---|---|
| `src/`, `scripts/`, all application and pipeline code | **MIT** | `LICENSE` |
| `packs/`, all generated content packs, deck definitions, `similar.json` | **CC BY-SA 4.0** | `LICENSE-DATA` |
| Upstream source attributions | per-source | `ATTRIBUTION.md` |

Practical consequences:

- Anyone may fork, close, rebrand, or sell the application code. That is intentional.
- Nobody may close the data packs. Any distribution of the content — including a proprietary fork's — must remain CC BY-SA 4.0 with attribution intact. This is a meaningful constraint, because the packs are most of the project's actual value and cannot be regenerated without the pipeline.
- The pack manifest carries its own `license` field, so a pack separated from the repo is still self-describing and still encumbered.

**Name and brand.** MIT gives away the code, not the identity. If protecting against app-store clones matters, trademark registration on the project name and icon is the only available lever, and it is independent of the software license. Decide separately; it does not block MVP.

---

## 10. Companion documents

| Document | Contents |
|---|---|
| `FEATURE-PARITY.md` | Complete StickyStudy feature inventory mapped to KanjiForge status |
| `SRS-SPEC.md` | The scheduling algorithm, queue builder, and goal math in implementable detail |
| `DATA-SOURCES.md` | Every dataset, its license, its size, and its extraction plan |
| `ARCHITECTURE.md` | Stack, data model, storage, rendering, tokenization, stroke matching, sync design |
