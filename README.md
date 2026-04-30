# roadmap

[![test](https://github.com/Ocean-Synaptics/roadmap/actions/workflows/test.yml/badge.svg)](https://github.com/Ocean-Synaptics/roadmap/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

DAG-governed development protocol. Define a typed graph of work — nodes produce artifacts, edges encode dependencies. The system validates structure, tracks position, and enforces completion.

## Install

```bash
npm install roadmap
```

## What It Does

You declare a directed acyclic graph where each node has:
- **produces** — artifacts this node creates (files, configs, outputs)
- **consumes** — artifacts this node reads (must be produced by a predecessor)
- **deps** — ordering constraints
- **validate** — rules that must pass for completion (shell commands, artifact checks, schema validation)

The protocol validates the graph at compile time (TypeScript), import time (`define`), and runtime (`orient`, `advance`). Position is computed from filesystem state — which artifacts actually exist determines where you are.

```typescript
import { define, verify, orient, advanceBatch } from 'roadmap/protocol';
import { CompletionStore } from 'roadmap';

const g = define({
  id: 'auth-system', init: 'start', term: 'deployed',
  nodes: {
    start:    { id: 'start',    produces: ['schema.sql'],    consumes: [],             deps: [],        validate: [], idempotent: true },
    api:      { id: 'api',      produces: ['src/api.ts'],    consumes: ['schema.sql'],  deps: ['start'], validate: [{ type: 'shell', command: 'npx tsc --noEmit' }], idempotent: true },
    deployed: { id: 'deployed', produces: ['deploy.json'],   consumes: ['src/api.ts'],  deps: ['api'],   validate: [{ type: 'artifact-exists', target: 'deploy.json' }], idempotent: false },
  }
});

verify(g);  // all consumes satisfied by predecessor produces?

const completion = CompletionStore.loadOrEmpty(process.cwd());
const pos = orient(g, completion);
// pos.position = ['api']    — current batch (nodes whose artifacts are missing)
// pos.level = 1             — batch index
// pos.produces = ['src/api.ts']
```

## CLI

```
roadmap make <spec>  --note "..."   Create DAG from spec
roadmap orient       --note "..."   Current position + produces/consumes
roadmap advance [id] --note "..."   Complete node (run validators) or advance batch

roadmap dag insert   --note "..."   Insert node
roadmap dag remove   --note "..."   Remove node (--cascade)
roadmap dag modify   --note "..."   Modify node fields
roadmap dag log                     Mutation history

roadmap spec plan    --note "..."   Spec planning (--gallery, select, status)

roadmap api [<cmd>]                 JSON Schema for any command
roadmap help                        Usage
```

All commands except `help`, `orient`, and `api` require `--note "reason"`. Output is JSON. Every invocation records to `.roadmap/trail.jsonl` (local) and `~/.roadmap/trail.jsonl` (global).

## Core API

| Function | Purpose |
|----------|---------|
| `define(g)` | Validate structure — cycles, init/term, id consistency |
| `verify(g)` | Contract check — every consumed artifact produced by a predecessor |
| `check(g)` | Reachability — every node reachable from init and can reach term |
| `orient(g, completion)` | Batch position from completion state |
| `advanceBatch(g, completion)` | Validate current batch done, return next |
| `parallelOrder(g)` | Topological sort into concurrent batches |
| `reconcile(g, fwd, bwd)` | Find where forward.produces meets backward.consumes |
| `merge(g1, g2, conns)` | Combine DAGs at join points |
| `branch(g, from)` | Extract subgraph |

## Entry Points

```typescript
import roadmap from 'roadmap';                    // Full API
import { define, verify, orient } from 'roadmap/protocol';  // Core operations
import { getBrief, advance } from 'roadmap/agent';          // Sealed agent API
import { CheckpointManager } from 'roadmap/recovery';       // Snapshots + rollback
import { validateBatch } from 'roadmap/validation';          // Batch validation
```

## Validation Stack

| Layer | Catches | When |
|-------|---------|------|
| `tsc --noEmit` | Invalid dep refs, missing nodes | Compile time |
| `define(g)` | Cycles, missing init/term | Import time |
| `verify(g)` | Consumed artifact not produced upstream | On demand |
| `check(g)` | Disconnected/unreachable nodes | On demand |
| `orient(g, completion)` | Batch position from filesystem | Session start |
| `advanceBatch(g, completion)` | All artifacts materialized | Batch transition |

## Enforcement

- **Pre-commit hooks** — branch discipline (no direct commits to main), gitsafe denylist, DAG edit authorization, TypeScript compilation
- **Gitsafe** — file access control with denylist + size limits, multi-repo support
- **DAG intake pipeline** — all DAGs must originate from spec pipeline, blocks manual construction
- **DAG mutations** — insert/remove/modify with provenance receipts logged to `.roadmap/mutations.jsonl`

## Self-Compounding Stack

The system includes a self-teaching pipeline:

- **Metrics extraction** — SLO tracking from trail data, zero-instrumentation retroactive analysis
- **Spec-conformance** — Given/When/Then scenario validation against DAG nodes
- **LLM feedback** — metrics + audit trail converted to improvement prompts
- **Distributed DAG** — multi-repo DAG merge + cross-project pattern mining
- **Checkpoint runtime** — snapshots at each node, decision recording, rollback

## Testing

```bash
npm test        # 261 tests across 15 suites
npx tsc --noEmit  # type check
```

## License

Proprietary. All rights reserved.
