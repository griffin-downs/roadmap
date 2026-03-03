# roadmap

DAG expansion protocol library. Any repo can depend on this package, define a `roadmap.ts`, and get typed governance over its development plan.

## Entry Points

| Import | What |
|--------|------|
| `roadmap` | Full API — DAG ops + recovery + versioning + predicates + errors |
| `roadmap/protocol` | Core — define, verify, orient, merge, branch, reconcile, parallelOrder, advanceBatch |
| `roadmap/agent` | Sealed agent API — getBrief, advance, checkpoint (no DAG introspection) |
| `roadmap/recovery` | CheckpointManager + AuditTrail |
| `roadmap/validation` | validateNode, validateGraph, validateBatch |
| `roadmap/versioning` | loadDAG, migration, compatibility |

Full file-by-file map: `docs/MODULE-MAP.md`

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

Chart legend: `📋` = plan node, `🔍` = pre-gate workable, `👉` = current batch, `✅` = done

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
bin/roadmap orient    --note "..."   Batch position + produces/consumes + preGate (JSON)
bin/roadmap advance   --note "..."   Advance to next batch (requires current batch complete)
bin/roadmap describe  --note "..."   Full API surface + project state
bin/roadmap validate  --note "..."   Run validation rules (all or single node)
bin/roadmap parallel  --note "..."   Batched execution groups
bin/roadmap expand    --note "..."   Run expansion script, validate, commit
bin/roadmap branch    --note "..."   Create git branch with optional DAG
bin/roadmap chart                    Pretty-print progress chart with emoji bars
bin/roadmap chart --deps             Cross-repo chart with dependency positions
bin/roadmap retire <id> --note "..." Skip/retire a node (--cascade, --undo, --list)
bin/roadmap trail [--last N]         Read invocation trail (local)
bin/roadmap trail --global           Cross-project trail (~/.roadmap/trail.jsonl)
bin/roadmap trail --repo <name>      Filter by repo name
bin/roadmap trail --archive          Commit (local) or truncate (global)
bin/roadmap dig [path]               Browse/restore archived files from git history
bin/roadmap help                     Usage
```

All commands except help/trail/chart/install/dig require `--note "reason"`. Every invocation appends to both `~/.roadmap/trail.jsonl` (global) and `.roadmap/trail.jsonl` (local, if DAG exists). Trail entries include batch position (string[]) and level.

## Session Protocol

**At session start**: `roadmap orient --note "<what you're doing and why>"`. This is mandatory — it finds position and leaves a breadcrumb. Do not infer position from memory or file reads. The note is trail content — write what matters, not ceremony.

Example: `--note "auth module — adding JWT refresh token rotation"`

**Core mainline:**
```bash
roadmap orient --note "..."      # Find batch position
roadmap show <node-id>           # Inspect node spec
roadmap explore --api            # Dump explore API surface (if needed)
roadmap dag expand script.ts     # Decompose DAG (if needed)
roadmap team claim <id>          # Claim node
roadmap complete <id> --note ""  # Mark done + advance
roadmap advance --note "..."     # Move to next batch
```

**Group reference:** `roadmap <group> help` (dag, team, spec, util)

**During work**: Orient after completing logical units. Use `roadmap chart` to see progress.

**At session end**: `roadmap util trail --archive` if trail has entries.

## This Repo's Own Roadmap

DAG stored in `.roadmap/head.json`. 127 nodes across 17 phases. Position at `term` (99% complete). Legacy query via `roadmap.ts` still works but prefer `bin/roadmap`.

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

## CLI Consolidation (v0.3.0+)

Consolidated 41 commands → **10 total** (6 core + 4 groups).

### Mainline (6 Core Commands)
Execute primary DAG operations in sequence:
- `orient` — Batch position from filesystem
- `advance` — Move to next batch (validates current)
- `show <id>` — Full node spec
- `complete <id>` — Claim → checkpoint → advance
- `chart` — Progress visualization
- `validate [id]` — Validation rule checks

### Groups (4 Command Groups)
Operational tasks clustered by domain:
- `dag {diff,expand,propagate,retire,optimize,switch,spawn}` — DAG manipulation
- `team {claim,dispatch,strategy,assign}` — Multi-agent coordination
- `spec {plan,import,intake,compile,init}` — Spec pipeline
- `util {trail,checkpoint,install,federation}` — Session utilities

### Surface
- **Help**: 33 lines (<40 target)
- **No backward compat**: clean break from 41-command surface
- **Enforcement**: pre-commit branch discipline + validation gates
- **Status**: Minimal, production-ready

Migrations: See `docs/MIGRATION.md` for command mappings.
