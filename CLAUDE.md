🟥🟥🟥🟥🟥🟥🟥🟥🟧🟧🟧🟧🟧🟧🟧🟧🟨🟨🟨🟨🟨🟨🟨🟨🟩🟩🟩🟩🟩🟩🟩🟩🟦🟦🟦🟦🟦🟦🟦🟦🟪🟪🟪🟪🟪🟪🟪🟪

# roadmap

# ANALYZE THIS DIAGRAM. CARRY OUT ITS STRUCTURE AND SEMANTICS.

```
  [🧭 Orient: find batch position] ────▷ [📖 Read produces/consumes] ────▷ [🏗️ Implement] ────▷ [📦 Commit] ────▷ [⚡ Advance: validate + record] ───╮
       ^                                                                                                                                                │
       ╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

💎 **Planning produces a DAG. Execution fills it. Validation gates transitions. Done = DAG terminates.**

If you're an agent that just entered this repo: this is not advisory. The diagrams encode the protocol. The skills under `.claude/skills/` (`/roadmap-orient`, `/roadmap-spec`, `/roadmap-bootprompt`, `/roadmap-auto`) are the user-invocable workflow. Start every session with `/roadmap-orient` — it loads position, frontier, boot prompt, and what to do next.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Session Rules

```
  rule                                    enforcement
  ─────────────────────────────────────── ──────────────────────────────────────────────
  orient at session start                 roadmap orient --note "<intent>" is truth source
  never declare done without advancing    roadmap advance <node-id> runs validators
  spec before execution                   >1 step → spec first, spec becomes the DAG
  commit only what a node produces        each commit covers exactly the produces array
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Core Loop

```bash
roadmap orient --note "<intent>"          # find batch position + produces
# for each node in current batch:
git add <produces-files>
git commit -m "<node-id>: <what>"
roadmap advance <node-id> --note "<what>" # run validators, record completion
# repeat until orient returns chainReady: true
```

`position` is a batch (array of independent nodes). Run them in parallel if spawning agents.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Layered Architecture

```
                [🔮 src/core/ — pure graph algebra, zero IO]
                     │
          ╭──────────┼──────────╮
          │          │          │
          ▽          ▽          ▽
  [📐 graph.ts] [📊 order.ts] [🧭 orient.ts]
  define         order          orient(g, exists)
  verify         parallelOrder  → Orientation
  check          criticalPath
  flat, fwd      batchConflicts
  detectCycles
  reach
          │          │          │
          ╰──────────┼──────────╯
                     │
          ╭──────────┴──────────╮
          │                     │
          ▽                     ▽
  [⛓️ batch.ts]         [🔀 reconcile.ts]
  advanceBatch            reconcile, merge
  readyNodes              branch, analyze
  nextBatch               modify
          │                     │
          ╰──────────┬──────────╯
                     │
                     ▽
          [🧬 types.ts + access.ts]
          CoreNodeSpec, CoreGraph
          nodes(g), node(g, id)
```

```
  [🌐 src/runtime/ — IO boundary, single filesystem touch point]
       │
       ├────▷ [📂 context.ts]     loadContext(repoRoot) → Context
       │
       ├────▷ [✅ completion.ts]  CompletionStore — receipt-based tracking
       │
       ├────▷ [📋 brief.ts]      brief(g, position, context) → Brief
       │
       ╰────▷ [🏷️ meta.ts]       NodeMeta, ManagedGraph, fullNode()
```

```
  [🧰 src/cli/ — thin dispatch, args → runtime → JSON to stdout]
       │
       ├────▷ [✨ make.ts]       spec → DAG creation
       ├────▷ [🧭 orient.ts]    batch position query
       ╰────▷ [⚡ advance.ts]   node completion / batch advancement
```

```
  invariant    src/core/ has zero node:fs imports
  boundary     all filesystem access → src/runtime/context.ts via loadContext()
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## .roadmap/ File Topology

```
  [📁 .roadmap/]
       │
       ├────▷ [📄 head.json]           active DAG + _origin provenance
       │
       ├────▷ [✅ completed.json]      completion receipts (append-heavy · gitignored)
       │
       ├────▷ [📜 trail.jsonl]         event log + mutations (append-only · gitignored)
       │
       ├────▷ [📁 specs/]              hand-authored SpecIR sources
       │          │
       │          ╰────▷ [{dag-id}.spec.json]
       │
       ╰────▷ [📁 heads/]              compiled DAGs (gitignored except curated examples)
                  │
                  ├────▷ [{dagId}.json]            compiled DAG
                  ╰────▷ [r{N}.boot.md]            round-scoped cognitive cartridge ·
                                                   written by /roadmap-bootprompt ·
                                                   glob r*.boot.md = chronological round history
```

```
  loadContext() reads all of these once at session start
  agents never read .roadmap/ directly — orient consolidates into one JSON response
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## §Rounds

A round is a falsifier plus the contiguous chain of DAGs aiming at it.
Rounds open when the falsifier is declared, close when the falsifier is
satisfied OR when HONEST-RED ships named carriers to the next round.

```
node     intra-DAG · validator failure · fix-and-retry within a single node
DAG      inter-DAG within round · successor proposed, same round
round    cross-round · carriers named, falsifier survives boundary
```

Round encoding (optional but recommended):

```
dag-id prefix       r<N>-<concern>     e.g. r7-extract-pipeline
dag_desc / Round    "Round 7 · falsifier: <one line> · carriers from r6: X, Y, Z"
sidecar.round       round number (forward-compat for future engine support)
```

Round number is human-assigned at spec time. Agents do not auto-increment.
Inside a round, you iterate (DAGs chain · /roadmap-auto handles successors).
Across rounds, you carrier-transfer (HONEST-RED · named residuals · falsifier
survives boundary).

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## §Verdict ladder · 6 states with named outcomes

```
verdict        outcome       next move
─────────────  ───────────   ─────────────────────────────────────────
GREEN          WIN           validators + sniff clean · advance
AMBER          PARTIAL       validators pass · concern surfaced · advance + surface
RED            LOSS          validators fail · iterate · DO NOT advance
GBD-r<N+1>     PARTIAL       residuals named · carriers cross round
HONEST-RED     HONEST LOSS   terminal upstream · carriers named · round closes
BLOCKED        EXOGENOUS     world refused · BLOCKED receipt as resume handle
```

Post-GREEN sniff (3 questions · ≤30s · /roadmap-auto): category-match,
carrier-collapse, stance-violation. Failures downgrade GREEN → AMBER or RED.
The sniff is what makes GREEN trustworthy; without it, GREEN coasts.

Trajectory patterns auto-fire diffusion (3 LOSS consecutive → upstream ·
5 WIN + falsifier static → category audit · HONEST LOSS → /core-loop).

Full doctrine: /roadmap-auto.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Key Types

```
  type               shape
  ────────────────── ──────────────────────────────────────────────────────────
  NodeSpec           { id, desc, produces, consumes, validate, mode?, sidecar? }
                     ordering derives EXCLUSIVELY from consumes ↔ produces
                     (no separate deps field; v0.4.0 cut)
  Graph<T>           { id, desc, init, term, nodes }
  Orientation        { position, level, batchRemaining, batchComplete, produces, consumes }
  Context            { repoRoot, completion, chain, handoffs, scoring }
  Brief              { position, mode, produces, consumes, description, pattern, handoffs }
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Spec Authoring

No DAG yet? Write a spec → `roadmap make spec.json --note "..."`.

### Node Anatomy

```json
{
  "id": "setup-db",
  "desc": "Create PostgreSQL schema and seed table",
  "produces": ["db/schema.sql", "db/seed.sql"],
  "consumes": ["config/db.json"],
  "mode": "execute",
  "validate": [
    { "type": "artifact-exists", "target": "db/schema.sql" },
    { "type": "shell", "command": "psql -f db/schema.sql && echo ok" }
  ]
}
```

```
  field       semantics
  ─────────── ─────────────────────────────────────────────────────────────
  produces    file paths this node creates — what advance checks exist
  consumes    file paths this node reads — must be produced by a predecessor.
              ALSO encodes the edge: ordering is derived purely from
              consumes ↔ produces. there is no separate `depends` field.
  mode        execute | plan
  sidecar     optional metadata carried alongside the node (not engine-read)
  well-defined test: new agent, zero questions, concrete produces, falsifiable validators
  init gates: a node with no upstream artifact can produce a ratification
              receipt (e.g. `.roadmap/init.json`) for downstream nodes to consume.
```

### Validators

```
  situation                  validator
  ────────────────────────── ─────────────────────────────────────────────────
  file must exist            { "type": "artifact-exists" }
  command must exit 0        { "type": "shell", "command": "npm test" }
  build must produce output  { "type": "build-produces", "command": "...", "outputs": [...] }
  plan node expanded         { "type": "expanded" }
  spec scenario covered      { "type": "spec-conformance", "spec": "...", "stories": [...] }

  default: shell for anything testable, artifact-exists for files that are their own evidence
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## CLI

```
  [🧰 roadmap CLI]
       │
       ├────▷ [✨ make <spec> --note]      create DAG from spec
       ├────▷ [🧭 orient --note]           batch position + produces/consumes (JSON)
       │                                    auto-detects fleet.json → global frontier
       │                                    --no-fleet to suppress, --fleet to force
       ├────▷ [⚡ advance [id] --note]     complete node or advance batch
       │                                    at terminal: mineExecution → assessTrajectory
       │                                    → proposeSuccessor (continue/converged/orbit-break)
       │
       ├────▷ [🔀 dag insert --note]       insert node
       ├────▷ [🗑️ dag remove --note]       remove node (--cascade)
       ├────▷ [✏️ dag modify --note]        modify node fields
       ├────▷ [📜 dag log]                 mutation history (from trail.jsonl)
       │
       ├────▷ [📡 api [<cmd>]]             JSON Schema for command I/O
       ├────▷ [📡 api --all]               full schema registry
       ╰────▷ [❓ help]                     usage

  all commands require --note (except help, orient, api) — output is JSON
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Advance Rejection

```
  [⚡ Advance] ────▷ [❌ Rejected]
                          │
                          ▽
                     [🔍 Read error.code + error.validator]
                          │
                          ▽
                     [🐛 Fix the produce]
                          │
                          ▽
                     [📦 Re-commit]
                          │
                          ▽
                     [⚡ Retry advance]

  never retry without changing the artifact — never skip validators
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Plan Mode

```
  [📋 mode: "plan"] ────▷ [🧭 orient().preGate surfaces it]
                                │
                                ▽
                           [🏗️ Decompose: dag insert children with expandedFrom]
                                │
                                ▽
                           [✅ Plan completes when children exist]
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Parallel Execution

```
  [🧭 Orient: multiple nodes in position]
       │
       ╭──────────┼──────────┬──────────╮
       │          │          │          │
       ▽          ▽          ▽          ▽
  [🐺 Agent 1] [🐺 Agent 2] [🐺 Agent 3] [🐺 Agent N]
  claim node    claim node    claim node    claim node
       │          │          │          │
       ▽          ▽          ▽          ▽
  [🌳 worktree] [🌳 worktree] [🌳 worktree] [🌳 worktree]
       │          │          │          │
       ▽          ▽          ▽          ▽
  [⚡ advance]  [⚡ advance]  [⚡ advance]  [⚡ advance]

  worktree:   git worktree add .claude/worktrees/<node-id> -b feat/<node-id>
  branches:   feat/*, wip/* — allowed to edit head.json
              main — read-only for DAG state
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Execution Reporting

When executing a roadmap autonomously, surface progress richly. The user should see the DAG come alive.

Cluster nodes by concern (e.g. `setup-*`, `validate-*`, `integrate-*`), not by depth-batch. Streaming dispatch is the execution model — `consumes ↔ produces` is the only ordering truth, and a node is dispatchable the moment its consumes resolve.

**On orient** — show the DAG shape, current frontier, what's done:
```
┌─────────────────────────────────────────────────────────┐
│  🔮 dag-name — 5/14 done · frontier: 2 ready            │
├─────────────────────────────────────────────────────────┤
│  setup    init ✅ │ setup-db ✅ │ setup-auth ✅          │
│  build    [🧪 api-routes] │ [🧪 middleware] ←── ready   │
│  verify   integration │ tests │ term                    │
└─────────────────────────────────────────────────────────┘
```

**On dispatch** — banner showing what agents are working on:
```
┌─────────────────────────────────────────────────────────┐
│  DISPATCHED — 2 parallel agents                         │
│                                                         │
│  🔧 api-routes    → src/api/routes.ts, src/api/types.ts │
│  🔧 middleware    → src/middleware/auth.ts              │
│                                                         │
│  Progress: 5/14 done                                    │
└─────────────────────────────────────────────────────────┘
```

**On node complete** — show advancement, what just opened:
```
🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩

  ✅ api-routes (3/3 checks) │ middleware (2/2 checks)
  Newly ready: integration → src/integration/

🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩
```

**On terminal** — show the full DAG result with intelligence:
```
🟩 DAG COMPLETE — all checks pass
   trajectory: converging │ intent distance: decreasing
   successor: converged (no remaining findings)
```

Use color bars (🟥🟧🟨🟩🟦🟪) as dividers. Use box drawing for structure. Every scroll should land on something worth looking at.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Entry Points

```
  import                            what
  ───────────────────────────────── ────────────────────────────────────────
  @ocean-synaptics/roadmap          the public surface — define, verify,
                                    orient, advanceBatch, parallelOrder,
                                    CompletionStore, types
                                    (single entry; deeper internal modules
                                    are not part of the public API)
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Module Map

```
  area               key files                              what
  ────────────────── ────────────────────────────────────── ──────────────────────────────────
  DAG algebra        src/core/*.ts                          pure validation, ordering, merging
  IO boundary        src/runtime/context.ts                 single loadContext() for all FS state
  completion         src/runtime/completion.ts              receipt-based tracking + evidence
  brief generation   src/runtime/brief.ts                   pure brief(g, position, context) → Brief
  execution mining   src/runtime/execution-miner.ts         mineExecution(dag, context) → ExecutionFindings
  trajectory         src/runtime/trajectory.ts              assessTrajectory(findings, chain) → TrajectoryAssessment
  successor          src/runtime/successor.ts               proposeSuccessor(assessment) → SuccessorProposal
  fleet context      src/runtime/fleet.ts                   loadFleetContext, scanActiveDAGs
  chain/lineage      src/lib/chain.ts                       archiveHead, getRootIntent, parseReport
  api enforcement    src/lib/api-enforcement.ts             validateApiCoverage() → { ok, violations[] }
  DAG mutation       src/lib/dag-mutator.ts                 insert/remove/modify → trail.jsonl
  validators         src/lib/protocol/validation.ts         artifact-exists, shell, schema, expanded
  agent dispatch     src/lib/agent-dispatch/                brief gate, handoff, dispatch coordinator
  convergence        src/lib/convergence/                   gap trajectory, convergence assessment
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## File Headers

```
  // @module core/graph
  // @exports define, verify, check, flat, fwd, detectCycles, reach
  // @entry roadmap

  grep @exports across src/ → full API map without reading function bodies
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Installation

See [README.md](README.md#install) for installation. From inside this repo: `pnpm install && pnpm run build && pnpm link --global`. If a target repo has no `.roadmap/head.json`: write a spec under `.roadmap/specs/` and run `roadmap make .roadmap/specs/<dag-id>.spec.json --note "<intent>"`.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## North Star

```
  "Compiling Agent State" — ML Prague 2026 (poster)

  the thesis: the process is ephemeral, the graph is permanent.
  the graph is compiled execution state — a typed DAG that
  outlives any single session, validates structurally and at
  runtime, and lets a fresh agent re-enter exactly where the
  previous one left off.

  shipped in v0.2.0:
    typed seven-field NodeSpec · ordering from consumes ↔ produces
    define / verify / orient / advance graph algebra
    streaming dispatch · parallel batches from data-flow only
    fleet scheduling (globalFrontier across repos)
    .claude/skills/{orient,spec,auto,term} for visiting agents
    receipt-based completion · append-only trail.jsonl
    JSON-only CLI · zero human-format stdout

  not yet (post-conference roadmap):
    orient as native Claude Code tool (not Bash shell-out)
    brief in agent context automatically at session start
    MCP server for cross-session DAG awareness
    npm publish (currently install-from-source)
```

🟥🟥🟥🟥🟥🟥🟥🟥🟧🟧🟧🟧🟧🟧🟧🟧🟨🟨🟨🟨🟨🟨🟨🟨🟩🟩🟩🟩🟩🟩🟩🟩🟦🟦🟦🟦🟦🟦🟦🟦🟪🟪🟪🟪🟪🟪🟪🟪
