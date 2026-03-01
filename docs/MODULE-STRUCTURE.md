# Module Structure (v0.7.0+)

## Public API (`src/lib/index.ts`)

Export only:
- `define(g)` — Define DAG
- `verify(g)` — Verify contracts
- `check(g)` — Verify termination
- `orient(g, exists)` — Batch position
- `ValidatorRule` — Type
- `AuditSchema` — Type

**Do not rely on:**
- `CheckpointManager` (internal)
- `RecoveryUtils` (internal)
- Anything in `src/lib/internal/*`

## Internal Modules (`src/lib/internal/*`)

- `recovery.ts` — Checkpoint/restore (internal use only)
- `validation-internals.ts` — Validator implementations
- `error-recovery.ts` — Error handling utilities

**Import pattern:**
```typescript
// ✓ Public API
import { define, ValidatorRule } from 'src/lib';

// ✗ Internal (don't do this)
import { CheckpointManager } from 'src/lib/internal';
```

## Test Organization

```
tests/
├── unit/
│   ├── fast/       ← Quick validation tests (~100ms)
│   └── slow/       ← Slow unit tests (rare)
├── integration/
│   ├── fast/       ← API contract tests (~500ms)
│   └── slow/       ← Full scenarios (~5s+)
└── e2e/
    └── ...         ← End-to-end scenarios
```

Run CI with:
- `npm run test:fast` — unit + integration-fast (~1s)
- `npm run test:slow` — integration-slow + e2e (~30s)
