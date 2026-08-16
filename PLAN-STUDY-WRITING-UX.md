# Plan: writing practice becomes the study answer

Decisions came from the Lavish review session (`.lavish/study-writing-ux.html`).

## Agreed design

| Decision                  | Choice                                                       |
| ------------------------- | ------------------------------------------------------------ |
| Layout                    | **Option 1 — Trace in place**: the card face becomes the canvas |
| Reveal behaviour          | **B1 — Show everything at once**: no gating, no blur           |
| Writing toggle            | **Always on**: remove it from the answer-style setting         |
| Standalone `/writing`     | **Keep it**, restore it to primary navigation as the drill     |

### Target reveal view (kanji card)

Inside the one existing flashcard container, top to bottom:

1. **Canvas** — the question glyph cross-fades into the 12%-opacity stroke
   guide in the same box. The learner draws on the card face.
2. **Meta row** — `n / m strokes`, Undo stroke, Clear all.
3. **Readings** — one compact line (`音: … 訓: …`, or `読み: …` for a word).
4. **Meaning** — one muted line.
5. **Related words** — collapsed disclosure, expandable in place.
6. **Level line** — unchanged.

Grade buttons stay directly below the card, as today. The separate
`StudyWritingPanel` box disappears; nothing renders between card and grades.

### Word cards

The kanji chip row sits directly above the canvas, inside the card. Selecting a
chip swaps the canvas. A chip gets a tick once that character is completed at
least once in this reveal. No auto-advance — the learner taps the next chip.

## Assumptions (unanswered open questions, resolved to the safe default)

- **No stroke data** (kana-only word, kanji missing from KanjiVG): fall back to
  today's text card — big glyph, then readings/meaning/related. No empty canvas.
- **Writing does not affect grading.** Stroke accuracy stays practice only; the
  SRS grade is still the learner's own three-button call.
- **Two-tap mode**: the canvas appears at full reveal only, not at the
  readings step.
- **Repetitions**: keep the pad's current auto-clear so a second pass is
  possible immediately. `autoClear` stays `true`.
- **Keyboard grading**: arrow keys keep working; the canvas is pointer-driven
  and does not capture arrow keys, so no modifier is needed.

Say the word on any of these and I will change it before building.

## Implementation

### 1. `src/features/study/study-style.ts`

- Remove `'writing'` from `STUDY_ANSWER_OPTIONS` (and therefore from
  `StudyAnswer`). `parseStudyAnswer` already drops unknown stored values, so
  existing `study.answer` rows containing `writing` degrade cleanly.
- `DEFAULT_STUDY_ANSWER` stays `['kanji', 'reading', 'meaning']`.

### 2. `src/features/settings/settings-screen.tsx`

- The answer-style checkbox list loses its "Writing pad" row automatically.
- The separate **Writing practice** section (validation on/off, leniency) stays
  — it now governs the study canvas as well as the drill page.

### 3. `src/features/writing/writing-pad.tsx`

- Add a `fill` presentation variant: no inner card chrome, canvas fills the
  container, and the stroke counter + Undo + Clear collapse into one wrapping
  meta row under the canvas.
- Keep `compact` for the drill page. No change to matching, hint or
  assist-after-3-failures logic.

### 4. `src/features/study/study-writing-panel.tsx`

- Drop the `<section>` chrome and the "Writing practice" heading — it is no
  longer a labelled sub-region, it is the card face.
- Render the chip row above the canvas; add per-chip completion ticks driven by
  `WritingPad`'s `onComplete`.
- Return `null` when no character in the literal has stroke data, so the caller
  can fall back.

### 5. `src/features/study/study-screen.tsx`

- Restructure the revealed branch (~lines 592-707): canvas first inside the
  card, then readings, meaning, Related disclosure, level line.
- Delete the standalone `StudyWritingPanel` render at lines 709-716 and the
  `answerShows('writing')` gate.
- Cross-fade the question glyph to the guide using `--duration-reveal`;
  collapse to instant under `prefers-reduced-motion` (already handled by the
  token).
- Collapse Related words behind a disclosure button; keep the existing
  per-word "Show reading and meaning" behaviour inside it.
- Widen the card on `sm` and up so the canvas is not stuck at 384px.

### 6. `src/features/navigation/app-navigation.tsx`

- Add a `Writing` nav link between Study and Browse.

### 7. Tests

- `study-screen.test.tsx`: update DOM-order and presence assertions; the writing
  canvas is now inside `study-answer`, always present for kanji cards with
  stroke data. Add a no-stroke-data fallback case and a Related-disclosure case.
- `app-navigation.test.tsx`: assert the Writing link.
- `study-style.test.ts`: assert `'writing'` is no longer a valid answer style
  and that a stored `kanji,reading,writing` value parses to `['kanji','reading']`.
- `study-writing-panel.test.tsx`, `writing-pad.test.tsx`: extend for the chip
  ticks and the `fill` variant.
- Run the e2e study spec; the reveal-then-grade flow must still pass.

### 8. Manual verification

Run the app and screenshot the revealed card at 375px and at desktop width.
The canvas must be the largest element and fully above the fold on a phone.
Do not rely on DOM-text checks alone — that was the previous session's mistake.

## Risks

- **Vertical budget on small phones.** A square canvas plus readings, meaning
  and grade buttons is tight at 375×667. If it does not fit, the fallback is
  the Option 2 treatment: sticky grade bar pinned to the viewport bottom.
- **Card metaphor.** The sticky-note border colour must stay visible around the
  canvas, or the level cue is lost on the answer side.
- **Always-on writing** means every kanji card now loads stroke data on reveal.
  Confirm `getKanjiStrokes` is cached well enough not to add a visible delay.
