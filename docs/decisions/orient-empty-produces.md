# orient() empty-produces node semantics

## Decision

A node with `produces: []` has no filesystem artifacts to create. When reached in topo
order (all deps satisfied), it is trivially done. `orient()` marks it done and advances.

## Bug

`protocol.ts` line 228 (pre-fix):

```typescript
if (node.produces.length && node.produces.every(exists)) {
```

`node.produces.length` evaluates to `0` (falsy) for empty-produces nodes — short-circuits
before `every(exists)`. The node is never marked done. `orient()` returns it as `position`
and stalls permanently, regardless of filesystem state or upstream completion.

## Fix

```typescript
if (!node.produces.length || node.produces.every(exists)) {
```

`!node.produces.length` is true for empty-produces nodes — marks them done unconditionally.
For nodes with produces, falls through to `every(exists)` as before.

## Fallthrough invariant

When all nodes pass the done check (including `g.term` which also has `produces: []`),
`g.term` must be excluded from `done` before the fallthrough return:

```typescript
return { position: g.term, done: done.filter(id => id !== g.term), produces: [], consumes: [], remaining: [] };
```

This preserves the partition invariant: `done ++ [position] ++ remaining = order(g)`.
Without this filter, `g.term` appears in both `done` and `position`.

## Semantics

Empty-produces nodes are gate/coordination nodes — checkpoints, phase boundaries, session
entries. They represent state that is verified or confirmed rather than produced. When deps
are satisfied, the gate is passed. `orient()` must not stall at a gate it cannot unblock.

Proven by: `tests/adv-orient.test.ts` + `tests/adv-property.test.ts` — core contract and
property tests specify this behavior and fail against the pre-fix implementation.
