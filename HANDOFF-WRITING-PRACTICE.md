# Handoff: writing practice needs to be the focal point of the study answer

## User's intent (their words, paraphrased)

> After revealing a flash card, I expect the writing practice card/pane to be
> top, front and center. Practicing stroke order helps commit the kanji to
> memory, both from a readings and meaning standpoint.

Two things to take from this:

1. **Layout**: the writing canvas should dominate the revealed-answer view —
   not be one more item in a list the learner scrolls past. "Top, front and
   center" reads as: it should be the first and most visually prominent thing
   they see after tapping Reveal, not a small pane below the meaning, related
   words, and level line.
2. **Why**: the user considers writing practice core to how they memorize a
   kanji's reading and meaning, not a bolt-on extra. That's a signal it
   should probably feel mandatory/central to the study loop, not a
   low-visibility opt-in.

## What exists right now

A prior session (see git log: `78e3e19 writing as part of studying ux`, and
the plan file that produced it) did the following:

- Extracted the stroke-matching canvas out of the old standalone `/writing`
  page into a reusable component:
  [`src/features/writing/writing-pad.tsx`](src/features/writing/writing-pad.tsx)
  (`WritingPad`).
- Built a study-specific wrapper that shows one canvas for a kanji card, or a
  kanji-picker (chip row) + canvas for a multi-kanji word card:
  [`src/features/study/study-writing-panel.tsx`](src/features/study/study-writing-panel.tsx)
  (`StudyWritingPanel`).
- Wired it into the study screen at
  [`src/features/study/study-screen.tsx:709-716`](src/features/study/study-screen.tsx#L709-L716).
- Gated it behind the existing `writing` **answer-style** setting
  (`answerShows('writing')`), which is **off by default** — see
  `DEFAULT_STUDY_ANSWER` in
  [`src/features/study/study-style.ts`](src/features/study/study-style.ts).
  A learner has to go into Settings → Study answer and turn "Writing pad" on.
- Removed the standalone `/writing` page from primary navigation (it's still
  reachable by direct link, e.g. from a kanji's Detail page).

### Why this doesn't satisfy the user's ask

Look at the render order in `study-screen.tsx` inside the revealed-card
branch (~line 514 onward):

1. The flashcard itself — a **fixed `max-w-sm` (384px) card** — renders the
   question, then (once revealed) kanji / readings / meaning / a "Related
   words" section / the level line, all stacked inside that one card.
2. **Only after that whole card** does `StudyWritingPanel` render
   (line 709), in its own `compact`, narrower (`max-w-xs`, 320px) box below
   the card.
3. Below that come the grade buttons.

So even with the setting turned on, the writing canvas is the **fourth
thing** on the page after reveal, visually subordinate to the card, and on a
typical phone viewport it's off-screen below the fold — the opposite of
"front and center." This was a straightforward bolt-on placement, not a
deliberate layout redesign, and it's the reason the user is unhappy.

## What was *not* attempted

- No layout redesign. The card's `max-w-sm` container and the
  meaning/reading/related-words stack were left exactly as they were before
  writing practice existed; the pad was just appended after.
- No change to the default answer-style settings — writing practice is still
  opt-in and easy to never notice.
- No exploration of what "front and center" should mean concretely: replace
  the card's role as the primary focal element? Show the canvas *inside* the
  card, above the readings/meaning? Show canvas first, then reveal
  readings/meaning as secondary/collapsed detail below or beside it? These
  are genuinely different designs and weren't discussed with the user before
  the previous session shipped its version.

## Suggested next steps

1. **Clarify the target layout with the user before writing code.** Useful
   questions:
   - Should the writing canvas replace the flashcard's current shape (e.g.
     canvas becomes the primary "card," with meaning/reading/related words
     shown as a smaller panel underneath or beside it, rather than in a
     separate stacked box)?
   - Should it be the very first thing shown on reveal — before the
     meaning/reading text is even visible — so the learner writes the kanji
     before reading its meaning? Or shown simultaneously, just visually
     dominant?
   - Does this apply on mobile, desktop, or both? A 384px-wide card and a
     320px canvas stacked vertically is a mobile-plausible layout; "front and
     center" might imply a wider/taller canvas that needs a different
     breakpoint strategy.
   - Should writing become **on by default** (removed from the opt-in
     answer-style list, or defaulted to on) given the user frames it as core
     to memorization, not optional?
2. Once the layout is agreed, the components to change are:
   - [`study-screen.tsx`](src/features/study/study-screen.tsx) — reorder/
     restructure the revealed-answer JSX (~lines 514-737).
   - [`study-writing-panel.tsx`](src/features/study/study-writing-panel.tsx) —
     may need a non-`compact` / larger presentation mode if it becomes the
     primary element.
   - [`study-style.ts`](src/features/study/study-style.ts) — if the default
     answer-style set changes.
3. Re-run the existing test suites after changes — they currently assert the
   old DOM order/behavior in several places:
   - `study-screen.test.tsx` (the "renders" and "offers writing practice for
     the kanji inside a word card" tests specifically check for the writing
     panel's presence/heading, not its position — but a layout change could
     still break assumptions about what's inside `study-answer` vs. outside
     it).
   - `study-writing-panel.test.tsx`, `writing-pad.test.tsx` — these test the
     component in isolation and shouldn't need to change unless the
     component's own API changes.
4. Verify manually in the browser (not just unit tests) that the writing pad
   is the dominant visual element immediately after Reveal, on the viewport
   sizes the user cares about — this is a visual/UX judgment call that unit
   tests can't catch.

## Verification note from the previous session

Screenshots via the browser preview tool were unreliable in that session
(returned solid black after any scroll or programmatic scroll), so layout
was partly verified via `get_page_text` / DOM queries instead of visually.
**Don't trust that as sufficient proof of "front and center."** Get an actual
visual screenshot (or ask the user to look) before declaring this done —
text-content checks cannot confirm visual prominence, which is the entire
point of this request.
