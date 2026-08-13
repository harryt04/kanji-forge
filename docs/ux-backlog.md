# UX backlog — GNHF loop queue

**Origin:** full UX audit of the signed-in app and marketing page — desktop
(1440), laptop (1280), tablet (768), mobile (375), light and dark theme.
Findings are measured (contrast ratios, pixel overflow, touch-target boxes),
not eyeballed — see "How this was measured" at the bottom.

Audited against the project's own written standard:
[`docs/BRAND-DESIGN-LANGUAGE.md`](BRAND-DESIGN-LANGUAGE.md) and
[`docs/tokens.css`](tokens.css). Most items here are not taste — they are
places where the shipped UI contradicts a rule the project already wrote down.

This file is a **GNHF queue**, driven by
[`gnhf-ux-prompt.md`](gnhf-ux-prompt.md). Read the four sections below before
touching any item — they outrank instinct about how to improve this app.

## Claim protocol

- `[ ]` — unclaimed, available.
- `[~]` — claimed, in progress. Commit this mark before you start implementing
  so a crashed run doesn't silently re-claim the same item.
- `[x]` — done. One or two lines underneath saying what changed and which test
  proves it.
- `[!]` — blocked or rejected. One or two lines underneath saying why. Take the
  next item in the same loop; do not skip to a later loop.

## The rule that makes this loop terminate

**Do not add items to a loop.** Loops A–E are closed lists, fixed at the time
this file was written. You may tick, block, or annotate an existing item.
Anything else you notice while working goes under **Observed, not queued** at
the bottom of this file, in one or two lines — then you return to your claimed
item. Do not act on an observed item in the same iteration you found it in.

If you believe a claimed item is wrong, already fixed, or not worth fixing, do
not redefine it or quietly skip it. Mark it `[!]`, say why in two sentences,
and take the next item in the loop.

## What done means here

Every item below ends in an **acceptance line** — the single measurable
condition that defines done for that item. If your fix satisfies something
else (looks better, feels smoother, matches your own taste) but not the
acceptance line, the fix is not done. If the acceptance line itself is wrong,
that's a `[!]`, not a license to substitute your own criterion.

"I looked at it and it seems fine" is not evidence. Reproduce the original
measurement (contrast ratio, `scrollWidth` vs `clientWidth`, bounding-box
dimensions) the same way this file's evidence was gathered, and show the
before/after numbers changed.

## Traps specific to this queue

- **A spinner is not a fix for a hang.** Loop C items are about missing error
  states, not loading polish.
- **Do not introduce new colour, iconography, or ornament to fix "boring".**
  The belt-rank ramp and the fold overlay are the whole visual vocabulary —
  see `BRAND-DESIGN-LANGUAGE.md` §3. New decoration satisfies no acceptance
  line in this queue.
- **Do not resize a token globally to fix one screen.** Several items point at
  the same root cause (see Loop A's note) — fix at the shared component or
  utility, not by overriding one instance and leaving the pattern to recur
  elsewhere next audit.
- **Do not lower a contrast requirement, a touch-target minimum, or a coverage
  threshold to make a check pass.** If an acceptance line seems wrong, mark the
  item `[!]` and say why — don't quietly weaken it.
- **Do not batch two items into one commit**, and do not leave uncommitted
  work — GNHF discards it between iterations.

---

## Loop A — Break fixes (P0)

Functional breakage, not polish. Fix these before anything else in this file.

- [x] **A1. Browse overflows horizontally, and collides with the Detail pane
      when open.**
      Where: [`browse-screen.tsx:640`](../src/features/browse/browse-screen.tsx#L640)
      (`section.grid.min-w-0` wraps flex rows that report max-content width to
      the grid parent instead of wrapping — grid items default to
      `min-width: auto`). Same pattern copy-pasted into
      [`dictionary-screen.tsx:264`](../src/features/dictionary/dictionary-screen.tsx#L264)
      and [`detail-screen.tsx:175,663`](../src/features/detail/detail-screen.tsx#L175).
      Evidence: document `scrollWidth` vs `clientWidth` — 1022px on a 375px
      viewport, 1278px on 768px, 1494px on 1440px. With the Detail pane open at
      1440px the left column's `header` (1014px) runs 482px into the right
      column's 508px track.
      Fix each flex row inside the section with `min-w-0`, or set
      `grid-template-columns: minmax(0, 1fr)` on the section — same fix in all
      three files.
      **Acceptance line:** at 375/768/1440px, on Browse, Dictionary, and Detail
      (both standalone and with the split pane open), `document.documentElement.scrollWidth`
      does not exceed `clientWidth`, and no element's bounding box crosses into
      an adjacent grid track.
      Changed split-pane tracks to allow zero-width minimums and constrained
      nested flex rows with `min-w-0`; `e2e/ux-layout.spec.ts` measures the
      acceptance condition at all required viewports and route variants.

- [x] **A2. Grade buttons use the wrong colour tokens.**
      Where: study screen grade buttons (locate via the "I know" / "No problem"
      button text).
      Evidence: measured `background-color` — "I know" resolves to
      `--primary` (`oklch(0.45 0.13 25)`), "No problem" resolves to
      `--secondary` (`oklch(0.93 0.015 85)`). `--success` and `--perfect` are
      defined at [`globals.css:78-81`](../src/app/globals.css#L78) and mapped
      to Tailwind at [`globals.css:28-31`](../src/app/globals.css#L28) but used
      by no component. `--destructive` and `--primary` share a hue, so "Don't
      know" and "I know" render as near-identical red buttons side by side.
      `BRAND-DESIGN-LANGUAGE.md` §3.4 specifies these three tokens by name.
      **Acceptance line:** computed `background-color` of "I know" equals
      `--success`, and "No problem" equals `--perfect`, in both light and dark
      theme.
      Added semantic `success` and `perfect` Button variants and applied them to
      the two correct-grade actions; `study-screen.test.tsx` verifies the token
      classes and `e2e/offline-study.spec.ts` verifies computed colors in both
      themes when the auth backend is configured.

- [ ] **A3. Stroke-order guide renders as a filled blob, not an outline.**
      Where: [`writing-screen.tsx:434-441`](../src/features/writing/writing-screen.tsx#L434)
      and [`:460-463`](../src/features/writing/writing-screen.tsx#L460);
      [`stroke-animation.tsx:66-77`](../src/features/detail/stroke-animation.tsx#L66).
      Evidence: KanjiVG centreline paths (open curves) drawn with
      `fill="currentColor"` and no `stroke` — browsers implicitly close an open
      path before filling it, so the guide is a solid wedge, not a stroke
      outline. The correct pattern already exists 50 lines below in the same
      file: [`writing-screen.tsx:492-506`](../src/features/writing/writing-screen.tsx#L492)
      (`fill="none"`, `strokeWidth="2.5"`, `strokeLinecap="round"`).
      **Acceptance line:** guide and animated stroke paths in both files use
      `fill="none"` with an explicit `stroke`, matching the captured-stroke
      pattern already in `writing-screen.tsx`. Confirmed visually at `/writing`
      and on a card's stroke animation in `/detail`.

- [ ] **A4. Home deck-card action row overflows on mobile.**
      Where: Home screen deck list, action row (`flex gap-2`,
      `whitespace-nowrap`, no wrap; buttons "Study Development Kanji" 189px +
      "Browse Development Kanji" 201px inside a 251px container).
      Evidence: 477px document on a 375px viewport.
      Fix: allow the row to wrap, and drop the repeated deck name from the
      button label (the card title already states it) — "Study" / "Browse" is
      enough.
      **Acceptance line:** at 375px, `document.documentElement.scrollWidth`
      on `/home` does not exceed `clientWidth`.

- [ ] **A5. Study toolbar overflows on mobile, clipping the remaining-count.**
      Where: `/study` header row.
      Evidence: 430px document on a 375px viewport; "N remaining" clipped.
      Fix: wrap the toolbar row, or move timer/sticky-colors/remaining-count
      into a secondary row below 480px.
      **Acceptance line:** at 375px, `document.documentElement.scrollWidth`
      on `/study` does not exceed `clientWidth`, and "N remaining" is fully
      visible (bounding box within viewport).

---

## Loop B — Accessibility conformance (P1)

- [ ] **B1. Touch targets under 44×44 throughout.**
      Where: [`src/ui/button.tsx:22-27`](../src/ui/button.tsx#L22) — `default`
      is `h-10` (40px), `sm` is `h-9` (36px). Also: Settings deck-selection
      checkboxes (13×13px), pack-install file inputs (20px tall), Browse row
      selection checkbox (20×20px), and the only entry point into a card's
      detail view — the kanji glyph itself (18×26px).
      `BRAND-DESIGN-LANGUAGE.md` §5: "≥44×44 CSS px on every interactive
      element, no exceptions."
      Fix: raise `sm` to an 11 (44px) minimum or pad the hit area with an
      invisible `::before` beyond the visible box; wrap small checkboxes and
      the glyph-link in a larger tappable container rather than resizing the
      visible element.
      **Acceptance line:** every interactive element's bounding box is
      ≥44×44 CSS px, checked on Home, Study, Browse, Settings, Dictionary,
      Writing at 375px and 1440px.

- [ ] **B2. Marketing hero text fails WCAG AA over the tile wall.**
      Where: `/` hero — H1 and subhead sit directly on the animated tile
      background with no scrim.
      Evidence (composited against actual tile colors behind the text):
      subhead (18px/400, needs 4.5:1) measures 1.20:1 worst / 3.69:1 best
      across the ramp; H1 (60px/700, needs 3:1) measures 1.05:1 worst. The
      subhead fails against every tile color measured, including its best
      case. The wall drifts, so legibility flickers as tiles move.
      Fix: add a scrim (gradient or semi-opaque panel) behind the hero text
      block, tuned to hold 4.5:1 against the darkest ramp tile (level 4).
      **Acceptance line:** subhead contrast ≥4.5:1 and H1 contrast ≥3:1
      against every one of the five ramp tile colors, both themes, measured
      the same way as the original audit (composited, not assumed).

- [ ] **B3. No active-page indication in nav.**
      Where: [`app-navigation.tsx:113-117`](../src/features/navigation/app-navigation.tsx#L113).
      Evidence: `grep -rn "aria-current" src/` returns nothing; every
      `NavLink` renders `text-muted-foreground` regardless of route.
      Fix: compare `href` against `usePathname()`, set `aria-current="page"`
      and a visually distinct state on the active link.
      **Acceptance line:** on every app route, the corresponding nav link has
      `aria-current="page"` and a computed style distinguishable from inactive
      links (not just identical `text-muted-foreground`).

- [ ] **B4. `lang="ja"` missing on several Japanese text nodes.**
      Where: page eyebrows — 一覧 (Browse), 辞書 (Dictionary), 環境設定
      (Settings), 共有された文章 (Import) — and kanji glyphs inside Browse's
      list (`span.font-jp-display`). The Study card already sets `lang="ja"`
      correctly, so this is inconsistency, not a blanket gap.
      `BRAND-DESIGN-LANGUAGE.md` §4: "without exception" — a browser may
      otherwise pick Chinese-variant glyphs for shared CJK codepoints.
      Fix: find the shared text/heading component these eyebrows reuse and add
      `lang="ja"` at that call site.
      **Acceptance line:** every element containing CJK Unified Ideographs has
      `lang="ja"` set on itself or an ancestor, verified across all app routes
      (re-run the injected `jaLangMissing` check from the original audit — see
      "How this was measured").

- [ ] **B5. 14px inputs trigger iOS zoom-on-focus.**
      Where: most Settings and Browse `<input>`/`<select>` elements
      (`text-sm`, 14px). Sign-in's fields are already correctly 16px, so this
      is inconsistency, not an unset default.
      `BRAND-DESIGN-LANGUAGE.md` §4 type scale: `--text-base` (16px) "never
      smaller on mobile — iOS zoom-on-focus guard."
      **Acceptance line:** every `input`, `select`, `textarea` in the app
      computes to ≥16px font-size, checked at 375px.

- [ ] **B6. Password field's accessible name is "PasswordShow".**
      Where: sign-in password field — the "Show" toggle button is nested
      inside the `<label>` wrapping the input, so the accessible name
      concatenates both.
      Fix: move the toggle button outside the `<label>`, or give the input an
      explicit `aria-label="Password"`.
      **Acceptance line:** the password input's computed accessible name is
      exactly "Password".

---

## Loop C — Dead-end states (P1)

- [ ] **C1. `/analyze` (text analyzer) is broken with no visible error.**
      Evidence: console repeats `TypeError: Cannot read properties of
      undefined (reading 'Gunzip')` from
      `kuromoji/src/loader/BrowserDictionaryLoader.js:50`; dictionary/tokenizer
      assets 404 in dev. UI shows "Preparing preview…" forever, and on cold
      load *also* shows a contradictory "No text field was included." banner.
      Likely cause: `predev` in `package.json` runs `copy-sql-wasm.mjs` and
      `copy-dev-packs.mjs` but omits `copy-tokenizer-dict.mjs`, which
      `prebuild`/`postinstall` both run — the tokenizer dictionary is never
      copied into `public/` in dev.
      **Acceptance line:** `pnpm dev` from a clean checkout serves the
      tokenizer dictionary (`/tokenizer/...` returns 200, not 404), `/analyze`
      completes a real analysis, and if the dictionary genuinely cannot load,
      the UI shows one clear error ("Couldn't load the offline dictionary —
      try reloading") instead of an infinite spinner plus a contradictory
      banner.

- [ ] **C2. `/detail` with an unresolvable ref hangs forever.**
      Where: [`detail-screen.tsx:489-497`](../src/features/detail/detail-screen.tsx#L489)
      collapses "still loading", "no card chosen", and "ref doesn't resolve"
      into one branch.
      Evidence: navigating to `/detail?deck=dev-kanji&card=0` renders "Loading
      detail…" with `aria-busy="true"` indefinitely, no recovery link.
      Fix: split the three states. Once `deck` has loaded and `contentRef` is
      non-null but resolves to no card, show "Couldn't find that card" with a
      link back to Browse — see `BRAND-DESIGN-LANGUAGE.md` §2 voice rules.
      **Acceptance line:** `/detail` with a syntactically valid but
      non-existent `contentRef` shows a distinct "not found" state with a link
      back to Browse within a bounded time, not an indefinite `aria-busy`
      state.

---

## Loop D — Responsive layout (P2)

- [ ] **D1. Desktop wastes roughly half the viewport width, and container
      widths are inconsistent screen-to-screen.**
      Evidence: at 1440px, Home's `<main>` is 576px (`max-w-xl`) inside a
      1200px content area. Widths vary: `max-w-xl` (home), `max-w-2xl`
      (settings), `max-w-3xl` (help/history/writing/share), unconstrained
      (browse/dictionary — the direct cause of A1).
      **Acceptance line:** single-column reading screens (home, history,
      settings, writing, help) share one max-width token; the chosen value is
      applied consistently and documented in one place (a Tailwind config
      constant or a shared layout component), not repeated as a literal string
      per screen.

- [ ] **D2. Desktop sidebar scrolls away with the page.**
      Evidence: `<aside>` is `position: static`; measured height equals the
      document — 2863px on Home, 9775px on Settings. Scrolling either page
      scrolls the nav sidebar out of view entirely.
      Fix: `position: sticky; top: 0; align-self: start` on the aside (already
      inside the `md:grid` two-column layout).
      **Acceptance line:** on Home and Settings, at 1440px, after scrolling to
      the bottom of the page, the sidebar `<aside>` remains visible in the
      viewport.

- [ ] **D3. Mobile nav hides 4 of 7 destinations with no scroll affordance.**
      Evidence: horizontal nav is 223px wide holding 555px of link content;
      scrolls (`overflow-x: auto`) but with no visible scrollbar, arrow, or
      edge fade — History, Dictionary, Writing, Help are undiscoverable.
      Fix: either a bottom tab bar with the most-used destinations plus a
      "More" overflow, or an edge-fade gradient and visible scroll affordance
      on the current nav.
      **Acceptance line:** at 375px, every one of the 7 nav destinations is
      either visible without scrolling or has a visible, discoverable
      affordance (fade, arrow, or scrollbar) indicating more content exists.

- [ ] **D4. Sidebar breakpoint switches on too early for tablet portrait.**
      Evidence: the two-column `md:grid` layout activates at 768px — iPad
      portrait's exact width — leaving 528px for content after a 240px
      sidebar, which is also the width that triggers A1.
      **Acceptance line:** at 768px, after A1 is fixed, either (a) no page
      overflows horizontally with the two-column layout active, confirmed by
      the same `scrollWidth`/`clientWidth` check as A1, or (b) the breakpoint
      is raised to `lg:` (1024px) and 768px gets the mobile-style collapsible
      nav instead.

- [ ] **D5. Settings is one 9775px scroll with no sectioning.**
      Evidence: measured document height 9775px, fully linear — Appearance,
      Text size, News links, Create a deck, and more below the fold, no jump
      links or sticky section headers.
      **Acceptance line:** Settings has an in-page way to jump directly to any
      of its major sections (anchor nav, sticky section headers, or
      tabs/accordion) reachable without scrolling past intervening sections.

---

## Loop E — Design-system conformance (P2)

- [ ] **E1. `--text-display` token defined but never used.**
      Where: [`tokens.css:64`](tokens.css#L64) defines `--text-display: 8.75rem`
      (140px) explicitly for "study-card kanji." The actual study-card glyph
      renders at `text-8xl` (96px); `grep -rn "text-display" src/` finds only
      the definition, no consumer.
      **Acceptance line:** either the study-card kanji element uses
      `--text-display` (and 96px was wrong), or `tokens.css`/
      `BRAND-DESIGN-LANGUAGE.md` are updated to state the actual value with a
      one-line rationale for the deviation. Do not leave a dead, contradicting
      token in place.

- [ ] **E2. Fold overlay swamps small level chips.**
      Where: `.sticky-shape` fold border-width ladder (6/9/12/16px for levels
      1–4) per `BRAND-DESIGN-LANGUAGE.md` §3.3.
      Evidence: legend chips render at 12×12px total, so a level-3 (12px
      border) or level-4 (16px border) fold covers nearly the whole chip,
      leaving almost no base colour visible.
      Fix: scale fold size as a proportion of element size, or use a
      simplified single-triangle indicator below a stated size threshold.
      **Acceptance line:** at every size the fold overlay is used (legend
      chips, tile-wall cells, study-card strip), the base ramp colour remains
      the dominant visible colour of the swatch — the fold does not cover a
      majority of the element's area.

- [ ] **E3. Dark-theme card/background contrast is razor-thin.**
      Evidence: `--card` vs `--background` measures 1.09:1 dark, 1.05:1
      light — cards are distinguished almost entirely by their 1px border.
      Level-4 swatch `#3a352e` vs dark background `#18120f` measures 1.53:1;
      the hairline-border rule is applied but at only 25% alpha.
      This is the numeric verification `BRAND-DESIGN-LANGUAGE.md`'s own
      "Open follow-ups" §3 asks for and flags as not yet done.
      **Acceptance line:** `--card` vs `--background` contrast is raised to a
      value you can state and justify (does not need to hit body-text AA since
      cards aren't text, but should be perceptibly distinct — target ≥1.2:1 at
      minimum, ideally higher); level-4 hairline alpha in dark theme is raised
      toward the light theme's 0.35. State the new values in this item's
      completion note.

- [ ] **E4. "Reveal (Space)" hint shown on touch devices.**
      Evidence: the primary study-card button always renders "Reveal (Space)"
      regardless of input method, including on mobile.
      Fix: detect `matchMedia('(pointer: coarse)')` and drop the keyboard
      hint, showing just "Reveal."
      **Acceptance line:** on a touch/coarse-pointer device (or emulated via
      `pointer: coarse`), the button reads "Reveal" without the keyboard hint;
      on a mouse/fine-pointer device it still shows "Reveal (Space)".

- [ ] **E5. Level chip accessible names omit the belt name.**
      Evidence: measured `aria-label` values — "Deck color: level 0" and
      "Level 0, New" — versus `BRAND-DESIGN-LANGUAGE.md` §3.5's spec, e.g.
      "Level 2, green (Midori)."
      **Acceptance line:** every `LevelChip`/swatch `aria-label` in the app
      includes both the numeral and the belt name (romaji + kanji or romaji
      alone, matching §3.5's example format), verified on Home, Browse,
      Detail, and Settings.

---

## Observed, not queued

Record anything noticed while working a claimed item here, in one or two
lines, without acting on it. Future audits triage this list into a loop.

---

## How this was measured

Contrast, overflow, and touch-target findings above were gathered with an
injected script (canvas-normalised colour resolution so OKLCH backgrounds
resolve correctly, composited against actual ancestor backgrounds — not raw
`getComputedStyle().color`/`backgroundColor` diffed naively). If you need to
re-run an equivalent check:

- **Contrast:** resolve both foreground and effective composited background to
  sRGB via an offscreen canvas (`fillStyle` round-trip), then apply the
  standard WCAG relative-luminance formula. Do not compare raw OKLCH strings.
- **Overflow:** compare `document.documentElement.scrollWidth` to `clientWidth`
  at each target viewport width (375, 768, 1280, 1440); find culprits by
  filtering elements whose `getBoundingClientRect().right` exceeds
  `clientWidth`.
- **Touch targets:** `getBoundingClientRect()` on every
  `a[href],button,input,select,textarea,[role=button]`, minimum 44×44.
- **`lang` coverage:** regex-match text nodes for the CJK Unified Ideographs /
  Hiragana / Katakana ranges, check `closest('[lang]')` resolves to `"ja"`.

## Verified working (do not re-audit)

- **In-app text contrast** passes AA everywhere measured, in both themes,
  except the marketing hero (B2) — every screen inside the authenticated app
  returned zero contrast failures from the injected audit.
- **History chart and heatmap** have correct `role="group"`, per-day
  `aria-label` and `title`, visible focus rings, and `motion-reduce` handling.
- **Dictionary search-mode toggle** (Text/Radical/Stroke-count) uses a correct
  `aria-pressed` button group.
- **Study card screen-reader text** is thorough: "Card 1 of 10. 国. Answer
  hidden. Activate the card or Reveal to show the answer. Level 0, New."
- **Level-0 hairline-border rule** works as designed on light theme — measured
  1.39:1 against the background, with the border carrying the distinction as
  intended.
- **Mobile marketing page** (`/`) has zero horizontal overflow at 375px — only
  the authenticated app's Browse/Home/Study screens do (Loop A).
