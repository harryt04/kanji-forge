# KanjiForge — Brand & Frontend Design Language

**Status:** Committed. Chosen after a three-direction review (Washi / Forge / Instrument) in `.lavish/kanjiforge-brand-options.html`, with two rounds of revision driven by direct feedback on ramp accessibility.
**Satisfies:** `PRD.md` §6 (design direction), §4.17 (accessibility). Read this doc as the concrete answer to those requirements, not a replacement for them.
**Builds on:** shadcn/ui as the component foundation (`ARCHITECTURE.md` §1.1 — "shadcn/ui-style copy-in primitives at most"). shadcn is vendored source copied into `src/ui/`, not an npm dependency, so it does not conflict with the "no component library" decision. Its Tailwind v4 theming model — OKLCH values in CSS custom properties, a `.dark` class override, a `--radius` scale — is exactly the runtime-swappable token model `ARCHITECTURE.md` §1 requires for the level ramp. Radix primitives underneath also satisfy most of PRD §4.17's keyboard/focus/ARIA requirements for free. **This is not up for relitigation** — treat every "no component library" mention elsewhere in `mvp-docs/` as compatible with this.

---

## 1. Brand foundation

**Name.** KanjiForge — "a forge is where raw material becomes something durable through repeated, deliberate work. That's the study loop: the same character, hammered at daily, until it holds." (`README.md`)

**Positioning.** StickyStudy's color-coded legibility, delivered as an open, cross-platform, offline-first web app with data you own — not a closed iOS app, not fifteen years of Anki add-ons, not a WaniKani subscription with a fixed curriculum.

**Promise, one sentence.** *Your whole deck, as a wall of color you can trust.*

**Three brand attributes.**
1. **Legible.** The color is the interface (PRD §1.2 principle 1) — every state must read at a glance, including for people who cannot distinguish hue. This document exists mainly to make that literal.
2. **Honest.** No dark patterns, no manufactured urgency, no synthesized-audio pretending to be recorded. Say what's true plainly (§2 below).
3. **Unhurried.** A study session is a quiet, repeated act — hammering at the same character until it holds — not a slot machine. Motion, copy, and layout all stay calm.

**Chosen direction.** Washi's chrome (Japanese Minimalism: paper, ink, restraint, light-first) carrying a **belt-rank level ramp** (§3) that replaced the direction's original pigment-name ramp after review found it insufficiently distinguishable under color-vision deficiency. Two other directions were seriously prototyped and rejected — Forge (dark industrial, heat/temper ramp) and Instrument (Swiss/flat, engineered OKLCH ramp) — see the artifact in `.lavish/` for the full comparison if either needs revisiting later (e.g. Forge's dark theme is a reasonable candidate to inform the `.dark` palette below, which this doc does not lift wholesale from Washi since Washi was designed light-first only).

---

## 2. Voice and tone

Codifies PRD §6.5: plain, direct, in the user's frame.

| Do | Don't |
|---|---|
| "4 correct answers to master this." | "SRS interval stage 4/5." |
| "This deck is empty — import a word list or add from the dictionary." | "No items found." |
| "Couldn't save your backup — check you have storage space and try again." | "Export failed. Error 0x8007000E." |
| "Your progress lives only on this device right now." | "Sync unavailable." |
| "Synthesized voice — no recorded audio pack installed for this deck." | (presenting TTS as if it were recorded audio) |

**Standard copy for the hard moments:**

- **Storage persistence prompt** (`ARCHITECTURE.md` §7.2), shown after first completed session, not on cold load: *"Keep my progress on this device — KanjiForge stores everything locally, and browsers can clear that data after a week of not opening the app. Allow persistent storage to stop that."*
- **Backup nag**, after 14 days without a backup: *"It's been two weeks since your last backup. Your review history only exists on this device — back it up in under a minute."*
- **Empty deck:** *"This deck is empty — import a word list or add from the dictionary."*
- **Offline state:** never an error. KanjiForge is offline by default (PRD §1.2 principle 3), so absence of network is not a fault state — omit any banner unless a pack download was interrupted, in which case: *"Couldn't finish downloading — resume when you're back online."*
- **Synthesized audio label**, inline next to the audio button whenever no recorded pack is installed: *"Synthesized voice"* (small, muted, never hidden — PRD §4.13's licensing note requires setting this expectation honestly).

---

## 3. Colour system

### 3.1 Base tokens (shadcn-compatible, OKLCH)

Light is the default theme (confirmed; `prefers-color-scheme`/manual toggle still available per PRD §4.14, including the 21:00–06:00 auto-dark window).

```css
:root {
  --background: oklch(97.3% 0.012 85);   /* #f7f4ec warm washi paper */
  --foreground: oklch(24.5% 0.02 55);    /* #211c16 ink */
  --card: oklch(99.1% 0.006 85);         /* #fffdf7 */
  --card-foreground: var(--foreground);
  --popover: var(--card);
  --popover-foreground: var(--foreground);
  --primary: oklch(45% 0.13 25);         /* #b23a2e vermilion accent */
  --primary-foreground: oklch(98% 0.01 85);
  --secondary: oklch(93% 0.015 85);
  --secondary-foreground: var(--foreground);
  --muted: oklch(93% 0.015 85);
  --muted-foreground: oklch(52% 0.02 60); /* #7d7264 */
  --accent: var(--primary);
  --accent-foreground: var(--primary-foreground);
  --destructive: oklch(50% 0.17 25);
  --destructive-foreground: oklch(98% 0.01 85);
  --border: oklch(90% 0.015 85);          /* #e4dcc9 */
  --input: var(--border);
  --ring: var(--primary);
  --radius: 0.875rem;                     /* 14px */
}

.dark {
  --background: oklch(19% 0.012 55);      /* #1c1a17 warm near-black, not cool slate */
  --foreground: oklch(91% 0.012 70);      /* #ece7de off-white, not pure white */
  --card: oklch(23% 0.014 55);            /* #221f1b */
  --card-foreground: var(--foreground);
  --popover: var(--card);
  --popover-foreground: var(--foreground);
  --primary: oklch(62% 0.15 30);          /* brighter vermilion for dark-bg contrast */
  --primary-foreground: oklch(15% 0.01 55);
  --secondary: oklch(27% 0.014 55);
  --secondary-foreground: var(--foreground);
  --muted: oklch(27% 0.014 55);
  --muted-foreground: oklch(65% 0.015 65);
  --accent: var(--primary);
  --accent-foreground: var(--primary-foreground);
  --destructive: oklch(62% 0.18 25);
  --destructive-foreground: oklch(15% 0.01 55);
  --border: oklch(31% 0.014 55);
  --input: var(--border);
  --ring: var(--primary);
}
```

Both themes must pass WCAG AA (`--foreground` on `--background`, `--muted-foreground` on `--background`/`--card`) — verify with the actual rendered values once the app exists; the OKLCH numbers above are a starting point tuned by eye against the artifact, not measured output.

### 3.2 The level ramp — belt rank

The single most important decision in this document. **Not** the PRD §6.2 reference red→green table — see rationale below.

| Level | Name | Light hex | Light text | Dark hex | Dark text | Rel. luminance (light) |
|---|---|---|---|---|---|---|
| 0 | 白 Shiro (white) | `#D9D2C3` | `#2B2620` | `#EDE7DA` | `#221F1B` | 210 |
| 1 | 黄 Ki (yellow) | `#E8B23D` | `#3A2708` | `#E8B23D` | `#3A2708` | 181 |
| 2 | 緑 Midori (green) | `#6B9950` | `#16240D` | `#7FB05C` | `#12210B` | 138 |
| 3 | 青 Ao (blue) | `#3D5A9E` | `#EEF1FA` | `#5B7FC7` | `#101A2E` | 89 |
| 4 | 黒 Kuro (black) | `#1E1B18` | `#EFECE6` | `#3A352E` | `#EDE9E0` | 27 |

**Why belts, not pigment names or an engineered OKLCH sweep.** Three ramps were prototyped and rendered against a live 240-tile grid (the actual test that matters — PRD §6.2 requires legibility "as small tiles (12px)," and eyeballing large swatches does not predict that). The first pass ordered colors by hue (red→orange→gold→olive→green for one direction, ember→amber→teal→dark-green for another); under any color-vision deficiency simulation that ordering collapses into noise, which is exactly the failure PRD §4.17 warns about ("the default red→green ramp is the worst possible choice for the most common CVD"). A subsequent purple→yellow OKLCH sweep fixed the CVD problem by using strictly increasing lightness, but its early steps (levels 0–2) sat close enough together that they were hard to tell apart *out of context* — a real usability complaint, not just an accessibility one.

The belt-rank ramp — white → yellow → green → blue → black — fixes both at once:
- **Zero hue-matching required.** Everyone already reads "closer to black = more mastered" without thinking about it, the same way a dojo wall works. This is a stronger accessibility property than "CVD-safe": it doesn't just survive impaired color vision, it needs no color vision at all, because rank is legible from lightness and cultural convention together.
- **Wide, uneven-by-design gaps.** Because white-to-black is the widest possible lightness range, consecutive steps land 43–62 luminance units apart (vs. ~18–29 for a single-hue sweep over the same range), which is what actually fixed the "can't tell them apart one at a time" complaint.

**Level 0 gets a hairline border, always.** `#D9D2C3` sits close to the paper background by design (a "blank" white belt should look unmarked) — close enough that early tiles could visually vanish into the tile-wall background. Every level-0 swatch — ramp legend, tile, deck chip, study-card strip — carries `box-shadow: inset 0 0 0 1px rgba(43,38,32,.35)` (dark theme: a light-toned equivalent) so it never disappears. The same principle applies in reverse to level 4 in dark mode: true black would vanish into a dark background, so `.dark` lightens level 4 to `#3A352E` with its own hairline border. **Design rule, not a one-off fix:** whichever ramp endpoint sits closest to the current theme's background luminance always gets a hairline border.

### 3.3 Shape encoding — the fold overlay

Ships **always-on**, not a switchable "shapes + color mode" (PRD §4.17 asks for a switchable mode; user review concluded the overlay is cheap and unobtrusive enough to be a baseline brand feature instead of an opt-in accessibility add-on). Every sticky-shaped element — tile-wall cells, the study-card level strip, deck chips — carries a **peeled paper-corner fold** in the top-right, rendered as two stacked CSS border-triangles (a dark shadow layer, a lighter fold layer on top), whose *size* scales with level:

```css
.sticky-shape { position: relative; overflow: hidden; }
.sticky-shape::before, .sticky-shape::after {
  content: ''; position: absolute; top: 0; right: 0; width: 0; height: 0; border-style: solid;
}
.sticky-shape::before { border-color: transparent rgba(0,0,0,.32) transparent transparent; }
.sticky-shape::after  { border-color: transparent rgba(255,255,255,.92) transparent transparent; }
.sticky-shape.l0::before, .sticky-shape.l0::after { border-width: 0; }
.sticky-shape.l1::before { border-width: 0 6px 6px 0; }  .sticky-shape.l1::after { border-width: 0 5px 5px 0; }
.sticky-shape.l2::before { border-width: 0 9px 9px 0; }  .sticky-shape.l2::after { border-width: 0 8px 8px 0; }
.sticky-shape.l3::before { border-width: 0 12px 12px 0; } .sticky-shape.l3::after { border-width: 0 11px 11px 0; }
.sticky-shape.l4::before { border-width: 0 16px 16px 0; } .sticky-shape.l4::after { border-width: 0 15px 15px 0; }
```

This reads by luminance contrast alone (black shadow + white fold), so it survives any CVD type and full greyscale. On the tile wall, hit-testing and rendering stay in the canvas layer per `ARCHITECTURE.md` §5 — draw the same two-triangle shape directly into the glyph atlas / dirty-rect pass rather than using real DOM elements at low zoom.

### 3.4 Semantic tokens

Distinct from the level ramp — these describe *events and states*, not mastery.

```css
:root {
  --success: oklch(48% 0.1 145);    /* grade "I know" / level-up feedback, ≠ any ramp step */
  --success-foreground: oklch(97% 0.02 145);
  --perfect: oklch(45% 0.11 165);   /* grade "No problem" */
  --perfect-foreground: oklch(97% 0.02 165);
  --flag: var(--primary);           /* flagged sticky marker reuses the vermilion accent */
  --due: oklch(70% 0.13 75);        /* due-today indicator, warm amber, distinct from level 1 */
}
```

Grade buttons (§6) use `--destructive` for "I don't know," `--success` for "I know," `--perfect` for "No problem" — never a ramp color, so grading feedback is never confused with mastery state.

### 3.5 Non-color level encoding (PRD §4.17 hard requirement)

Every color chip carries, always available to screen readers and optionally visible: the numeral (0–4) and the belt name (白/黄/緑/青/黒 with romaji). `aria-label` on every `LevelChip` and `TileWall` cell reads e.g. `"Level 2, green (Midori)"`. The fold-shape overlay (§3.3) is the visual "shapes + color" signal; numerals/names are the assistive-tech signal. Both ship unconditionally — there is no reduced-accessibility mode to fall back to.

---

## 4. Typography

| Role | Face | Weight(s) | License |
|---|---|---|---|
| JP card display (large kanji, ~140px+) | **Klee One** | 600 | SIL OFL 1.1 |
| JP UI (readings, list text, furigana) | **Noto Sans JP** | 400/500/700 | SIL OFL 1.1 |
| Latin display (headings, wordmark, numbers) | **Fraunces** | 500/600/700/900 | SIL OFL 1.1 |
| Latin body (glosses, UI copy) | **Public Sans** | 400/500/600 | SIL OFL 1.1 |
| Mono (data, labels, code) | **JetBrains Mono** | 400/500 | SIL OFL 1.1 |

Klee One's textbook-hand forms were chosen over a print serif specifically because they match how kanji are actually taught to write (PRD §6.3) — reinforcing the study app's pedagogical purpose rather than a generic "Japanese aesthetic" pick.

**Subsetting** (`DATA-SOURCES.md` §9): jōyō + jinmeiyō set plus every character in any bundled deck or `words-core` (~3,500 characters), full kana/punctuation/Latin/digits, `unicode-range`-split into woff2 chunks, target ≤400 KB initial JP payload. `font-display: block` specifically for the Klee One card face — a flash of fallback kanji is worse than a brief blank, since fallback fonts can render simplified/Chinese-variant forms. `lang="ja"` on every Japanese text node, without exception (`ARCHITECTURE.md` §6) — omitting it can make a browser pick a Chinese font for CJK Unified Ideographs and render structurally wrong glyphs (直, 骨, 者 differ meaningfully between variants).

**Type scale** (rem, 16px base):

| Token | Size | Use |
|---|---|---|
| `--text-display` | 8.75rem (140px) | Study-card kanji |
| `--text-3xl` | 2.5rem | Page headings |
| `--text-2xl` | 1.75rem | Section headings |
| `--text-xl` | 1.25rem | Card titles |
| `--text-base` | 1rem | Body — never smaller on mobile (iOS zoom-on-focus guard) |
| `--text-sm` | 0.875rem | Secondary text |
| `--text-xs` | 0.75rem | Labels, mono metadata |

**Furigana:** `~50%` of base size (`ruby-text` styling), tight leading, rendered with native `<ruby><rb>漢<rt>かん</rt></ruby>` — accessible, reflows, screen-reader-compatible — never absolutely-positioned spans (`ARCHITECTURE.md` §6). Verify it is never clipped at any zoom level; this is a common ruby-CSS regression.

---

## 5. Space, radius, elevation

- **Spacing scale:** 4px base unit (4/8/12/16/24/32/48/64), matching shadcn/Tailwind defaults — no custom scale needed.
- **Radius:** `--radius: 0.875rem` (14px) as the base; shadcn's derived scale (`--radius-sm`, `--radius-md`, `--radius-lg` = `calc(var(--radius) - 4/2/0px)`) follows automatically. Consistent rounding, never sharp corners — this is Washi's chrome, not Instrument's.
- **Elevation ("paper object" rule, PRD §6.1):** subtle drop shadow only, never a hard-edged shadow.
  ```css
  --shadow-card: 0 1px 2px rgba(60,45,20,.06), 0 6px 16px rgba(60,45,20,.05);
  ```
  Dark theme: same structure, darker and more transparent, never the same values as light (`rgba(0,0,0,.35)`/`rgba(0,0,0,.25)`-range, tuned once real components exist).
- **Touch targets:** ≥44×44 CSS px on every interactive element, no exceptions (PRD §4.17).

---

## 6. Component inventory

Verified against the current shadcn/ui component list (fetched 2026-07-22, not assumed from memory — note in particular that shadcn replaced its old `Toast` with **Sonner**, and there is no dedicated dice/rating component, both relevant below).

### 6.1 Used as-is (copy in, restyle with tokens only)

Button, Dialog, Sheet, Drawer, Tabs, Slider, Switch, Select, Native Select, Command, Combobox, Popover, Progress, Sonner, Table, Data Table, Skeleton, Scroll Area, Tooltip, Toggle Group, Accordion, Badge, Card, Separator, Field, Empty, Item, Pagination, Calendar, Date Picker, Kbd, Breadcrumb, Avatar.

Two get *meaningful* restyling, not just token substitution:
- **Slider** → base for `IntervalSlider` (§6.2) but also used plainly for per-level interval sliders (PRD §4.1) and the leniency slider (writing trainer, PRD §4.6).
- **Progress** → restyled to render as a ramp-colored bar (deck chooser progress %, goal progress) using `--success`/ramp tokens, not shadcn's default primary fill.

### 6.2 Custom-built (no shadcn equivalent)

| Component | Why custom | Screens (PRD §5) |
|---|---|---|
| **Sticky** | The core visual metaphor — a "paper object" card with the fold overlay, level strip, flip animation. Nothing in shadcn models a physical object. | Study (5), Detail (9) |
| **LevelChip** | Ramp-colored, fold-shaped, numeral + belt-name always present per §3.5. Tappable to cycle/set level. | Browse-list (8), Deck chooser (3), Detail (9) |
| **TileWall** | Canvas/WebGL + DOM hybrid renderer per `ARCHITECTURE.md` §5 — 2,500 tiles at 60fps is not a component category shadcn addresses at all. | Browse-tiles (7) |
| **StrokePlayer** | KanjiVG path playback with numbered stroke start-points, play/pause/step. | Detail (9) |
| **WritingCanvas** | Pointer Events stroke capture + KanjiVG matching, per `ARCHITECTURE.md` §8. | Writing (10) |
| **RadicalGrid** | Multi-radical picker grid (PRD §4.9) — replaces the unlicensable SKIP search. | Dictionary (11) |
| **IntervalSlider** | Wraps shadcn Slider but must derive and display "total time to green" live (PRD §4.1, e.g. `3 + 9 + 30 = 42 days`) — a domain-specific composed behavior, not a restyle. | Settings (14) |
| **FuriganaText** | Native `<ruby>` wrapper with the app's furigana-toggle and non-N5-only modes (PRD §4.10). | Text analyzer (12), Detail (9), Study (5) |

Eight custom components against ~30 used-as-is — consistent with `ARCHITECTURE.md` §1.1's estimate of "a flashcard app has ~12 unique components."

---

## 7. Motion

Codifies PRD §6.4 with concrete values:

| Interaction | Duration | Easing |
|---|---|---|
| Card reveal (question → answer) | ≤180ms | `ease-out` crossfade |
| Grading exit (swipe direction) | 220ms | `cubic-bezier(.2,.8,.2,1)` |
| Level-strip color transition | 200ms | `ease-in-out` |
| Tile-wall pan | momentum, no fixed duration | native inertia + rubber-band at limits |
| Tile-wall pinch zoom | tracks pointer distance | anchor at pinch centroid, not viewport center |
| Stroke animation | calibrated to real handwriting speed, not instant | `linear` per-segment |
| Generic hover/focus (buttons, cards) | 150ms | `ease-out` |
| Page-level reveals (Washi's slower register) | 300–400ms | `ease-out` fade, used sparingly — onboarding, empty states |

**`prefers-reduced-motion`:** every duration above collapses to 0ms (instant state change), stroke animation becomes a static fully-drawn glyph, tile-wall pan/zoom loses rubber-banding but keeps direct 1:1 tracking. No exceptions — this query is checked once at the token layer, not per-component.

---

## 8. Theming implementation

- CSS custom properties only, per `ARCHITECTURE.md` §1 ("the ramp must be swappable at runtime for CVD modes, which means CSS variables, not compiled classes"). Tailwind v4's `@theme inline` block maps every token in §3.1/§3.2/§3.4 to a Tailwind utility (`bg-background`, `text-foreground`, `bg-level-2`, etc.) without a JS theme object.
- Theme switching: `.dark` class on `<html>`, driven by a `data-theme` attribute the settings store controls — supports the three-way light/dark/auto toggle plus the "auto between 21:00–06:00" mode (PRD §4.14) by having the auto mode compute and set `data-theme` itself rather than relying solely on `prefers-color-scheme`.
- Because the ramp is CVD-safe by construction (§3.2), there is **no separate ramp swap needed at runtime** — a meaningful simplification versus the original PRD §6.2 assumption that a second "CVD-safe ramp" setting would exist. One ramp, two theme variants (light/dark hex columns in the table above).

---

## 9. Accessibility contract

Restates PRD §4.17 as testable rules, mapped to what's already handled by the stack vs. what needs explicit work:

| Requirement | Satisfied by |
|---|---|
| Color never the only signal for level | §3.3 fold overlay (always-on) + §3.5 numeral/name (always present) |
| Palette survives protanopia/deuteranopia/tritanopia | §3.2 belt ramp — verify with a CVD simulator once real components render; luminance ordering is CVD-invariant by construction, but confirm rendered hex output, not the design-time values |
| ≥44×44 CSS px touch targets | §5 — enforced as a lint/review rule, shadcn defaults are close but not guaranteed to meet this everywhere (verify Button `size="sm"`, icon buttons) |
| Full keyboard operability, visible focus rings | Radix (under shadcn) handles roll-your-own focus trapping/order for Dialog, Sheet, Command, etc. `--ring` token (§3.1) must render visibly in both themes — do not suppress `:focus-visible` |
| `prefers-reduced-motion` | §7 — single token-layer check |
| WCAG AA text contrast | §3.1 base tokens tuned for it; verify numerically once implemented, not just by eye |
| `lang="ja"` on Japanese text | §4 — no exceptions |

---

## 10. Identity assets

- **Wordmark:** "Kanji" in `--foreground`, "Forge" in `--primary` (vermilion), set in Fraunces 800, tight tracking. No logotype beyond typography for MVP — a mark can be commissioned post-launch once the product is real.
- **App icon / maskable:** 黒 (kuro, the level-4 belt kanji) or 鍛 (the product's own name-kanji, "forge/temper") centered in a `--primary`-on-`--background` (or reversed) square, with a 20% safe-zone margin on all sides for the Android maskable-icon spec. Export 192×192, 512×512, and a maskable 512×512 variant per `ARCHITECTURE.md` §7.3's manifest.
- **`theme_color` / `background_color`:** the manifest in `ARCHITECTURE.md` §7.3 currently hardcodes `#0D0D0F` (Forge's dark background) — **must be updated** to Washi's light values now that the light-first direction won: `theme_color: "#f7f4ec"`, `background_color: "#f7f4ec"`. Flag this as a required follow-up edit to `ARCHITECTURE.md` §7.3, not just this doc.
- **GitHub social card:** the tile wall itself, mid-study (mixed belt levels), full-bleed — the product's signature screen is also its best marketing image. No separate illustrated graphic needed.
- **README screenshots:** always capture the tile wall and the study card at minimum; prefer real data (a JLPT deck) over placeholder lorem-kanji once content packs exist.

---

## 11. Landing page direction

- **Hero:** the tile wall *is* the hero — a live, animated (slow drift, `prefers-reduced-motion`-aware) wall of belt-colored tiles behind the headline, not a screenshot. Headline: *"Your whole deck, as a wall of color."* Subhead: *"A free, offline-first way to study kanji — the StickyStudy mechanic, open and yours."* Single CTA: *"Start studying — free."*
- **Sections, in order:** hero (tile wall) → the color-is-the-interface explainer (belt-rank ramp shown explicitly, since it's a genuinely novel pitch worth teaching) → screen highlights (study card, writing trainer, dictionary) → licensing honesty section (MIT code / CC BY-SA data, per `README.md`'s licensing table — a FOSS audience will look for this) → install/PWA instructions.
- **No pricing section, no account-gated anything** — reinforces PRD §1's "no account, no server, no paywall" as a landing-page-level trust signal, not just a feature list bullet.

---

## Open follow-ups

1. `ARCHITECTURE.md` §7.3's manifest JSON needs its `theme_color`/`background_color` updated from Forge's `#0D0D0F` to Washi's `#f7f4ec` (§10 above) — this doc does not edit `ARCHITECTURE.md` directly to keep the diff scoped to design, but implementation must not silently ship the stale dark values.
2. Dark-theme values in §3.1/§3.2 are a first pass tuned by eye against the review artifact, not against Forge's dark theme (which was fully designed and rejected as the *primary* direction, but its `#0D0D0F`/`#161519` surface values are a reasonable reference point for Washi's `.dark` variant if it needs revisiting).
3. Numeric WCAG contrast verification (§9) and CVD simulation (§3.2, §9) are stated as requirements here but not yet run against actual rendered pixels — do this once `tokens.css` is wired into a real page, not from the hex values alone.
