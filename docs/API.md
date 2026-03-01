# Public API Reference (v0.7.0+)

## Core Functions

### define(g: Graph)
Define and validate DAG structure.

```typescript
import { define } from 'src/lib';

const g = {
  id: 'my-dag',
  init: 'start',
  term: 'end',
  nodes: { /* ... */ }
};

define(g); // Validates structure
```

### verify(g: Graph)
Verify contracts (consumes satisfied by producers).

### check(g: Graph)
Verify termination (all nodes reachable init→term).

### orient(g: Graph, exists: FileExists)
Get current batch position.

## Types

All types imported from `src/lib/schema.ts`:

```typescript
import { ValidatorRule, AuditSchema } from 'src/lib';
```

**Avoid:**
- Deprecated imports from `audit-schema.ts`, `perf-schema.ts`
- Internal APIs (`src/lib/internal/*`)

See `MODULE-STRUCTURE.md` for detailed guidance.
