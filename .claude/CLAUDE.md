# roadmap

DAG expansion protocol library. Any repo can depend on this package, define a `roadmap.ts`, and get typed governance over its development plan.

---

## 🤖 AGENT GUIDE — System Architecture & Self-Orientation

**Read this first.** This guide helps agents understand what they're building without requiring conversation.

### System Architecture (6 Layers)

```
Layer 1: DAG Core
  ├─ define(g)    — validate structure
  ├─ verify(g)    — validate contracts (consumes satisfied by predecessors)
  ├─ check(g)     — termination (reachability from init↔term)
  ├─ orient(g)    — batch position from filesystem
  └─ advanceBatch — move to next batch
  Status: ✓ COMPLETE

Layer 2: Batch Execution
  ├─ parallelOrder(g)  — topological sort → batches (runnable in parallel)
  ├─ nodeOrder(g)      — full execution sequence
  └─ Progress tracking  — which nodes are done
  Status: ✓ COMPLETE

Layer 3: Enforcement & Safety
  ├─ Pre-commit gates (4 gates)      — branch discipline, gitsafe, DAG edit auth
  ├─ Gitsafe (gitsafe-loader.ts)     — file access control (denylist, size limits, multi-repo)
  ├─ Validator framework (5 types)   — artifact-exists, shell, function, schema, manual-approval
  ├─ CheckpointManager (recovery.ts) — snapshots, rollback, wired into runtime
  ├─ DAG intake pipeline             — origin enforcement, blocks manual DAG construction
  └─ DAG mutator (dag-mutator.ts)    — insert/remove/modify with provenance receipts
  Status: ✓ COMPLETE

Layer 4: Agent Coordination [PARTIAL]
  ├─ Worktree spawning          — isolated DAG editing per agent
  ├─ Feature branch merging     — consolidation via git
  ├─ Task dispatch              — claim/assign/complete workflow (basic)
  ├─ Swarm orchestration        — MISSING (no multi-agent coordination)
  ├─ Load balancing             — MISSING
  └─ Status synchronization     — MISSING
  Status: 🟡 PARTIAL (worktrees work, swarm doesn't)

Layer 5: Spec Integration
  ├─ Spec parsing               — JSON IR exists
  ├─ DAG generation from spec   — basic (exists)
  ├─ Scenario mapping           — spec-conformance.ts (Given/When/Then → node mapping)
  ├─ Conformance validation     — spec-conformance validator (validates DAG against scenarios)
  ├─ LLM feedback loop          — llm-feedback.ts (metrics → improvement prompts)
  └─ Distributed DAG            — protocol-distributed.ts (multi-repo DAG state + pattern mining)
  Status: ✓ COMPLETE

Layer 6: Observability
  ├─ Trail logging              — .roadmap/trail.jsonl (exists)
  ├─ Metrics extraction         — metrics-extractor.ts (SLO tracking from trail)
  ├─ Checkpoint runtime         — checkpoint-runtime.ts (snapshots + audit trail)
  ├─ Error attribution          — trail error recording with structured codes
  └─ Telemetry/dashboard        — MISSING
  Status: ✓ MOSTLY COMPLETE (dashboard missing)
```

### Self-Compounding Stack (Implemented)

These modules form the self-teaching pipeline:

1. **CheckpointManager** (src/checkpoint-runtime.ts) — wired into runtime, snapshots + rollback
2. **Metrics extraction** (src/metrics-extractor.ts) — SLO tracking from trail.jsonl
3. **Gitsafe multi-repo** (src/lib/gitsafe-loader.ts) — file access control across N repos
4. **Spec-conformance** (src/validators/spec-conformance.ts) — Given/When/Then → node validation
5. **LLM feedback** (src/llm-feedback.ts) — metrics + audit → improvement prompts
6. **Distributed DAG** (src/protocol-distributed.ts) — multi-repo DAG merge + pattern mining
7. **DAG mutator** (src/lib/dag-mutator.ts) — insert/remove/modify with provenance
8. **Intake pipeline** (src/lib/intake/index.ts) — enforced spec origin for all DAGs

### Gap Inventory

**🟡 HIGH (enables distributed work):**
- **Swarm orchestration** — Multi-agent coordination (worktrees work, no swarm layer)
- **Metrics dashboard** — Visualization of trail/metrics data

### Integration Patterns (Learn from These Branches)

Reference these completed branches to understand how to wire systems:

1. **feat/protocol-design** (e535f8f)
   - How to: Build core DAG operations
   - Pattern: Define types first, then implementations
   - Test: Cycles detection, contract validation

2. **feat/hook-installation** (5f4af3f)
   - How to: Add pre-commit gates
   - Pattern: Hook into git lifecycle, validate before commit
   - Test: Bypass detection, gate logic

3. **feat/worktree-spawn-command** (0894831)
   - How to: Add agent isolation + feature branch support
   - Pattern: Worktree branching discipline, merge semantics
   - Test: Branch protection, DAG edit enforcement

4. **feat/consolidation-complete** (48a8eaf)
   - How to: Merge multiple DAGs
   - Pattern: Dependency resolution, provenance tracking
   - Test: Conflicting merges, topological ordering

5. **feat/hardening-verification** (bf5ce57)
   - How to: Build validator framework
   - Pattern: Pluggable validators, composable checks
   - Test: Each validator type, integration with complete()

### Quick Reference Map

**"I need to add observability"**
→ Layer 6: metrics-extractor.ts, checkpoint-runtime.ts, trail.jsonl. Gap: dashboard/visualization.

**"I need to support multiple repos"**
→ Layer 5: protocol-distributed.ts (multi-repo merge), gitsafe-loader.ts (multi-repo access control).

**"I need agents to generate correct DAGs"**
→ Layer 5: spec-conformance.ts (scenario → node validation), intake pipeline (origin enforcement).

**"I need the system to teach itself"**
→ Full pipeline: metrics-extractor → llm-feedback → spec-conformance → distributed DAG pattern mining.

### Session Checklist (Before Starting Work)

Before an agent claims a task:

- [ ] Agent has read this AGENT_GUIDE section
- [ ] Agent understands which layer(s) the task affects
- [ ] Agent knows what existing code relates to it
- [ ] Agent has read 1-2 example branches (integration patterns)
- [ ] Agent can explain: "I'm building X so that Y becomes possible"

If agent can't check all ^, ask for clarification before starting.

---

## Entry Points

| Import | What |
|--------|------|
| `roadmap` | Full API — DAG ops + recovery + versioning + predicates + errors |
| `roadmap/protocol` | Core — define, verify, orient, merge, branch, reconcile, parallelOrder, advanceBatch |
| `roadmap/agent` | Sealed agent API — getBrief, advance, checkpoint (no DAG introspection) |
| `roadmap/recovery` | CheckpointManager + AuditTrail |
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
fileExists(root)         curried predicate for orient()
RoadmapError(code, ctx)  typed error with fix suggestion
```

## Key Types

```typescript
NodeSpec<TAll, TSelf>   { id, desc, produces, consumes, deps, validate, idempotent, mode?, expandedFrom? }
Graph<T>                { id, desc, init, term, nodes: { [N in T]: NodeSpec<T, N> } }
Orientation             { position: string[], level, batchRemaining, batchComplete, preGate, done, produces, consumes, remaining }
ValidationRule          'artifact-exists' | 'artifact-schema' | 'function' | 'manual-approval' | 'expanded' | 'shell'
RoadmapError            { code: ErrorCode, context: { fix, entry, ... } }
Brief                   { position, mode, produces, consumes, description, pattern, handoffs }
FinalHandoff            { summary, keyDecisions, gotchas, timestamp }
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
  - Filtered: plan nodes with uncompleted plan-mode deps are excluded (their ADR outputs shape downstream research)
  - Execute deps are ignored for pre-gate (code doesn't affect research direction)
- **`expanded` validation rule**: checks that nodes with `expandedFrom === nodeId` exist in the graph
- **Brief.mode**: agents receive `'plan'` or `'execute'` in their sealed brief and branch on it

Orient output includes `preGate` array for plan nodes workable before deps close.

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

1. **Spawn**: `roadmap spawn --task <node-id>` creates worktree and feature branch
   ```bash
   git worktree add .claude/worktrees/<task-id> -b feat/<task-id>
   cd .claude/worktrees/<task-id>
   ```

2. **Work**: Edit files, commit to feature branch
   ```bash
   git add <files>
   git commit -m "<node-id>: <what>"
   ```

3. **Merge**: `roadmap merge-batch --from <branches>` consolidates DAGs
   ```bash
   roadmap merge-batch --from feat/task-1,feat/task-2
   ```

4. **Cleanup**: `roadmap cleanup-worktrees` removes stale worktrees

### Pre-Commit Enforcement

The pre-commit hook enforces branch discipline:
- Reject edits to `head*.json` on main/master
- Allow edits only on `feat/*`, `wip/*`, `develop` branches

### Merge Semantics

Multiple DAGs are consolidated via:
1. Discover all `.roadmap/*.json` files from each branch
2. Merge DAGs in dependency order (topological sort)
3. Propagate constraints (derive artifact dependencies)
4. Validate (define, verify, check)
5. Write unified head.json with consolidatedFrom provenance

## CLI

```
Core (mainline execution loop):
  bin/roadmap make <spec>  --note "..."   Create ideal DAG from spec
  bin/roadmap orient       --note "..."   Batch position + produces/consumes (JSON)
  bin/roadmap advance [id] --note "..."   Complete node (run validators) or advance batch

Groups:
  bin/roadmap dag insert   --note "..."   Insert node into DAG
  bin/roadmap dag remove   --note "..."   Remove node (--cascade for dependents)
  bin/roadmap dag modify   --note "..."   Modify node fields
  bin/roadmap dag log                     Show mutation history
  bin/roadmap spec plan    --note "..."   Spec planning (--gallery, select <id>, status)

Discovery:
  bin/roadmap api [<cmd>]                 Schema discovery (JSON Schema + examples)
  bin/roadmap api --all                   Full registry dump
  bin/roadmap help                        Usage
```

All commands require `--note "reason"` (except help, orient, api). Output is JSON. Every invocation appends to both `~/.roadmap/trail.jsonl` (global) and `.roadmap/trail.jsonl` (local).

## Session Protocol

**At session start**: `roadmap orient --note "<what you're doing and why>"`. This is mandatory — it finds position and leaves a breadcrumb. Do not infer position from memory or file reads. The note is trail content — write what matters, not ceremony.

Example: `--note "auth module — adding JWT refresh token rotation"`

**Core loop:**
```bash
roadmap orient --note "..."             # Find batch position + produces
# ... implement produces ...
roadmap advance <node-id> --note "..."  # Run validators, record completion
roadmap advance --note "..."            # Advance to next batch (when all nodes done)
```

**Group reference:** `roadmap <group> help` (dag, spec)

**During work**: Orient after completing logical units.

## This Repo's Own Roadmap

DAG stored in `.roadmap/head.json`. 24 nodes (self-compounding-001). Position at terminal node `self-teaching-enabled` — 23/24 complete, 1 remaining.

## Expansion Protocol

1. Define INIT (what exists) and TERM (what should exist)
2. EXPAND backward from TERM
3. FLIP — EXPAND forward from INIT
4. RECONCILE — `reconcile(g, fwd, bwd)` finds where produces meets consumes
5. RECURSE into gaps
6. `define(g)` after every change, `check(g)` to test termination
7. Done when `check()` returns `{ done: true }` and `verify()` returns `[]`

Plan nodes can appear anywhere in the DAG. They expand into new execute (or plan) nodes at runtime. Use `expandedFrom` to track provenance.

## File Headers

Every src/ file has structured headers for machine discovery:
```
// @module protocol
// @exports define, verify, orient, merge, branch, ...
// @types NodeSpec, Graph, Orientation, ...
// @entry roadmap/protocol
```

Grep for `@exports` across src/ to get the full API map without reading function bodies.

---

## CLI Surface (v0.3.0+)

3 core commands + 2 groups + discovery.

### Core
- `make <spec>` — Create ideal DAG from spec (validates: define, verify, check)
- `orient` — Batch position from filesystem
- `advance [node-id]` — Complete node (run validators, record evidence) or advance batch

### Groups
- `dag {insert,remove,modify,log}` — DAG mutations with provenance
- `spec {plan}` — Spec planning (gallery, select, status)

### Discovery
- `api [<cmd>]` — JSON Schema for any command's input/output
- `api --all` — Full schema registry
