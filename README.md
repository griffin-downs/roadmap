# roadmap

**DAG expansion protocol library: autonomous execution + recovery + versioning**

Enables any project to define a typed, verifiable development roadmap. Agents boot, orient to current position, create artifacts, validate, and advance — with automatic checkpointing for crash recovery.

## What this is

## Entry Points

| Import | Use when |
|--------|----------|
| `roadmap` | Full API — DAG ops + recovery + versioning + predicates + errors |
| `roadmap/protocol` | Core only — define, verify, orient, merge, branch, reconcile, parallelOrder |
| `roadmap/agent` | Sealed agent API — getBrief, advance, checkpoint (no DAG introspection) |
| `roadmap/recovery` | CheckpointManager + AuditTrail |
| `roadmap/validation` | validateNode, validateGraph |
| `roadmap/versioning` | loadDAG, migration, compatibility |

See `docs/MODULE-MAP.md` for full file-by-file breakdown.

Core functions:

```typescript
define(g)               // Validate DAG (acyclic, connected, contracts sound)
check(g)                // Test reachability (init → term)
verify(g)               // Test consumes satisfied by predecessors
order(g)                // Execution sequence (topological sort)
parallelOrder(g)        // Batched topo sort — concurrent execution groups
orient(g, exists)       // Find position (first incomplete node)
reconcile(g, fwd, bwd)  // Find gaps (where produces meets consumes)
merge(g1, g2, conn)     // Combine DAGs at join points
branch(g, from)         // Extract subgraph
fileExists(root)        // Curried predicate for orient()
```

Key types:

```typescript
NodeSpec<T>     // { id, desc, produces, consumes, deps, validate, idempotent }
Graph<T>        // { id, init, term, nodes, version, protocolVersion }
Orientation     // { position, done, produces, consumes, remaining }
RoadmapError    // { code: ErrorCode, context: { fix, entry, ... } }
```

## Quick start

### 1. Define your roadmap

```typescript
import { define, graph } from 'roadmap/protocol';

export default define(graph({
  id: 'my-project',
  desc: 'What I'm building',
  version: '1.0.0',
  protocolVersion: '0.3.0',
  init: 'init',
  term: 'deployed',
  nodes: {
    init: {
      id: 'init',
      desc: 'What exists now',
      produces: ['src/index.ts', 'package.json'],
      consumes: [],
      deps: [],
      validate: [
        { type: 'artifact-exists', target: 'src/index.ts' },
        { type: 'artifact-exists', target: 'package.json' },
      ],
      idempotent: true,  // Deterministic; re-runnable
    },
    build: {
      id: 'build',
      desc: 'Compile + test',
      produces: ['dist/index.js', 'dist/index.d.ts'],
      consumes: ['src/index.ts', 'package.json'],
      deps: ['init'],
      validate: [
        { type: 'artifact-exists', target: 'dist/index.js' },
      ],
      idempotent: true,
    },
    deployed: {
      id: 'deployed',
      desc: 'Ready for production',
      produces: [],
      consumes: ['dist/index.js', 'dist/index.d.ts'],
      deps: ['build'],
      validate: [],
      idempotent: false,  // Manual: requires approval
    },
  },
}));
```

### 2. Check your roadmap

```bash
# Validation
tsc --noEmit                # Type errors? Caught here
node --experimental-strip-types roadmap.ts
# ERROR: DAG not connected
# Orphans: [...]
```

### 3. Orient your agent

```typescript
import { orient, loadDAG } from 'roadmap/protocol';
import roadmap from './roadmap.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const dag = await loadDAG(roadmap);  // Auto-migrates if needed

import { fileExists } from 'roadmap';

const position = orient(dag, fileExists(process.cwd()));

console.log(`Current: ${position.position}`);
console.log(`Create:  ${position.produces.join(', ')}`);
console.log(`Use:     ${position.consumes.join(', ')}`);
console.log(`Done:    ${position.remaining.length} nodes left`);
```

### 4. Checkpoint & restore

```typescript
import { CheckpointManager } from 'roadmap/protocol';
import { AuditTrail } from 'roadmap/protocol';

const checkpoint = new CheckpointManager(repoRoot);
const audit = new AuditTrail(repoRoot);

// On boot: restore from checkpoint
const restore = await checkpoint.restore();
if (restore) {
  console.log(`Restoring from ${restore.checkpoint.id}`);
  position = restore.position;  // Skip completed phases
}

// After node completion
await checkpoint.saveCheckpoint({
  position: node.id,
  artifacts: createdFiles,
  agent: 'my-agent',
  duration: elapsed,
  success: true,
});

// End session
audit.endSession();
```

## Core patterns

### Idempotency guarantee

**All nodes declare**: `idempotent: true | false`

```typescript
idempotent: true   // Code/test/docs generation — re-runnable
idempotent: false  // Manual approval, deployment — one-time
```

**Recovery**: if idempotent node's artifacts vanish after validation passes, re-run it.
Validation proves correctness; idempotency proves reproducibility.

### Multi-repo coordination

Merge DAGs at artifact boundaries:

```typescript
const merged = merge(roadmapDAG, fusionDAG, [
  { g1Node: 'roadmap-term', g2Node: 'fusion-init', artifact: 'src/protocol.ts' }
]);

const position = orient(merged, existsAcrossRepos);
// Single DAG spans both repos; agents advance both in sync
```

### Versioning

Define DAG version + protocol version:

```typescript
{
  version: '1.0.0',           // Your DAG
  protocolVersion: '0.3.0',   // Protocol
  ...
}
```

Load with auto-migration:

```typescript
const dag = await loadDAG(rawDAG, { autoMigrate: true });
// 0.1.0 → 0.2.0 → 0.3.0 automatically
// Or: explicit error with migration plan
```

## Architecture

### Validation stack

| Layer | Checks | When |
|-------|--------|------|
| `tsc --noEmit` | Type-safety (invalid deps, missing nodes) | Compile |
| `define(g)` | Cycles, init/term | Import |
| `check(g)` | Reachability (orphans, unreachable) | On demand |
| `verify(g)` | Contracts (consumes satisfied) | On demand |
| `orient(g, exists)` | Filesystem state (position) | Session start |

### Execution flow

```
Agent boots
  ↓
Load DAG + auto-migrate (loadDAG)
  ↓
Check compatibility (checkCompatibility)
  ↓
Try restore from checkpoint
  ├─ YES → skip to checkpoint position
  └─ NO → orient fresh (find first incomplete)
  ↓
Loop: create produces → validate → commit → checkpoint → audit
  ↓
Advance to next incomplete node
  ↓
When position === term: done
```

### Recovery

**Idempotent nodes** (code, tests, docs):
- Crash mid-phase → restart
- Checkpoint saved state
- Latest checkpoint has artifacts + hashes
- Verify hashes match → restore position (skip re-running)
- If hashes missing → re-run node (idempotent guarantee)

**Non-idempotent nodes** (manual approval, deployment):
- Can't be skipped on recovery
- Restore fails if trying to skip → manual intervention required
- Audit trail shows what was attempted

## Examples

### Generate consumer bootstrap

```bash
npx roadmap generate-bootstrap \
  --project my-project \
  --desc "TypeScript library" \
  --init src/index.ts,package.json \
  --term dist/index.js,dist/index.d.ts
# Outputs: roadmap.ts, boot.ts, .roadmap/head.json
```

### Multi-repo example

See `example/multi-repo-merge.ts` for roadmap + cockpit coordination.

### Autonomous agent

See `.claude/agents/roadmap-agent-template.md` for full integration pattern.

## Testing

**Adversarial specs**: all features tested via adversarial test patterns that fail on current code, pass after fix.

```bash
npm test                    # 225 tests pass (28 test files)
npm test -- tests/adv-*.ts  # Adversarial suite
```

## API reference

### `define(graph): Graph`
Validate graph structure. Throws if cycles or missing init/term.

### `check(graph): { done, orphans }`
Verify reachability. Returns true if init reaches term, all nodes reachable.

### `verify(graph): Error[]`
Check contracts. For each node, verify all consumes are produced by predecessors.

### `order(graph): string[]`
Topological sort. Returns execution sequence.

### `orient(graph, exists): Orientation`
Find position. Returns current node (first incomplete), produces, consumes, remaining.

### `reconcile(graph, fwd, bwd): Gap[]`
Find gaps between forward + backward expansion phases.

### `merge(g1, g2, connections): Graph`
Combine DAGs at specified join points. Returns merged graph.

### `loadDAG(rawDAG, options): Graph`
Load with versioning. Auto-migrates if needed (0.1 → 0.3).

## Constraints

- **Acyclic**: DAG must have no cycles
- **Connected**: init must reach term
- **Sound**: all consumes satisfied by predecessors
- **Versioned**: all DAGs carry protocol version
- **Idempotent**: all nodes declare recovery semantics

## Roadmap layers

| Layer | Nodes | Focus |
|-------|-------|-------|
| 0: Protocol | 8 | Core + adversarial hardening |
| 1: DAG ops | 7 | Merge, branch |
| 2: Execution | 5 | Bootstrap, orientation |
| 3: Recovery | 6 | Checkpoint, restore, audit |
| 4: Agent | 4 | Regent template, integration |
| 5: Versioning | 4 | Version compatibility, migrations |

**Total**: 99 nodes (12 phases), 225 tests, v0.4.0.

---

**Next**: Apply to real projects. See `docs/decisions/` for design rationale.
