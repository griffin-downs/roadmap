# reconcile() gap.missing semantics

## Decision

`gap.missing` = artifacts in `bn.consumes` not satisfied by `fn.produces` (unmet demand only).

Not: symmetric difference of `fn.produces` and `bn.consumes`.

## Bug

`protocol.ts` lines 171-175 (pre-fix):

```typescript
const m = [
  ...fn.produces.filter(p => !bn.consumes.includes(p)),  // surplus produces — WRONG
  ...bn.consumes.filter(c => !fn.produces.includes(c)),   // unmet consumes — correct
];
```

`fn.produces.filter(p => !bn.consumes.includes(p))` gives surplus forward produces —
artifacts F provides that B does not need. These are not actionable work items.

## Fix

```typescript
const m = bn.consumes.filter(c => !fn.produces.includes(c));
```

`missing[i]` is an artifact a bridging node must produce to close the gap. Surplus forward
produces are already available — inserting them into `missing` generates phantom work items
that do not close the actual gap, and inflates the expansion step with false requirements.

## Invariant

`gap.missing` ⊆ `bn.consumes`. Every entry is an unmet consume. No entry is a surplus produce.

Proven by: `tests/adv-reconcile.test.ts` — core contract tests specify this behavior and
fail against the pre-fix implementation.
