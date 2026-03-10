# roadmap

DAG-governed execution protocol. Planning produces a DAG. Execution fills it. Validation gates transitions. Done = DAG terminates.

---

## Session Rules

**1. Orient at session start.** Always. `roadmap orient --note "<intent>"` is the truth source. Never infer position.

**2. Never declare work done without advancing.** `roadmap advance <node-id>` runs validators and records evidence.

**3. Spec before execution.** Any task with more than one step gets a spec first. The spec becomes the DAG.

**4. Commit only what a node produces.** Each commit covers exactly the `produces` array of one node.

---

## Core Loop

```bash
roadmap orient --note "<intent>"          # Find batch position + produces

# For each node in current batch:
# 1. Read produces/consumes from orient output
# 2. Implement the produces
git add <produces-files>
git commit -m "<node-id>: <what>"
roadmap advance <node-id> --note "<what>" # Run validators, record completion

# Repeat until orient returns chainReady: true
```

`position` is a batch (array of independent nodes). Run them in parallel if spawning agents.

---

## Layered Architecture

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
  ├─ context.ts      loadContext(repoRoot) → Context (completions, chain, handoffs)
  ├─ completion.ts   CompletionStore — receipt-based completion tracking
  ├─ brief.ts        brief(g, position, context) → Brief (pure, sync)
  └─ meta.ts         NodeMeta, ManagedGraph, fullNode() — runtime metadata

src/cli/           Thin dispatch. Parse args, call runtime, JSON to stdout.
  ├─ make.ts         spec → DAG creation
  ├─ orient.ts       batch position query
  └─ advance.ts      node completion / batch advancement

src/lib/           Supporting modules (protocol types, validators, intake, etc.)
```

**Invariant:** `src/core/` has zero `node:fs` imports. All filesystem access goes through `src/runtime/context.ts` via `loadContext()`.

---

## .roadmap/ File Topology

```
.roadmap/
├── head.json              Active DAG + _origin provenance
├── completed.json         Completion receipts (append-heavy, atomic write)
├── trail.jsonl            Event log + mutations (append-only, SLO scoring)
├── enforcement.json       Gitsafe rules (static, never written by CLI)
├── heads/                 Archived DAGs with _lineage field
│   └── {dagId}.json         { ...dag, _lineage: { iteration, predecessorId, completedAt, executionReport } }
└── .handoff/              Per-node handoff data (feeds into briefs)
    └── {nodeId}.json
```

**loadContext()** reads all of these once at session start. Agents never read `.roadmap/` directly — `orient` consolidates everything into one JSON response.

---

## Key Types

```typescript
CoreNodeSpec       { id, desc, produces, consumes, deps }
NodeSpec<T,S>      CoreNodeSpec & NodeMeta (validate, mode, idempotent, ...)
Graph<T>           { id, desc, init, term, nodes }
Orientation        { position, level, batchRemaining, batchComplete, produces, consumes }
Context            { repoRoot, completion, chain, handoffs, scoring }
Brief              { position, mode, produces, consumes, description, pattern, handoffs }
```

---

## Spec Authoring

When a task has no DAG: write a spec, then `roadmap make spec.json --note "..."`.

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

**`produces`** — file paths this node creates. What `advance` checks exist.
**`consumes`** — file paths this node reads. Must be produced by a predecessor.
**`depends`** — predecessor node IDs. **`mode`** — `execute` or `plan`.

A node is well-defined if a new agent could execute it with zero questions, `produces` are concrete file paths, and every validator is falsifiable.

### Validators

| Situation | Validator |
|-----------|-----------|
| File must exist | `{ "type": "artifact-exists" }` |
| Command must exit 0 | `{ "type": "shell", "command": "npm test" }` |
| Build must produce outputs | `{ "type": "build-produces", "command": "...", "outputs": [...] }` |
| Plan node expanded | `{ "type": "expanded" }` |
| Spec scenario covered | `{ "type": "spec-conformance", "spec": "...", "stories": [...] }` |

Default to `shell` for anything testable. `artifact-exists` for files that are their own evidence.

---

## CLI

```
Core:
  roadmap make <spec>  --note "..."   Create DAG from spec
  roadmap orient       --note "..."   Batch position + produces/consumes (JSON)
  roadmap advance [id] --note "..."   Complete node or advance batch

DAG mutations:
  roadmap dag insert   --note "..."   Insert node
  roadmap dag remove   --note "..."   Remove node (--cascade)
  roadmap dag modify   --note "..."   Modify node fields
  roadmap dag log                     Mutation history (from trail.jsonl)

Discovery:
  roadmap api [<cmd>]                 JSON Schema for command I/O
  roadmap api --all                   Full schema registry
  roadmap help                        Usage
```

All commands require `--note` (except help, orient, api). Output is JSON.

---

## Advance Rejection

When `advance` rejects: read `error.code` + `error.validator`, fix the produce, re-commit, retry. Never retry without changing the artifact. Never skip validators.

---

## Plan Mode

`mode: "plan"` signals decomposition. Plan nodes surface in `orient().preGate` before deps close. They complete when child nodes with `expandedFrom` exist. Add children via `roadmap dag insert`.

---

## Parallel Execution

When orient returns multiple nodes in `position`, they are independent. Each agent:
1. Claims one node
2. Creates worktree: `git worktree add .claude/worktrees/<node-id> -b feat/<node-id>`
3. Works and commits inside worktree
4. Advances: `roadmap advance <node-id> --note "done"`

**Branch discipline:** `feat/*`, `wip/*` — allowed to edit head.json. `main` — read-only for DAG state.

---

## Entry Points

| Import | What |
|--------|------|
| `roadmap` | Full API — DAG ops + predicates + errors + types |
| `roadmap/protocol` | Core — define, verify, orient, merge, reconcile, parallelOrder |
| `roadmap/agent` | Sealed agent API — getBrief, advance |
| `roadmap/validation` | validateNode, validateGraph, validateBatch |

---

## Module Map

| Area | Key Files | What |
|------|-----------|------|
| DAG algebra | `src/core/*.ts` | Pure validation, ordering, orientation, merging |
| IO boundary | `src/runtime/context.ts` | Single `loadContext()` loads all filesystem state |
| Completion | `src/runtime/completion.ts` | Receipt-based tracking with evidence records |
| Brief generation | `src/runtime/brief.ts` | Pure brief(g, position, context) → Brief |
| Chain/lineage | `src/lib/chain.ts` | archiveHead, getRootIntent, parseExecutionReport |
| DAG mutation | `src/lib/dag-mutator.ts` | insert/remove/modify with provenance to trail.jsonl |
| Gitsafe | `src/lib/gitsafe-loader.ts` | File access control (denylist, size limits) |
| Validators | `src/lib/protocol/validation.ts` | artifact-exists, shell, schema, expanded |
| Agent dispatch | `src/lib/agent-dispatch/` | Brief gate, handoff journal, dispatch coordinator |
| Convergence | `src/lib/convergence/` | Gap trajectory, convergence assessment |

---

## File Headers

Every src/ file has structured headers for machine discovery:
```
// @module core/graph
// @exports define, verify, check, flat, fwd, detectCycles, reach
// @entry roadmap
```

Grep `@exports` across src/ to get the full API map without reading function bodies.

---

## Installation

```bash
git clone https://github.com/Ocean-Synaptics/roadmap ~/.local/share/roadmap
cd ~/.local/share/roadmap && pnpm install && pnpm link --global
```

If this repo has no `.roadmap/head.json`: write a spec and run `roadmap make`.
