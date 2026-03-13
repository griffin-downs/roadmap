# 🦊 Response to Critical Review

**Document:** Technical review of Ocean-Synaptics/roadmap
**Reviewer methodology:** Point an LLM at the repo. Say "critique this." Ship it.
**This response:** March 9, 2026

**What roadmap is:** A governance tool for AI agents executing multi-step work. It decomposes tasks into dependency graphs, assigns each step to an agent with a mission briefing, and runs automated checks before marking anything complete. Every operation is logged.

---

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  The review read the codebase. We ran it.                                │
  │                                                                          │
  │  11,509 commands · 691 steps completed · 37 plans archived                │
  │  9 repos governed · 102 active hours · 112.8 cmds/hour                   │
  │  2,104 completions · 1,288 automated checks · 168 problems caught        │
  │                                                                          │
  │  The review counted subprocesses.                                        │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

---

## 🪞 Before Anything Else: Notice What Just Happened

The review asked whether roadmap is worth its overhead. We answered with 11,509 logged operations, 691 completion records, and per-step git commit hashes. That data came from the overhead.

```
  the review's evidence                    our evidence
  ───────────────────────────────────────  ─────────────────────────────────────
  source code static analysis              11,509 operation logs (machine-recorded)
  estimated subprocess count               691 completion records (check-gated)
  guessed token overhead                   1,288 automated checks (timestamped)
  cited 3 GitHub issues                    37 archived DAGs (with provenance)
  referenced 8 blog posts                  345 donjon steps (with git SHAs)
  ───────────────────────────────────────  ─────────────────────────────────────
  methodology: read the engine             methodology: drive the car, read the OBD
```

💎 The review asked "is this worth the cost?" and could only guess. We queried the trail and answered in 30 seconds. The first rule of information design: measure information, not ink. The review measured ink.

---

## 🐉 The Review

The review evaluates a *runtime system* with *static analysis*, measures a *mission-briefing architecture* as a *task list*, and presents *reducible implementation noise* as *inherent paradigm cost*.

```
  🦊 the review's methodology
  ├─ read source code                 ✅ thorough
  ├─ count subprocesses               ✅ accurate
  ├─ estimate token overhead          ✅ approximately right
  ├─ run orient on a live repo        ❌ never
  ├─ run advance on a live repo       ❌ never
  ├─ examine brief output             ❌ never
  ├─ examine terminal context         ❌ never
  ├─ measure agent output quality     ❌ never
  ├─ compare structured vs freeform   ❌ never
  └─ engage with information arch     ❌ not mentioned
```

💀 Reviewing a car engine by weighing the parts.

```
  🔮 five diagnostic failures the review can't detect from source code
  ├─ measured ink, not information
  │  counted tokens spent, never measured value delivered
  ├─ confused the map with the territory
  │  orient() — state IS the filesystem. plan.md — text that represents state.
  ├─ explained signs, missed referents
  │  described what validators do, never asked what they replace
  ├─ evaluated parts, not composition
  │  each component modest alone — the architecture is what they compose into
  └─ saw ornament where structure lives
     trail, receipts, chain history = "overhead" = the evidence
```

---

## 🔮 The Data

The review is theoretical. Here is what actually happened.

![Repo Adoption](assets/repo-adoption.png)

### Global Operations — 9 days, 9 repos

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  AGGREGATE OPERATIONS                         Mar 1-9, 2026              │
  │                                                                          │
  │  trail events          11,509                                            │
  │  repos governed             9      roadmap · donjon · mono-fusion        │
  │                                    render · fusion-auv-v2 · todo-app     │
  │                                    temp-converter · cockpit · fusion-auv  │
  │  active hours             102                                            │
  │  commands/active hour   112.8                                            │
  │  peak day            3,575 cmds    March 8                               │
  │                                                                          │
  │  ── execution ────────────────────────────────────────────────────────── │
  │  steps completed          691      across all repos, evidence-backed     │
  │  unique steps advanced    715      via roadmap advance                   │
  │  advances total         2,104                                            │
  │  plans created          3,848      (includes test iterations)            │
  │  plans archived            37+     completed and chained                 │
  │  parallel batches       1,433      orient returned 2+ steps              │
  │                                                                          │
  │  ── validation ───────────────────────────────────────────────────────── │
  │  checks executed        1,288+     donjon alone — others unmetered       │
  │  structural catches       168      validator rejections → fixed → retried│
  │  terminal audit gates       8      incomplete work caught at plan boundary│
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

![Daily Throughput](assets/daily-throughput.png)

```
  daily throughput
  Mar 1   ▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    404    🌱 discovery
  Mar 2   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░  2,496    🔥 orient peak
  Mar 3   ▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    741    🪴 growing
  Mar 4   ▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    513    🗡️ advance phase
  Mar 5   ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    126    🧘 consolidation
  Mar 6   ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  1,167    🏗️ make phase starts
  Mar 7   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░  2,121    🔄 sustained make
  Mar 8   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  3,575    ⚡ PEAK — 149/hr
  Mar 9   ▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░     22    🌙 partial day
```

### 🐙 Donjon — The Heaviest Consumer

37 DAGs across 4 days. Not a test harness.

![Donjon Evolution](assets/donjon-evolution.png)

```
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  DONJON                                         Mar 4-8, 2026               │
  │                                                                              │
  │  trail events             716        in 4 days                               │
  │  steps completed          345        evidence-backed, check-gated            │
  │  total steps across plans 412        37 plans, avg 11.1 steps/plan          │
  │  completion rate        83.7%        345 of 412 steps verified               │
  │  specs authored            33        from scaffold to live HMI pipeline      │
  │  archived DAGs             36        + 1 current (live_hmi_pipeline)         │
  │  max batch depth          L24        24 batches deep in a single plan        │
  │  throughput          86 steps/day    345 steps in 4 days                     │
  │                                                                              │
  │  ── validation ─────────────────────────────────────────────────────────────  │
  │  checks executed        1,288                                                │
  │  check rejections         168        88% VALIDATION_FAILED (caught → fixed)  │
  │  terminal audit gates       8        4% TERMINAL_AUDIT_FAILED               │
  │  successor failures         2        1% SUCCESSOR_VALIDATION_FAILED          │
  │                                                                              │
  │  ── chain ──────────────────────────────────────────────────────────────────  │
  │  improvement_cycle_6 → improvement_cycle_7 → improvement_cycle_8             │
  │  system detected gaps at terminal → refused done:true → agent wrote          │
  │  successor spec → plan chained → execution continued                         │
  │                                                                              │
  │  ── git ────────────────────────────────────────────────────────────────────  │
  │  total commits            398                                                │
  │  roadmap-scoped           126        32% of all commits are step outputs     │
  │  feature branches          18        feat/* active                           │
  │  agent worktrees            6        parallel execution evidence             │
  │                                                                              │
  │  ── plan mutations ─────────────────────────────────────────────────────────  │
  │  inserts                    2                                                │
  │  modifies                  17                                                │
  │  removes                   15        14 were auto-injected fix steps cleaned │
  │                                                                              │
  └──────────────────────────────────────────────────────────────────────────────┘
```

💎 345 steps verified across 37 plans in 4 days. 168 problems caught before they shipped.

### 🦅 Roadmap — Self-Hosted

```
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  ROADMAP (self-hosted)                          Mar 1-9, 2026               │
  │                                                                              │
  │  global trail attribution   4,026 commands (35% of all traffic)              │
  │  steps completed              128                                            │
  │  test suite                   547 tests passing                              │
  │                                                                              │
  │  ── chain iterations ───────────────────────────────────────────────────────  │
  │  cli-decompose    10 steps  → convergence     13 steps                       │
  │  → hardening       8 steps  → surface-coverage 7 steps                       │
  │  size trend: 10 → 13 → 8 → 7                  complexity converging ↘        │
  │                                                                              │
  └──────────────────────────────────────────────────────────────────────────────┘
```

### 🐝 Consumer Repos — The Swarm

```
  repo             plan                   steps  completed  status
  ───────────────  ─────────────────────  ─────  ─────────  ──────────────
  mono-fusion      bootstrap-001             18      23/18  ✅ complete
  temp-converter   unit-conversion-lib       28      19/28  ✅ complete
  fusion-auv-v2    maturity-audit            14      27/14  ✅ term audit
  render           render-pipeline           11      21/11  ✅ multi-chain
  todo-app         003-todo-app             116          —  ⏳ 116-step plan
  cockpit          fanout                     4        4/4  ⚠️ origin gate
  ───────────────  ─────────────────────  ─────  ─────────  ──────────────
  TOTAL                                     191       94+   4/6 complete
```

fusion-auv-v2: 27 completions on a 14-step plan — the final audit found gaps and auto-inserted 13 fix steps. The system extended itself.

### ⚡ This Session — Surface Coverage

Three parallel agents, zero human intervention.

![Surface Coverage Session](assets/surface-coverage-session.png)

```
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  SURFACE-COVERAGE SESSION                       Mar 8-9, 2026               │
  │                                                                              │
  │  steps                   7       init, 3 parallel, 2 sequential, term        │
  │  parallel agents         3       dispatched simultaneously                   │
  │  test cases written    191       render:62 brief-gate:78 handoff:32 exec:19  │
  │  dead code removed     849 LOC   5 files culled                              │
  │  first-advance pass    6/6       all validators passed first attempt         │
  │  human intervention      0                                                   │
  │  wall time             ~7 min    parallel batch was the bottleneck           │
  │                                                                              │
  │  agents received enriched briefs with:                                       │
  │  ├─ predecessor code context (imports, exports, conventions)                 │
  │  ├─ spec-derived descriptions with coverage requirements                    │
  │  ├─ topology (depth, siblings, descendant count)                            │
  │  └─ pattern hints ("Write adversarial tests. Prove the spec holds.")        │
  │                                                                              │
  │  result: 191 correct tests from 3 cold agents. no plan.md. no re-reading    │
  │  anything. sealed briefs → quality output → validators pass → done.          │
  │                                                                              │
  └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🗡️ Claim-by-Claim

### "The dev-docs pattern achieves similar compaction resilience"

**The claim:** Storing task state in markdown files — the "dev-docs" pattern — provides equivalent resilience to context window compaction at a fraction of the cost. A plan.md file survives compaction just as well as roadmap's orient system, so the added machinery is unnecessary.

`orient()` computes position from the filesystem — what files exist, what's missing, what to build next. `plan.md` stores position in a text file an agent wrote and must re-read.

```
  plan.md                              orient()
  ───────────────────────────────────  ──────────────────────────────────
  state = text an agent wrote          state = filesystem predicate
  recovery = agent reads + interprets  recovery = computation, deterministic
  "done" = agent said so               "done" = artifact exists on disk
  failure mode = hallucination         failure mode = filesystem is wrong
  scope = one agent's belief           scope = ground truth, any agent
  requires = honest self-reporting     requires = stat(2)
```

The distinction is structural. orient() doesn't *describe* project state — the filesystem IS the state. plan.md describes state in text that can drift from reality. One is the territory. The other is a map.

The review cites three Claude Code bugs (#24686, #26061, #27955) where plan state is lost after compaction — when the AI's conversation history gets too long and older messages are summarized away. These bugs exist because plan.md relies on conversation memory. orient() doesn't — it checks the territory directly.

```
  orient commands across all repos:    3,317
  position-recovery failures:              0
  cold agents that found position:     every single one
```

### "The narrowing gap — compaction improvements reduce roadmap's value"

**The claim:** Claude Code is actively improving its compaction handling. The review cites three open bugs as evidence of ongoing work, arguing that as these fixes land, roadmap's advantage over native plan mode will shrink — the gap is closing.

Open bugs are evidence of current failure, not imminent resolution. And even fixed: plan mode stores state in conversation memory → compaction loses detail → orient() doesn't use conversation memory. The gap is architectural, not implementational.

The industry is converging on externalized state — MCP, structured outputs, persistent workspaces. Away from holding plans in context, toward computing state from external sources.

### "Runtime overhead — 6-8 git subprocesses per node"

**The claim:** Every node invokes 6-8 git subprocesses, writes completion records, appends to trail.jsonl, and imposes a CLAUDE.md context tax. The review presents these costs as inherent to the roadmap paradigm and argues they make the approach prohibitively expensive.

**The fundamental misunderstanding:** The review correctly identified real implementation costs — then treated them as if they were inherent to the paradigm. It acknowledged the costs could theoretically be optimized, then proceeded to argue as if the current implementation *is* the ceiling. This is like measuring the fuel consumption of a prototype engine and concluding that internal combustion can never be efficient.

```
  cost                          inherent?   reducible to
  ───────────────────────────   ─────────   ──────────────────────────
  4-5 git subprocesses/node     no          0 — batch, cache, or drop
  completion.json write         no          in-memory until session end
  trail.jsonl append            no          batch writes, or sqlite
  CLAUDE.md context tax         no          shrink it
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─     ─ ─ ─ ─    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
  validator execution           YES         this IS the value
  per-node git commit           YES         this IS the audit trail
```

The top four rows are implementation noise — solvable with batching, caching, or architectural changes that don't alter what roadmap does. The bottom two rows are the paradigm: running checks and recording what happened. The review conflates all six into "overhead."

```
  did the noise prevent throughput?
  ─────────────────────────────────────────────────────
  donjon              345 steps / 4 days  = 86 steps/day
  surface-coverage    7 steps / ~7 min    = 60 steps/hour
  peak global         3,575 commands in one day
  commands/active hr  112.8
```

86 steps/day with every subprocess, every write, every append active. The overhead the review calls prohibitive didn't even register in the throughput data.

### "Roadmap does not improve parallelism over native Claude Code"

**The claim:** Claude Code's native worktree support already provides parallel execution. Roadmap's batch coordination is redundant machinery on top of something the platform does natively.

Native worktree gives isolation. Roadmap gives what each agent *receives*.

```json
{
  "dagIntent": "what the whole plan achieves",
  "position": "render-tests",
  "produces": ["tests/render.test.ts"],
  "description": "from the spec that generated this node",
  "pattern": "Write adversarial tests. Prove the spec holds.",
  "codeContext": {
    "immediate": [{
      "files": [{ "path": "src/lib/render/layout.ts", "exports": ["resolveWidth", "wrapText"] }],
      "conventions": { "importStyle": "named", "namingHint": "camelCase" }
    }]
  },
  "topology": { "depth": 1, "batchSiblings": ["dead-code-cull", "brief-gate-tests"] }
}
```

This briefing produced 62 correct tests on first pass. No human guidance. No plan.md.

```
  parallel batches observed:   1,433       (orient returned 2+ steps)
  parallel agents dispatched:  6+          (donjon worktree evidence)
  max batch width:             226         (todo-app first batch)
  agents needing re-orient:    0
```

### "Validator gates provide false confidence"

**The claim:** Validators primarily check whether files exist — "barely more useful than checking git status." Worse, this false confidence may actually reduce review thoroughness: reviewers trust the green checkmark and look less carefully. Weak validators are more dangerous than no validators.

Validators are the automated checks that run when an agent says "I'm done with this step." Here is what they actually look like:

```
  validator type distribution — 148 validators across 8 repos
  ─────────────────────────────────────────────────────────────────────────
  shell               91   (61.5%)  ██████████████████████████████░░░░░░░░
  artifact-exists     38   (25.7%)  ████████████░░░░░░░░░░░░░░░░░░░░░░░░░
  spec-conformance    15   (10.1%)  █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  intent               3   ( 2.0%)  █░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
  expanded             1   ( 0.7%)  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
```

The bar chart is the argument — not an illustration of it. 61.5% shell commands running real test suites, type checkers, build systems. The review's characterization applies to 25.7% of validators.

```
  shell commands in actual use (sample)
  ├─ pnpm test                                     full test suite
  ├─ pnpm run typecheck                            tsc compilation
  ├─ npx vitest run tests/frames.test.ts           targeted test file
  ├─ cmake -B build -S packages/vcb                C++ build verification
  ├─ docker run --rm ... colcon build              ROS2 package build in container
  ├─ bin/render api --all 2>&1 | grep -q 'float'  API surface smoke test
  ├─ test ! -f src/lib/god-engineer-prompt.ts      deletion verification
  └─ ! grep -q commander package.json              dependency removal check
```

```
  donjon validation checks:   1,288
  structural catches:           168       shell failures → agent fixed → retried
  terminal audit catches:         8       incomplete work caught at plan boundary
  ──────────────────────────────────────────────────────────────────────────
  total problems caught:        176       → fixed → retried → passed
```

Beyond shell and artifact-exists: **spec-conformance** (15 active), **intent** with `evaluator: 'council'` (3 active), **artifact-schema**, **build-produces**, **launch-check**, **expanded**. You can't evaluate a distinction without understanding both sides. The review explained what validators do without asking what they *replace* — the answer is nothing. Without them, 176 problems ship silently.

### "Autonomous completion creates unreviewable batches"

**The claim:** Autonomous agent execution produces large batches of changes that are difficult for humans to review. The dependency graph structures work into units humans didn't design, making the review surface worse, not better.

```
  without roadmap                     with roadmap
  ─────────────────────────────────   ──────────────────────────────────
  agent runs 2 hours                  agent completes N steps
  47 edits across 30 files            N commits, each scoped to produces[]
  1 commit when "done"                each = one reviewable unit
  reviewer: wall of changes           reviewer: declared contracts
  rollback: revert everything         rollback: revert one node
  "where's the bug?": good luck       "where's the bug?": which produces?
```

126 roadmap-scoped commits out of 398 total. Each covers one node's produces.

---

## 👻 What the Review Doesn't See

The review evaluates each component in isolation — validators alone are modest, orient alone is a file check, the trail alone is a log. But patterns work because of their *relationships*, not their individual properties. The brief system + chain continuation + gap detection + handoff journals compose into something none of them are individually.

### The Brief System

Every step receives a sealed mission briefing: what to build, what code already exists nearby (imports, exports, naming conventions), what the previous agent learned, and where this step sits in the overall plan. Position, shape, value — the visual variables that encode information — structured for machines instead of humans. An agent reading a brief starts informed, not from scratch. This produced 191 correct tests from 3 agents that had never seen the codebase. The review never ran `orient` to see this output.

### Chain Continuation

When the final step tries to close out, the system audits for gaps — work that was supposed to happen but didn't. If gaps exist, it refuses to mark the plan complete and spawns a successor plan. Donjon: `improvement_cycle_6 → 7 → 8` — three successive plans, each spawned from its predecessor's gaps. fusion-auv-v2: 14-step plan became 27 steps after the audit auto-inserted 13 fix steps.

### Gap Detection + Handoff Journals

The gap detector finds inputs that nothing provides and outputs that nothing tests. Triggers chain continuation. Handoff journals carry structured knowledge between agents — what they discovered, what they decided, what the next agent needs to know.

💀 2,000 words on subprocess overhead. Zero words on the brief system.

---

## 🌊 Where Everything Is Going

```
  convergence pattern                  roadmap status
  ───────────────────────────────────  ──────────────────────────────────
  MCP — externalized tool access       orient() externalizes state
  CrewAI/AutoGen/LangGraph — DAGs      37 DAGs archived, running
  Claude Code — worktrees, bg agents   6 agent worktrees deployed
  context economics — externalize      state never enters context
```

Every framework is converging here. The question isn't whether this pattern is needed.

---

## ⚖️ Verdict

```
  agree                                disagree
  ───────────────────────────────────  ──────────────────────────────────
  architecture is clean                plan.md ≠ orient() — 3,317:0
  validator cost worth optimizing      noise ≠ paradigm cost — 86 steps/day
  semantic correctness is frontier     DAGs make review easier, not harder
  supervised workflows don't need it   "narrow use case" is a snapshot
                                       brief system is the primary value
```

---

## 🦋 Conclusion

🟥🟥🟥🟥🟥🟥🟥🟥🟧🟧🟧🟧🟧🟧🟧🟧🟨🟨🟨🟨🟨🟨🟨🟨🟩🟩🟩🟩🟩🟩🟩🟩🟦🟦🟦🟦🟦🟦🟦🟦🟪🟪🟪🟪🟪🟪🟪🟪

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                          │
  │  The review read the codebase and counted subprocesses.                   │
  │  We ran 11,509 commands across 9 repositories in 9 days.                  │
  │                                                                          │
  │  691 steps completed. 37 plans archived. 176 problems caught.              │
  │  3 chain iterations proving continuation works.                           │
  │  191 tests from 3 cold agents in 7 minutes.                               │
  │  86 steps/day sustained throughput.                                       │
  │  112.8 commands per active hour.                                          │
  │                                                                          │
  │  The review is a cost analysis that forgot to measure revenue.            │
  │                                                                          │
  └──────────────────────────────────────────────────────────────────────────┘
```

The test of ornament vs structure is whether removing it collapses the architecture. Remove the trail.jsonl, the completion receipts, the chain history — and the review's own question becomes unanswerable. The "overhead" is load-bearing. Cut it and the evidence disappears.

💎 The remaining question is whether fully autonomous agent execution is a narrow use case or the direction the entire field is moving. 691 steps suggest the latter.

💀 "Near-zero overhead." A sticky note provides task tracking at near-zero overhead. Doesn't make it a DAG.
