# API Usage Metrics

**Generated**: 2026-02-25 (phase 10 / api-audit)
**Method**: grep counts across `tests/`, `src/`, `roadmap.ts` excluding comment lines and export declarations

---

## Symbol Frequency

| Rank | Symbol | Count | Domain | Tier |
|------|--------|-------|--------|------|
| 1 | `define` | 155 | core | hot |
| 2 | `check` | 155 | core | hot |
| 3 | `graph` | 148 | core | hot |
| 4 | `orient` | 74 | core | hot |
| 5 | `checkpoint` | 73 | agent | hot |
| 6 | `merge` | 62 | core | warm |
| 7 | `verify` | 61 | core | warm |
| 8 | `branch` | 42 | core | warm |
| 9 | `order` | 34 | core | warm |
| 10 | `advance` | 33 | agent | warm |
| 11 | `reconcile` | 19 | core | warm |
| 12 | `getBrief` | 18 | agent | warm |
| 13 | `loadDAG` | 15 | versioning | cool |
| 14 | `modify` | 11 | core | cool |
| 15 | `checkCompatibility` | 10 | versioning | cool |
| 16 | `AuditTrail` | 9 | recovery | cool |
| 17 | `migrateDAG` | 6 | versioning | cool |
| 18 | `verifyBootstrapSignature` | 5 | agent | cold |
| 19 | `validateNode` | 4 | core | cold |
| 20 | `loadHandoffJournal` | 4 | agent | cold |
| 21 | `CheckpointManager` | 4 | recovery | cold |
| 22 | `validateGraph` | 3 | core | cold |
| 23 | `DAGMigrator` | 3 | versioning | cold |
| 24 | `modifyAndCommit` | 1 | core | cold |
| 25 | `loadDAGFromFile` | 1 | versioning | cold |
| 26 | `analyze` | 1 | core | cold |

Tiers: **hot** ≥70 · **warm** 15–69 · **cool** 5–14 · **cold** <5

---

## Source File LOC

| File | LOC | Exported from index.ts | Notes |
|------|-----|----------------------|-------|
| `protocol.ts` | 661 | yes (core functions + re-exports) | largest file; contains versioning re-exports (bug) |
| `handoff.ts` | 204 | yes (agent domain) | |
| `generate-bootstrap.ts` | 198 | no | internal-only |
| `brief.ts` | 185 | yes (agent domain) | |
| `project-metadata.schema.ts` | 128 | no | internal-only |
| `versioning.schema.ts` | 137 | yes (versioning) | |
| `checkpoint.ts` | 120 | yes (recovery) | |
| `audit.ts` | 159 | yes (recovery) | |
| `git-state.schema.ts` | 80 | no | internal-only |
| `index.ts` | 84 | — | barrel |
| `versioning.ts` | 86 | yes (versioning) | |
| `orient-cached.ts` | 76 | no | internal-only |
| `migrations.ts` | 76 | yes (versioning) | |
| `checkpoint.schema.ts` | 88 | yes (types only) | |
| `build-discoverer.ts` | 58 | no | internal-only |
| `dependency-resolver.ts` | 46 | no | internal-only |
| `auto-integrate.ts` | 43 | no | internal-only |
| `project-detector.ts` | 30 | no | internal-only |
| **Total** | **2,459** | | |

---

## Tree-Shaking Impact

### Current (single `.` barrel)

Consumer imports `define` from `'roadmap'`:
- Loads: index.ts → protocol.ts + versioning.ts + versioning.schema.ts + migrations.ts + checkpoint.ts + checkpoint.schema.ts + audit.ts + brief.ts + handoff.ts
- Estimated bundle contribution: **~2,116 LOC** (all exported files minus index.ts itself)

### After sub-entry-points

Consumer imports `define` from `'roadmap/protocol'`:
- Loads: protocol.ts (versioning re-exports removed)
- Bundle contribution: **~661 LOC**
- Reduction: **~69%**

| Consumer pattern | Before | After | Reduction |
|-----------------|--------|-------|-----------|
| Core only (`define`, `orient`, etc.) | ~2,116 | ~661 | 69% |
| Core + agent | ~2,116 | ~1,050 | 50% |
| Core + versioning | ~2,116 | ~960 | 55% |
| Full library | ~2,116 | ~2,116 | 0% (same) |

---

## Entry Point Usage (tests)

| Entry | Import pattern | Files using it |
|-------|---------------|----------------|
| `roadmap/protocol` | `from 'roadmap/protocol'` | 1 test (consumer-integration.test.ts) |
| direct src path | `from '../src/protocol.ts'` | 16 test files |
| `roadmap` (`.`) | not used in tests | — |

All internal tests bypass the package entry points and import source files directly.
The `roadmap/protocol` entry is used only in consumer-facing tests (`consumer-integration.test.ts`).
Test migration to sub-entry-points will verify the new entries work correctly.

---

## Internal-Only Files (Not in index.ts)

| File | Purpose | Risk if made public |
|------|---------|-------------------|
| `auto-integrate.ts` | `roadmap integrate` CLI | planIntegration() would be stable API |
| `build-discoverer.ts` | project-type heuristics | brittle, repo-layout dependent |
| `generate-bootstrap.ts` | agent template generator | output format not stable |
| `git-state.schema.ts` | git-state cache r/w | format changes frequently |
| `orient-cached.ts` | O(1) orient via cache | depends on git-state format |
| `project-detector.ts` | project-type detection | brittle |
| `project-metadata.schema.ts` | metadata schema types | too specific |

Recommendation: keep all nine internal-only. Enforce via `package.json#exports` after sub-entry-points land (any import not in exports map will throw at runtime in Node 12+).
