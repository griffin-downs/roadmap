# roadmap

DAG expansion protocol library. Any repo can depend on this package, define a `roadmap.ts`, and get typed governance over its development plan.

## What This Is

`src/protocol.ts` — one file, six functions:

```
define(g)               validate structure (cycles, init/term)
verify(g)               validate contracts (consumes satisfied by predecessors)
check(g)                termination (every node reachable init→term)
reconcile(g, fwd, bwd)  find where forward.produces meets backward.consumes
order(g)                implementation sequence (topo sort)
orient(g, exists)       agent reorientation (position from filesystem state)
```

Two types:

```
NodeSpec<TAll, TSelf>   { id, desc, produces, consumes, deps }
Graph<T>                { id, desc, init, term, nodes: { [N in T]: NodeSpec<T, N> } }
```

## How A Consumer Repo Uses It

### 1. Install

```
pnpm add ../roadmap   # or npm install, git dependency, etc.
```

### 2. Write roadmap.ts

```typescript
import { define, graph } from 'roadmap/protocol';

export default define(graph({
  id: 'my-project',
  desc: 'what this project is',
  init: 'scaffold',
  term: 'deployed',
  nodes: {
    scaffold: { id: 'scaffold', desc: 'what exists now', produces: [...], consumes: [], deps: [] },
    deployed: { id: 'deployed', desc: 'what should exist', produces: [], consumes: [], deps: [] },
  },
}));
```

Two disconnected nodes. The gap is the project. Expand by adding nodes between them until `check()` returns `done: true`.

### 3. Orient agents

```typescript
import { orient } from 'roadmap/protocol';
import roadmap from './roadmap.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const o = orient(roadmap, (a) => existsSync(join(repoRoot, a)));
// o.position  — current node (first with missing artifacts)
// o.produces  — files to create
// o.consumes  — files available from predecessors
// o.remaining — how many nodes left
```

The agent creates the files in `produces`, commits, re-runs `orient()`, advances.

### 4. Type exports

```typescript
export type NodeId = keyof typeof roadmap.nodes;
export type Artifact = (typeof roadmap.nodes)[NodeId]['produces'][number];
```

Any file that references a phase or artifact imports these types. The roadmap becomes the project schema — invalid references are compile errors.

## Expansion Protocol

For building new roadmaps or expanding existing ones, read `SKILL.md`. The protocol:

1. Define INIT (what exists) and TERM (what should exist)
2. EXPAND backward from TERM — what must exist immediately before it?
3. FLIP — EXPAND forward from INIT — what can we build first?
4. RECONCILE — `reconcile(g, fwd, bwd)` finds where produces meets consumes
5. RECURSE into gaps — sub-expand coarse nodes at finer granularity
6. `define(g)` after every change, `check(g)` to test termination
7. Done when `check()` returns `{ done: true }` and `verify()` returns `[]`

## Validation Stack

| Layer | What it catches | When |
|-------|----------------|------|
| `tsc --noEmit` | Invalid dep refs, missing nodes, id/key mismatch | Compile time |
| `define(g)` | Cycles, missing init/term | Import time |
| `verify(g)` | Consumed artifact not produced by predecessor | On demand |
| `check(g)` | Disconnected nodes, unreachable from init or term | On demand |
| `orient(g, exists)` | Position from filesystem — which artifacts actually exist | Session start |

## This Repo's Own Roadmap

`roadmap.ts` is self-referential — this library describes its own construction. Run it:

```
node --experimental-strip-types roadmap.ts   # validates + self-checks
tsc --noEmit                                 # type-checks
```
