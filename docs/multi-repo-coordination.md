# Multi-repo coordination via merge()

## Problem

Real projects span multiple repositories:
- **cockpit**: dashboard + agent runtime
- **roadmap**: DAG expansion protocol (this repo)
- **fusion**: orchestration engine
- **build-tools**: common build infra

Each has its own roadmap. But they're interdependent — fusion needs roadmap output, cockpit needs fusion events, etc.

Current state: each repo's roadmap is independent. No way to express "my deployment depends on another repo's release" or "we coordinate across 3 repos".

## Solution: DAG merging at publish boundaries

Use `merge(g1, g2, connections)` to combine roadmaps at artifact boundaries:

```
roadmap.ts produces → fusion consumes
(join point)
          ↓
merge(roadmap_dag, fusion_dag, [
  { g1Node: 'phase-6-term', g2Node: 'init', artifact: 'src/protocol.ts' }
])
          ↓
combined_dag → represents full release coordination
```

## Architecture

### Single-repo execution (current)
```
Agent boots in repo A
  orient() → position
  create produces
  commit
  advance → next node
Done when position === term
```

### Multi-repo execution (new)
```
Orchestrator boots in repo A
  load roadmap_A, roadmap_B
  merge(A, B, connections) → combined_dag
  combined_dag.init = A.init
  combined_dag.term = B.term (or any specified terminal)

  Agent loop:
    orient(combined_dag, exists_across_repos)
    create produces (may span repos)
    commit to repo(s)
    advance

Done when position === combined_dag.term
```

### Topology

Example: roadmap → fusion → cockpit chain

```
ROADMAP DAG          FUSION DAG          COCKPIT DAG
────────────         ──────────          ──────────
init                 init
  ↓                    ↓
[phases]             [phases]
  ↓                    ↓
roadmap-term  ----→  fusion-init  ----→  cockpit-init
              (src/                       (src/orchestration.ts)
              protocol.ts)
                       ↓                    ↓
                    [phases]            [phases]
                       ↓                    ↓
                   fusion-term    ----→ cockpit-term
                                    (fusion-events.ts)
```

Merged graph:
- `init` = roadmap.init
- `term` = cockpit.term (or roadmap-term for "just protocol release")
- **Linear chain**: roadmap → fusion → cockpit
- Each repo's phases independent (no cross-dependencies within phase)

## merge() semantics for multi-repo

### Pre-merge validation
```typescript
// Each roadmap must be standalone valid
verify(roadmap_dag) → []  // no errors
verify(fusion_dag) → []   // no errors
verify(cockpit_dag) → []
```

### Merging process
```typescript
const merged_1 = merge(roadmap_dag, fusion_dag, [
  { g1Node: 'roadmap-term', g2Node: 'fusion-init', artifact: 'src/protocol.ts' }
]);

const merged_2 = merge(merged_1, cockpit_dag, [
  { g1Node: 'fusion-term', g2Node: 'cockpit-init', artifact: 'src/orchestration.ts' }
]);

// Result: single DAG with 47 nodes (roadmap) + N nodes (fusion) + M nodes (cockpit)
// verify(merged_2) → [] (all contracts satisfied across repos)
```

### After merge, all DAG operations work transparently
```typescript
check(merged_dag)      // entire chain connected? ✓
verify(merged_dag)     // all consumes satisfied? ✓
order(merged_dag)      // execution sequence across repos
orient(merged_dag, exists_multi_repo)  // which repo? which node?
```

## Integration: orchestrator pattern

```typescript
// Orchestrator (top-level coordinator)
import { merge, orient, check, verify } from 'roadmap/protocol';
import roadmap_dag from '../roadmap/roadmap.ts';
import fusion_dag from '../fusion/roadmap.ts';
import cockpit_dag from '../cockpit/roadmap.ts';

const roadmapDir = '../roadmap';
const fusionDir = '../fusion';
const cockpitDir = '../cockpit';

// Load all roadmaps
const combined = merge(
  merge(roadmap_dag, fusion_dag, [
    { g1Node: 'roadmap-term', g2Node: 'fusion-init', artifact: 'src/protocol.ts' }
  ]),
  cockpit_dag,
  [{ g1Node: 'fusion-term', g2Node: 'cockpit-init', artifact: 'src/orchestration.ts' }]
);

// Multi-repo existence check
const existsInMultiRepo = (artifact: string) => {
  for (const dir of [roadmapDir, fusionDir, cockpitDir]) {
    if (existsSync(join(dir, artifact))) return true;
  }
  return false;
};

// Coordinate execution
const position = orient(combined, existsInMultiRepo);
console.log(`Position: ${position.position} (${position.remaining.length} nodes remaining)`);
console.log(`Produces in: ${findRepo(position.produces[0])}`);
console.log(`Consumes from: ${position.consumes.map(a => `${findRepo(a)}:${a}`)}`);

// Agents spawn per repo + phase
const repo = findRepo(position.produces[0]);
const agent = spawnAgent(repo, position.position);
await agent.execute(position.produces);
await agent.commit();
```

## Cross-repo artifact visibility

Problem: `orient(combined, exists)` needs to know about artifacts across repos.

Solution: **artifact registry**

```typescript
// Each agent writes a manifest on commit
~/.regent/manifest.json (per repo)
{
  "repo": "roadmap",
  "phase": "bootstrap-gen-impl",
  "artifacts": [
    { "path": "src/generate-bootstrap.ts", "hash": "sha256:..." },
    { "path": "example/consumer-bootstrap.ts", "hash": "sha256:..." }
  ]
}

// Orchestrator reads all manifests
const registry = await readMultiRepoRegistry([roadmapDir, fusionDir, cockpitDir]);
const existsInMultiRepo = (artifact) => registry.has(artifact);
```

Alternatively, **direct filesystem probe** (simple, O(N) git ops):

```typescript
const existsInMultiRepo = (artifact) => {
  for (const dir of [roadmapDir, fusionDir, cockpitDir]) {
    if (existsSync(join(dir, artifact))) return true;
  }
  return false;
};
// Agent checks multiple repos; if found in any, it exists.
```

## Constraints + invariants

### Node ID uniqueness
Caller pre-qualifies: if fusionDir and cockpitDir both have `init`, caller renames before merge.

```typescript
// Option A: rename at source
cockpit_dag.nodes['cockpit-init'] = cockpit_dag.nodes['init'];
delete cockpit_dag.nodes['init'];
cockpit_dag.init = 'cockpit-init';

// Option B: merge accepts renaming
merge(fusion_dag, cockpit_dag, [
  { g1Node: 'init', g2Node: 'init', renameTo: 'cockpit-init' }  // future
]);
```

### Acyclicity preserved
Connections must not create cycles. `merge()` + `define()` catch this.

### Single terminal node
Merged DAG has single `term`. For "release roadmap A only":

```typescript
merge(roadmap_dag, fusion_dag, connections, 'roadmap-init', 'roadmap-term');
// Result: term = 'roadmap-term', no fusion phases included
```

## Real-world scenario: coordinated release

Team wants to release v0.2.0 across all three repos simultaneously.

```
Current state:
  roadmap: phase-4.5-term (governance ready)
  fusion: phase-4-term (orchestration ready)
  cockpit: bootstrap-gen-impl (agent templating)

Goal: all three at term by coordinating via merged DAG

Steps:
1. Identify next artifacts from each
2. Create merged DAG
3. Agents spawn in each repo
4. When all nodes complete → all at term
5. Release together (single npm publish, docker push, etc.)
```

## Testing multi-repo scenarios

See `tests/multi-repo.test.ts` for:
- Merge two independent DAGs
- Orient in merged DAG (artifacts split across dirs)
- Parallel agents in different repos
- Cross-repo dependency satisfaction (node in A depends on artifact from B)

## Next: multi-repo merge example

See `example/multi-repo-merge.ts` for runnable code.
