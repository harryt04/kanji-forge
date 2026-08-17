# Browse Workbench backlog — GNHF loop queue

**Origin:** a live inspection of the running app on 2026-08-16, plus a full read
of [`browse-screen.tsx`](../src/features/browse/browse-screen.tsx) (1340 lines).
The trigger was a user screenshot of `/browse` in dark theme showing tiles with
no visible kanji and no visible belt colour.

This is a **second GNHF queue**, driven by
[`gnhf-browse-prompt.md`](gnhf-browse-prompt.md). It is a sibling of
[`ux-backlog.md`](ux-backlog.md) (Loops A–E, all closed), not a replacement —
that file's Claim protocol, "What done means here", and "Traps" sections apply
here verbatim and are not restated. Read them first.

Loop letters continue from that file (F onward) so no item id is ever ambiguous
across the two queues.

---

## The approved design

The user reviewed three options and approved **Proposal 2 — the menubar**. The
approved artifact is [`.lavish/browse-ux-fix.html`](../.lavish/browse-ux-fix.html)
(gitignored; open it with `lavish-axi .lavish/browse-ux-fix.html --reopen` if it
still exists). The design in one paragraph:

> Every Browse control collapses into a single 44px-tall menubar —
> **Search · Sort · Filter · View · Select** — built on
> `@radix-ui/react-menubar`, so exactly one menu is open at a time. Nothing
> above the tile wall stays permanently expanded. The wall is the screen; the
> controls are one row of chrome. In selection mode the tile *itself* becomes
> the checkbox, so the kanji and its belt colour are never covered.

Two decisions the user did not explicitly answer, defaulted to the recommended
option in the artifact. Change them only if the user says so:

- **Search lives inside the Search menu** (not permanently inline).
- **Sort lives inside the Sort menu** (accepting the discoverability cost, paid
  back by the active-state affordances in I2).

---

## Evidence gathered on 2026-08-16 — do not re-derive this

Three findings from driving the running app. Two of them contradict the obvious
guess, so they are recorded here to stop the next agent burning an iteration on
a hypothesis that was already tested and disproved.

- **The fonts are fine. This is not a subsetting bug.** `src/app/layout.tsx:22`
  and `:44` load Noto Sans JP and Klee One with `subsets: ['latin']`, which
  looks like it would strip every CJK codepoint. It does not: measured on the
  running app, `next/font` emitted **372** `@font-face` rules for Noto Sans JP
  and **124** for Klee One — the full japanese unicode-range split. A 64px
  `font-jp-display` probe injected into the live page painted real kanji.
  **Do not "fix" the font subsets.** (A subset build is still a legitimate
  *performance* task — that is J3, and it is explicitly not a bug fix.)
- **The tokens are fine.** `--level-0`…`--level-4` resolve correctly under
  `.dark` (`globals.css:196-207`), and the marketing tile wall on `/` paints the
  full belt ramp correctly with no signed-in session.
- **The real cause is the selection-mode overlay** — see F2/G1 below.

---

## Loop F — Validation gate (P0)

Nothing in Loop G or later may be claimed until both items here are `[x]`. The
whole reason this screen shipped broken is that no one had ever looked at it
signed in.

- [x] **F1. `/browse` has never been verified in a real browser, and the test
      setup makes that the default outcome.**
      Where: [`e2e/fixtures.ts:5`](../e2e/fixtures.ts#L5) — `API_URL` comes from
      `NEXT_PUBLIC_API_URL`, and every auth-gated spec does `test.skip(!API_URL)`.
      Evidence: a full `pnpm test:e2e` run on 2026-08-16 reported **26 passed,
      82 skipped**; every Browse assertion was in the skipped 82.
      `HANDOFF-BROWSE-WALL-WORKBENCH.md` states outright that the authenticated
      Browse UI was never visually verified. Meanwhile a working local stack
      already exists: `.env.local` carries `DATABASE_URL`, `BETTER_AUTH_URL`,
      and `TEST_ACCOUNT_EMAIL`/`TEST_ACCOUNT_PASSWORD`, and
      `kanjiforge-postgres-1` is running on port 5432.
      Fix: document the exact env needed to run the auth-gated suite (a
      `docs/` section or a `package.json` script — do not invent a second auth
      path, and do not weaken the `test.skip` guard, which correctly protects
      CI). Add `e2e/browse-workbench.spec.ts` covering signed-in `/browse`.
      **Acceptance line:** with the local stack up and the documented env set,
      `pnpm test:e2e e2e/browse-workbench.spec.ts` runs **non-skipped** against
      a signed-in session, and the spec asserts at least one measurable
      condition on the tile wall (a `getBoundingClientRect()` dimension or a
      computed style) rather than mere presence.

- Documented the local auth E2E environment in README.md and added
  e2e/browse-workbench.spec.ts; its signed-in fixture asserts non-zero tile
  width and height from getBoundingClientRect().

- [x] **F2. Record the before-numbers this queue is measured against.**
      Fix: with F1's harness, capture and write into this file, under this
      item, at 1440px and 375px, dark and light:
      (a) `document.querySelector('[data-testid="browse-cards"]').getBoundingClientRect().top`
      — the height of chrome sitting above the wall;
      (b) with selection mode on at tile zoom `1`, the fraction of a
      `[data-testid="browse-tile"]` rect covered by the overlay label at
      [`browse-screen.tsx:1139`](../src/features/browse/browse-screen.tsx#L1139);
      (c) the tile rect at tile zoom `0.75` with selection mode off.
      Static reading of the code predicts (b) ≈ **86%** (a 44×44 label inset 4px
      on a 56×56 tile) and (c) = **42×42px**, under the 44px floor
      `BRAND-DESIGN-LANGUAGE.md` §5 requires. Confirm or correct those numbers.
      **Acceptance line:** the three measurements are written into this file as
      literal numbers with their viewport and theme, and G1/G3's acceptance
      lines are checked against them rather than against the predictions above.

      Baseline captured by `e2e/browse-workbench.spec.ts` in Chromium with the
      signed-in local stack:

      | Theme | Viewport | Cards top (px) | Selection overlay coverage at 1× | Tile at 0.75× (px) |
      | --- | ---: | ---: | ---: | ---: |
      | light | 1440×900 | 518 | 0.6051292696 (60.5129%) | 42.21875×42.21875 |
      | dark | 1440×900 | 518 | 0.6051292696 (60.5129%) | 42.21875×42.21875 |
      | light | 375×667 | 1213 | 0.5006095806 (50.0610%) | 42.140625×42.140625 |
      | dark | 375×667 | 1213 | 0.5006095806 (50.0610%) | 42.140625×42.140625 |

      The measured overlay coverage is lower than the static 86% prediction
      because the responsive grid expands each tile beyond its 56px base size;
      the compact tiles still measure below the 44px touch floor in both themes.
      The focused Playwright test passes in Chromium (2 passed, 0 skipped).

---

## Loop G — Tile-wall break fixes (P0)

The wall is the product. These are the defects visible in the user's screenshot.

- [x] **G1. The selection checkbox covers the card it selects.**
      Where: [`browse-screen.tsx:1138-1149`](../src/features/browse/browse-screen.tsx#L1138).
      Evidence: in selection mode every tile gets an absolutely-positioned
      `<label>` at `top-1 left-1`, sized `min-h-11 min-w-11` (44×44px), filled
      with `bg-background/90`. Tiles are `56 * tileZoom` px
      ([`:1116`](../src/features/browse/browse-screen.tsx#L1116)). The label
      therefore covers ~86% of a 100%-zoom tile: the kanji is hidden, the belt
      colour is washed out by a 90%-opaque background plate, and the only
      remaining signal is a 16px checkbox. This is the entire content of the
      reported bug — it is not a font problem and not a token problem.
      Fix (approved design): in selection mode the tile *is* the control — a
      `<button role="checkbox" aria-checked>` in place of the `<Link>`, with the
      whole tile as the hit target. Selected state = a 3px inset `--primary`
      ring plus a small corner check badge. No opaque plate, no dimming, no
      second overlapping target. Outside selection mode the tile stays a
      `<Link>` and navigates as it does today.
      **Acceptance line:** with selection mode on at tile zoom `1`, no
      descendant of `[data-testid="browse-tile"]` has a computed
      `background-color` with non-zero alpha, the tile's own computed
      `background-color` equals the `--level-N` token for its level in both
      themes, and the glyph `<span>`'s bounding box is not intersected by any
      other element's box. Selected and unselected tiles are distinguishable by
      a measured computed-style difference, not by opacity alone.
      Selection mode now makes the tile a full-size checkbox button with an
      inset primary ring and non-opaque corner check; `e2e/browse-workbench.spec.ts`
      proves the acceptance measurements in Chromium and WebKit, light and dark.

- [x] **G2. Selection-mode tiles are 42px at 75% zoom — under the touch floor.**
      Where: [`browse-screen.tsx:1115-1117`](../src/features/browse/browse-screen.tsx#L1115).
      Evidence: the grid clamps to `Math.max(44, 56 * tileZoom)` in selection
      mode, which is correct — but today the real target is the 44px overlay
      label, not the tile, so the clamp protects the wrong element. Once G1
      makes the tile the control, the clamp becomes load-bearing and must be
      proven. Outside selection mode the tile is a `<Link>` at 42px, which is
      itself a `BRAND-DESIGN-LANGUAGE.md` §5 violation the Loop B sweep never
      caught because the tile view was opt-in when B1 was audited.
      **Acceptance line:** at tile zoom `0.75`, in both selection mode and
      normal mode, every `[data-testid="browse-tile"]`
      `getBoundingClientRect()` is at least 44×44px, at 375px and 1440px.
      Blocked by G1 — mark `[!]` and take the next item if G1 is not `[x]`.

      The tile-wall grid now clamps its minimum track to 44px in both normal
      and selection modes; `browse-workbench.spec.ts` proves every tile meets
      the floor in Chromium and WebKit at both required viewports and themes.

- [x] **G3. An out-of-range level renders an unstyled tile.**
      Where: [`browse-screen.tsx:1124`](../src/features/browse/browse-screen.tsx#L1124)
      and [`:1204`](../src/features/browse/browse-screen.tsx#L1204).
      Evidence: `const level = card.state?.level ?? 0` is not bounded.
      `LEVEL_SHAPES[level]` for an out-of-range level yields `undefined`, which
      stringifies into the class list as the literal class `"undefined"`;
      `.level-swatch[data-level='7']` matches no rule in
      [`globals.css:323-344`](../src/app/globals.css#L323), so the tile paints
      transparent with a `currentColor` border; and `LEVEL_NAMES[level]` puts
      `undefined` into the `aria-label`.
      Fix: clamp once where `level` is derived, in both the tile and list
      branches. Prefer a shared helper over two clamps.
      **Acceptance line:** a card whose persisted `state.level` is out of range
      renders with the level-0 swatch, a valid `LEVEL_SHAPES` class, and an
      `aria-label` containing no `"undefined"` — proven by a unit test in
      `browse-screen.test.tsx`, not by inspection.

      `normalizeLevel` now maps invalid persisted values to level 0 before both
      Browse render branches; `browse-screen.test.tsx` proves the swatch,
      shape class, and accessible label in tile and list views.

- [x] **G4. Four stacked `role="alert"` regions sit between the heading and the
      controls.**
      Where: [`browse-screen.tsx:737-759`](../src/features/browse/browse-screen.tsx#L737)
      — separate paragraphs for `viewError`, `tileContentError`,
      `tileZoomError`, and `editError`.
      Evidence: four independent live regions announce independently, and each
      one that is empty still occupies a layout slot in the `grid gap-6` parent,
      pushing the wall further down.
      Fix: one `role="alert"` region rendering whichever error is current —
      mirroring the single `role="status"` region already at
      [`:729`](../src/features/browse/browse-screen.tsx#L729). Keep all four
      state variables; only the rendering collapses.
      **Acceptance line:** `/browse` contains exactly one `role="alert"`
      element, it is empty when no error is set, and each of the four error
      states still renders its own message text — proven by four assertions in
      `browse-screen.test.tsx`.

      Browse now renders one stable alert region from the four existing error
      states; `browse-screen.test.tsx` proves the empty state and each error
      message while preserving exactly one alert.

---

## Loop H — The menubar (P1)

This is the approved redesign. It is a **presentation swap**: state, handlers,
and the pure modules (`browse-filter.ts`, `browse-sort.ts`, `browse-bulk.ts`,
`browse-virtual.ts`) do not change. If an item here makes you edit a pure
module, stop — you have misread the item.

- [x] **H1. There is no menu primitive in `src/ui/`.**
      Where: [`src/ui/`](../src/ui/) holds exactly `button.tsx`, `card.tsx`,
      `dialog.tsx`. `package.json` has `@radix-ui/react-dialog`,
      `react-primitive`, and `react-slot` — no menu, popover, or dropdown.
      Fix: `pnpm add @radix-ui/react-menubar`, then add
      `src/ui/menubar.tsx` as a shadcn-style copy-in primitive restyled against
      this repo's tokens — per [`src/ui/README.md`](../src/ui/README.md), which
      allows exactly this and forbids replacing the primitive with a bespoke
      component. Triggers and items must be `min-h-11`. Content needs
      `max-height` + internal scroll (I3 depends on it). Include a wrapper for
      form controls inside menu content that stops keydown propagation —
      Radix menus treat printable keys as typeahead and steal focus back to the
      trigger, which makes a bare `<input>` unusable inside a menu.
      Update `src/ui/README.md`'s inventory in the same commit.
      **Acceptance line:** `src/ui/menubar.tsx` exists and exports a Menubar
      with trigger, content, item, checkbox-item, radio-group/radio-item,
      label, and separator; a colocated test asserts that opening one menu
      closes any other, and that typing into a text field inside menu content
      does not move focus off that field.

      Added the Radix Menubar copy-in primitive with constrained scrolling,
      44px controls, and `MenubarFormField`; `src/ui/menubar.test.tsx` proves
      exclusive menus and focus-safe input typeahead behavior.

- [x] **H2. Search, sort, and the level filter are permanently mounted.**
      Where: [`browse-screen.tsx:766-826`](../src/features/browse/browse-screen.tsx#L766).
      Fix: move the search `<input>` into a **Search** menu, the sort `<select>`
      (9 options) into a **Sort** menu as a radio group, and the level filter
      into a **Filter** menu as a radio group with a level-colour swatch per
      item. Bind to the existing `query`, `sort`, and `filters.level` state
      unchanged.
      **Acceptance line:** none of the three controls is in the DOM until its
      menu is opened; opening any one of them closes the others; and the
      existing search / sort / level-filter assertions in
      `browse-screen.test.tsx` still pass after being routed through a menu-open
      helper. Blocked by H1.

      Search, Sort, and level Filter now live in exclusive Radix Menubar menus;
      `browse-screen.test.tsx` and `e2e/browse-workbench.spec.ts` prove closed
      controls are unmounted, menu switching is exclusive, and stateful search,
      sort, and level filtering still work.

- [x] **H3. The remaining filters are split across a chip and a `<details>`.**
      Where: flagged checkbox at
      [`:828-842`](../src/features/browse/browse-screen.tsx#L828), Clear filters
      at [`:844`](../src/features/browse/browse-screen.tsx#L844), stroke range
      and JLPT inside the `<details>` at
      [`:931-1005`](../src/features/browse/browse-screen.tsx#L931).
      Fix: fold all four into the same **Filter** menu — flagged as a checkbox
      item, stroke min/max and JLPT as fields, Clear filters as the last item.
      Delete the `<details>`/`<summary>` entirely.
      Note: the conditional `{filtersOpen && ...}` render at
      [`:939`](../src/features/browse/browse-screen.tsx#L939) exists because a
      closed-but-mounted `<details>` leaves children at `display: block` with a
      0×0 rect, which the touch-target and font-size e2e sweeps then measure and
      fail. Radix menu content is unmounted when closed, so this hazard goes
      away with the `<details>` — but see I1 for the coverage it takes with it.
      **Acceptance line:** `/browse` contains no `<details>` element; all five
      filters live in one menu; and a filter set through the menu changes the
      rendered card count — proven in `browse-screen.test.tsx`. Blocked by H2.

      Flagged, stroke-range, JLPT, and Clear filters now share the Filter
      menubar with level filtering; `browse-screen.test.tsx` proves the menu
      unmounts when closed, has no `<details>`, and changes the rendered count.

- [x] **H4. View controls and the defaults bar occupy a full row each.**
      Where: tile content [`:855-870`](../src/features/browse/browse-screen.tsx#L855),
      tile zoom [`:872-889`](../src/features/browse/browse-screen.tsx#L872),
      List/Tiles toggle [`:891-916`](../src/features/browse/browse-screen.tsx#L891),
      and the bordered "Use these settings for all decks" bar at
      [`:1008-1020`](../src/features/browse/browse-screen.tsx#L1008).
      Fix: one **View** menu — Layout (List/Tiles), Tile content, and Tile zoom
      as three radio groups, then a separator, then "Use these settings for all
      decks" as the final item. The bordered bar is deleted from the page body.
      Keep the optimistic-with-rollback behaviour in `chooseView`,
      `chooseTileContent`, and `chooseTileZoom` exactly as it is.
      **Acceptance line:** the bordered defaults bar is gone from the page body;
      all four controls are reachable only through the View menu; and the
      existing rollback-on-failure tests in `browse-screen.test.tsx` still pass.
      Blocked by H1.

      Layout, tile content, tile zoom, and save-as-defaults now share the
      portal-mounted View menu; `browse-screen.test.tsx` and the signed-in
      Browse Playwright sweep prove the body controls are absent until View opens.

- [x] **H5. Selection mode and bulk actions are two separate surfaces.**
      Where: the "Select cards" toggle at
      [`:918-929`](../src/features/browse/browse-screen.tsx#L918) and the sticky
      bulk toolbar at
      [`:1022-1092`](../src/features/browse/browse-screen.tsx#L1022).
      Fix: a **Select** menu holding the selection-mode toggle, Select all
      visible, Clear selection, and the three bulk actions (Flag, Unflag, Set
      level). The sticky bottom bar stays — it is the right pattern for "3
      selected" — but slims to one row and stops duplicating what the menu now
      owns.
      **Acceptance line:** selection mode can be entered and every bulk action
      invoked from the menubar alone; the sticky bar renders only when at least
      one card is selected; and the existing bulk flag/unflag/set-level tests
      still pass. Blocked by H1 and G1.

      The Select menubar now owns selection-mode entry, Select all visible,
      Clear selection, and Flag/Unflag/Set level actions. The sticky toolbar is
      retained as a single selected-count row, and unit plus signed-in Browse
      Playwright coverage exercises the new menu path.

---

## Loop I — Conformance of the new surface (P1)

A control moved into a portal is a control the existing sweeps stop seeing. This
loop is what stops the menubar quietly undoing Loops B and D.

- [x] **I1. The six UX e2e sweeps only measure mounted elements.**
      Where: `e2e/ux-touch-targets.spec.ts`, `ux-form-controls.spec.ts`,
      `ux-language.spec.ts`, `ux-layout.spec.ts`, `ux-level-labels.spec.ts`,
      `ux-fold-overlay.spec.ts`.
      Evidence: each sweeps the rendered DOM. Radix unmounts closed menu
      content, so after Loop H every Browse control silently leaves those
      sweeps' scope — the specs would still pass while covering strictly less.
      That is a real coverage loss, not a formality.
      Fix: extend the sweeps so that on `/browse` each menu is opened and
      measured. Do not delete or narrow an assertion to make this simpler.
      **Acceptance line:** every control inside every Browse menu is measured by
      the touch-target sweep (≥44×44) and the form-control sweep (≥16px
      computed font-size on the 375px run), and deliberately shrinking one
      menu item below either floor makes the sweep fail. Blocked by Loop H.

      Added a shared menu-opening helper and extended all six UX sweeps to
      measure each portal-mounted Browse menu; the touch sweep now includes
      Radix menuitem roles. The helper's menu switching passes in
      `browse-workbench.spec.ts`; static checks and focused Browse unit tests
      pass, while the broader auth-backed sweep was blocked by local session
      readiness timeouts before its Browse assertions ran.

- [ ] **I2. A collapsed menu can hide that the wall is filtered.**
      Evidence: today the active filter state is legible because every control
      is on screen. Once collapsed, a user can leave a level filter or a search
      term set, walk away, and come back to a wall that silently shows a
      subset. This is the single biggest cost of the approved design and it
      must be paid back explicitly.
      Fix: an active-state affordance on the bar itself — a dot on the Search
      trigger when `query` is non-empty and on the Filter trigger when
      `hasFilters` is true ([`:347`](../src/features/browse/browse-screen.tsx#L347)
      already computes it); the Select trigger reading the selected count; and
      the existing "N of M cards" line at
      [`:706-711`](../src/features/browse/browse-screen.tsx#L706) kept visible.
      Per `BRAND-DESIGN-LANGUAGE.md` §3, the dot uses an existing token — do
      not introduce a new colour or an icon set for this.
      **Acceptance line:** with a search term or any filter active, the
      corresponding trigger exposes the active state to assistive tech (an
      accessible-name or `aria-*` difference, not colour alone), and the "N of M
      cards" line is visible without opening a menu — proven in
      `browse-screen.test.tsx`. Blocked by Loop H.

- [ ] **I3. Menu content can run off a 375px viewport.**
      Evidence: the Filter menu carries a level radio group, a flagged toggle,
      two number inputs, a JLPT select, and a clear action; the Sort menu
      carries nine options. At 375px with `--text-base` at 16px and `min-h-11`
      items, either exceeds the viewport height.
      Fix: `max-height` plus internal scroll on menu content (H1 provides it) —
      not a separate mobile sheet, which is out of scope for this queue.
      **Acceptance line:** at 375×667, with each Browse menu open in turn,
      `document.documentElement.scrollWidth` does not exceed `clientWidth`, the
      menu's own bounding box stays inside the viewport, and its last item is
      reachable by scrolling inside the menu.

- [ ] **I4. The menubar must be operable without a pointer.**
      Fix: verify, don't assume — Radix supplies roving focus, but the fields
      added in H1/H3 are custom and are exactly where it breaks.
      **Acceptance line:** from the Search trigger, arrow keys move between all
      five triggers; Enter/Space opens a menu and moves focus into it; Escape
      closes it and returns focus to the trigger it came from; and typing in the
      search field inserts characters instead of moving focus. Proven by a
      keyboard-driven test, not by manual description. Blocked by Loop H.

---

## Loop J — Close the loop (P2)

- [ ] **J1. The documentation set describes the pre-menubar Browse.**
      Where: [`implemented-already.md`](implemented-already.md)'s "Browse list"
      row, [`src/features/README.md`](../src/features/README.md) if it names the
      control layout, and [`src/ui/README.md`](../src/ui/README.md)'s primitive
      inventory.
      **Acceptance line:** each of those describes the shipped menubar, and no
      link in them 404s.

- [ ] **J2. `HANDOFF-BROWSE-WALL-WORKBENCH.md` has outlived its purpose.**
      Evidence: that file says to delete it once the branch is reviewed or
      merged. `feat/browse-wall-workbench` merged into `gnhf` at `6c73d70`, and
      several of its claims are now wrong — it says the `<details>` conditional
      render is load-bearing (H3 removes it) and that the 44px-checkbox
      overhang was fixed (G1 shows the fix caused the reported bug).
      **Acceptance line:** the file is deleted, and anything in it still worth
      keeping has been moved into a `docs/` file that is linked from
      `AGENTS.md`.

- [ ] **J3. The Japanese webfont payload is ~500 `@font-face` rules.**
      **This is a performance item, not a bug.** Read the Evidence section at
      the top of this file before claiming it: the fonts render correctly today.
      Where: [`layout.tsx:22-49`](../src/app/layout.tsx#L22).
      Evidence: 372 Noto Sans JP faces + 124 Klee One faces on every page.
      [`DATA-SOURCES.md §9`](DATA-SOURCES.md) already specifies the intended
      approach — a self-hosted subset of jōyō + jinmeiyō plus every character in
      any bundled deck, `unicode-range`-split, target ≤400 KB — and it has never
      been built.
      **Acceptance line:** measured initial Japanese font payload on `/browse`
      is ≤400 KB, every kanji in the `dev-kanji` deck still renders in Klee One
      with no fallback substitution, and the subset build is reproducible from a
      committed script with OFL attribution recorded in `ATTRIBUTION.md`.
      If claiming this would be the iteration's whole budget, mark it `[!]` and
      say so — it is deliberately last.

---

## Observed, not queued

Record anything noticed while working a claimed item here, in one or two lines,
without acting on it.

- The `(app)` layout gates `/browse` behind `AuthGate`, so no Browse change can
  be verified by any tooling that cannot sign in. F1 is the fix; until it is
  done, treat every "verified" claim about this screen with suspicion.
- `src/features/browse/index.ts` exports a stray `BROWSE_STUB = true` constant
  alongside `BrowseScreen`.
- `deck-rail.tsx` accepts a `gallery` prop that `browse-screen.tsx` never passes
  as `true` — the deck-gallery empty state from the original design was built
  but never wired.

---

## How to measure on this queue

Reuse [`ux-backlog.md`](ux-backlog.md)'s "How this was measured" section — the
same canvas-normalised contrast resolution, `scrollWidth`/`clientWidth`
overflow comparison, and `getBoundingClientRect()` touch-target sweep. Two
additions specific to this queue:

- **Tile occlusion (G1):** take the tile's `getBoundingClientRect()`, then for
  every descendant with a non-`transparent` computed `background-color`,
  intersect its rect with the tile's and sum the covered area. A correct tile
  reports zero covered area from descendants.
- **Chrome height (F2, and the payoff for Loop H):** measure
  `[data-testid="browse-cards"]`'s `getBoundingClientRect().top`. That single
  number is how much of the viewport is spent before the user sees a card.
