# Sub-Entry-Points Design

**Date**: 2026-02-25
**Phase**: 10 (sub-entry-points-spec node)
**Consumes**: docs/decisions/api-audit.md

---

## Problem

Single `.` barrel (index.ts) loads all four domains on any import. Consumer importing
`define` from `'roadmap'` transitively loads: recovery (CheckpointManager, AuditTrail),
agent (getBrief, handoff), versioning (migrations, schema loaders). ~2,116 LOC for a
core-only consumer; 69% overhead.

Secondary bug: `src/protocol.ts` lines 659–661 re-export versioning inside the core
protocol module. This breaks `roadmap/protocol`'s tree-shaking.

---

## New Entry Point Map

```json
{
  ".":             "src/index.ts",
  "./protocol":    "src/protocol.ts",
  "./recovery":    "src/index.recovery.ts",
  "./validation":  "src/index.validation.ts",
  "./versioning":  "src/index.versioning.ts",
  "./agent":       "src/index.agent.ts"
}
```

### `./protocol` — `src/protocol.ts`

Core DAG functions only. Remove versioning re-exports (lines 659–661).

**Exports**:
```ts
// Functions
define, graph, check, verify, order, orient, reconcile,
merge, branch, analyze, modify, modifyAndCommit
// Types
Graph, NodeSpec, Connection, Gap, Orientation,
ModifyAnalysis, ModificationRecord
```

**Does NOT export**: validateNode, validateGraph (→ `./validation`), versioning (→ `./versioning`)

---

### `./validation` — `src/index.validation.ts`

Proof-of-delivery: async validation rules + execution. Separated from core because
`validateNode`/`validateGraph` are async and file-system coupled (unlike the pure
synchronous DAG functions).

**Exports**:
```ts
// Functions
validateNode, validateGraph
// Types
ValidationRule, ValidationCheck, ValidationResult
```

---

### `./recovery` — `src/index.recovery.ts`

Checkpoint/restore + audit trail. Used by agents that need crash recovery and
append-only evidence logs. Separate from core to avoid loading fs-heavy modules
in lightweight consumers.

**Exports**:
```ts
// Classes
CheckpointManager, AuditTrail
// Types
GitState, Checkpoint, AuditEntry, AuditSession
```

---

### `./versioning` — `src/index.versioning.ts`

Migration and backward-compatibility tooling. Used during upgrades, not during
normal operation.

**Exports**:
```ts
// Functions
loadDAG, loadDAGFromFile, checkCompatibility, migrateDAG
// Classes
DAGMigrator
// Types
VersionInfo, CompatibilityResult
```

---

### `./agent` — `src/index.agent.ts`

Sealed APIs for regent-style executors. Agents use these; they cannot reach the DAG
directly. Separate entry enforces the boundary: agent code doesn't import core functions.

**Exports**:
```ts
// Functions
getBrief, loadHandoffJournal, checkpoint, advance, verifyBootstrapSignature
// Types
Brief, FinalHandoff, InterimHandoff
```

---

### `.` — `src/index.ts` (unchanged barrel)

Re-exports all four sub-entries. Existing consumers importing from `'roadmap'` continue
to work without changes. No breaking change.

---

## Bundle Impact

| Consumer pattern | Entry | Loaded LOC (est.) |
|-----------------|-------|------------------|
| Core DAG only | `./protocol` | ~661 |
| Validation only | `./validation` | ~661 + ~50 |
| Recovery only | `./recovery` | ~347 |
| Agent only | `./agent` | ~389 |
| Versioning only | `./versioning` | ~299 |
| Full | `.` | ~2,116 |

---

## Execution Plan

1. **Create** `src/index.recovery.ts` — re-exports from checkpoint.ts, checkpoint.schema.ts, audit.ts
2. **Create** `src/index.validation.ts` — re-exports validateNode, validateGraph, validation types from protocol.ts
3. **Create** `src/index.versioning.ts` — re-exports from versioning.ts, versioning.schema.ts, migrations.ts
4. **Create** `src/index.agent.ts` — re-exports from brief.ts, handoff.ts
5. **Modify** `src/protocol.ts` — delete versioning re-exports (lines 659–661)
6. **Modify** `package.json` — add four new entries to `exports` field
7. **Create** `tests/api-tree-shaking.test.ts` — import from each sub-entry, verify symbols resolve

---

## Invariants

- `.` barrel is not modified (backward compat)
- `src/index.ts` re-exports everything (stays as aggregate)
- No code moves between files — only re-export wrappers created
- `tsc --noEmit` must pass after all changes
- All 161+ existing tests must continue passing
