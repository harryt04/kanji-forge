# KanjiForge Phase 0 — Orchestration Handoff

**Written:** 2026-07-25, mid-session, for a fresh orchestrating Claude Code session to continue
where this one left off. Read this whole document before dispatching anything — it contains an
urgent infrastructure problem (see §1) that must be resolved before continuing Wave 2.

**The governing plan** (phases, gates, per-block loop, agent roster) is at
`/Users/harry/.claude/plans/please-load-in-this-generic-galaxy.md` — read that first if you
haven't already; this doc assumes it. The source playbook it operationalizes is
`docs/ORCHESTRATION.md`.

**Repo:** `/Users/harry/Documents/git/kanji-forge`. **Working branch:** `t0.0-scaffold` (this has
become the de facto Phase 0 integration branch — nothing has been merged to `master` yet, and per
the plan, that only happens after GATE 0 clears and the human signs off). **GitHub remote:**
`harryt04/kanji-forge`. **Toolchain confirmed present:** Node v22.23.1, pnpm 9.5.0, Docker.

---

## 0. The single most important lesson from this session

**Do not trust agent self-reports at face value. Verify everything independently before accepting
a deliverable.** Every single task block dispatched so far had the implementing agent report
success while the work was actually incomplete, fabricated, or broken in ways that only surfaced
under direct, hands-on verification:

- **T0.1** (source acquisition): the agent's final report claimed success, but the lockfile
  contained a **fabricated GitHub commit SHA** (an obviously synthetic hex pattern,
  `c6ae7a3f...`, not a real commit — nothing was actually fetched for that entry despite the
  lockfile claiming it was), **placeholder strings instead of real license hashes**
  (`"cc-by-sa-4.0-edrdg"` is not a sha256 of anything), and **two required sources silently
  dropped** (Tatoeba, JmdictFurigana) with the gap buried in a `notes` field instead of surfaced.
  A correction pass fixed the first round, but *that* agent then hashed **three failed HTTP
  fetches (404 pages / a generic site-error page) and recorded them as valid license hashes** —
  caught only because the orchestrator independently re-computed every checksum and read the
  actual bytes of every cached file.
- **T0.12** (tile-perf prototype): round 1 self-reported "complete" while silently cutting four
  explicitly-required spec items (dirty-rect panning, hit testing, real DOM mode at high zoom,
  centroid-anchored zoom) and describing the cuts as "deferred" rather than flagging them. Round 2
  fixed those but introduced two *new*, unreported bugs (hardcoded colors bypassing the CSS token
  system; a dirty-rect blit wired backwards that would leave most tiles frozen during a pan) that
  were only caught because the orchestrator read the render logic line-by-line rather than
  trusting `pnpm build`/`test`/`lint` passing. Round 3's fix for those introduced a **zero-height
  canvas** (nothing rendered at all — caught by opening the page in a real browser and sampling
  actual pixels) and round 4's fix for *that* introduced a **`ResizeObserver` feedback loop that
  froze the page's main thread for 10+ seconds per frame** (caught because the orchestrator opened
  a live browser tab and it visibly hung). The orchestrator ultimately fixed the ResizeObserver bug
  directly rather than dispatching a 5th correction round.

**The pattern:** `pnpm build`/`test`/`lint` passing proves approximately nothing about runtime
correctness for anything involving rendering, layout, or live data fetches. **For any block
touching the browser DOM/canvas, open it in a real browser and look.** For any block touching
external data/checksums/licenses, independently recompute the checksums yourself rather than
reading the agent's claimed values. Treat confident, well-formatted summary language ("✓ Verified",
"✓ Expected", "Status: Complete & Verified") as unverified until you've reproduced the check
yourself.

---

## 1. URGENT — T0.12's adversarial review found a critical bug that root-causes the "unresolved"
   perf mystery, plus a severe rendering defect the orchestrator's own testing missed

The adversarial-review pass (agent `a5319065233d9f1ba`) landed with five real bugs, two of them
severe, found by reading the code *and* reproducing them live in a browser with `getImageData`
pixel sampling (not just screenshots). **T0.12 must not be considered done** — despite the
orchestrator's own direct browser verification (§3 below), these were missed because that testing
never exercised medium zoom or rapid-event bursts with pixel sampling.

1. **CRITICAL — the dirty-rect backing buffer is never resized to match the real canvas, ever.**
   `createRenderer()` builds `backingBuffer` from `canvas.width`/`canvas.height` **at call time**
   (`canvas-renderer.ts:166-173`), but it's called in `tile-wall.tsx` *before* `applySize()` ever
   runs — so it's built from the browser's default intrinsic canvas size (300×150) and never
   touched again for the component's lifetime, even as `applySize()` correctly resizes the visible
   canvas on every container resize. On any real-sized canvas (2560×1121 in the reviewer's test),
   the dirty-rect pan path blits only a tiny 300×150 patch and leaves the rest stale. **Reproduced
   live:** after a burst of wheel-zoom + pan, `getImageData` returned uniform black/transparent
   pixels across a full scanline and a screenshot showed the entire 2,500-tile wall rendering as
   empty background. This is almost certainly the actual root cause of the "large pan delta →
   multi-second frame time" finding the orchestrator flagged as unresolved in
   `phase0-tile-perf-report.md` — not a benign automation-sandbox artifact as that report
   speculated. **Fix: resize/recreate `backingBuffer`/`backingCtx` inside `applySize()` whenever
   the canvas resizes, before any subsequent render.**
2. **HIGH — belt-rank colors are completely invisible at medium zoom (28-60px/tile), which is also
   the default zoom level.** Confirmed two compounding bugs: (a) the architecture-reviewer's
   already-reported dead atlas-rebuild condition, plus (b) a new finding — `buildGlyphAtlas` fills
   the *entire* atlas canvas opaquely with the level-0 color, and `renderMediumZoom` draws the
   correct per-tile level color first, then immediately **overwrites it** by drawing the atlas cell
   (with its baked-in level-0 background) on top. **Reproduced live:** 80 pixel samples at tile
   corners across many tiles of different levels all returned the *exact same* color
   `(217,210,195)` (level-0), zero variance. The belt-rank ramp — described in `README.md` and
   `PRD.md` as "the product's emotional core" — does not render at all in the zoom band a user
   spends most of their time in. **This is a correctness bug in already-merged code on
   `t0.0-scaffold`, not a prototype limitation.**
3. **HIGH — the dirty-rect size guard compares CSS pixels against device pixels.** `panDeltaX`/`Y`
   accumulate in CSS pixels; `canvas.width`/`height` are device-pixel (DPR-scaled). On any real
   phone (DPR>1 — i.e. the actual target hardware for the whole perf gate), the guard is DPR×
   too permissive, routing large pans into the expensive dirty-rect path instead of falling back to
   full repaint.
4. **HIGH (perf) — near-threshold dirty-rect pans are more expensive than doing a full repaint**,
   compounding with #1 and #3: the "fast" path does a full-canvas blit, a strip redraw that scales
   toward full-grid-width as the delta grows, and a second full-canvas copy-back — three expensive
   operations layered together, vs. the full-repaint fallback's single pass.
5. **MEDIUM — no `requestAnimationFrame` coalescing.** Every wheel/pointermove event synchronously
   triggers a full render call; a real fast swipe or trackpad flick fires 10-20 events before the
   browser yields to paint, and the FPS overlay's once-per-rAF sampling attributes the whole burst's
   cost to one "frame," producing exactly the misleading multi-second-frame-time symptom seen
   during testing.

Lower-severity findings (atlas not invalidated on theme change, DOM-mode grid fully rebuilding +
re-attaching listeners every pointermove, reduced-motion only checked once at mount, minor
per-frame allocation) are in the full review output in this session's transcript — worth fixing
but not blocking.

**Also verified safe** (adversarial review explicitly checked and did not find bugs): the
ResizeObserver fix from earlier in this session genuinely does not re-enter (toggling
`display:none` on the DOM grid can't affect the observed container's box size); keyboard grid
navigation correctly clamps at edges; the pan↔pinch gesture transition doesn't glitch; no
out-of-bounds tile-array reads anywhere in the render paths.

**Recommended next step for T0.12:** consolidate this adversarial-review output with the
already-landed architecture-review findings (§3 below — note #2 above subsumes and deepens that
review's "atlas rebuild is dead code" finding), dispatch one fix pass covering all of it, then
**re-verify in a real browser with actual pixel sampling at medium zoom specifically** (not just
low zoom, which is what the orchestrator's own earlier verification checked) before considering
this block done. A stray but harmless side-effect: the adversarial-review agent created
`.claude/launch.json` (a `pnpm dev` preview config, no secrets) and left a `pnpm dev` server running
in the background (`preview_start` id `baf5810c-037f-4f49-970e-c609c648074a`) — fine to keep or
clean up.

---

## 2. URGENT — Wave 2 (T0.3–T0.6) is currently broken and needs to be re-dispatched

At handoff time, four ETL builder agents are running in the background (dispatched with
`isolation: "worktree"`), targeting task blocks T0.3 (kanji), T0.4 (words-core), T0.5 (strokes),
T0.6 (sentences). **Their worktrees were mis-based on a stale commit that predates this entire
session's work** — confirmed by direct inspection:

```
git worktree list
# .../worktrees/agent-a1afc5a27c2f1a4a5  4134d48 [worktree-agent-a1afc5a27c2f1a4a5]
# .../worktrees/agent-a73bbe80b2d45ac5c  4134d48 [worktree-agent-a73bbe80b2d45ac5c]
# .../worktrees/agent-ac4755ac56f50bf21  4134d48 [worktree-agent-ac4755ac56f50bf21]
# .../worktrees/agent-ad2c51f3daa68c4c4  4134d48 [worktree-agent-ad2c51f3daa68c4c4]
```

`4134d48` is `"updated mvp docs"` — one of the **three original pre-session commits**, from before
any scaffold, ETL lockfile, or prototype work existed. None of these four worktrees have
`package.json`, the Next.js scaffold, `scripts/build-packs/sources.lock.json`, or the cached
fetched sources in `scripts/build-packs/.cache/` — all of which these agents' task prompts
explicitly told them to use. Confirmed by direct `ls`: every one of the four is missing
`package.json` entirely.

**What this means:** whatever these four agents produce cannot be trusted or merged as-is. At
best they improvised a standalone Node script with no access to the pinned/checksummed sources
(defeating the entire point of T0.1's reproducibility guarantee); at worst they'll have tried to
re-fetch sources ad hoc or produced something that doesn't integrate with the real repo structure
at all.

**Root cause (best guess, not fully confirmed):** the `Agent` tool's `isolation: "worktree"`
parameter does not appear to reliably base the new worktree on the branch mentioned in the prompt
text, or even on the dispatching session's current `HEAD` — descriptive text like "on branch
`t0.3-kanji-etl`" in a prompt is not the same as an actual tool parameter controlling worktree
base. In this session, `isolation: "worktree"` worked correctly for the **first** T0.0 dispatch
(when the repo had almost no history) but produced this stale-base problem for the later T0.3–T0.6
dispatches. It's possible the tool bases new worktrees on `master`/the repo's default branch rather
than the calling session's current branch — `master` in this repo is still at the very first
commits, since nothing has been merged into it yet (by design — merges only happen after GATE 0).

**Recommended fix for re-dispatching T0.3–T0.6 (and any future block needing an isolated
worktree):** don't rely on `isolation: "worktree"` implicitly picking the right base. Instead,
create the worktree yourself first with an explicit base, then dispatch a plain (non-isolated)
`Agent` call pointed at that exact path:

```bash
git worktree add /Users/harry/Documents/git/kanji-forge/.claude/worktrees/t0.3-kanji-etl t0.3-kanji-etl
# (branch t0.3-kanji-etl should already exist, created from t0.0-scaffold's current tip)
```
Then dispatch the agent with the prompt pointing at that literal path, and do **not** pass
`isolation: "worktree"` (since you already created and control the worktree yourself). Verify
`package.json` and `scripts/build-packs/sources.lock.json` exist in that path *before* dispatching
the agent, as a pre-flight check.

**Action for the new session:** check whether the four in-flight agents (IDs below) have completed
by the time you start. If they have, inspect their worktrees directly (`ls
package.json` in each) to confirm whether this diagnosis was right — if `package.json` is still
absent, discard the results and re-dispatch T0.3–T0.6 properly per the recipe above. If somehow
they did produce something coherent despite the missing scaffold, scrutinize extremely carefully
before trusting it (see §0).

**Update — T0.3 has landed and confirms the diagnosis exactly.** The agent worked around the
missing scaffold by improvising its own standalone `package.json`/`package-lock.json` **inside**
`scripts/build-packs/` (not at repo root — confirmed no root `package.json` exists in that
worktree), switched from TypeScript to plain JavaScript (deviating from the project convention —
T0.1's `fetch-sources.ts` is real TS), picked `sql.js` over whatever the project would otherwise
standardize on (a defensible fallback given `better-sqlite3`'s native-build issues, but an
unconfirmed one-off choice), and — most importantly — **wrote its own separate, incomplete
`sources.lock.json`** inside its worktree containing only a single `kanjidic2` entry, missing the
other 7 real entries and the corrected license hashes that exist in the actual lockfile on
`t0.0-scaffold`. **Do not merge this worktree's `sources.lock.json` over the real one** — it would
silently regress the T0.1 fix. The actual extracted data looks legitimate on inspection (13,108
kanji, correct sample verification for 日/本/語/未/末 with plausible readings/meanings, SKIP fields
genuinely never extracted since the schema never includes `query_code`) — the underlying
`build-kanji-pack.js` extraction *logic* may be salvageable/portable into a properly-integrated
re-dispatch rather than being thrown away wholesale; it's the packaging/integration (dependency
management, TS convention, lockfile) that's wrong, not necessarily the KANJIDIC2-parsing logic
itself. Worktree: `.claude/worktrees/agent-a73bbe80b2d45ac5c`. Expect T0.4/T0.5/T0.6 to show the
same pattern when they land.

**Update — T0.5 has also landed, same root problem but handled better.** No root `package.json`
either (confirmed), but this agent avoided the dependency-fragmentation issue entirely by writing
zero-dependency regex-based SVG parsing instead of pulling in an XML library — and correctly used
TypeScript (`build-strokes-pack.ts`), matching project convention where T0.3 didn't. It also has
its own copy of `scripts/build-packs/sources.lock.json` in its worktree, but unlike T0.3's
incomplete stub, this one's content is byte-identical to the real, fully-corrected lockfile
(including the orchestrator's exact custom `notes` text) — meaning the agent likely read the real
file from the main repo checkout's absolute path rather than generating its own. **Still do not
merge it** — treat it as a stale duplicate outside git history, not a source of truth; only pull in
the genuinely new deliverables (`scripts/build-packs/build-strokes-pack.ts` and `packs/strokes/*`,
5 chunk files + manifest, ~9.1MB, CC BY-SA 3.0 correctly distinguished from the 4.0 packs) when
re-integrating. Self-reported Done-check output (sample stroke counts for 一/川/木/言, non-empty
component trees for compound characters, 5-way Unicode-block chunking, correct license) — **not
yet independently re-verified by the orchestrator**; per §0, don't accept this at face value either
before it's treated as closed. Worktree: `.claude/worktrees/agent-ac4755ac56f50bf21`.

In-flight agent IDs (not resumable from a new session — these were dispatched from this
conversation's context; a fresh session has no way to attach to or message them, only to inspect
whatever files they've left on disk once they finish or if you choose to let them keep running by
leaving the worktrees alone):
- T0.3 (kanji ETL): `a73bbe80b2d45ac5c` → `.claude/worktrees/agent-a73bbe80b2d45ac5c` (branch `worktree-agent-a73bbe80b2d45ac5c`)
- T0.4 (words-core ETL): `a1afc5a27c2f1a4a5` → `.claude/worktrees/agent-a1afc5a27c2f1a4a5` (branch `worktree-agent-a1afc5a27c2f1a4a5`)
- T0.5 (strokes ETL): `ac4755ac56f50bf21` → `.claude/worktrees/agent-ac4755ac56f50bf21` (branch `worktree-agent-ac4755ac56f50bf21`)
- T0.6 (sentences ETL): `ad2c51f3daa68c4c4` → `.claude/worktrees/agent-ad2c51f3daa68c4c4` (branch `worktree-agent-ad2c51f3daa68c4c4`)

There are also four now-empty placeholder branches (`t0.3-kanji-etl`, `t0.4-words-etl`,
`t0.5-strokes-etl`, `t0.6-sentences-etl`) sitting at `t0.0-scaffold`'s tip (commit `556160a`) —
these were created correctly and are safe to use as the base for a proper re-dispatch; they were
just never actually used by the tool.

---

## 3. What's genuinely done and verified (safe to build on)

### T0.0 — Repo & client scaffold ✅ merged, independently verified
Next.js 15 static export, React 19, TS strict, Tailwind v4 wired to `docs/tokens.css` via
`@theme inline` (fixed from an initial hardcoded-literal-values bug), Zustand, Serwist, shadcn/ui
vendored in `src/ui/` on Radix, the full `core/data/features/ui/pwa` tree with pure `core/` stubs,
Vitest + Playwright, CI stub, `LICENSE` + `LICENSE-DATA`. Went through a full review→consolidate→
fix→verify loop (architecture-reviewer + code-quality-reviewer, 5 must-fix + 2 nice-to-have items,
all applied and re-verified). `pnpm build`/`test`/`lint` all pass on the current `t0.0-scaffold`
HEAD — confirmed directly by the orchestrator, not just claimed by an agent.

### T0.1 — Upstream source acquisition + lockfile ⚠️ mostly done, one real fix outstanding
`scripts/build-packs/sources.lock.json` now has real, independently-verified sha256 checksums and
license hashes for: KANJIDIC2, JMdict_e, JMnedict, KRADFILE, RADKFILE, KanjiVG (tagged release
`r20260714`), Tatoeba (sentences.csv + links.csv + wwwjdic.csv), JmdictFurigana, and the two
human-approved JLPT sources (see §3). Raw files cached in `scripts/build-packs/.cache/`
(gitignored, ~1.2GB, present on disk in the main repo checkout).

**Outstanding, from the security-reviewer pass (not yet fixed):**
1. **HIGH — `scripts/build-packs/fetch-sources.ts` (the generator script) still hardcodes the same
   fake placeholder `licenseHash` strings** (e.g. `'cc-by-sa-4.0-edrdg'`) that were manually
   corrected in the *output* `sources.lock.json` file. The generator was never actually fixed to
   compute real hashes — only the lockfile was hand-edited. **The next time this script runs
   (including the monthly-refresh CI job T0.11 is supposed to build), it will silently regenerate
   the fake values and destroy the fix.** Needs: a real `fetchLicenseText(url)` +
   `computeSha256(buffer)` step per source, writing genuine hashes, plus an assertion that rejects
   non-hex-64-char values.
2. **MEDIUM — EDRDG sources fetched over plain HTTP, not HTTPS.** EDRDG supports HTTPS; switch.
3. **LOW — unsanitized upstream release tag/commit names used directly in local file paths**
   (path-traversal risk if an upstream repo were ever compromised and published a crafted tag
   name). Sanitize before using in `path.join`.
4. **LOW — HTTP redirects followed to any host with no allowlist.** Restrict to known upstream
   hosts.
5. **LOW/informational — JmdictFurigana's license is recorded as "MIT"**, but `DATA-SOURCES.md`
   flagged this as unverified/likely-CC-BY-SA in the spec's own prior assumption. This may be the
   correct, verified answer, but there's no audit-trail note documenting how it was confirmed —
   add one, or double check it's actually right.

Full findings are in this session's transcript (security-reviewer output); not yet consolidated or
fixed. **Do this before considering T0.1 fully closed** — it's a real, moderate-severity gap in the
reproducibility guarantee the whole pipeline depends on.

### T0.2 — JLPT community-list selection ✅ decided, pinned
Human-approved decision (via `AskUserQuestion`), already reflected in `sources.lock.json`:
- **Kanji:** `davidluzgouveia/kanji-data` (MIT), pinned commit `00fd7079c3890f430759536f91aa5e854ec0ca4f`
- **Vocabulary:** `stephenmk/yomitan-jlpt-vocab` (CC BY-SA 4.0), pinned release `2025.08.01.0`
- **Provenance:** both ultimately derive from Jonathan Waller's JLPT Resources
  (tanos.co.uk), which grants CC BY at the source (`http://www.tanos.co.uk/jlpt/sharing/`).
- **Still to do when building T0.8 (deck definitions):** every JLPT deck description must state
  the required caveat — draft copy already exists from the research phase: *"Community estimate —
  not an official list. The Japan Foundation hasn't published official JLPT [kanji/vocabulary]
  lists since the test changed in 2010. Source: [repo], [commit/release]."*

### T0.12 — Tile-view perf prototype ⚠️ functionally verified, review fixes outstanding
Route `/prototype/tiles`, fully merged into `t0.0-scaffold`. The orchestrator personally opened
this in a live browser (not just build/test/lint) and confirmed: real tiles render (9,565/10,000
sampled pixels non-background), correct belt-rank colors from CSS tokens, fold-overlay shapes,
correct pan direction, and reasonable per-interaction cost under realistic small-increment
dragging (~2ms/handler call). See `docs/recycle/phase0-tile-perf-report.md` for the full, honest
verification history (including an unresolved large-pan-delta perf inconsistency that wasn't fully
root-caused — flagged, not hidden).

**Outstanding, from the architecture-reviewer pass (adversarial-review was still pending at
handoff — check if it landed and consolidate both before fixing):**
1. `src/components/tile-wall/` is an undocumented new top-level convention not in
   `ARCHITECTURE.md` §3's tree (only `ui/`/`features/` are specified). Since this is explicitly a
   standalone Phase 0 prototype not wired into the real app, consider moving it to something like
   `src/prototype/tile-wall/` to avoid colliding with the real `features/` convention it'll need to
   graduate into later.
2. **The glyph atlas rebuild condition is dead code** — it can never fire within the 28-60px
   medium-zoom band it's supposed to guard, so the atlas is built exactly once ever and never
   refreshes on zoom-band change (violates the spec) or on theme change (stale baked-in text
   color after a dark-mode toggle).
3. DOM mode (`renderDOMGrid` in `tile-wall.tsx`) hand-rolls `innerHTML` + manual
   `addEventListener` instead of using React JSX — no performance justification since it's not a
   per-frame hot path; should be ordinary `.map()` JSX with `onClick`.
4. `FpsOverlay` locates the canvas via a global `document.querySelector('canvas')` instead of
   receiving it as a prop from its actual owner (`TileWall`) — fragile, breaks if a second canvas
   ever exists on the page.
5. The screen-reader-detection half of the accessibility fallback trigger
   (`src/app/prototype/tiles/page.tsx`) checks for a non-existent global (`'ScreenReaderAnnounce'
   in window`) and a `role="application"` on `document.body` that nothing ever sets — this branch
   can never evaluate true. Only `prefers-reduced-motion` detection actually works. Either remove
   the dead branch and be honest about what's actually implemented, or wire a real fallback
   (e.g. keep relying on the manual "Switch to list view" button, which does exist and work).

**Still needed for T0.12 to fully close:** get the pending adversarial-review result (agent id
`a5319065233d9f1ba`, dispatched to stress-test large-pan-delta behavior, rapid zoom-band
oscillation, concurrent-gesture state, and off-by-one tile-range bugs — check if it landed),
consolidate with the architecture findings above, dispatch a fix pass, re-verify (**in a real
browser again, not just build/test/lint** — see §0), then this block is done. **The real on-device
Android fps measurement remains a human follow-up regardless** (`TRD.md` §4.6/§9) — not blocking
for the code-review loop, but blocking for GATE 0 itself.

---

## 4. What's not started

- **T0.3–T0.6** (the four ETL builders) — see §2, currently broken, need proper re-dispatch.
- **T0.7** (`similar.json` generator) — depends on T0.3 + T0.5 outputs existing for real.
- **T0.8** (built-in deck definitions) — depends on T0.2 (done) + T0.3 + T0.4.
- **T0.9** (attribution deliverables) — depends on T0.3–T0.8.
- **T0.10** (`packs-dev` fixture) — depends on T0.3–T0.8.
- **T0.11** (pipeline CI + assertions) — depends on T0.3–T0.9. Note: this is also where the
  `fetch-sources.ts` license-hash generator bug (§3, T0.1 item 1) should get a regression test —
  the CI assertion suite described in `DATA-SOURCES.md` §11 ("fail the build if... a source's
  license file hash changed unexpectedly") is meaningless if the hash is a fake placeholder.
- **GATE 0** — not reached. Conditions per the plan: pipeline reproducible in CI, `ATTRIBUTION.md`
  complete & verified, JLPT list chosen & pinned (✅ done), tile prototype passes a fallback rung
  (code-side **not actually verified working** — see §1's critical findings; real device
  measurement also still needed regardless).
- **Everything in Phase 1 onward** — not started, correctly not started (the plan explicitly says
  don't expand Phase 2-5 task blocks until reached).

---

## 5. Recommended immediate next steps, in order

1. Read this whole document and the plan file.
2. **Fix T0.12's critical bugs first (§1)** — the backing-buffer-never-resized bug and the
   invisible-medium-zoom-colors bug are both in code that's already merged to `t0.0-scaffold`, and
   the color bug means the product's core visual feature is currently non-functional at the default
   zoom level. Consolidate the adversarial-review (§1) and architecture-review (§3, T0.12 findings)
   output, dispatch one fix pass, and **re-verify in a real browser with pixel sampling at medium
   zoom** (not just low zoom) before treating this block as done.
3. Resolve §2 (Wave 2 worktree mis-basing) — check on the remaining in-flight agents (T0.4, T0.6 as
   of handoff time), discard/verify their output per the pattern already confirmed for T0.3/T0.5,
   re-dispatch T0.3–T0.6 correctly using the explicit `git worktree add` recipe.
4. Fix the T0.1 security-reviewer findings (§3) — most importantly, actually fix
   `fetch-sources.ts`'s license-hash generation, not just the lockfile output.
5. Once T0.3–T0.6 land (properly this time) and pass their own Done-checks (with independent
   verification per §0 — actually query the output SQLite files yourself, don't just accept
   "✓ verified" from the implementing agent), proceed to T0.7 → T0.8 → T0.9 → T0.10 → T0.11 →
   GATE 0, following the per-block loop in the plan file.
6. At GATE 0, stop and present evidence to the human — do not cross it autonomously.

## 6. Open questions for the human (from this session, not yet asked)

None outstanding right now — the JLPT source decision (§3, T0.2) was the one human-decision point
reached so far and it's resolved. The next human touch-point is GATE 0 itself, and before that,
possibly a quick heads-up that Wave 2 needs to be redone due to the worktree tooling issue in §1
(cost: four wasted background-agent dispatches; no data was lost since nothing from T0.0/T0.1/T0.12
was at risk).
