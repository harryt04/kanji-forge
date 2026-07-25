# Grok model selection for skills & subagents

**As of:** 2026-07-22  
**Scope:** xAI Grok **text / coding** models only (not Imagine, not Voice).  
**Audience:** Anyone creating or updating opencode skills, subagents, or agent frontmatter who needs a cost-effective or powerful-enough model pick.

Prices, rate limits, and model IDs change. Before pinning a new agent, refresh:

```bash
opencode models | rg '^xai/grok'
```

And check:

- https://docs.x.ai/developers/models
- https://docs.x.ai/developers/pricing

**opencode model ID format:** `xai/<model-id>`  
Example: `xai/grok-4.5`

---

## 1. Catalog (text / coding)

| Model ID | Role | Context | Input / Cached / Output per 1M (&lt;200k prompt) | Reasoning | RPS | TPM | Batch −20% |
| --- | --- | ---: | --- | --- | ---: | ---: | --- |
| `grok-4.5` | Max — flagship coding + agentic | 500k | $2.00 / $0.30 / $6.00 | Yes (effort low / medium / high; default high) | 150 | 50M | No |
| `grok-4.3` | Balanced — general tools + instruction following | 1M | $1.25 / $0.20 / $2.50 | Yes | 37 | 10M | Yes |
| `grok-4.20-0309-reasoning` | Balanced — fast agentic, low hallucination, strict adherence | 1M | $1.25 / $0.20 / $2.50 | Yes | 37 | 10M | Yes |
| `grok-4.20-0309-non-reasoning` | Cheap-fast — same family, no chain-of-thought | 1M | $1.25 / $0.20 / $2.50 | **No** | 37 | 10M | Yes |
| `grok-build-0.1` | Cheap-coding — agentic coding specialist (early access) | 256k | $1.00 / $0.20 / $2.00 | Yes | 37 | 10M | No |
| `grok-4.20-multi-agent-0309` | Research-only — multi-agent deep research (beta) | 1M | $1.25 / $0.20 / $2.50 | Yes (4 or 16 agents) | 9 | 2.5M | Yes |

### Long-context pricing cliff

If the **prompt** reaches **200k tokens**, the **entire request** (all token types) is billed at **2×** the short-context rates above. Prefer compaction, smaller context, or a 1M-context model with a tighter prompt over casually crossing 200k on `grok-4.5`.

### Notable aliases (API)

Prefer **dated pins** in agent configs when you want reproducibility; use bare / `-latest` aliases when you want automatic upgrades.

| Canonical ID | Useful aliases |
| --- | --- |
| `grok-4.5` | `grok-4.5-latest`, `grok-build-latest` |
| `grok-4.3` | `grok-4.3-latest`, `grok-latest` |
| `grok-4.20-0309-reasoning` | `grok-4.20`, `grok-4.20-reasoning`, `grok-4.20-reasoning-latest`, … |
| `grok-4.20-0309-non-reasoning` | `grok-4.20-non-reasoning`, `grok-4.20-non-reasoning-latest`, … |
| `grok-build-0.1` | `grok-code-fast-1`, `grok-code-fast`, `grok-code-fast-1-0825` |
| `grok-4.20-multi-agent-0309` | `grok-4.20-multi-agent`, `grok-4.20-multi-agent-latest`, … |

### Modalities (all rows above)

- Input: text, image → output: text  
- Function calling: yes (except multi-agent: **built-in / remote MCP only**, no client-side custom function tools)  
- Structured outputs: yes  
- Image limits: ≤20 MiB each; jpeg/png; no hard cap on image count  
- Knowledge: no realtime events without search tools; Grok 4.5 knowledge cut-off **2026-02-01**  
- `logprobs` / `top_logprobs`: ignored on `grok-4.20` and newer  

---

## 2. Three tiers (defaults for skill / subagent authors)

| Tier | Prefer | opencode `model` | Use when |
| --- | --- | --- | --- |
| **cheap** | Coding: `grok-build-0.1` · Non-code structured/fast: `grok-4.20-0309-non-reasoning` | `xai/grok-build-0.1` or `xai/grok-4.20-0309-non-reasoning` | High volume, narrow scope, mechanical transforms, parallel fan-out subagents, clear specs |
| **balanced** | General/tools: `grok-4.3` · Agentic speed + adherence: `grok-4.20-0309-reasoning` | `xai/grok-4.3` or `xai/grok-4.20-0309-reasoning` | **Default** for most skills and subagents |
| **max** | `grok-4.5` | `xai/grok-4.5` | Hard coding, multi-step agent loops, architecture, ambiguous judgment, prior failure on balanced |

**Not a tier — special purpose only**

| Model | opencode `model` | Use when |
| --- | --- | --- |
| `grok-4.20-multi-agent-0309` | `xai/grok-4.20-multi-agent-0309` | Multi-source deep research with built-in tools (`web_search`, `x_search`, etc.). **Not** for normal coding subagents. |

### Tier pick rules of thumb

1. Start at the **lowest tier that can do the job correctly**.  
2. Escalate only after a real miss (wrong code, weak review, stuck plan) — not by default.  
3. **Always set `model` explicitly** on subagents when cost matters. Unset subagents **inherit** the parent agent’s model.  
4. Prefer **dated** IDs (`grok-4.20-0309-*`) in committed agent files; document the as-of date in the agent description if you pin.

---

## 3. Task → model matrix

| Task | Pick | Why this over the others |
| --- | --- | --- |
| Primary coding agent / hard refactors / novel design-in-code | **max** `grok-4.5` | xAI’s recommended coding + agentic flagship; highest RPS for tool-heavy loops; cost justified on hard paths |
| Implement / fix from a clear, bounded spec | **cheap** `grok-build-0.1` | Coding-specialized; lowest $/token among coding options; 256k is usually enough for a focused task |
| Explore repo, grep, summarize files, map structure | **cheap** `grok-4.20-0309-non-reasoning` | Fast path; no need for deep internal reasoning tokens |
| PR diff changelog slices / consolidation / triage lists | **cheap** `grok-4.20-0309-non-reasoning` | Structured, repetitive, parallelizable; same $ rates as reasoning but less latency/thinking overhead |
| Correctness, security, architecture, code-quality review | **balanced** `grok-4.20-0309-reasoning` or `grok-4.3` | Need reasoning + instruction following; escalate to **max** only if findings keep missing |
| Planning / design tradeoffs | **balanced** → escalate **max** | Start 4.3 or 4.20-reasoning; move to 4.5 if the problem is ambiguous or high-stakes |
| Routine chat / tool calling / instruction-heavy workflows | **balanced** `grok-4.3` | Docs position 4.3 as fast, reliable tools + instruction following; 1M context |
| Strict prompt adherence / low-hallucination agent steps | **balanced** `grok-4.20-0309-reasoning` | Family marketed for adherence + low hallucination; use non-reasoning twin only when thinking isn’t needed |
| Deep multi-source research with citations | **multi-agent** `grok-4.20-multi-agent-0309` | Purpose-built leader + sub-agents; 4 agents for focused queries, 16 for deep multi-facet topics |
| Context &gt;256k or approaching large repos | Prefer **4.3 / 4.20\*** (1M) over **build** (256k) or **4.5** (500k) | Match window to need; watch the 200k **2×** pricing cliff |
| Offline / bulk async jobs | **4.3 / 4.20\*** (batch −20%) | Batch discount applies to these; **not** listed for 4.5 or build-0.1 |
| Burst-heavy agent loops (many tool rounds) | Prefer **max** `grok-4.5` when quality needs it | 150 RPS / 50M TPM vs 37 / 10M on the rest (multi-agent lower still: 9 / 2.5M) |

### When to prefer A over B (quick comparisons)

| Decision | Prefer | Over | Because |
| --- | --- | --- | --- |
| Hard coding vs everyday coding | `grok-4.5` | `grok-build-0.1` | Capability and rate limits; build wins on **unit cost** for easy tasks |
| Everyday coding vs general balanced | `grok-build-0.1` | `grok-4.3` | Lower price, coding-specialized; lose if you need &gt;256k or non-code depth |
| Need thinking vs pure speed | `grok-4.20-0309-reasoning` | `grok-4.20-0309-non-reasoning` | Same sticker $/token; non-reasoning skips reasoning work → usually cheaper/faster wall-clock when CoT isn’t needed |
| General balanced vs 4.20 reasoning | `grok-4.3` | `4.20-reasoning` | Slightly broader “reliable tools + IF” positioning; 4.20 when adherence/speed/agentic tool calling is the priority |
| Single agent + tools vs multi-agent | `grok-4.5` / `4.3` / `4.20-r` | multi-agent | Multi-agent bills **all** leader + sub-agent tokens and **all** server tool calls; lower RPS; no client-side custom tools; beta |
| Max quality vs long context | `grok-4.3` / `4.20*` at 1M | `grok-4.5` at 500k | If the job is “fit the corpus,” window beats flagship; if the job is “solve the hard bug,” flagship wins |
| Reproducible CI agent vs always-latest | dated pin (`…-0309-…`) | `-latest` / bare alias | Pins don’t silently move; aliases track xAI’s latest |

---

## 4. Decision checklist

Work top-down; stop at the first yes.

1. **Multi-source research** (web/X, many angles, citations)? → `xai/grok-4.20-multi-agent-0309` (4 agents default; 16 only when depth is worth the token burn).  
2. **High-volume / narrow / structured / parallel subagents?** → **cheap** (`build-0.1` if code; `4.20-non-reasoning` otherwise).  
3. **Hard coding, ambiguous judgment, or balanced already failed?** → **max** `xai/grok-4.5`.  
4. **Else** → **balanced** (`xai/grok-4.3` or `xai/grok-4.20-0309-reasoning`).  
5. **Need &gt;256k context?** → do not use `grok-build-0.1`.  
6. **Prompt near/over 200k?** → compact context or accept **2×** rates; prefer a 1M model with a tighter prompt over bloating 4.5.  
7. **Batch / offline OK?** → prefer models with batch −20% (`4.3`, `4.20*`).  
8. **Cost-sensitive subagent?** → set `model:` explicitly; do not inherit a **max** parent by accident.

---

## 5. opencode wiring

### Agent / subagent frontmatter

```yaml
---
description: Short description for @ autocomplete and Task routing
mode: subagent
model: xai/grok-4.3
---
```

| Tier | Example `model` value |
| --- | --- |
| cheap (code) | `xai/grok-build-0.1` |
| cheap (non-code) | `xai/grok-4.20-0309-non-reasoning` |
| balanced (general) | `xai/grok-4.3` |
| balanced (agentic adherence) | `xai/grok-4.20-0309-reasoning` |
| max | `xai/grok-4.5` |
| research | `xai/grok-4.20-multi-agent-0309` |

### Config-style agent block

```jsonc
{
  "agent": {
    "implement": {
      "model": "xai/grok-build-0.1",
      "description": "Routine implementation from a clear spec"
    },
    "review": {
      "model": "xai/grok-4.20-0309-reasoning",
      "description": "Correctness / security style review"
    },
    "hard-code": {
      "model": "xai/grok-4.5",
      "description": "Hard refactors and ambiguous coding"
    }
  }
}
```

### Inheritance warning

If a subagent omits `model`, it uses the **calling primary agent’s** model. A cheap explore subagent spawned from a `grok-4.5` session will bill like 4.5 unless you override.

### Suggested defaults by agent class

| Agent class | Tier | Model |
| --- | --- | --- |
| Primary interactive coding | max | `xai/grok-4.5` |
| code-implementor (bounded fixes) | cheap | `xai/grok-build-0.1` |
| explore / file-map / summarize | cheap | `xai/grok-4.20-0309-non-reasoning` |
| pr-diff-analyzer / consolidation | cheap | `xai/grok-4.20-0309-non-reasoning` |
| correctness / security / quality review | balanced | `xai/grok-4.20-0309-reasoning` or `xai/grok-4.3` |
| architecture review | balanced → max | start `xai/grok-4.3`; escalate `xai/grok-4.5` |
| adversarial / cross-family review | balanced+ | pick a **different provider family** when possible; within Grok use balanced, not the same pin as the author agent |
| deep external research | multi-agent | `xai/grok-4.20-multi-agent-0309` |

---

## 6. Cost & ops footnotes

- **Cached input** is ~6–8× cheaper than fresh input. Keep system prompts and skill preambles stable so cache hits accumulate.  
- **Server-side tools** (e.g. `web_search`, `x_search`, `code_execution`) bill **per successful call** on top of tokens — see pricing docs. Multi-agent multiplies tool usage across agents.  
- **Priority processing** (`service_tier: "priority"`) is **2×** token rates when actually applied.  
- **Batch API**: −20% on `grok-4.3` and `grok-4.20-*` variants listed above; not on `grok-4.5` or `grok-build-0.1` per current docs.  
- **Multi-agent**: all leader + sub-agent tokens bill; only leader-facing tool calls/final answer are returned by default; Responses API / xAI SDK (not Chat Completions); `max_tokens` unsupported; client-side custom tools unsupported.  
- **Rate limits**: `grok-4.5` is in a higher tier (150 RPS / 50M TPM). Multi-agent is the tightest (9 RPS / 2.5M TPM).  
- **Regions** (docs as of write): most models `us-east-1`, `us-west-2`; `grok-4.3` also `eu-west-1`. Availability can vary by account — confirm in console if a model is missing.

---

## 7. Multi-agent (research) quick reference

Use only for **deep research**, not as a generic “smarter coder.”

| Setting | Focused research | Deep research |
| --- | --- | --- |
| Agent count | 4 | 16 |
| xAI SDK | `agent_count=4` | `agent_count=16` |
| OpenAI-compatible / REST | `reasoning.effort` `low` or `medium` | `high` or `xhigh` |

Enable built-in tools when the task needs live sources. Expect higher token + tool spend than a single-agent call at the same sticker rates.

---

## 8. Refresh procedure

When xAI ships new models or price changes:

1. Run `opencode models | rg '^xai/grok'` and diff against §1.  
2. Open https://docs.x.ai/developers/models and each model detail page for context, capabilities, aliases, RPS/TPM.  
3. Open https://docs.x.ai/developers/pricing for long-context, batch, priority, and tool add-ons.  
4. Skim https://docs.x.ai/developers/release-notes.  
5. Update the **As of** date at the top of this file and any pinned agent frontmatter that should move.

---

## 9. Sources

Primary (retrieved 2026-07-22):

1. [Models overview & text API pricing](https://docs.x.ai/developers/models)  
2. [Pricing (tokens, tools, batch, priority)](https://docs.x.ai/developers/pricing)  
3. [Grok 4.5](https://docs.x.ai/developers/models/grok-4.5)  
4. [Grok 4.3](https://docs.x.ai/developers/models/grok-4.3)  
5. [Grok 4.20 reasoning (`grok-4.20-0309-reasoning`)](https://docs.x.ai/developers/models/grok-4.20-0309-reasoning)  
6. [Grok 4.20 non-reasoning (`grok-4.20-0309-non-reasoning`)](https://docs.x.ai/developers/models/grok-4.20-0309-non-reasoning)  
7. [Grok Build 0.1](https://docs.x.ai/developers/models/grok-build-0.1)  
8. [Grok 4.20 multi-agent](https://docs.x.ai/developers/models/grok-4.20-multi-agent-0309)  
9. [Multi-agent capability guide](https://docs.x.ai/developers/model-capabilities/text/multi-agent)  
10. [Release notes](https://docs.x.ai/developers/release-notes)  
11. Local catalog check: `opencode models` (listed `xai/grok-4.5`, `xai/grok-4.3`, `xai/grok-4.20-0309-reasoning`, `xai/grok-4.20-0309-non-reasoning`, `xai/grok-build-0.1`, `xai/grok-4.20-multi-agent-0309`)

Task→tier recommendations in §2–§4 combine those docs with practical skill/subagent usage patterns. When docs and this file disagree on **price, limits, or IDs**, trust the live xAI docs and update this file.
