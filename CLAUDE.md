🟥🟥🟥🟥🟥🟥🟥🟥🟧🟧🟧🟧🟧🟧🟧🟧🟨🟨🟨🟨🟨🟨🟨🟨🟩🟩🟩🟩🟩🟩🟩🟩🟦🟦🟦🟦🟦🟦🟦🟦🟪🟪🟪🟪🟪🟪🟪🟪

# roadmap

```
  [🧭 Orient: find batch position] ────▷ [📖 Read produces/consumes] ────▷ [🏗️ Implement] ────▷ [📦 Commit] ────▷ [⚡ Advance: validate + record] ───╮
       ^                                                                                                                                                │
       ╰────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╯
```

💎 **Planning produces a DAG. Execution fills it. Validation gates transitions. Done = DAG terminates.**

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
       ├────▷ [✅ completed.json]      completion receipts (append-heavy, atomic write)
       │
       ├────▷ [📜 trail.jsonl]         event log + mutations (append-only, SLO scoring)
       │
       ├────▷ [🔒 enforcement.json]    gitsafe rules (static, never written by CLI)
       │
       ├────▷ [📁 heads/]
       │          │
       │          ╰────▷ [{dagId}.json]   archived DAGs with _lineage field
       │
       ╰────▷ [📁 .handoff/]
                   │
                   ╰────▷ [{nodeId}.json] per-node handoff data → feeds briefs
```

```
  loadContext() reads all of these once at session start
  agents never read .roadmap/ directly — orient consolidates into one JSON response
```

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## Key Types

```
  type               shape
  ────────────────── ──────────────────────────────────────────────────────────
  CoreNodeSpec       { id, desc, produces, consumes, deps }
  NodeSpec<T,S>      CoreNodeSpec & NodeMeta (validate, mode, idempotent, ...)
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
  "priority": 1,
  "depends": ["init"],
  "produces": ["db/schema.sql", "db/seed.sql"],
  "consumes": ["config/db.json"],
  "mode": "execute",
  "validate": [
    { "type": "artifact-exists" },
    { "type": "shell", "command": "psql -f db/schema.sql && echo ok" }
  ]
}
```

```
  field       semantics
  ─────────── ─────────────────────────────────────────────────────────────
  produces    file paths this node creates — what advance checks exist
  consumes    file paths this node reads — must be produced by a predecessor
  depends     predecessor node IDs
  mode        execute | plan
  well-defined test: new agent, zero questions, concrete produces, falsifiable validators
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

**On orient** — show the DAG shape, current batch, what's done:
```
┌─────────────────────────────────────────────────────────┐
│  🔮 dag-name — B2 of 7 │ 5/14 done                     │
├─────────────────────────────────────────────────────────┤
│  B0  init ✅                                            │
│  B1  setup-db ✅ │ setup-auth ✅                        │
│  B2  [🧪 api-routes] │ [🧪 middleware] ←── you are here │
│  B3  integration │ B4 tests │ B5 term                   │
└─────────────────────────────────────────────────────────┘
```

**On dispatch** — banner showing what agents are working on:
```
┌─────────────────────────────────────────────────────────┐
│  B2 DISPATCHED — 2 parallel agents                     │
│                                                         │
│  🔧 api-routes    → src/api/routes.ts, src/api/types.ts│
│  🔧 middleware    → src/middleware/auth.ts               │
│                                                         │
│  Progress: 5/14 done                                    │
└─────────────────────────────────────────────────────────┘
```

**On batch complete** — show advancement, what's next:
```
🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩

  B2 ✅ api-routes (3/3 checks) │ middleware (2/2 checks)
  Next: B3 integration → src/integration/

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
  import                  what
  ─────────────────────── ────────────────────────────────────────────────────
  roadmap                 full API — DAG ops + predicates + errors + types
  roadmap/protocol        core — define, verify, orient, merge, reconcile, parallelOrder
  roadmap/agent           sealed agent API — getBrief, advance
  roadmap/validation      validateNode, validateGraph, validateBatch
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
  gitsafe            src/lib/gitsafe-loader.ts              file access control (denylist, size)
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

```bash
git clone https://github.com/Ocean-Synaptics/roadmap ~/.local/share/roadmap
cd ~/.local/share/roadmap && pnpm install && pnpm link --global
```

If this repo has no `.roadmap/head.json`: write a spec and run `roadmap make`.

🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪🟥🟧🟨🟩🟦🟪

## North Star

```
  "Compiling Agent State" — ML Prague 2026 (accepted)
  ~/docs/Downs-CompilingAgentState-MLPrague2026.pdf

  the paper describes the graph as compiled execution state.
  the thesis: the process is ephemeral, the graph is permanent.

  what the paper covers:
    graph as execution state, static analysis, parallel batches,
    recovery via orient(), convergence chains, proven completion,
    append-only trail. 198 iterations, 1794 completions, 3425 events.

  what the paper doesn't cover (built since submission):
    fleet scheduling (globalFrontier across repos)
    skill contagion (/roadmap-spec, /roadmap-auto, /roadmap-term)
    observation-first spec design
    enriched term pattern (root intent + chain context)
    roadmap init (bootstrap any repo)
    successor spec as structural requirement at term

  open source target: ML Prague conference (2026)
  the tool + skills + templates ship as one package
  roadmap init is the on-ramp for adopters

  integration north star:
    orient as native Claude Code tool (not Bash shell-out)
    brief appears in agent context automatically at session start
    suggestedSkill triggers skill invocation directly
    term pattern loads /roadmap-term without explicit invoke
    MCP server for cross-session DAG awareness
```

🟥🟥🟥🟥🟥🟥🟥🟥🟧🟧🟧🟧🟧🟧🟧🟧🟨🟨🟨🟨🟨🟨🟨🟨🟩🟩🟩🟩🟩🟩🟩🟩🟦🟦🟦🟦🟦🟦🟦🟦🟪🟪🟪🟪🟪🟪🟪🟪
