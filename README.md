# roadmap — DAG governance for development

Typed DAG specification for project phases. A roadmap is a directed acyclic graph where:
- **Nodes** = phases (produce artifacts, consume prerequisites, have dependencies)
- **Edges** = dependencies (A → B means B depends on A completing)
- **INIT** = current state
- **TERM** = verified intent

## Install

```bash
npm install roadmap
```

## Quick start

```typescript
import { define, graph, orient, check, verify } from 'roadmap/protocol';
import { existsSync } from 'node:fs';

const roadmap = define(graph({
  id: 'cli',
  init: 'scaffold',
  term: 'released',
  nodes: {
    scaffold: { produces: ['src/main.ts'], consumes: [], deps: [] },
    features: { produces: ['src/cli.ts'], consumes: ['src/main.ts'], deps: ['scaffold'] },
    tests:    { produces: ['tests/'], consumes: ['src/cli.ts'], deps: ['features'] },
    released: { produces: [], consumes: ['tests/', 'src/'], deps: ['tests'] },
  },
}));

// Validate
check(roadmap);   // connected?
verify(roadmap);  // contracts satisfied?

// Find current position
const pos = orient(roadmap, f => existsSync(f));
console.log(`Build: ${pos.produces}`);

// Create artifacts, then:
const next = orient(roadmap, f => existsSync(f));
// Position advances
```

## Why

**Problem**: Prompts drift. Adding features shifts priorities. Unclear phases.

**Solution**: A DAG is executable specification. Typing enforces structure (tsc), validation ensures consistency (define/check/verify), position-finding guides execution (orient).

## API

**6 core functions**:
- `define(g)` — validate structure
- `check(g)` — validate connectivity
- `verify(g)` — validate contracts
- `order(g)` — topological sort
- `orient(g, exists)` — find current position
- `reconcile(g, fwd, bwd)` — gap analysis

**2 composition functions**:
- `merge(g1, g2, connections)` — combine DAGs
- `branch(g, fromNode)` — extract variant

## Examples

### Multi-phase
```typescript
const p1 = define(graph({ init: 'a', term: 'b', nodes: {...} }));
const p2 = define(graph({ init: 'c', term: 'd', nodes: {...} }));
const full = merge(p1, p2, [{ g1Node: 'b', g2Node: 'c', artifact: 'x' }]);
// full.init = 'a', full.term = 'd'
```

### Parallel variants
```typescript
const main = define(graph({...}));
const branch = branch(main, 'midpoint');
// Work independently, then merge back
```

## Type safety

TypeScript enforces:
- Node IDs match keys
- Dependencies reference valid nodes
- No forward references

```typescript
// Compile error: 'unknown' not in graph
define(graph({ nodes: { a: { deps: ['unknown'] } } }));
```

## Further reading

- **SKILL.md**: API reference, expansion protocol, recipes
- **docs/decisions/**: design rationale (4 records)
- **SPEC.md**: adversarial spec system
- **docs/test-organization.md**: how to read tests
- **.briefing/{node}.json**: node-level guidance
- **example/**: real consumer project

## Governance

The roadmap IS the governance mechanism:
- **Types** enforce structure
- **Validation** ensures consistency
- **Position** guides execution
- **No configuration**, no hidden state, no implicit dependencies

## License

MIT
