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
| 1.10 | Manual color override | ✅ | 2026-08-07 | Browse list level picker persists a manual SRS assignment without changing review totals |
| 1.11 | Grey stickies (hide color during study) | ✅ | 2026-08-07 | Study toolbar toggle persists per-user and replaces level colors with a neutral border while retaining the accessible level label |
| 1.12 | Session summary dialog | ✅ | 2026-08-06 | |
| 1.13 | Study timer, tap to show | ✅ | 2026-08-07 | Elapsed session timer is hidden until requested and updates once per second |
| 1.14 | Flag a sticky during study | ✅ | 2026-08-07 | Accessible flag/unflag control persists the card state locally and queues it for sync |
| 1.15 | External keyboard shortcuts (←→↑↓, space, a) | ✅ | 2026-08-06 | Same bindings |
| 1.16 | Swipe left/right to grade | ✅ | 2026-08-06 | |
| — | Undo last answer | ➕ ✅ | 2026-08-06 | StickyStudy lacks this |
| — | Interval fuzz to prevent pile-ups | ➕ ✅ | 2026-08-06 | |
| — | Append-only review log | ➕ ✅ | 2026-08-06 | Enables everything in §7 |
| — | Retention-by-level diagnostic | ➕ 🔷 | 2026-08-07 | Home reports study-answer retention for each starting level and flags levels below 80% as possible interval problems |
| — | Optional FSRS scheduler mode | ➕ ✅ | 2026-08-08 | Adaptive interval mode keeps the visible five-level belt-rank progression while shaping due dates from review accuracy and lapses; it shares the append-only review log and can be switched back without rewriting history |

## 2. Study style configuration

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 2.1 | Choose what appears before the tap | ✅ | 2026-08-07 | Settings persistently chooses kanji, reading, or first meaning for the starter-deck question face |
| 2.2 | Choose what appears after the tap | ✅ | 2026-08-07 | Settings independently persists kanji, reading, and meaning answer fields; at least one answer field remains selected |
| 2.3 | 2-tap study (word → readings → everything) | ✅ | 2026-08-07 | Settings toggle; overrides question and answer field choices while enabled |
| 2.4 | Word + writing cannot both be the question | ✅ | — | Enforced in the UI |
| 2.5 | Audio setting ignored for kanji-only decks | ✅ | 2026-08-08 | Study audio controls and auto-play apply only to dictionary-word cards; kanji-only decks remain silent |
| 2.6 | Writing setting ignored for word-only decks | ✅ | 2026-08-08 | Dictionary-word memberships remain studyable in custom decks, while the kanji writing pad is omitted for word cards |
| 2.7 | Restore study style to default | ✅ | 2026-08-07 | Settings restores the kanji question and all answer fields offline |
| 2.8 | Hide 'Related' answers until tapped | ✅ | 2026-08-08 | Study reveals up to three offline related example words for kanji; each word's reading and English meaning stays hidden until its disclosure control is tapped |
| 2.9 | Auto-play audio during study | ✅ | 2026-08-07 | Study can replay a labeled device-synthesized Japanese voice and optionally autoplay the first reading on reveal |

## 3. Browse

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 3.1 | Tile view — zoom out to see all stickies | ✅ | 2026-08-07 | Browse now has a persisted compact tile wall for the filtered/sorted deck; tiles encode level and flag state accessibly. The canvas performance prototype remains available for the future 2,500-tile gate. |
| 3.2 | Configurable tile content | ✅ | 2026-08-07 | Browse tiles can show kanji, reading, or the first English meaning; the choice persists per user offline |
| 3.3 | Zoom ratio setting | ✅ | 2026-08-07 | Browse persists 75% compact, 100% standard, and 150% large tile density per user and applies it to the tile wall |
| 3.4 | Tap tile for detail | ✅ | 2026-08-07 | Browse tiles open an authenticated offline kanji detail view backed by the installed content pack |
| 3.5 | List view | ✅ | 2026-08-08 | Accessible local-first list for the installed deck, with level/color, readings, meanings, and flag state; lists above 500 cards use an overscanned fixed-row viewport so full-size packs do not create one DOM node per card |
| 3.6 | Inline color editing in list view | ✅ | 2026-08-07 | Accessible per-card level picker schedules the new level and persists a manual override offline |
| 3.7 | Sorting | ✅ | 2026-08-07 | Browse list sorts offline by deck order, level, stroke count, frequency, JLPT, school grade, review count, last review, or kana; ties retain deck order and missing metadata sorts last |
| 3.8 | Filtering | ✅ | 2026-08-07 | Browse filters offline by level/color, flagged state, inclusive stroke-count range, and JLPT level; filters combine with text search and can be cleared together |
| 3.9 | Searching within a deck | ✅ | 2026-08-07 | Offline search matches kanji, kana readings, and English meanings; multiple terms are ANDed |
| 3.10 | Sticky count badge on the Browse icon | ✅ | 2026-08-07 | Authenticated primary navigation shows the installed starter-deck sticky count on Browse and remains usable offline |
| 3.11 | Set current deck's browse settings as the default for all decks | ✅ | 2026-08-07 | Browse saves view, tile content, and tile zoom as validated offline defaults; deck-specific preferences take precedence when available |
| — | Multi-select + bulk actions | ➕ ✅ | 2026-08-07 | Browse selects visible cards in list or tile view and atomically flags/unflags them or assigns a manual level while preserving review totals |

## 4. Detail view

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 4.1 | Kanji details: readings, meanings, stroke count, radical, elements | ✅ | 2026-08-07 | Detail shows KANJIDIC2 metadata plus an offline nested KanjiVG radical/component decomposition |
| 4.2 | School grade, JLPT level, frequency | ✅ | 2026-08-07 | Detail shows KANJIDIC2 metadata; JLPT flagged as unofficial |
| 4.3 | Nanori (name readings) | ✅ | 2026-08-07 | Detail shows KANJIDIC2 name readings offline when available |
| 4.4 | SKIP code display | ❌ | — | Not licensable — DATA-SOURCES §6 |
| 4.5 | Similar-looking kanji | ✅ | 2026-08-07 | Detail shows ranked generated matches from the offline derived pack; each match links to its own kanji detail |
| 4.6 | Example words containing this kanji | ✅ | 2026-08-07 | Detail loads up to 12 matching JMdict words from the offline pack, ranked by pack frequency |
| 4.7 | Example sentences with breakdown | ✅ | 2026-08-07 | Detail loads ranked offline Tatoeba sentences with furigana, English translation, target-kanji highlighting, and author attribution |
| 4.8 | Everything hyperlinked | ✅ | 2026-08-08 | Dictionary results and Detail example words link to their offline detail views; similar-kanji links retain the same navigation stack |
| 4.9 | Swipe between stickies in detail view | ✅ | 2026-08-07 | Detail provides previous/next controls and horizontal touch swiping through the loaded deck order |
| 4.10 | Save sticky to a deck | ✅ | 2026-08-07 | Kanji detail saves the selected card offline to the per-user Saved deck or an existing custom deck and queues the membership mutation for sync |
| 4.11 | "Save to Saved deck" vs. always-ask setting | ✅ | 2026-08-07 | Settings persists direct-save vs. ask-every-time behavior offline; Detail and Dictionary honor the confirmation preference before saving to the per-user Saved deck |
| 4.12 | Inline stroke animations instead of static glyph | ✅ | 2026-08-07 | Kanji detail loads ordered KanjiVG paths offline with play, pause, restart, and step controls; Settings persists the global visibility toggle |
| 4.13 | Night mode with auto 21:00–06:00 | ✅ | — | Plus a full theme system |
| 4.14 | Native-speaker audio per word | ⚠️ Partial | 2026-08-08 | Kanji and dictionary-word Detail views, plus Study, prefer matching licensed community recordings installed from Settings and fall back to labeled device-synthesized Japanese audio; broad human-recorded coverage remains 🔷 — DATA-SOURCES §8 |
| — | Installable community audio packs | ➕ ✅ | 2026-08-08 | Settings installs a licensed ZIP manifest with `writing|reading` recordings into browser-local storage; Study exposes installed recordings even when the browser has no SpeechSynthesis runtime, and Study/Detail fall back to labeled device speech synthesis |
| — | Per-sticky notes and tags | ➕ ✅ | 2026-08-08 | Detail view persists personal notes and comma-separated tags offline, includes them in backups, and syncs annotation mutations with authenticated last-write-wins storage |

## 5. Writing

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 5.1 | Writing trainer with stroke input | ✅ | 2026-08-07 | Offline practice surface captures finger, stylus, and mouse strokes over a KanjiVG/grid guide |
| 5.2 | 6,500+ kanji stroke animations | ✅ | 2026-08-08 | KanjiVG (T6.0); committed chunk sizes and checksums are now regression-tested so offline stroke playback cannot silently drift from its manifest |
| 5.3 | "Correct pen strokes" — reject wrong strokes live | ✅ | 2026-08-07 | Persisted Check stroke order toggle rejects mismatched next strokes, highlights the expected stroke after failures, and keeps an unchecked free-draw mode |
| 5.4 | Writing as the answer side of a study card | ✅ | 2026-08-08 | Study answer settings can opt into an ephemeral offline writing pad with KanjiVG guidance; the learner grades the result with the normal answer buttons and no stroke data enters SRS history |
| — | Hint escalation after repeated failures | ➕ ✅ | 2026-08-08 | After two rejected strokes, the expected stroke gets a start dot; after three, it pulses as an animated hint, with reduced-motion support |
| — | Leniency setting | ➕ ✅ | 2026-08-08 | Writing practice persists strict, normal, or forgiving stroke-match tolerance per user and applies it while validating strokes |
| — | Alternate-stroke-order exceptions table | ➕ ✅ | 2026-08-08 | Writing validation accepts a curated set of interchangeable stroke indexes for common ambiguous orders while keeping all other strokes sequential |
| — | Standalone drill mode | ➕ ✅ | 2026-08-08 | Authenticated primary navigation opens the offline writing route directly (defaulting to 日), and each Detail view can open a selected kanji for 1–10 repetitions without changing study progress |

## 6. Decks

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 6.1 | Deck chooser with progress %, color, last studied | ✅ | 2026-08-06 | |
| 6.2 | Rename deck | ✅ | 2026-08-07 | Settings renames the built-in starter deck offline and queues its metadata mutation for sync |
| 6.3 | Delete deck (swipe) | ✅ | 2026-08-08 | Settings can delete any user-owned Saved or custom deck after confirmation, atomically removing its membership, progress, notes, reviews, sessions, and folder metadata; the built-in starter deck is protected |
| 6.4 | Create new deck | ✅ | 2026-08-08 | Settings creates an empty user-owned custom deck offline and queues its metadata for sync; card population and custom-deck study surfaces follow in the deck-content slices |
| 6.5 | Combine multiple decks into a new deck | ✅ | 2026-08-08 | Settings creates a user-owned deck from one or more built-in or user-owned sources, preserving source order and removing duplicate cards |
| 6.6 | Take only the first N stickies when combining | ✅ | 2026-08-08 | Optional first-N limit applies after the combined source list is de-duplicated |
| 6.7 | Built-in JLPT Kanji N1–N5 | ✅ | 2026-08-06 | Sourced per DATA-SOURCES §5 (content pipeline) |
| 6.8 | Built-in JLPT Vocabulary N1–N5 | ✅ | 2026-08-06 | Same caveat (content pipeline) |
| 6.9 | Built-in School Grade 1–6 | ✅ | 2026-08-06 | KANJIDIC2 grade field (content pipeline) |
| 6.10 | Built-in School Grade 7/8/9 (KK4/KK3/KK2.5) | ✅ | 2026-08-06 | grade 8 partitioned by frequency (content pipeline) |
| 6.11 | Built-in Jōyō (Old, 1981) | ✅ | 2026-08-06 | (content pipeline) |
| 6.12 | Built-in Jōyō (New, 2010) | ✅ | 2026-08-06 | 2,136 characters (content pipeline) |
| 6.13 | Built-in Top 500 Kanji | ✅ | 2026-08-06 | freq 1–500 (content pipeline) |
| 6.14 | Built-in Hiragana / Katakana / Kana Words | ✅ | 2026-08-06 | (content pipeline) |
| 6.15 | Reset colors | ✅ | 2026-08-07 | Settings resets starter-deck levels and schedules atomically while preserving review totals, flags, and history |
| 6.16 | Reset statistics | ✅ | 2026-08-07 | Settings clears starter-deck review/daily/session statistics and returns touched cards to New while preserving flags and annotations |
| 6.17 | Restore built-in deck to original | ✅ | 2026-08-07 | Settings restores the built-in starter deck's original name offline and queues the metadata mutation for sync without changing progress |
| 6.18 | Remove duplicates (same question + reading) | ✅ | 2026-08-08 | Custom-deck composition now canonicalizes the visible question and readings, so equivalent dictionary entries with different ids are kept only once; unknown refs still fall back to exact contentRef identity |
| 6.19 | Transfer progress between decks sharing stickies | ✅ | 2026-08-08 | Settings can copy studied SRS progress from the built-in starter deck to matching Saved cards offline; destination flags and annotations are preserved |
| — | Deck folders / grouping | ➕ ✅ | 2026-08-08 | Settings assigns decks to named offline folders; Home and Settings render custom decks grouped by folder, with empty labels remaining in Unfiled |
| — | Deck sharing by file or URL | ➕ ✅ | 2026-08-08 | Settings can share any locally owned built-in, Saved, or custom deck as a content-only URL or JSON file; the authenticated `/analyze` route and Settings JSON importer preview dictionary-backed kanji and word cards and add them to Saved without sharing private SRS progress |
| — | Mixed kanji + dictionary-word deck sharing | ➕ ✅ | 2026-08-08 | Version 2 share payloads preserve stable `kanji:` and `word:` content references, while version 1 kanji-only links remain readable |
| — | Save a Detail card to a custom deck | ➕ ✅ | 2026-08-08 | Detail lists existing user-owned custom decks and adds the selected kanji offline with an idempotent membership action and sync outbox mutation |
| — | Study and Browse custom decks | ➕ ✅ | 2026-08-08 | Home exposes each user-owned custom deck with its own progress/color and offline Study/Browse links; both surfaces load the deck's local memberships and SRS state |
| — | Kanji Kentei level decks | ➕ ✅ | 2026-08-08 | Built-in Kanji Kentei 10 through 1 and pre-level decks are generated from the attributable pinned level-list derivative, resolved against KANJIDIC2 and ordered by frequency; rare source characters absent from KANJIDIC2 are reported in deck coverage |

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
| — | Retention rate per level | ➕ 🔷 | 2026-08-07 | Home reports retained study answers by starting level, excluding manual history and reviews taken before 80% of the configured stage interval |
| — | Leech identification | ➕ 🔷 | 2026-08-07 | Home surfaces cards with six or more lapses for manual attention, following SRS-SPEC §8 |
| — | Heatmap calendar | ➕ 🔷 | 2026-08-07 | History includes a keyboard-accessible 30-day activity grid with intensity by review count and shared day detail selection |
| — | Unrealistic-pace warning with inline fixes | ➕ ✅ | 2026-08-07 | Home warns above 200 answers/day and offers a one-tap later-date suggestion; smaller-deck selection remains unavailable for the built-in fixture deck |

## 8. Dictionary

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 8.1 | Search by kanji, kana, or English | ✅ | 2026-08-07 | Offline search over the installed KANJIDIC2/JMdict fixture packs |
| 8.2 | Rōmaji input | ✅ | 2026-08-07 | Dictionary search normalizes romaji to hiragana before matching |
| 8.3 | ~700,000 entries including names and places | ✅ | 2026-08-08 | `npm run build:names` reproducibly builds the optional JMnedict SQLite pack; Settings installs a raw SQLite file or manifest-bearing ZIP into browser-local storage, and Dictionary searches and links names offline without forcing the default install to carry the optional pack |
| 8.4 | Details for 6,355 kanji | ✅ | 2026-08-07 | Offline results expose KANJIDIC2 readings, meanings, stroke count, school grade, JLPT, frequency rank, and name readings; KANJIDIC2 covers 13,108 |
| 8.5 | SKIP search | ❌ | — | Replaced by multi-radical search |
| 8.6 | Search by radical | ✅ | 2026-08-07 | Offline classical radical-number search over the installed KANJIDIC2 pack |
| 8.7 | Search by stroke count | ✅ | 2026-08-07 | Dictionary offers an offline exact stroke-count search over the installed KANJIDIC2 pack |
| 8.8 | Wildcard search | ✅ | 2026-08-07 | `*` matches zero or more characters and `?` matches exactly one across normalized Japanese and English dictionary values |
| 8.9 | Save any result to a deck | ✅ | 2026-08-07 | Dictionary results can be saved offline to the per-user Saved system deck and queue a membership sync mutation |
| 8.10 | Fully offline | ✅ | 2026-08-06 | SQLite-WASM over OPFS (content pipeline) |
| — | Search history / pinned searches | ➕ 🔷 | 2026-08-07 | Recent searches and pinned queries persist per authenticated user in the local database and work offline |
| — | Optional full JMdict dictionary tier | ➕ 🔷 | 2026-08-08 | `npm run build:words-full` produces a reproducible all-entry JMdict SQLite pack sharing the words-core schema; it remains optional so the default install stays small |

## 9. Text analysis & news

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 9.1 | Paste Japanese text → readings, furigana, English | ✅ | 2026-08-08 | Authenticated `/analyze` now lazy-loads an offline Kuromoji/IPADIC morphological tokenizer pack and maps its boundaries through the dictionary, inflection, grammar, furigana, and unknown-text fallback layers. The tokenizer pack is optional and never blocks study; if unavailable, the prior dictionary-only analyzer remains usable |
| 9.2 | Many display options for the analyzed output | 🔷 | 2026-08-08 | Analyzer preferences persist offline for furigana all/non-N5/off, optional rōmaji, and inline or tap-to-reveal English glosses |
| 9.3 | Tap any word → detail → save to deck | 🔷 | 2026-08-08 | Analyzer word tokens open an authenticated offline word detail route with readings, meanings, parts of speech, and the optional Kuromoji grammatical boundaries |
| 9.4 | Live Japanese news feed, updated daily | ❌ as built | — | NHK Easy content is copyrighted |
| 9.5 | Tap an article → broken into words + furigana | ✅ | 2026-08-08 | PWA share-target text is analyzed immediately and offline with readings/furigana; the source article URL remains an explicit external link and the supplied text can be edited and re-analyzed |
| — | Text analysis history | ➕ ✅ | 2026-08-08 | The analyzer keeps the ten most recent successful texts per user offline, supports one-tap reuse, and allows the history to be cleared without touching study progress |
| — | Add all unknown words from a text in bulk | ➕ 🔷 | 2026-08-08 | Analyzer can bulk-save deduplicated dictionary-backed word tokens not already in Saved, atomically and offline; unmatched characters remain visible for future tokenizer/enrichment work |
| — | Web Share Target — share text into KanjiForge from any app | ➕ 🔷 | 2026-08-08 | The PWA share target opens an authenticated offline preview, extracts dictionary-backed kanji from shared text, and adds new cards to Saved with progress-preserving outbox mutations |
| — | User-configurable RSS with link-out, no reproduction | ➕ 🔶 | 2026-08-08 | Settings stores up to 12 validated HTTP(S) feed links per user and opens them externally; feed content is never fetched or reproduced |
| — | CC-licensed news source (e.g. Japanese Wikinews) | ➕ 🔶 | 2026-08-08 | Settings offers a one-click Japanese Wikinews RSS link-out preset labeled CC BY 4.0; KanjiForge stores only the URL and never reproduces article content |

## 10. Import & export

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 10.1 | Import by typing/pasting into an import box | ✅ | 2026-08-08 | Settings accepts one-per-line dictionary words or compact bare-kanji lists (including the first column of KanjiForge text exports), enriches exact forms/readings/glosses offline, and appends matches to Saved or a custom deck without changing progress |
| 10.2 | CSV import | ✅ | 2026-08-08 | Settings accepts pasted or selected CSV files, parses quoted fields offline, and lets users map any column containing kanji or exact dictionary words into the existing preview-and-confirm flow; imported progress remains untouched |
| 10.3 | Multiple import formats | ✅ | 2026-08-08 | Settings accepts CSV, TSV, line lists, versioned KanjiForge JSON deck exports, and best-effort Anki `.apkg` files; Anki Japanese word runs now flow through the same offline dictionary enrichment and preview; all imports add content without overwriting progress |
| 10.4 | Append imported stickies to the current deck | ✅ | 2026-08-08 | Import preview and confirmation can append matched kanji to Saved or an existing custom deck without overwriting progress; built-in derived decks remain read-only |
| 10.5 | Export deck to clipboard as text | ✅ | 2026-08-07 | Settings copies the current starter deck as tab-separated kanji, readings, and meanings for pasting into another app or spreadsheet |
| — | Auto-enrichment of bare kanji/word lists | ➕ ✅ | 2026-08-08 | Bare kanji and exact dictionary word forms/readings/glosses are matched against the installed offline packs before being added to Saved or a custom deck; unknown values remain in the preview |
| — | Import preview with matched/already-in-target/not-found results | ➕ ✅ | 2026-08-08 | Preview classifies kanji and exact dictionary-word matches, existing target-deck cards, and missing entries before confirmation; ambiguous word segmentation remains future work |
| — | Export to CSV and JSON files | ➕ ✅ | 2026-08-07 | Settings downloads the current deck's content and local study progress as versioned CSV or JSON files |
| — | Full backup export/restore incl. review history | ➕ ✅ | 2026-08-07 | Settings downloads/restores the locked v1 JSON format; restore unions records and replays the review log |
| — | Anki .apkg import | ➕ 🔷 | 2026-08-08 | Browser-local best-effort import reads `collection.anki2`/`.anki21`, extracts kanji from note fields, and previews them before adding to Saved; scheduling, tags, and templates are intentionally not migrated |

## 11. Sync & backup

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 11.1 | iCloud backup and sync | ❌ as built | — | Platform-locked |
| 11.2 | Dropbox backup | ❌ | — | Discontinued upstream too |
| — | Manual full backup file | ➕ ✅ | 2026-08-07 | Settings provides a local JSON download and same-account non-destructive restore; includes decks, settings, Saved membership, and complete review history |
| — | Auto-backup to a chosen folder (File System Access) | ➕ ✅ | 2026-08-07 | Supported desktop browsers persist the chosen folder handle per account and write one full backup per day when the app opens or returns to the foreground |
| — | Optional self-hostable sync server | ➕ ✅ | 2026-08-08 | `deploy/docker-compose.yml` runs Postgres, API, and pinned Electric; `/api/electric/shape` authenticates sessions, allow-lists sync tables, injects a parameterized `user_id` filter, and the client consumes the proxied shape stream when Electric is configured. |
| — | Authenticated read synchronization | ➕ ✅ | 2026-08-08 | The authenticated runtime consumes Electric JSON/NDJSON/SSE shape changes through the user-scoped proxy when configured, materializes inserts/updates/deletes into local projections, and falls back to the API snapshot with review-union and metadata last-write-wins semantics. |
| — | Authenticated mutation write API | ➕ ✅ | 2026-08-08 | Self-hosted API accepts authenticated batches for reviews and deck/settings/membership metadata, stamps the session user id, applies reviews idempotently, and resolves metadata last-write-wins; Electric remains read-only |
| — | Client outbox flush and retry | ➕ ✅ | 2026-08-08 | Authenticated local mutations for the current write contract batch to `/api/mutations`, delete only acknowledged rows, retry network/server failures with backoff, pause on expired auth, and retain poison rows for diagnostics; unsupported local-only mutation types remain queued until their server contract exists |
| — | Backup nag when none taken in 30 days | ➕ ✅ | 2026-08-07 | Settings records successful backup downloads and shows a persistent warning when no backup exists or the last one is more than 30 days old |

## 12. Platform & settings

| # | Feature | Status | Implemented | Notes |
|---|---|---|---|---|
| 12.1 | Night mode (manual + auto 21:00–06:00) | ✅ | 2026-08-07 | Settings persists light, dark, device, and StickyStudy-compatible 21:00–06:00 night preferences per user and applies them app-wide |
| 12.2 | App icon badge with configurable info | ⚠️ Partial | 2026-08-08 | Settings choose Cards to study, All cards, or Off; the optional Badging API is used when supported, refreshes immediately after local study grades/undo, and falls back to a temporary browser-tab title count when the platform cannot show an app-icon badge; iOS Safari still cannot show an icon badge |
| 12.3 | Notifications | ⚠️ Partial | 2026-08-08 | Settings persist a daily reminder time and permission-aware local browser reminders fire while the app is open; clicking one opens Study. When the self-hosted VAPID sender is configured, enabling the reminder registers the device, Settings restores the device's subscription state after reload, the API scheduler sends a localized Web Push reminder, and the service worker opens Study; iOS still requires an installed PWA (T1.1) |
| 12.4 | Extensive options | ✅ | 2026-08-08 | Settings now includes offline-persisted font-size/text scaling alongside the theme, study, audio, backup, and platform options; PRD §4.14 |
| 12.5 | Full in-app documentation | ✅ | 2026-08-07 | Authenticated `/help` route bundles offline guidance for study controls, levels, Browse/Dictionary, backup, and privacy |
| — | Request persistent browser storage + warn when eviction protection is denied | ➕ ✅ | 2026-08-07 | After the first non-empty completed study session, KanjiForge requests durable storage; Settings reports unsupported/denied browsers, points users to backups, and gives non-standalone iPhone/iPad Safari users Add to Home Screen instructions |
| — | Installable to home screen, all platforms | ➕ ✅ | 2026-08-07 | Manifest and build-generated Serwist service worker are registered on the client; the app shell and visited pages can load offline after the first visit |
| — | Works in a plain browser with no install | ➕ ✅ | 2026-08-06 | |
| — | Tablet / laptop / desktop layouts | ➕ ✅ | — | Two-pane above `md` |
| — | Full keyboard operability | ➕ ✅ | 2026-08-06 | |
| — | CVD-safe alternate color ramp | ➕ ✅ | 2026-08-08 | The belt ramp uses luminance and always-on fold shapes so Home distribution, Browse cards, tiles, and deck chips remain distinguishable without hue perception; the red→green default is avoided |
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
