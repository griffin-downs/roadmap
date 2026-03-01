# src/lib Consolidation Targets

## High Priority (Low Risk, High Value)

### 1. Unify recovery/checkpoint/audit modules
- **Files to merge**: recovery.ts, checkpoint.ts, audit-trail.ts → audit.ts
- **Rationale**: All handle state tracking; strong semantic unity
- **Lines saved**: ~180
- **Risk**: Low (internal module, well-tested)

### 2. Reduce validation exports
- **Current exports**: validateNode, validateGraph, validateType, validatePath, validateRef, validateSchema
- **Keep public**: validateNode, validateGraph
- **Move internal**: validateType, validatePath, validateRef, validateSchema
- **Lines saved**: ~60 (reduction in public surface)
- **Risk**: Low (only 2 public functions)

### 3. Consolidate type definitions
- **Scatter**: NodeSpec (protocol.ts), Graph (protocol.ts), ValidationRule (validation.ts), Orientation (protocol.ts), etc.
- **Target**: src/lib/types.ts (single source of truth)
- **Affected imports**: ~45 files
- **Risk**: Medium (wide impact, but mechanical change)

### 4. Remove dead code
- **deprecated**: oldParallelOrder, deprecatedValidatorCheck, legacyMigration, v04to05Compat
- **Archive to**: .archive/lib-deprecated/
- **Risk**: Low (unused)

## Medium Priority (High Value, High Risk)

### 5. Reorganize by concern
- **Target structure**:
  - src/lib/core/ (define, verify, check, orient — protocol.ts)
  - src/lib/agent/ (executor, brief, spawn-plan)
  - src/lib/recovery/ (audit.ts, versioning, migrations)
  - src/lib/internal/ (helpers, non-public APIs)
- **Impact**: 213 files → organized into concerns
- **Risk**: High (structural change, many import paths)
- **Value**: 98 points (major clarity improvement)

## Execution Order

1. Consolidate recovery modules (independent)
2. Reduce validation exports (independent)
3. Consolidate types (independent, unlocks #5)
4. Remove dead code (independent)
5. Reorganize by concern (depends on 1-4)

All of L02 can run in parallel except final #5.
