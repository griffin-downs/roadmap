# Reconcile Gap: Missing Semantics

## Problem

The `reconcile()` function in `src/protocol.ts` must identify which artifacts a bridging node must **produce** to connect two DAG sequences. A "gap" exists when `forward.produces` does not fully satisfy `backward.consumes`.

The key insight: **missing artifacts are those that `backward` requires but `forward` does not provide**. Surplus artifacts that `forward` produces (but `backward` does not need) are not work items — they are already available.

### Bug

Early implementations computed `missing` as the symmetric difference of `produces ∪ consumes`:

```typescript
// WRONG: includes surplus produces
const missing = [
  ...fn.produces.filter(p => !bn.consumes.includes(p)),  // surplus
  ...bn.consumes.filter(c => !fn.produces.includes(c))   // unmet (correct part)
];
```

This conflates two distinct sets:
- **Unmet demand**: artifacts `backward` needs that `forward` cannot provide
- **Surplus supply**: artifacts `forward` provides that `backward` does not need

Only unmet demand generates actionable work. Surplus produces are already supplied.

## Solution

`missing` must contain only unmet demand:

```typescript
const missing = bn.consumes.filter(c => !fn.produces.includes(c));
```

This is the set of artifacts a new intermediate node must produce to close the gap.

## Validation

Property-based tests in `tests/adv-reconcile.test.ts` verify:

1. **Surplus produces do not appear in missing** — a forward node that produces ['x'] and a backward that consumes ['y'] must have missing = ['y'] only, not ['x', 'y'].

2. **Missing length equals unmet consume count** — if forward produces ['p','q'] and backward consumes ['r','s'], missing.length = 2, not 4.

3. **No forward produces** — if forward produces nothing, missing = backward.consumes exactly.

4. **Semantics invariant** — every entry in missing is actionable: a bridging node must produce it. Surplus produces violate this.

5. **Regression guards** — full overlap (no gap), surplus produces with partial overlap, and between.nodes identification all remain correct.

## Impact

- **Correct:** `Gap.missing` now accurately represents bridging work, enabling reliable DAG expansion.
- **Scoped:** Only affects `reconcile()` return values; internal `connections` logic (shared artifacts) unaffected.
- **Testable:** All 8 adversarial tests pass.

## References

- `src/protocol.ts:335` — implementation (`bnArtifacts.filter(c => !fn.produces.includes(c))`)
- `tests/adv-reconcile.test.ts` — adversarial spec and test suite (8 tests, all passing)
- `src/protocol.ts:317-342` — full `reconcile()` function
