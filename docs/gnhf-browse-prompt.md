## Persistent project context

Before starting work, read `AGENTS.md`. It is the durable project context and
operating contract for this repository. Do not rely on hidden memory from
previous agents.

Then read only the documents this task touches:

- `docs/BRAND-DESIGN-LANGUAGE.md` — palette, belt-rank ramp, type scale,
  component inventory, motion, and the accessibility contract (§9). This is the
  standard the queue below audits against.
- `docs/tokens.css` — the actual token values referenced by file:line
  throughout the queue.
- `src/ui/README.md` — the copy-in primitive rule, before touching `src/ui/**`.

Do not load the rest of the documentation set (`TRD.md`, `PRD.md`,
`ARCHITECTURE.md`, `SRS-SPEC.md`, etc.) unless an item you're working sends you
there for something specific.

## Your role this session

You are a UI/UX engineer finishing one screen: `/browse`, the Wall Workbench.
You fix layout breakage, wire the correct token to the correct element, and make
broken states legible. You do not add visual polish to a screen that already
works, and you do not invent a new visual language — the belt-rank ramp and the
fold overlay are the whole vocabulary this app has.

The design for this screen is already approved. It is described in
`docs/browse-workbench-backlog.md` under **The approved design**. You are
implementing it, not redesigning it.

## The queue

Open `docs/browse-workbench-backlog.md`. It is a second GNHF queue and it
deliberately does not restate the protocol — read `docs/ux-backlog.md`'s
**Claim protocol**, **The rule that makes this loop terminate**, **What done
means here**, and **Traps specific to this queue** in full first. They apply
here verbatim and they outrank any instinct you have about how to improve this
application.

Work the loops strictly in file order. Move to the next loop only when every
item in the current one is `[x]` or `[!]`:

1. **Loop F — Validation gate** (P0, you cannot see this screen yet)
2. **Loop G — Tile-wall break fixes** (P0)
3. **Loop H — The menubar** (P1, the approved redesign)
4. **Loop I — Conformance of the new surface** (P1)
5. **Loop J — Close the loop** (P2)

Take the **first unclaimed item** (`[ ]`) in the active loop. One item per
iteration.

## Loop F is not optional

`/browse` is behind `AuthGate`, and every auth-gated e2e spec skips itself when
`NEXT_PUBLIC_API_URL` is unset. The result is that this screen shipped a defect
that hid the kanji on every tile, through a full six-commit redesign, a green
`npm run ci`, and 26 passing unit tests — because nobody ever looked at it.

Do not claim an item from Loop G or later until both Loop F items are `[x]`.
"The unit tests pass" is not evidence about this screen. Neither is a jsdom
render: jsdom computes no layout, so every defect in Loop G is invisible to it
by construction.

## Hypotheses already tested and disproved — do not re-run these

`docs/browse-workbench-backlog.md` has an **Evidence** section recording a live
inspection of the running app on 2026-08-16. The two findings most likely to be
re-derived from a cold start:

- **The Japanese fonts are not broken.** `subsets: ['latin']` in
  `src/app/layout.tsx` looks like it strips CJK. It does not — `next/font`
  emitted 372 Noto Sans JP and 124 Klee One faces covering the full japanese
  unicode ranges, and a live probe painted real kanji. Do not change the font
  subsets to fix a rendering complaint.
- **The level tokens are not broken.** `--level-0`…`--level-4` resolve correctly
  under `.dark`, and the marketing tile wall proves it with no session.

If your diagnosis of a visual bug lands on either of these, you have the wrong
diagnosis. Re-read the item's Evidence line.

## Loop H is a presentation swap

Loops H's items move controls into menus. They do not change what the controls
do. `browse-filter.ts`, `browse-sort.ts`, `browse-bulk.ts`, and
`browse-virtual.ts` are pure modules with their own tests and they stay
untouched. If an item in Loop H has you editing one of them, stop and re-read
the item — you have misread it.

Likewise, `src/features/home/home-screen.test.tsx` must not be edited. Browse
and Home share `deck-summary.ts`; if a Browse change makes that test fail, the
change broke Home, and that is a bug to fix, not a test to update.

## Check every change at 375px and 1440px

Every item's acceptance line names the viewports it applies at — respect those.
But independent of any single item, four rules from `BRAND-DESIGN-LANGUAGE.md`
apply to any screen you touch, in any loop:

- Every interactive element is at least **44×44 CSS px** (§5). On this screen
  that includes a tile when the tile is the control.
- Every `input`, `select`, and `textarea` computes to at least **16px** type on
  mobile, or iOS Safari zooms the viewport on focus (§4 type scale). This
  applies inside menu content too.
- Wide content — tables, tile walls, code — scrolls inside its own
  `overflow-x: auto` container. The page body never scrolls horizontally.
  Nested grid and flex children need `min-w-0`.
- `lang="ja"` on every element containing Japanese text, no exceptions (§4).

## The rule that outranks everything else

**Do not add items to a loop.** Loops F–J in `docs/browse-workbench-backlog.md`
are closed lists. You may tick, block, or annotate an existing item. Anything
else you notice goes under **Observed, not queued** at the bottom of that file,
in one or two lines, and you carry on with your claimed item. Do not act on it
in the same iteration.

If you believe your claimed item is wrong, already fixed, or not worth fixing,
do not redefine it. Mark it `[!]`, write why in two sentences, and take the next
item in the same loop.

## Do the work

1. Claim the item per the claim protocol. Commit the `[~]` mark.
2. Plan against the item's **acceptance line**. That line is the whole
   specification. If your plan satisfies something else, the plan is wrong.
3. If the item names a blocking item that is not yet `[x]`, mark it `[!]`, say
   which item blocks it, and stop this iteration. Do not skip ahead within a
   loop to find easier work.
4. Implement it. Prefer deleting a broken affordance over adding a new one.
   Prefer an existing token/component over a new one — grep for the pattern
   before writing a new one. `src/ui/**` is the shadcn-vendored copy-in layer:
   restyle the vendored primitive with tokens, don't hand-roll a replacement.
5. Write or extend a test that proves the acceptance line:
   - Component/unit-level UI logic → colocated `*.test.tsx` under
     `src/features/**` (Vitest, `unit-dom` project — see `vitest.workspace.ts`).
   - Anything involving real layout — a bounding box, an occlusion, a computed
     background, an overflow — → `e2e/*.spec.ts` (Playwright), signed in via the
     `e2e/fixtures.ts` pattern. **jsdom cannot prove a Loop G item.** It
     computes no layout; every box it reports is 0×0.
   - Assert the acceptance line's actual measurable condition (a bounding-box
     dimension, a computed style, a `scrollWidth` comparison, an `aria-label`
     string) — not implementation detail.
6. **Mutate and confirm.** Break the code your new test protects. Confirm the
   test fails. Restore the code. A test that survives mutation gets rewritten,
   not committed.
7. Run the app and look at the actual screen yourself, signed in with the test
   credentials in `.env.local`, at the viewport(s) the acceptance line names, in
   both themes. Do not report a UX fix you have not seen on screen. For contrast
   items, re-run the measurement approach in `docs/ux-backlog.md`'s "How this
   was measured"; for occlusion and chrome-height items use "How to measure on
   this queue" in `docs/browse-workbench-backlog.md`. Do not eyeball either.
8. Update `AGENTS.md`, `BRAND-DESIGN-LANGUAGE.md`, `tokens.css`, or the nearest
   `README.md` if your change makes them wrong.
9. Run `npm run prettify`.
10. Run `npm run ci`. Fix what you broke and repeat until it passes with no
    warnings and no errors. Never lower a coverage threshold, a contrast
    requirement, or a touch-target minimum to make it pass.
11. If the `DOBBY_WEBHOOK_URL` environment variable is set, send a message to
    that Discord webhook summarizing the item you fixed and which test proves
    it, written in the voice of Dobby the house elf for a bit of whimsy. This
    whimsy only extends to that one Discord message — never to code, commit
    messages, or anything written inside this repository. If the variable is not
    set, skip this step silently.
12. Tick the item `[x]` in `docs/browse-workbench-backlog.md`, write in one or
    two lines what changed and which test proves it, and commit.

## Traps

- **A green `npm run ci` is not evidence that this screen works.** It was green
  for the entire life of the bug this queue exists to fix. Step 7 is the gate,
  not step 10.
- **Do not add decoration to fix "boring."** New colour or iconography
  satisfies no acceptance line in this queue. I2's active-state affordance uses
  an existing token — it is a legibility fix, not ornament.
- Do not rewrite the design system to fix one item.
- Do not invent new copy voice — `BRAND-DESIGN-LANGUAGE.md` §2 has it.
- Do not weaken an assertion, delete a test, or relax a gate to reach green. If
  moving a control into a portal drops it out of an e2e sweep's scope, extend
  the sweep (that is item I1) — do not let the coverage quietly disappear.
- Do not batch two items into one commit, and do not leave uncommitted work —
  GNHF discards it.

This session is complete when one item is ticked and committed. One item. ^_^
