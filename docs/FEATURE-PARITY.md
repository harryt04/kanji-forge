# KanjiForge — StickyStudy Feature Parity Matrix

Complete inventory of StickyStudy Japanese's advertised and documented features, mapped to KanjiForge's plan. Sourced from the official product page and the official user guide (Basics, Browse, Detail, Writing, History, Dictionary, Settings, Import/Export).

**Legend**
✅ MVP · 🔷 v1.1 · 🔶 v1.2+ · ❌ Not doing (with reason) · ➕ KanjiForge-only addition

**Implementation tracking**
Each feature row includes an "Implemented" column showing:
- ✓ **Date (YYYY-MM-DD)** — Feature is complete and tested. Date marks when it was verified.
- ⏳ **In progress** — Actively being implemented.
- (empty) — Not yet started.

When implementing a feature, update the "Implemented" cell with today's date. Include a note in the table if implementation differs significantly from the specification. All MVP features (✅) should be marked with implementation dates before MVP release.

---

## 1. Study & SRS

| # | StickyStudy feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 1.1 | Level/color SRS, red → green | ✅ | 2026-08-06 | Core mechanic. SRS-SPEC §2 |
| 1.2 | 4 consecutive correct answers to master | ✅ | 2026-08-06 | |
| 1.3 | Three answer buttons: I don't know / I know / No problem | ✅ | 2026-08-06 | |
| 1.4 | "Pass is −1" setting | ✅ | 2026-08-06 | Including the forced-on-below-10-reds rule |
| 1.5 | Adjustable per-stage intervals with sliders | ✅ | 2026-08-06 | Plus presets |
| 1.6 | "Total time to green" derived display (3+9+30=42) | ✅ | 2026-08-06 | |
| 1.7 | Green sticky recycling, adjustable | ✅ | 2026-08-06 | |
| 1.8 | New-cards-per-session control ("red slider") | ✅ | 2026-08-06 | |
| 1.9 | Intervals as guidelines, other priorities can reorder | ✅ | 2026-08-06 | Queue builder, SRS-SPEC §5 |
| 1.10 | Manual color override | ✅ | — | Detail + list view |
| 1.11 | Grey stickies (hide color during study) | ✅ | — | |
| 1.12 | Session summary dialog | ✅ | 2026-08-06 | |
| 1.13 | Study timer, tap to show | ✅ | 2026-08-07 | Elapsed session timer is hidden until requested and updates once per second |
| 1.14 | Flag a sticky during study | ✅ | 2026-08-07 | Accessible flag/unflag control persists the card state locally and queues it for sync |
| 1.15 | External keyboard shortcuts (←→↑↓, space, a) | ✅ | 2026-08-06 | Same bindings |
| 1.16 | Swipe left/right to grade | ✅ | 2026-08-06 | |
| — | Undo last answer | ➕ ✅ | 2026-08-06 | StickyStudy lacks this |
| — | Interval fuzz to prevent pile-ups | ➕ ✅ | 2026-08-06 | |
| — | Append-only review log | ➕ ✅ | 2026-08-06 | Enables everything in §7 |
| — | Retention-by-level diagnostic | ➕ 🔷 | 2026-08-07 | Home reports study-answer retention for each starting level and flags levels below 80% as possible interval problems |
| — | Optional FSRS scheduler mode | ➕ 🔶 | — | Shares the same log |

## 2. Study style configuration

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 2.1 | Choose what appears before the tap | ✅ | — | |
| 2.2 | Choose what appears after the tap | ✅ | — | |
| 2.3 | 2-tap study (word → readings → everything) | ✅ | — | Overrides field config |
| 2.4 | Word + writing cannot both be the question | ✅ | — | Enforced in the UI |
| 2.5 | Audio setting ignored for kanji-only decks | ✅ | — | |
| 2.6 | Writing setting ignored for word-only decks | ✅ | — | |
| 2.7 | Restore study style to default | ✅ | — | |
| 2.8 | Hide 'Related' answers until tapped | ✅ | — | |
| 2.9 | Auto-play audio during study | ✅ | — | Device TTS in MVP |

## 3. Browse

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 3.1 | Tile view — zoom out to see all stickies | ✅ | Phase 0 | Prototype only; ARCHITECTURE §5 |
| 3.2 | Configurable tile content | ✅ | — | |
| 3.3 | Zoom ratio setting | ✅ | — | |
| 3.4 | Tap tile for detail | ✅ | — | |
| 3.5 | List view | ✅ | — | Virtualized |
| 3.6 | Inline color editing in list view | ✅ | — | |
| 3.7 | Sorting | ✅ | — | Expanded set — PRD §4.4 |
| 3.8 | Filtering | ✅ | — | Expanded set |
| 3.9 | Searching within a deck | ✅ | — | |
| 3.10 | Sticky count badge on the Browse icon | ✅ | — | Tab badge |
| 3.11 | Set current deck's browse settings as the default for all decks | ✅ | — | |
| — | Multi-select + bulk actions | ➕ ✅ | — | |

## 4. Detail view

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 4.1 | Kanji details: readings, meanings, stroke count, radical, elements | ✅ | — | KANJIDIC2 + KanjiVG |
| 4.2 | School grade, JLPT level, frequency | ✅ | — | JLPT flagged as unofficial |
| 4.3 | Nanori (name readings) | ✅ | — | |
| 4.4 | SKIP code display | ❌ | — | Not licensable — DATA-SOURCES §6 |
| 4.5 | Similar-looking kanji | ✅ | — | Generated dataset — DATA-SOURCES §7 |
| 4.6 | Example words containing this kanji | ✅ | — | Ranked by frequency |
| 4.7 | Example sentences with breakdown | ✅ | — | Tatoeba |
| 4.8 | Everything hyperlinked | ✅ | — | Navigation stack |
| 4.9 | Swipe between stickies in detail view | ✅ | — | |
| 4.10 | Save sticky to a deck | ✅ | — | |
| 4.11 | "Save to Saved deck" vs. always-ask setting | ✅ | — | |
| 4.12 | Inline stroke animations instead of static glyph | ✅ | — | Global setting |
| 4.13 | Night mode with auto 21:00–06:00 | ✅ | — | Plus a full theme system |
| 4.14 | Native-speaker audio per word | ⚠️ Partial | — | Device TTS in MVP; community packs 🔷 — DATA-SOURCES §8 |
| — | Per-sticky notes and tags | ➕ 🔷 | — | |

## 5. Writing

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 5.1 | Writing trainer with stroke input | ✅ | — | Pointer Events, stylus supported |
| 5.2 | 6,500+ kanji stroke animations | ✅ | — | KanjiVG (T6.0) |
| 5.3 | "Correct pen strokes" — reject wrong strokes live | ✅ | — | Toggle (T6.0) |
| 5.4 | Writing as the answer side of a study card | ✅ | — | (T6.0) |
| — | Hint escalation after repeated failures | ➕ ✅ | — | (T6.0) |
| — | Leniency setting | ➕ ✅ | — | Accessibility (T6.0) |
| — | Alternate-stroke-order exceptions table | ➕ ✅ | — | ARCHITECTURE §8 (T6.0) |
| — | Standalone drill mode | ➕ 🔷 | — | |

## 6. Decks

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 6.1 | Deck chooser with progress %, color, last studied | ✅ | 2026-08-06 | |
| 6.2 | Rename deck | ✅ | — | |
| 6.3 | Delete deck (swipe) | ✅ | — | |
| 6.4 | Create new deck | ✅ | — | |
| 6.5 | Combine multiple decks into a new deck | ✅ | — | |
| 6.6 | Take only the first N stickies when combining | ✅ | — | |
| 6.7 | Built-in JLPT Kanji N1–N5 | ✅ | 2026-08-06 | Sourced per DATA-SOURCES §5 (content pipeline) |
| 6.8 | Built-in JLPT Vocabulary N1–N5 | ✅ | 2026-08-06 | Same caveat (content pipeline) |
| 6.9 | Built-in School Grade 1–6 | ✅ | 2026-08-06 | KANJIDIC2 grade field (content pipeline) |
| 6.10 | Built-in School Grade 7/8/9 (KK4/KK3/KK2.5) | ✅ | 2026-08-06 | grade 8 partitioned by frequency (content pipeline) |
| 6.11 | Built-in Jōyō (Old, 1981) | ✅ | 2026-08-06 | (content pipeline) |
| 6.12 | Built-in Jōyō (New, 2010) | ✅ | 2026-08-06 | 2,136 characters (content pipeline) |
| 6.13 | Built-in Top 500 Kanji | ✅ | 2026-08-06 | freq 1–500 (content pipeline) |
| 6.14 | Built-in Hiragana / Katakana / Kana Words | ✅ | 2026-08-06 | (content pipeline) |
| 6.15 | Reset colors | ✅ | — | |
| 6.16 | Reset statistics | ✅ | — | |
| 6.17 | Restore built-in deck to original | ✅ | — | |
| 6.18 | Remove duplicates (same question + reading) | ✅ | — | |
| 6.19 | Transfer progress between decks sharing stickies | ✅ | — | |
| — | Deck folders / grouping | ➕ 🔷 | — | |
| — | Deck sharing by file or URL | ➕ 🔶 | — | |
| — | Kanji Kentei level decks | ➕ 🔶 | — | If an openly-licensed list is found |

## 7. Goal scheduler, history & statistics

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 7.1 | Set a goal date | ✅ | 2026-08-06 | |
| 7.2 | Days-to-goal display | ✅ | 2026-08-06 | |
| 7.3 | Remaining correct answers required today | ✅ | 2026-08-06 | SRS-SPEC §6 |
| 7.4 | Overall progress percent | ✅ | 2026-08-06 | Level-weighted — SRS-SPEC §7 |
| 7.5 | Overall progress as color | ✅ | 2026-08-07 | Home progress uses the level-weighted belt-rank ramp with an accessible level/name label |
| 7.6 | Last time studied / total time studied | ✅ | 2026-08-07 | Home shows the latest completed-card time and total duration of completed local study sessions |
| 7.7 | Rolling bar chart of study history | ✅ | 2026-08-07 | History shows a 30-day local daily-activity chart with review/correct/again totals |
| 7.8 | Tap a bar for that day's detail | ✅ | 2026-08-07 | History bars are keyboard/touch selectable and show that day's review, correct, and again breakdown |
| — | On-pace / ahead / behind status | ➕ ✅ | 2026-08-06 | |
| — | Projected completion date vs. goal | ➕ ✅ | 2026-08-07 | Home projects completion from correct answers per active day over the trailing 14 days and explains >20% divergence from the goal date |
| — | Level distribution stacked bar | ➕ ✅ | 2026-08-07 | Home shows all five belt-rank levels, including untouched cards as level 0, with an accessible stacked bar and count legend |
| — | 30-day review forecast | ➕ 🔷 | 2026-08-07 | Home shows the currently scheduled due-review workload for the next 30 calendar days; overdue cards count today and unscheduled new cards are excluded |
| — | Retention rate per level | ➕ 🔷 | — | |
| — | Leech identification | ➕ 🔷 | 2026-08-07 | Home surfaces cards with six or more lapses for manual attention, following SRS-SPEC §8 |
| — | Heatmap calendar | ➕ 🔷 | 2026-08-07 | History includes a keyboard-accessible 30-day activity grid with intensity by review count and shared day detail selection |
| — | Unrealistic-pace warning with inline fixes | ➕ ✅ | 2026-08-07 | Home warns above 200 answers/day and offers a one-tap later-date suggestion; smaller-deck selection remains unavailable for the built-in fixture deck |

## 8. Dictionary

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 8.1 | Search by kanji, kana, or English | ✅ | 2026-08-07 | Offline search over the installed KANJIDIC2/JMdict fixture packs |
| 8.2 | Rōmaji input | ✅ | 2026-08-07 | Dictionary search normalizes romaji to hiragana before matching |
| 8.3 | ~700,000 entries including names and places | 🔷 | — | JMnedict as an optional pack |
| 8.4 | Details for 6,355 kanji | ✅ | — | KANJIDIC2 covers 13,108 |
| 8.5 | SKIP search | ❌ | — | Replaced by multi-radical search |
| 8.6 | Search by radical | ✅ | — | KRADFILE/RADKFILE |
| 8.7 | Search by stroke count | ✅ | — | |
| 8.8 | Wildcard search | ✅ | — | |
| 8.9 | Save any result to a deck | ✅ | — | |
| 8.10 | Fully offline | ✅ | 2026-08-06 | SQLite-WASM over OPFS (content pipeline) |
| — | Search history / pinned searches | ➕ 🔷 | 2026-08-07 | Recent searches and pinned queries persist per authenticated user in the local database and work offline |

## 9. Text analysis & news

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 9.1 | Paste Japanese text → readings, furigana, English | 🔷 | — | Requires the tokenizer pack (T3.0) |
| 9.2 | Many display options for the analyzed output | 🔷 | — | (T3.0) |
| 9.3 | Tap any word → detail → save to deck | 🔷 | — | (T3.0) |
| 9.4 | Live Japanese news feed, updated daily | ❌ as built | — | NHK Easy content is copyrighted |
| 9.5 | Tap an article → broken into words + furigana | 🔷 | — | Applies to any user-supplied text (T3.0) |
| — | Add all unknown words from a text in bulk | ➕ 🔷 | — | |
| — | Web Share Target — share text into KanjiForge from any app | ➕ 🔷 | — | |
| — | User-configurable RSS with link-out, no reproduction | ➕ 🔶 | — | Legal alternative to 9.4 |
| — | CC-licensed news source (e.g. Japanese Wikinews) | ➕ 🔶 | — | Legal alternative to 9.4 |

## 10. Import & export

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 10.1 | Import by typing/pasting into an import box | ✅ | — | (T8.0) |
| 10.2 | CSV import | ✅ | — | With column mapping UI (T8.0) |
| 10.3 | Multiple import formats | ✅ | — | CSV, TSV, line lists, JSON (T8.0) |
| 10.4 | Append imported stickies to the current deck | ✅ | — | (T8.0) |
| 10.5 | Export deck to clipboard as text | ✅ | — | (T8.0) |
| — | Auto-enrichment of bare kanji/word lists | ➕ ✅ | — | ARCHITECTURE §9 (T8.0) |
| — | Import preview with matched/ambiguous/not-found | ➕ ✅ | — | (T8.0) |
| — | Export to CSV and JSON files | ➕ ✅ | — | (T8.0) |
| — | Full backup export/restore incl. review history | ➕ ✅ | — | (T8.0) |
| — | Anki .apkg import | ➕ 🔷 | — | Best-effort (T8.0) |

## 11. Sync & backup

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 11.1 | iCloud backup and sync | ❌ as built | — | Platform-locked |
| 11.2 | Dropbox backup | ❌ | — | Discontinued upstream too |
| — | Manual full backup file | ➕ ✅ | — | MVP replacement for 11.1 (T8.0) |
| — | Auto-backup to a chosen folder (File System Access) | ➕ 🔷 | — | Desktop (T2+) |
| — | Optional self-hostable sync server | ➕ 🔷 | — | ARCHITECTURE §10 (T4.0) |
| — | Backup nag when none taken in 30 days | ➕ ✅ | — | |

## 12. Platform & settings

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 12.1 | Night mode (manual + auto 21:00–06:00) | ✅ | — | |
| 12.2 | App icon badge with configurable info | ⚠️ Partial | — | Badging API where supported; not on iOS |
| 12.3 | Notifications | 🔷 | — | Web Push, installed-only on iOS (T1.1) |
| 12.4 | Extensive options | ✅ | — | PRD §4.14 |
| 12.5 | Full in-app documentation | ✅ | — | Bundled offline help |
| — | Installable to home screen, all platforms | ➕ ✅ | — | (T5.0) |
| — | Works in a plain browser with no install | ➕ ✅ | 2026-08-06 | |
| — | Tablet / laptop / desktop layouts | ➕ ✅ | — | Two-pane above `md` |
| — | Full keyboard operability | ➕ ✅ | 2026-08-06 | |
| — | CVD-safe alternate color ramp | ➕ ✅ | — | The red→green default is the worst case for CVD |
| — | Screen reader support | ➕ ✅ | — | |
| — | Open source, self-hostable, no account | ➕ ✅ | 2026-08-06 | The whole point |
| — | Chinese/hanzi support (StickyStudy has a separate app) | 🔶 | — | Architecture allows; out of MVP scope |

---

## 13. Gaps where KanjiForge will be worse

Be honest about these in the README rather than discovering them in issue reports.

| Gap | Severity | Mitigation |
|---|---|---|
| No human-recorded audio for 8,000+ words | Medium | Device TTS; community packs; label synthesized audio as such |
| No SKIP search | Low | Multi-radical search is a good substitute for the same job |
| No built-in news feed | Low | Text analyzer covers the underlying use case; users can paste anything |
| No iCloud sync | Medium | Manual backup at MVP; optional sync server at v1.1 |
| JLPT lists are community estimates | Low | StickyStudy's are too — but we say so |
| iOS storage eviction risk | **High** | Persistence request, backup nagging, install prompting — ARCHITECTURE §7.2 |
| Tile view perf ceiling vs. native | Medium | Canvas renderer, prototyped before anything else is built |

---

## 14. Where KanjiForge should be better

Not parity — reasons for someone to switch.

1. **Cross-platform.** Android, desktop, and the web are entirely unserved by StickyStudy today.
2. **Your data is a file.** Full export including complete review history, in an open format, at any time, without an account.
3. **Undo.** A misfired swipe is currently unrecoverable.
4. **Diagnostics.** Retention-by-level and the review forecast turn the SRS from a black box into something a user can actually tune.
5. **Accessibility.** Keyboard-complete, screen-reader-usable, CVD-safe ramp, reduced-motion respected.
6. **Import enrichment.** Paste a textbook chapter's kanji list, get complete cards, in one step.
7. **Open decks.** Anyone can contribute a deck; nobody waits on one maintainer.
8. **No trust required.** Nothing leaves the device. The code is readable. It'll still work in ten years.
