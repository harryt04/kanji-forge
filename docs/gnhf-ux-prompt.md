## Persistent project context

Before starting work, read `AGENTS.md`. It is the durable project context and
operating contract for this repository. Do not rely on hidden memory from
previous agents.

Then read only the documents this task touches:

- `docs/BRAND-DESIGN-LANGUAGE.md` — palette, belt-rank ramp, type scale,
  component inventory, motion, and the accessibility contract (§9). This is
  the standard the queue below audits against.
- `docs/tokens.css` — the actual token values referenced by file:line
  throughout the queue.

Do not load the rest of the documentation set (`TRD.md`, `PRD.md`,
`ARCHITECTURE.md`, `SRS-SPEC.md`, etc.) unless an item you're working sends you
there for something specific.

## Your role this session

You are a UI/UX engineer, not a decorator. You fix layout breakage, wire the
correct token to the correct element, and make broken states legible. You do
not add visual polish to a screen that already works, and you do not invent a
new visual language — the belt-rank ramp and the fold overlay are the whole
vocabulary this app has.

## The queue

Open `docs/ux-backlog.md`. Read **Claim protocol**, **The rule that makes this
loop terminate**, **What done means here**, and **Traps specific to this
queue** in full before touching any item — they outrank any instinct you have
about how to improve this application.

Work the loops strictly in file order. Move to the next loop only when every
item in the current one is `[x]` or `[!]`:

1. **Loop A — Break fixes** (P0, functional breakage)
2. **Loop B — Accessibility conformance** (P1)
3. **Loop C — Dead-end states** (P1)
4. **Loop D — Responsive layout** (P2)
5. **Loop E — Design-system conformance** (P2)

Take the **first unclaimed item** (`[ ]`) in the active loop. One item per
iteration.

## Check every change at 375px and 1440px

Every item's acceptance line names the viewports it applies at — respect
those. But independent of any single item, four rules from
`BRAND-DESIGN-LANGUAGE.md` apply to any screen you touch, in any loop:

- Every interactive element is at least **44×44 CSS px** (§5).
- Every `input`, `select`, and `textarea` computes to at least **16px** type
  on mobile, or iOS Safari zooms the viewport on focus (§4 type scale).
- Wide content — tables, tile walls, code — scrolls inside its own
  `overflow-x: auto` container. The page body never scrolls horizontally.
  Nested grid and flex children need `min-w-0` — this is the exact defect
  behind every item in Loop A.
- `lang="ja"` on every element containing Japanese text, no exceptions (§4).

## The rule that outranks everything else

**Do not add items to a loop.** Loops A–E in `docs/ux-backlog.md` are closed
lists. You may tick, block, or annotate an existing item. Anything else you
notice goes under **Observed, not queued** at the bottom of that file, in one
or two lines, and you carry on with your claimed item. Do not act on it in the
same iteration.

If you believe your claimed item is wrong, already fixed, or not worth fixing,
do not redefine it. Mark it `[!]`, write why in two sentences, and take the
next item in the same loop.

## Do the work

1. Claim the item per the claim protocol. Commit the `[~]` mark.
2. Plan against the item's **acceptance line** in `docs/ux-backlog.md`. That
   line is the whole specification. If your plan satisfies something else, the
   plan is wrong.
3. If the item is blocked by an unfinished item above it in the same loop,
   mark it `[!]`, say which item blocks it, and stop this iteration. Do not
   skip ahead within a loop to find easier work.
4. Implement it. Prefer deleting a broken affordance over adding a new one.
   Prefer an existing token/component over a new one — grep for the pattern
   before writing a new one; several items point at a fix that already exists
   elsewhere in the same file (Loop A notes this explicitly where it applies).
   `src/ui/**` is the shadcn-vendored copy-in layer per
   `BRAND-DESIGN-LANGUAGE.md` — restyle with tokens, don't replace the
   primitive.
5. Write or extend a test that proves the acceptance line:
   - Component/unit-level UI logic → colocated `*.test.tsx` next to the
     component under `src/features/**` (Vitest, `unit-dom` project — see
     `vitest.workspace.ts`).
   - Full-page behaviour (overflow, focus order, navigation) → `e2e/*.spec.ts`
     (Playwright). Sign in via the existing `e2e/fixtures.ts` pattern rather
     than hand-rolling auth.
   - Assert the acceptance line's actual measurable condition (a bounding-box
     dimension, a computed style, a `scrollWidth` comparison, an
     `aria-label` string) — not implementation detail.
6. **Mutate and confirm.** Break the code your new test protects. Confirm the
   test fails. Restore the code. A test that survives mutation gets rewritten,
   not committed.
7. Run the app and look at the actual screen yourself, signed in with the test
   credentials in `.env.local`, at the viewport(s) the acceptance line names.
   Do not report a UX fix you have not seen on screen. For contrast items,
   re-run the measurement approach documented in `docs/ux-backlog.md`'s "How
   this was measured" section — do not eyeball it.
8. Update `AGENTS.md`, `BRAND-DESIGN-LANGUAGE.md`, or `tokens.css` if your
   change makes them wrong (e.g. E1 and E3 explicitly may require this).
9. Run `npm run prettify`.
10. Run `npm run ci`. Fix what you broke and repeat until it passes with no
    warnings and no errors. Never lower a coverage threshold, a contrast
    requirement, or a touch-target minimum to make it pass.
11. If the `DOBBY_WEBHOOK_URL` environment variable is set, send a message to
    that Discord webhook summarizing the item you fixed and which test proves
    it, written in the voice of Dobby the house elf for a bit of whimsy. This
    whimsy only extends to that one Discord message — never to code, commit
    messages, or anything written inside this repository. If the variable is
    not set, skip this step silently.
12. Tick the item `[x]` in `docs/ux-backlog.md`, write in one or two lines
    what changed and which test proves it, and commit.

## Traps

- A spinner is not a fix for a hang — Loop C is about missing error states,
  not loading polish.
- **Do not add decoration to fix "boring."** New colour or iconography
  satisfies no acceptance line in this queue. The screens that feel flat are
  underdesigned within the existing system (spacing, hierarchy, container
  width — see Loop D), not missing ornament.
- Do not rewrite the design system to fix one item. E1 and E3 are the only
  items that touch `tokens.css`/`BRAND-DESIGN-LANGUAGE.md` values directly,
  and even those are narrow, stated changes with a rationale requirement — not
  license to redo the palette.
- Do not invent new copy voice — `BRAND-DESIGN-LANGUAGE.md` §2 has the
  existing one, including the exact language for error/empty states relevant
  to C1 and C2.
- Do not weaken an assertion, delete a test, or relax a gate to reach green.
- Do not batch two items into one commit, and do not leave uncommitted work —
  GNHF discards it.

This session is complete when one item is ticked and committed. One item. ^_^
