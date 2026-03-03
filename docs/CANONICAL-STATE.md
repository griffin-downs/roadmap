# Canonical Execution State — API & Integration

**Source of Truth** for distributed roadmap execution. Single authoritative manifest that all validators depend on.

## Overview

The Canonical Execution State reconstructs what actually happened during execution:
- Which nodes completed
- When they completed
- What artifacts they produced
- Were there conflicts? How were they resolved?
- Is the state coherent (no impossible transitions)?

All downstream validators (audit-recovery, state-coherence, performance-hardening) query this manifest instead of the filesystem, ensuring they work from the same ground truth.

## Data Flow

```
.roadmap/trail.jsonl (invocation log)
        │
        ├─→ [load-trail] ──→ trail-raw.json
        │
        ├─→ [validate-trail-entries] ──→ trail-validated.json
        │
        ├─→ [detect-worktree-mutations] ──→ worktree-mutations.json
        │
        ├─→ [resolve-conflicts] ──→ conflict-resolution.json
        │
        ├─→ [reconstruct-state-timeline] ──→ state-timeline.json
        │
        ├─→ [validate-state-coherence] ──→ coherence-validation.json
        │
        ├─→ [extract-completed-nodes] ──→ node-completion-manifest.json
        │
        └─→ [produce-canonical-state] ──→ **canonical-state.json** ✅
```

## Manifest Format

File: `.roadmap/metaflow/canonical/canonical-state.json`

```json
{
  "timestamp": "2026-03-03T10:15:00Z",
  "trailChecksum": "sha256:...",
  "completedNodes": [
    {
      "id": "load-trail",
      "completedAt": "2026-03-03T09:00:00Z",
      "produces": [
        ".roadmap/metaflow/canonical/trail-raw.json"
      ]
    }
  ],
  "conflictsResolved": 3,
  "stateCoherent": true,
  "stateTimelinePath": ".roadmap/metaflow/canonical/state-timeline.json",
  "coherenceReportPath": ".roadmap/metaflow/canonical/coherence-validation.json",
  "validationErrors": []
}
```

## Query Interface

Access via `CanonicalStateProvider`:

```typescript
import { CanonicalStateProvider } from 'src/lib/metaflow/canonical-state-provider.ts';

const provider = new CanonicalStateProvider(process.cwd());

// Node completion queries
provider.isNodeComplete('node-id'): boolean
provider.getCompletionTimestamp('node-id'): Date | null
provider.getNodeProduces('node-id'): string[]

// Artifact queries
provider.artifactExists('path'): boolean

// State validation
provider.isStateCoherent(): boolean
provider.hasValidState(): boolean
provider.getValidationErrors(): string[]

// Statistics
provider.getCompletedCount(): number
provider.getConflictsResolved(): number
```

## Testing

18 passing tests covering:
- Node completion queries
- Artifact queries
- State validation rules
- Conflict resolution
- Missing manifest handling

Run: `npx vitest run tests/metaflow/canonical-state.test.ts`

## Integration

All downstream validators depend on canonical state:
- **audit-recovery-flow**: Check hasValidState() before audit
- **state-coherence-flow**: Validate using coherence report
- **performance-hardening-flow**: Query artifact existence

**Related**: `.roadmap/metaflow/canonical/DESIGN.md`, `.roadmap/flows/canonical-execution-state-flow.json`

---

**Status**: Stable
**Last Updated**: 2026-03-03
