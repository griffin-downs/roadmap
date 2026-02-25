# SKILL.md — Protocol Reference

## Functions (6 core + 2 composition)

```typescript
define(g)              // validate: cycles? init/term exist?
check(g)               // validate: init→term reachable? no orphans?
verify(g)              // validate: consumes satisfied by predecessors?
order(g)               // topo sort: execution sequence
orient(g, exists)      // find position: first incomplete node
reconcile(g, fwd, bwd) // find gaps: where produces meets consumes
merge(g1, g2, conn)    // combine: at join points, validate merged
branch(g, from)        // extract: subgraph from node to term
```

## Types
```typescript
interface NodeSpec<T> {
  id: T;                    // must match key
  desc: string;
  produces: string[];       // artifacts created
  consumes: string[];       // artifacts needed
  deps: T[];                // dependencies
}

interface Graph<T> {
  id: string;
  init: T; term: T;         // start/end nodes
  nodes: Record<T, NodeSpec<T>>;
}

interface Orientation {
  position: string;         // current node
  done: string[];           // finished
  produces: string[];       // to create
  consumes: string[];       // to use
  remaining: string[];      // future
}
```

## Expansion Protocol

1. **Define INIT + TERM**: what exists vs. should exist
2. **Expand forward**: nodes from INIT toward TERM
3. **Expand backward**: nodes from TERM back to fill gaps
4. **Reconcile**: `reconcile(g, fwd, bwd)` finds join points
5. **Validate**: define() + check() + verify() all pass, gaps empty
6. **Repeat**: for each phase, same protocol

## Quick examples

### Linear roadmap
```typescript
const g = define(graph({
  init: 'a', term: 'd',
  nodes: {
    a: { produces: ['a.txt'], deps: [] },
    b: { produces: ['b.txt'], deps: ['a'] },
    c: { produces: ['c.txt'], deps: ['b'] },
    d: { produces: [], deps: ['c'] },
  }
}));

const pos = orient(g, f => existsSync(f));
// pos.position: which node is incomplete
```

### Multi-phase with merge
```typescript
const merged = merge(g1, g2, [
  { g1Node: 'term', g2Node: 'init', artifact: 'x.json' }
]);
```

### Parallel variant with branch
```typescript
const variant = branch(g, 'midpoint');
// variant.init = 'midpoint' (was g.init)
// variant.term unchanged
```

## Session workflow
```typescript
check(g) && verify(g)          // valid?
const pos = orient(g, exists)  // current node
// create pos.produces
orient(g, exists)              // advance
```

## Adversarial specs

Write tests that **fail on current implementation, pass after fix**. See SPEC.md.

Pattern:
- Core contract: catches the bug
- Boundary: regression guards
- File: `tests/adv-{feature}.test.ts` (~100 lines)

## Design principles
- Type-safe (tsc validates)
- Acyclic (define checks)
- Connected (check validates)
- Sound (verify checks)
- Incremental (order + orient)

## See also
- README.md: what/why/how + examples
- docs/decisions/: detailed design records
- .briefing/{node}.json: node-level guidance
