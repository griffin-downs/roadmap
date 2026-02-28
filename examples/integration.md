# Example Integration: Dependency Convergence

Demonstrates how independent nodes (task-a, task-b) converge at a downstream integration point — the fundamental DAG coordination pattern.

## The Convergence Problem

Two parallel nodes produce independent artifacts:

```
task-a → examples/task-a.md   (node structure)
task-b → examples/task-b.md   (parallel execution)
```

An integration node consumes both:

```typescript
const integration: NodeSpec<All, 'integration'> = {
  id: 'integration',
  desc: 'Verify both subsystems work together',
  produces: ['examples/integration.md'],
  consumes: ['examples/task-a.md', 'examples/task-b.md'],
  deps: ['task-a', 'task-b'],
  validate: [
    { type: 'artifact-exists', target: 'examples/integration.md' },
  ],
  idempotent: true,
};
```

`consumes` declares the contract. `deps` declares the ordering. `verify(g)` enforces that every consumed artifact is produced by a predecessor.

## How the DAG Coordinates

No orchestrator sends a "both ready" signal. The DAG structure is the signal:

```
orient(g, fileExists(root))
```

1. `parallelOrder(g)` computes batches: `[..., [task-a, task-b], [integration], ...]`
2. `orient()` walks batches until it finds one with missing artifacts
3. While task-a or task-b artifacts are missing → position stays at their batch
4. Once both exist → position advances to integration's batch

The gate is structural, not temporal. It doesn't matter which finished first.

## Contract Verification

`verify(g)` checks at DAG definition time:

```
verify(g)
  → For each node n:
    → For each artifact in n.consumes:
      → Does some predecessor of n produce it?
  → Returns: VerifyViolation[] (empty = valid)
```

If task-a were removed but integration still consumed `task-a.md`, `verify()` would catch it:

```
[{
  node: 'integration',
  artifact: 'examples/task-a.md',
  message: 'consumed but not produced by any predecessor'
}]
```

This is compile-time safety for data flow.

## Batch Advancement

```typescript
// Before: task-b still in progress
const pos1 = orient(g, exists);
// pos1.position = ['task-a', 'task-b'], level = 1

// After: both complete
const pos2 = orient(g, exists);
// pos2.position = ['integration'], level = 2

// Explicit advancement with validation
const adv = advanceBatch(g, exists);
// Validates L1 complete, returns L2 orientation
```

`advanceBatch()` adds a validation layer — it won't advance if any node in the current batch has failing validators. `orient()` only checks artifact existence; `advanceBatch()` runs the full validation stack.

## Propagation Pattern

For real integration nodes, use `launch-check` or `build-produces` validators on the terminal node, then propagate:

```bash
roadmap propagate
```

This back-derives `artifact-exists` on upstream producers. The integration node's validators flow backward through the DAG, ensuring every intermediate artifact is checked without manual bookkeeping.

## Pattern Summary

| Step | Mechanism | Catches |
|---|---|---|
| Define | `deps` + `consumes` | Missing edges, wrong order |
| Verify | `verify(g)` | Broken contracts (consume without produce) |
| Execute | `orient()` batch gating | Premature advancement |
| Advance | `advanceBatch()` | Incomplete validation |
| Propagate | `propagate` | Missing intermediate checks |

Convergence is not a feature — it's a consequence of declaring contracts and letting the DAG enforce them.
