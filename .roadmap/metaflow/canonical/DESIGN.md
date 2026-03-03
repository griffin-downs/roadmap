# Canonical Execution State Flow — Design Document

**Authority**: Source of truth reconstruction for distributed roadmap execution
**Date**: 2026-03-03
**Status**: Design phase

## Overview

The Canonical Execution State Flow reconstructs the authoritative system state from the execution trail (`trail.jsonl`), resolves worktree conflicts, validates state coherence, and produces the source of truth manifest that all downstream validators depend on.

## Problem Statement

In parallel execution with multiple worktrees:
- Multiple branches may modify the same artifacts
- Filesystem state != canonical state (some edits uncommitted)
- Trail.jsonl records the order of invocations, not always which artifacts were committed
- Validators need a single source of truth to compare against

**Gap**: No authoritative reconstruction of execution state. Each validator independently guesses "what is the real state?"

## Solution Architecture

### Phase 1: Input Validation (Steps 1-2)
- Load trail.jsonl (all invocations)
- Validate schemas, temporal ordering, detect gaps
- Output: `trail-validated.json` (canonical input record)

### Phase 2: Conflict Detection & Resolution (Steps 3-4)
- Scan git log per worktree branch: which files touched when
- For each file modified by multiple branches: apply merge strategy (last-write-wins + canonical timestamp)
- Output: `conflict-resolution.json` (who owns each artifact)

### Phase 3: State Reconstruction (Steps 5-7)
- Replay trail invocation-by-invocation, applying conflict resolutions
- At each checkpoint: snapshot current state (which nodes completed, what artifacts exist)
- Validate state transitions are legal (no impossible orderings)
- Extract final completion manifest (nodes done, handoffs, timestamps)
- Output: `state-timeline.json`, `coherence-validation.json`, `node-completion-manifest.json`

### Phase 4: Authority (Step 8)
- Aggregate timeline + coherence + completion into single manifest
- This is the source of truth: `canonical-state.json`
- All downstream validators query this, not the filesystem

### Phase 5: Integration (Steps 9-11)
- Implement canonical state provider API (query interface)
- Unit + integration tests (trail reconstruction, conflict resolution, coherence)
- Documentation (data format, query interface, integration points)

## Conflict Resolution Strategy

**Last-Write-Wins (with timestamp authority)**:
- For each artifact modified by multiple worktrees:
  1. Collect all commit timestamps across branches
  2. Winner: branch with latest commit timestamp
  3. Tiebreaker: branch merged to main first (canonical ordering)
  4. Record decision in `conflict-resolution.json` with rationale

**Immutable Trail**: Trail.jsonl is the source of invocation order. Conflicts resolved at artifact level, not invocation level.

## State Coherence Validation Rules

1. **No backward transitions**: If node N completed at time T, it cannot be incomplete at T+1
2. **Consumes satisfied**: If node A's produces are consumed by B, and B completed, then A's produces must exist
3. **Temporal ordering**: If A → B (A depends on B), then B's completion timestamp < A's completion timestamp
4. **No cycles**: No node depends on itself transitively

## Manifest Format (canonical-state.json)

```json
{
  "timestamp": "2026-03-03T10:15:00Z",
  "trail_checksum": "sha256:...",
  "completed_nodes": [
    { "id": "node-a", "completed_at": "2026-03-03T09:00:00Z", "produces": [...] },
    ...
  ],
  "conflicts_resolved": 3,
  "state_coherent": true,
  "state_timeline_path": ".roadmap/metaflow/canonical/state-timeline.json",
  "coherence_report_path": ".roadmap/metaflow/canonical/coherence-validation.json",
  "validation_errors": []
}
```

## Query Interface (canonical-state-provider.ts)

```typescript
// Get authoritative completion status for a node
isNodeComplete(nodeId: string): boolean

// Get when a node completed
getCompletionTimestamp(nodeId: string): Date | null

// Get all produces from a node
getNodeProduces(nodeId: string): string[]

// Check if artifact is canonical (not in conflict)
isArtifactCanonical(path: string): boolean

// Get conflict resolution for an artifact
getConflictResolution(path: string): { winner: string; timestamp: Date; rationale: string } | null

// Validate consistency: is current state reachable from trail?
validateStateCoherence(): { valid: boolean; violations: string[] }
```

## Dependencies

- Consumes: `.roadmap/trail.jsonl`, `.roadmap/flows/canonical-execution-state-flow.json`
- Produces: Canonical state manifest + provider API
- Integration: All downstream validators (audit-recovery, state-coherence, performance-hardening, verify-iteration-ready)

## Success Criteria

1. Trail reconstruction matches git log (audit trail reconciliation)
2. No impossible state transitions detected
3. Conflicts resolved deterministically (same input → same output)
4. Manifest queryable by all validators
5. 100% test coverage of conflict resolution + state coherence logic

## Edge Cases

- **Orphaned commits**: Commits on branches that were deleted/not merged
  - Action: Ignore (not in canonical trail)
- **Concurrent mutations to same file**: Multiple branches touch same artifact
  - Action: Use conflict resolution strategy (last-write-wins + timestamp)
- **Trail entries without corresponding artifacts**: Invocation logged but file not committed
  - Action: Record in coherence-validation.json as "incomplete transition"
- **State regression**: Later state missing artifact that was present earlier
  - Action: Validate flag; investigates cause (deletion, conflict, corruption)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Trail corruption | Low | High | Validate schemas, checksums; detect impossible orderings |
| Conflict resolution incorrect | Low | High | Audit trail, double-check merge strategy, tests |
| Performance regression | Medium | Medium | Profile trail reconstruction; cache if > 1000 invocations |
| State explosion (too many checkpoints) | Low | Medium | Compress timeline; store deltas instead of full snapshots |

## Timeline

- **Design** (this phase): 1 node
- **Implementation**: 8 nodes (load → validate → detect → resolve → reconstruct → coherence → extract → produce)
- **Integration**: 1 node (provider API)
- **Testing**: 1 node (unit + integration)
- **Documentation**: 1 node
- **Ready**: 1 node (validation gate)

**Critical Path**: 12 nodes serial (light parallelism at coherence+extraction phase)

---

## References

- Flow spec: `.roadmap/flows/canonical-execution-state-flow.json`
- Trail format: `.roadmap/trail.jsonl` (JSONL with invocation records)
- Roadmap protocol: `CLAUDE.md` section "Roadmap Protocol"
- State coherence rules: Derived from DAG structure constraints (acyclic, consumes satisfied by predecessors)
