# roadmap

DAG expansion protocol library. Any repo can depend on this package, define a `roadmap.ts`, and get typed governance over its development plan.

---

## 🤖 AGENT GUIDE — System Architecture & Self-Orientation

**Read this first.** This guide helps agents understand what they're building without requiring conversation.

### Layered Architecture

```
src/core/          Pure graph algebra. Zero IO. Graph in, Value out.
  ├─ graph.ts        define, verify, check, flat, fwd, detectCycles, reach
  ├─ order.ts        order, parallelOrder, criticalPath, batchConflicts
  ├─ orient.ts       orient(g, exists) → Orientation
  ├─ batch.ts        advanceBatch, readyNodes, nextBatch
  ├─ reconcile.ts    reconcile, merge, branch, analyze, modify
  ├─ access.ts       nodes(g), node(g, id) — typed accessors
  └─ types.ts        CoreNodeSpec, CoreGraph (5-field contract)

src/runtime/       IO boundary. Single filesystem touch point.
  ├─ context.ts      loadContext(repoRoot) → Context (loads completions, chain, handoffs)
  ├─ completion.ts   CompletionStore — receipt-based completion tracking
  ├─ brief.ts        brief(g, position, context) → Brief (pure, sync)
  ├─ meta.ts         NodeMeta, ManagedGraph, fullNode() — runtime metadata
  └─ mutate.ts       modifyAndCommit() — IO-side DAG mutation with git commit

src/cli/           Thin dispatch. Parse args, call runtime, JSON to stdout.
  ├─ make.ts         spec → DAG creation
  ├─ orient.ts       batch position query
  └─ advance.ts      node completion / batch advancement

bin/roadmap.ts     CLI entry point + router (2064 lines — decomposition WIP)

src/lib/           Supporting modules (protocol types, validators, intake, etc.)
src/lib/protocol/  Type definitions + barrel exports
  ├─ types.ts        NodeSpec, Graph, ValidationRule, etc.
  ├─ index.ts        Barrel — re-exports from core/ and runtime/
  ├─ schema.ts       Validator rule schemas
  └─ validation.ts   validateNode, validateBatch, validateGraph
```

**Invariant:** `src/core/` has zero `node:fs` imports. All filesystem access goes through `src/runtime/context.ts` via `loadContext()`. The `exists` predicate passed to `orient()` is the only bridge from pure algebra to filesystem state.

### Module Map

| Area | Key Files | What |
|------|-----------|------|
| DAG algebra | `src/core/*.ts` | Pure validation, ordering, orientation, merging |
| IO boundary | `src/runtime/context.ts` | Single `loadContext()` loads all filesystem state |
| Completion | `src/runtime/completion.ts` | Receipt-based tracking with evidence records |
| Brief generation | `src/runtime/brief.ts` | Pure brief(g, position, context) → Brief |
| Type split | `src/core/types.ts` + `src/runtime/meta.ts` | CoreNodeSpec (5 fields) vs NodeMeta (runtime fields) |
| Intake pipeline | `src/lib/intake/` | Spec origin enforcement, SpecIR parsing, DAG generation |
| DAG mutation | `src/lib/dag-mutator.ts` | insert/remove/modify with provenance to mutations.jsonl |
| Gitsafe | `src/lib/gitsafe-loader.ts` | File access control (denylist, size limits) |
| Validators | `src/lib/protocol/validation.ts` | artifact-exists, shell, schema, manual-approval, expanded |
| Trail | `src/lib/audit/trail.ts` | .roadmap/trail.jsonl append-only event log |
| Metrics | `src/metrics-extractor.ts` | SLO tracking from trail.jsonl |
| Claims | `src/lib/claims/claims.ts` | Node claim/assign/release for multi-agent |
| Chain | `src/lib/chain.ts` | DAG chaining — iteration tracking, execution reports |
| Agent dispatch | `src/lib/agent-dispatch/` | Brief gate, handoff journal, dispatch coordinator |
| Predicates | `src/predicates.ts` | findRepoRoot, fileExists, gitArtifactExists, compound, any |

### Gap Inventory

- **bin/roadmap.ts decomposition** — 2064-line monolith, cli/ modules exist alongside but aren't wired as primary dispatch yet
- **Metrics dashboard** — trail.jsonl + metrics-extractor exist but no visualization

### Session Checklist (Before Starting Work)

Before an agent claims a task:

- [ ] Agent has read this AGENT_GUIDE section
- [ ] Agent understands which layer(s) the task affects
- [ ] Agent knows what existing code relates to it
- [ ] Agent can explain: "I'm building X so that Y becomes possible"

If agent can't check all ^, ask for clarification before starting.

---

## Entry Points

| Import | What |
|--------|------|
| `roadmap` | Full API — DAG ops + predicates + errors + types |
| `roadmap/protocol` | Core — define, verify, orient, merge, branch, reconcile, parallelOrder, advanceBatch |
| `roadmap/agent` | Sealed agent API — getBrief, advance (no DAG introspection) |
| `roadmap/validation` | validateNode, validateGraph, validateBatch |
| `roadmap/versioning` | loadDAG, migration, compatibility |

Use `roadmap api --all` for full schema map, or grep `@exports` across src/ for API surface.

## Core API

```
define(g)                validate structure (cycles, init/term)
verify(g)                validate contracts (consumes satisfied by predecessors)
check(g)                 termination (every node reachable init→term)
order(g)                 implementation sequence (topo sort)
parallelOrder(g)         batched topo sort → string[][] (concurrent execution groups)
orient(g, exists)        batch position from filesystem state → Orientation
advanceBatch(g, exists)  validate current batch complete, return next batch orientation
reconcile(g, fwd, bwd)   find where forward.produces meets backward.consumes
merge(g1, g2, conn)      combine DAGs at join points
branch(g, from)          extract subgraph
validateBatch(g, batch, exists)  validate all nodes in a batch as unit
findRepoRoot(startDir)   walk up to .roadmap/ or .git — repo root discovery
fileExists(root)         curried predicate for orient()
RoadmapError(code, ctx)  typed error with fix suggestion
```

## Key Types

```typescript
CoreNodeSpec       { id, desc, produces, consumes, deps }           // pure algebra contract
NodeMeta           { validate, idempotent, mode, expandedFrom, … }  // runtime metadata
NodeSpec<T,S>      CoreNodeSpec & NodeMeta                           // full node (backward compat)
Graph<T>           { id, desc, init, term, nodes: { [N in T]: NodeSpec<T, N> } }
Orientation        { position: string[], level, batchRemaining, batchComplete, preGate, done, produces, consumes, remaining }
Context            { repoRoot, completion, chain, handoffs }         // IO boundary output
Brief              { position, mode, produces, consumes, description, pattern, handoffs }
```

## Batch Position Model

Position is a **batch** (array of nodes runnable in parallel), not a single node. `orient()` uses `parallelOrder()` to compute the current batch — the first batch where any node's artifacts are missing.

```typescript
const pos = orient(g, fileExists(root));
// pos.position = ['node-a', 'node-b']  ← current batch
// pos.level = 5                         ← batch index
// pos.batchComplete = false             ← not all artifacts exist yet
// pos.preGate = ['plan-node-c']         ← plan nodes workable before deps close
```

Use `advanceBatch()` to move to the next batch (validates current batch is complete first).

## Plan Node Execution Mode

Nodes can declare `mode: 'plan'` to signal decomposition rather than execution.

```typescript
{ id: 'design-auth', mode: 'plan', produces: [], deps: ['setup'], validate: [{ type: 'expanded' }], ... }
```

- **Plan nodes** complete when expansion children exist (`expandedFrom` provenance)
- **Execute nodes** (default) complete when produced artifacts exist
- **Pre-gate**: plan nodes surface in `orient().preGate` before deps close — investigation can start early
- **`expanded` validation rule**: checks that nodes with `expandedFrom === nodeId` exist in the graph
- **Brief.mode**: agents receive `'plan'` or `'execute'` in their sealed brief and branch on it

## Validation Stack

| Layer | What it catches | When |
|-------|----------------|------|
| `tsc --noEmit` | Invalid dep refs, missing nodes, id/key mismatch | Compile time |
| `define(g)` | Cycles, missing init/term | Import time |
| `verify(g)` | Consumed artifact not produced by predecessor | On demand |
| `check(g)` | Disconnected nodes, unreachable from init or term | On demand |
| `orient(g, exists)` | Batch position from filesystem — which artifacts actually exist | Session start |
| `validateBatch(g, batch, exists)` | All nodes in batch pass + all artifacts materialized | Batch advancement |

## Worktree Protocol

Unified DAG editing discipline for both human users and LLM agents via feature branch isolation.

### Workflow

1. **Spawn**: `git worktree add .claude/worktrees/<task-id> -b feat/<task-id>`
2. **Work**: Edit files, `git add <produces>`, `git commit -m "<node-id>: <what>"`
3. **Merge**: `roadmap merge-batch --from feat/task-1,feat/task-2`
4. **Cleanup**: `roadmap cleanup-worktrees`

### Branch Discipline

- `feat/*`, `wip/*`, `develop` — allowed to edit `.roadmap/head.json` and run DAG mutations
- `main` — read-only for DAG state (pre-commit hook + runtime gate enforce this)
- Worktrees are exempt from branch enforcement (isolated execution context)

## CLI

```
Core (mainline execution loop):
  roadmap make <spec>  --note "..."   Create ideal DAG from spec
  roadmap orient       --note "..."   Batch position + produces/consumes (JSON)
  roadmap advance [id] --note "..."   Complete node (run validators) or advance batch

Groups:
  roadmap dag insert   --note "..."   Insert node into DAG
  roadmap dag remove   --note "..."   Remove node (--cascade for dependents)
  roadmap dag modify   --note "..."   Modify node fields
  roadmap dag log                     Show mutation history
  roadmap spec plan    --note "..."   Spec planning (--gallery, select <id>, status)

Discovery:
  roadmap api [<cmd>]                 Schema discovery (JSON Schema + examples)
  roadmap api --all                   Full registry dump
  roadmap help                        Usage
```

All commands require `--note "reason"` (except help, orient, api). Output is JSON. Every invocation appends to both `~/.roadmap/trail.jsonl` (global) and `.roadmap/trail.jsonl` (local).

## Session Protocol

**At session start**: `roadmap orient --note "<what you're doing and why>"`. This is mandatory — it finds position and leaves a breadcrumb. Do not infer position from memory or file reads.

**Core loop:**
```bash
roadmap orient --note "..."             # Find batch position + produces
# ... implement produces ...
roadmap advance <node-id> --note "..."  # Run validators, record completion
roadmap advance --note "..."            # Advance to next batch (when all nodes done)
```

**During work**: Orient after completing logical units.

## Expansion Protocol

1. Define INIT (what exists) and TERM (what should exist)
2. EXPAND backward from TERM
3. FLIP — EXPAND forward from INIT
4. RECONCILE — `reconcile(g, fwd, bwd)` finds where produces meets consumes
5. RECURSE into gaps
6. `define(g)` after every change, `check(g)` to test termination
7. Done when `check()` returns `{ done: true }` and `verify()` returns `[]`

## File Headers

Every src/ file has structured headers for machine discovery:
```
// @module core/graph
// @exports define, verify, check, flat, fwd, detectCycles, reach, Flat
// @types Flat
// @entry roadmap
```

Grep for `@exports` across src/ to get the full API map without reading function bodies.
