# KanjiForge — SRS Specification

This document specifies the scheduling algorithm precisely enough to implement and unit-test without further design decisions. It is a faithful reconstruction of StickyStudy's model (levels + colors + configurable stage waits + recycling), tightened where the original is ambiguous.

---

## 1. Why this model instead of SM-2 / FSRS

Anki-style schedulers store a continuous ease factor and an interval in days. The user cannot see or reason about them. StickyStudy stores a small integer level rendered as a color, and the entire deck's state is legible as a wall of colored tiles. That legibility *is* the product.

The trade-off: level-based scheduling is less individually optimal than FSRS. We accept that for MVP because the motivational payoff of visible progress outweighs a few percent of scheduling efficiency, and because the review log we keep makes it possible to add an FSRS mode later without losing history.

---

## 2. State

### 2.1 Per-sticky state (`card_state`)

```ts
interface CardState {
  deckId: string;
  stickyId: string;
  level: 0 | 1 | 2 | 3 | 4;   // 0 = New/red, 4 = Mastered/green
  dueAt: number | null;        // epoch ms; null = never scheduled (brand new)
  lastReviewedAt: number | null;
  correctStreak: number;       // consecutive correct answers; resets on lapse
  totalReviews: number;
  totalCorrect: number;
  lapses: number;              // times demoted from level >= 1 back toward 0
  flagged: boolean;
  manualOverride: boolean;     // true if user set the level by hand
  updatedAt: number;
  updatedBy: string;           // device id, for sync merge
}
```

**Invariant:** `level` and `dueAt` are always derivable by replaying the review log for that (deckId, stickyId). Store them as a materialized projection for speed, but the log wins in any conflict.

### 2.2 Review log record (`review`)

Append-only. Never mutated. Never deleted (except by full account wipe).

```ts
interface Review {
  id: string;              // UUIDv7 — sortable by time, collision-free across devices
  deckId: string;
  stickyId: string;
  at: number;              // epoch ms
  grade: 'again' | 'good' | 'easy';   // I don't know / I know / No problem
  levelBefore: 0|1|2|3|4;
  levelAfter: 0|1|2|3|4;
  intervalBefore: number;  // days; 0 for new
  elapsedDays: number;     // actual days since last review (for retention analysis)
  responseMs: number;
  source: 'study' | 'manual' | 'import' | 'transfer';
  deviceId: string;
}
```

This log is what makes everything else work: statistics, undo, retention analysis, multi-device merge, and a future FSRS migration.

---

## 3. Configuration

All values are per-deck, defaulting from global settings.

```ts
interface SrsConfig {
  // Days to wait after reaching each level before the sticky is due again.
  // Index = the level the sticky just arrived at.
  stageDays: [number, number, number, number, number];
  // default: [0, 3, 9, 30, 90]
  //           L0 L1 L2 L3  L4(recycle)

  newPerSession: number;      // default 10, range 0–100 ("the red slider")
  maxNewInCirculation: number;// default 30 — hard cap on level-0 + level-1 cards
  passIsMinusOne: boolean;    // default false
  fuzzPercent: number;        // default 10
  learningStepMinutes: number[]; // default [1, 10] — in-session re-show lags
  relearnToLevel: 0 | 1;      // where a lapse lands when passIsMinusOne is false; default 0
}
```

### 3.1 The settings UI contract

The SRS settings screen shows one slider per stage. Below the sliders it shows the **derived total time to green**, computed as the sum of stages 1 through 3:

```
3 + 9 + 30 = 42 days to green
```

This mirrors StickyStudy and is the number users actually reason about. Also show the recycle interval separately: `Green stickies return after 90 days`.

Ship three presets plus Custom:

| Preset | stageDays | Time to green | For |
|---|---|---|---|
| Relaxed | `[0, 5, 14, 45, 120]` | 64 days | Long horizon, low daily load |
| Default | `[0, 3, 9, 30, 90]` | 42 days | General use |
| Intensive | `[0, 1, 3, 9, 30]` | 13 days | Exam in <3 months |

---

## 4. Grading

### 4.1 Level transitions

Let `L` be the current level, `C` the config.

**`good` — "I know"**
```
L' = min(L + 1, 4)
correctStreak += 1
```

**`easy` — "No problem"**
```
L' = 4
correctStreak += 1
```
`easy` is a deliberate escape hatch for cards the user already knows. It exists so a user importing a deck with 300 known kanji isn't forced to grind them four times each.

**`again` — "I don't know"**
```
if (C.passIsMinusOne || redCount(deck) < 10) {
  L' = max(L - 1, 0)
} else {
  L' = C.relearnToLevel   // default 0
}
if (L >= 1) lapses += 1
correctStreak = 0
```

> **The `redCount < 10` rule is required, not optional.** It reproduces StickyStudy's "this setting is ignored when there are fewer than 10 red stickies in the deck." Without it, a user 95% through a deck can be thrown back to red repeatedly at the exact moment they're most invested. `redCount(deck)` counts stickies at level 0.

### 4.2 Scheduling the next review

```ts
function nextDue(levelAfter: number, cfg: SrsConfig, now: number): number | null {
  const days = cfg.stageDays[levelAfter];
  if (days === 0) return null;         // stays in the in-session learning queue
  const fuzz = 1 + (Math.random() * 2 - 1) * (cfg.fuzzPercent / 100);
  return now + days * 86_400_000 * fuzz;
}
```

Fuzz is applied on write, not on read, so `dueAt` is stable and the forecast chart is accurate.

### 4.3 Manual override

When a user sets a level by hand:
- Write a `Review` with `source: 'manual'` and the appropriate `levelBefore`/`levelAfter`.
- Set `manualOverride = true`.
- Schedule `dueAt` normally from the new level.
- Do **not** touch `totalCorrect` / `totalReviews`.

---

## 5. Queue construction

This is where "intervals are a guideline, not a rule" gets implemented. The user must never be told "nothing to study."

### 5.1 Pools

Given a deck and `now`:

```
DUE      = states where level in 1..3 and dueAt <= now
RECYCLE  = states where level == 4 and dueAt <= now
NEW      = states where level == 0
AHEAD    = states where level in 1..3 and dueAt > now, sorted by dueAt ascending
```

### 5.2 Build order

```
1. Take all of DUE, sorted by (dueAt ascending, level ascending).
   Most overdue first; within the same day, lower levels first (they're
   the ones actually at risk).

2. Take all of RECYCLE, sorted by dueAt ascending.

3. Take from NEW, limited by:
     min( cfg.newPerSession,
          cfg.maxNewInCirculation - count(level 0 or 1 states) )
   Ordered by the deck's own order (deck order encodes pedagogy —
   school grade decks are in teaching order, frequency decks in
   frequency order). Never shuffle NEW.

4. If the resulting queue is shorter than the user's daily goal
   (or shorter than 10 cards when no goal is set), pull from AHEAD
   to fill. This is the "study anyway" path.

5. Interleave (see 5.3).
```

### 5.3 Interleaving rules

Applied after the queue is assembled:

- **No adjacent duplicates.** A sticky answered `again` re-enters the queue after `learningStepMinutes[0]` worth of cards (approximate as ~5 cards) rather than immediately, and again after `learningStepMinutes[1]` (~15 cards) if it fails a second time.
- **Avoid character priming.** Two stickies sharing a kanji character should not be adjacent. Best-effort: when the next card shares a character with the previous one, swap with the following card. Cap the number of swap attempts to keep this O(n).
- **Mix pools.** Don't front-load 30 new cards then 60 reviews. Distribute NEW evenly through the queue so the cognitive load is steady.
- **Deterministic seed.** Seed the shuffle from `(deckId, dayOfYear)` so resuming an interrupted session gives the same order.

### 5.4 Session termination

A session ends when any of these is true:
- The user taps Finish
- The daily goal (§6) is met **and** the DUE + RECYCLE pools are exhausted
- The queue is exhausted

When the goal is met but cards remain, show a "You've hit today's target — keep going?" prompt rather than stopping.

---

## 6. Goal scheduler math

### 6.1 Remaining work

Define, for a deck:

```
remainingSteps = Σ over all stickies of (4 - level)
```

This is the total number of correct answers still required to turn the whole deck green, ignoring lapses. It's the honest denominator.

```
daysLeft  = max(1, ceil((goalDate - now) / 1 day))
dailyBase = ceil(remainingSteps / daysLeft)
```

### 6.2 Accounting for lapses

`dailyBase` assumes perfect recall. Correct it with the user's observed accuracy over the trailing 14 days:

```
accuracy   = correctReviews14d / totalReviews14d   (default 0.85 if <20 reviews logged)
lapseLoad  = (1 - accuracy) * averageLevelLossPerLapse   // ~1.0 with passIsMinusOne, ~2.2 without
dailyTarget = ceil(dailyBase * (1 + lapseLoad))
```

Clamp `dailyTarget` to a floor of 5 and warn above 200.

### 6.3 What the UI shows

**Home screen:**
- `Days to goal: 84`
- `Remaining today: 47 correct answers` (decrements live during study)
- Status pill: `On pace` / `12 ahead` / `31 behind`

**On the study screen:** a thin progress bar filling toward `dailyTarget`.

### 6.4 Missed days

Do not carry a debt counter. Recompute `dailyTarget` from scratch every day at local midnight. A missed day silently raises tomorrow's number, which is both mathematically correct and psychologically kinder than a guilt counter.

If `dailyTarget` crosses the warning threshold, surface a one-time non-modal suggestion: *"At this pace you'd need 240 answers a day. Move the goal date, or reduce the deck?"* with both actions inline.

### 6.5 Projected completion

Independently of the goal, compute:

```
recentPace  = correct answers per day, trailing 14 days, excluding zero days
projectedDate = now + remainingSteps / recentPace days
```

Show this on the History screen against the goal date. When they diverge by more than 20%, say so plainly.

---

## 7. Progress percentage

Deck progress must match the color wall. Use level-weighted completion:

```
progress = Σ(level) / (4 * cardCount)
```

So a deck of 100 cards all at level 2 reads 50%. This matches user intuition ("half the wall is yellow-ish") better than counting only green cards.

Display alongside a stacked level-distribution bar showing exact counts per color. Never show only the percentage.

---

## 8. Statistics derived from the log

All computed by replaying or aggregating `reviews`. None require additional stored state.

| Statistic | Computation |
|---|---|
| Daily bar chart | `count(reviews) group by local calendar day` |
| Correct % per day | `count(grade != 'again') / count(*)` per day |
| Time studied | Σ `responseMs`, capped per-review at 60s to exclude idle |
| Level changes per day | `count(levelAfter > levelBefore)` vs `count(levelAfter < levelBefore)` |
| Retention by level | For each level L: of reviews where `levelBefore == L` and `elapsedDays >= stageDays[L] * 0.8`, the fraction graded `good`/`easy` |
| Forecast (next 30 days) | `count(states) group by day(dueAt)` |
| Leeches | Stickies with `lapses >= 6` — surface these for manual attention |

**Retention by level is the single most useful diagnostic.** If level-3 retention is below ~80%, the stage-3 interval is too long for this user and the settings screen should say so in plain language.

---

## 9. Multi-device merge (design constraint for MVP, implemented in v1.1)

Because the log is append-only with UUIDv7 ids:

```
mergedLog = union(logA, logB)            // dedupe by review.id
state     = replay(mergedLog)            // deterministic
```

Replay rules:
1. Sort merged log by `at`, tie-break by `id`.
2. For each (deckId, stickyId), apply transitions in order, ignoring each record's stored `levelBefore` (it may be stale from a concurrent device) and recomputing from the running state.
3. `manualOverride` records are treated as absolute assignments and win over concurrent grade records with an earlier `at`.

Deck metadata and settings are not logs; resolve them last-write-wins per field using `updatedAt`.

**Nothing about this requires a server.** The same replay function powers "import a backup from another device."

---

## 10. Test cases (write these first)

| # | Scenario | Expected |
|---|---|---|
| 1 | New card, four `good` answers | level 0→1→2→3→4, `dueAt` offsets ≈ 3, 9, 30, 90 days |
| 2 | Level 3 card graded `again`, 40 reds in deck, passIsMinusOne=false | level → 0, lapses +1 |
| 3 | Same, but 6 reds in deck | level → 2 (rule forced on) |
| 4 | Level 0 card graded `easy` | level → 4, one review logged, streak = 1 |
| 5 | Deck with 0 due cards, user taps Study | Queue is non-empty, filled from AHEAD |
| 6 | `newPerSession = 5`, 200 new cards | Exactly 5 level-0 cards in the queue |
| 7 | `maxNewInCirculation = 30`, already 28 cards at level 0–1 | At most 2 new introduced |
| 8 | Card graded `again` mid-session | Reappears ~5 cards later, not immediately |
| 9 | Two devices review the same card offline, then merge | Deterministic final state, both reviews present, no duplicates |
| 10 | Manual override to level 4, then merge with an older `again` from another device | Level stays 4 |
| 11 | Goal 30 days out, 500 remaining steps, accuracy 0.85 | `dailyTarget` ≈ 20 (17 base × 1.18) |
| 12 | Backup export → wipe → import | `replay(log)` produces identical state for all decks |
| 13 | Fuzz applied 1,000 times to a 30-day interval | All results within [27, 33] days |
| 14 | Progress % of a 100-card deck, all level 2 | Exactly 50% |
