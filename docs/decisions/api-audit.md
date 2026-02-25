# API Audit: Surface, Usage, and Tree-Shaking Opportunities

**Date**: 2026-02-25
**Phase**: 10 (api-audit node)
**Scope**: `src/index.ts`, `src/protocol.ts`, `package.json#exports`

---

## Current State

### Entry Points

```json
{
  ".":         "src/index.ts",
  "./protocol": "src/protocol.ts"
}
```

Two entry points. `.` is a barrel over everything. `./protocol` is the core module — but
it silently re-exports versioning too (lines 659–661 of protocol.ts). This is a structural
bug: consumers importing from `roadmap/protocol` get recovery/migration code bundled in.

### Export Inventory

**Functions exported from `.` (index.ts)**

| Symbol | Domain | Usage count | Notes |
|--------|--------|-------------|-------|
| `define` | core | 155 | highest frequency |
| `check` | core | 155 | highest frequency |
| `graph` | core | 148 | |
| `orient` | core | 74 | |
| `verify` | core | 61 | |
| `merge` | core | 62 | |
| `branch` | core | 42 | |
| `order` | core | 34 | |
| `reconcile` | core | 19 | |
| `modify` | core | 11 | |
| `validateNode` | core | 4 | |
| `validateGraph` | core | 3 | convenience wrapper over validateNode |
| `analyze` | core | 1 | expected companion to modify(); low standalone use |
| `modifyAndCommit` | core | 1 | async + git side effects; edge of stable API |
| `CheckpointManager` | recovery | 4 | |
| `AuditTrail` | recovery | 9 | |
| `getBrief` | agent | 18 | |
| `checkpoint` | agent | 73 | high (agent workflow) |
| `advance` | agent | 33 | |
| `loadHandoffJournal` | agent | 4 | |
| `verifyBootstrapSignature` | agent | 5 | |
| `loadDAG` | versioning | 15 | |
| `checkCompatibility` | versioning | 10 | |
| `migrateDAG` | versioning | 6 | |
| `DAGMigrator` | versioning | 3 | |
| `loadDAGFromFile` | versioning | 1 | nearly unused |

**Types exported from `.` (index.ts)**: 18 types across four domains — all live in protocol.ts,
checkpoint.schema.ts, versioning.schema.ts, brief.ts, audit.ts.

---

## Problems

### 1. protocol.ts re-exports versioning (structural bug)

`protocol.ts` lines 659–661:
```ts
export { loadDAG, loadDAGFromFile } from './versioning.ts';
export { checkCompatibility, migrateDAG } from './versioning.schema.ts';
export { DAGMigrator } from './migrations.ts';
```

These belong to the versioning domain, not the core protocol. Consumers who import
`from 'roadmap/protocol'` to get `define/check/orient` incidentally pull in versioning
(migrations.ts = 76 LOC, versioning.ts = 86 LOC, versioning.schema.ts = 137 LOC).
No bundler can tree-shake this — the re-exports are side-effectful module loads.

### 2. Single fat barrel at `.`

`src/index.ts` exposes all four domains from one entry. A consumer wanting only core
DAG validation (~661 LOC from protocol.ts) currently imports from `.` and transitively
loads: checkpoint.ts (120), checkpoint.schema.ts (88), audit.ts (159), brief.ts (185),
handoff.ts (204), versioning.ts (86), versioning.schema.ts (137), migrations.ts (76).

Total: ~2,116 LOC loaded for a consumer that needs only core. Reduction potential: ~69%.

### 3. Nine src files inaccessible but not enforced

These files exist in `src/` but are not exported from `index.ts`:
- `auto-integrate.ts`, `build-discoverer.ts`, `dependency-resolver.ts`
- `generate-bootstrap.ts`, `git-state.schema.ts`, `orient-cached.ts`
- `project-detector.ts`, `project-metadata.schema.ts`

Direct path imports (`from '../src/auto-integrate.ts'`) still work. Internal-only by
convention, not by enforcement. No `package.json#exports` entry means no encapsulation.

### 4. Low-usage / edge-of-API symbols

`modifyAndCommit` (1 usage): async, writes to disk, commits to git. Not a pure function.
Should not be in the same entry as `define`. Caller must reason about git state.

`loadDAGFromFile` (1 usage), `analyze` (1 usage): candidate for removal or internal-only
demotion in next version.

---

## Recommendations

### A. Remove versioning re-exports from protocol.ts (immediate)

Delete lines 659–661 from `src/protocol.ts`. Versioning is already exported from
`src/index.ts` directly; the re-export from protocol.ts is redundant and harmful.

### B. Add sub-entry-points to package.json

Split the barrel into four typed sub-entries:

```json
{
  ".":             "src/index.ts",
  "./protocol":    "src/protocol.ts",
  "./recovery":    "src/recovery.ts",
  "./agent":       "src/agent.ts",
  "./versioning":  "src/versioning-index.ts"
}
```

Each sub-entry is a minimal re-export file. `.` re-exports all four.

**Domain mapping**:

| Entry | Exports | Source files |
|-------|---------|--------------|
| `./protocol` | define, graph, check, verify, order, orient, reconcile, merge, branch, analyze, modify, modifyAndCommit, validateNode, validateGraph + 10 types | protocol.ts |
| `./recovery` | CheckpointManager, AuditTrail + GitState, Checkpoint, AuditEntry, AuditSession | checkpoint.ts, checkpoint.schema.ts, audit.ts |
| `./agent` | getBrief, loadHandoffJournal, checkpoint, advance, verifyBootstrapSignature + Brief, FinalHandoff, InterimHandoff | brief.ts, handoff.ts |
| `./versioning` | loadDAG, loadDAGFromFile, checkCompatibility, migrateDAG, DAGMigrator + VersionInfo, CompatibilityResult | versioning.ts, versioning.schema.ts, migrations.ts |

### C. Import migration for tests

Tests currently import direct paths (`from '../src/protocol.ts'`). After sub-entry-points
ship, tests should migrate to `from 'roadmap/protocol'`. Existing `consumer-integration.test.ts`
already uses this pattern correctly.

### D. Candidate for removal (v0.5.0)

- `loadDAGFromFile`: 1 usage, functionality covered by `loadDAG`. Mark deprecated.
- `analyze`: 1 external usage; primarily an internal pre-check for `modify`. Consider
  unexporting and calling internally from `modify()` itself.

---

## Decision

Proceed with phases in order:
1. **api-audit** (this doc) — complete
2. **sub-entry-points-spec** — design the three new re-export files
3. **api-refactor** — create recovery.ts, agent.ts, versioning-index.ts; remove versioning re-exports from protocol.ts
4. **package-exports-update** — update package.json exports field
5. **api-test-migration** — update test imports, verify tree-shaking

No breaking changes to the `.` barrel. Sub-entry-points are additive.
