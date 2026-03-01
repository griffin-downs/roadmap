# Specification: dir-refactor-002

**Title**: Directory Consolidation + Tree-Shaking (Phase 2)

**Scope**: Achieve perfect directory structure (all dirs ≤10 files) AND eliminate dead code

---

## Acceptance Scenarios

### Scenario 1: src/lib Root Consolidation

**Given** src/lib has 57 root files (56 in utilities bucket)
**When** consolidation is complete
**Then**:
- src/lib root has ≤10 files (core protocol, core, config, index.ts)
- All 56 utility files are moved to semantic groupings:
  - src/lib/tools/: build, generation, compilation utilities
  - src/lib/utilities/: general helpers, algorithms, formatters
  - src/lib/strategies/, src/lib/sgk/: specialization (already organized)
- Barrel exports in src/lib/index.ts maintain backward compatibility
- All imports resolve correctly
- Tests pass: `npm run test -- tests/ --run`

### Scenario 2: src Root Consolidation

**Given** src has 26 root files
**When** consolidation is complete
**Then**:
- src root has ≤10 files (main entry points, core config, package.json references)
- CLI files consolidated to src/cli/
- Test utilities consolidated to tests/
- IO utilities consolidated to src/io/
- Protocol core files stay at src/
- All imports updated
- No breaking changes to public API

### Scenario 3: Tree-Shaking - Unused Exports

**Given** codebase has ~2200 exports across modules
**When** tree-shaking analysis complete
**Then**:
- All top-level exports are either:
  - Used by at least one external module, OR
  - Part of public API surface (intentional library exports)
- Zero unused exports remain
- Re-exports cleaned up (no chains like `export { X } from './other'` → `export { X }`)
- Barrel exports only contain active exports

### Scenario 4: Tree-Shaking - Dead Functions

**Given** modules contain unused internal functions
**When** dead code removal is complete
**Then**:
- Zero functions exist that are:
  - Never called within module, AND
  - Never exported, AND
  - Not test utilities
- Unreachable code paths removed
- Conditional logic that never executes removed

### Scenario 5: Tree-Shaking - Stale Modules

**Given** unknown number of modules with zero external usage
**When** usage analysis complete
**Then**:
- Any module identified as "stale" (zero imports from other files) is either:
  - Re-evaluated as legitimately unused and removed, OR
  - Documented as intentional (e.g., entry points, test fixtures)
- No module is silently unused
- All genuinely unused modules removed

### Scenario 6: Import Cleanup Post-Consolidation

**Given** consolidation moves files and creates new import targets
**When** import cleanup is complete
**Then**:
- Zero broken imports (all resolution errors fixed)
- Zero circular dependencies introduced
- Import paths simplified where possible
- ~900 import statements in codebase are all valid
- tsc clean with no resolution errors

### Scenario 7: Full Test Coverage After Tree-Shaking

**Given** 279 tests passing before tree-shaking
**When** dead code removal is complete
**Then**:
- All 279+ tests still pass
- No test failures due to removed code
- No test behavior changes
- Coverage metrics maintained or improved

### Scenario 8: Zero Breaking Changes to Public API

**Given** roadmap library is consumed by downstream projects
**When** consolidation and tree-shaking are complete
**Then**:
- Public exports still accessible via barrel exports
- Old import paths still work (backward compatible)
- New import paths available but optional
- No changes to exported type signatures
- No changes to exported function contracts

---

## Acceptance Criteria (Definition of Done)

### Phase 2A: Consolidation
- [ ] All 56 utility files moved from src/lib root
- [ ] src/lib root: ≤10 files verified
- [ ] src root: ≤10 files verified
- [ ] All subdirectories: ≤10 files verified
- [ ] Barrel exports updated (src/lib/index.ts, src/lib/tools/index.ts, etc.)
- [ ] All imports updated (95+ files touched)
- [ ] Tests pass: npm run test -- tests/ --run
- [ ] tsc clean: npm run tsc -- --noEmit
- [ ] Git history clean: atomic commits per domain consolidation

### Phase 2B: Tree-Shaking
- [ ] Unused export analysis complete (report generated)
- [ ] Dead function analysis complete (report generated)
- [ ] Stale module analysis complete (report generated)
- [ ] All unused code removed (or documented as intentional)
- [ ] Circular dependency check passed (zero cycles found)
- [ ] Import cleanup complete (zero broken imports)
- [ ] Tests pass: npm run test -- tests/ --run
- [ ] tsc clean: npm run tsc -- --noEmit
- [ ] Code quality metrics improved (LOC reduction, export cleanup)

### Phase 2 Complete
- [ ] All directories ≤10 files (100% compliance)
- [ ] Dead code eliminated (<1% stale code remaining)
- [ ] All constraints from Phase 1 maintained
- [ ] Public API stable (no breaking changes)
- [ ] Documentation updated (STRUCTURE.md revised)

---

## Technical Constraints

**Consolidation Rules**:
- Use `git mv` for file moves (preserve history)
- Update all import statements (use find-and-replace + verification)
- Create barrel exports in each new directory
- Update main src/lib/index.ts with new imports

**Tree-Shaking Rules**:
- Only remove code that is truly unreachable
- Keep all code in:
  - tests/ (test utilities, fixtures)
  - public API surface (exported from index.ts)
  - validation/verification (used for gates)
- Document why each module is kept if usage is unclear
- Do NOT remove code without understanding the reason

**Safety**:
- Zero breaking changes to downstream consumers
- All tests must pass
- tsc must be clean
- Commits must be atomic and revertible

---

## Integration Points

### Depends On
- dir-refactor-001 (Phase 1): baseline 15 domains, 6 file splits, all files ≤400 lines

### Produces
- Consolidated directory structure (all dirs ≤10 files)
- Tree-shaking analysis report
- Dead code removal (LOC reduction)
- Updated STRUCTURE.md documentation

### Enables Future Work
- Further modularization (if needed)
- Public API stabilization
- Performance optimization (dead code removal helps)

---

## Metrics & Reporting

**Consolidation Metrics**:
- Files moved per domain
- Subdirectories created
- Barrel exports added
- Imports updated

**Tree-Shaking Metrics**:
- Lines of code removed
- Unused exports eliminated
- Dead functions removed
- Stale modules deleted
- Circular dependencies found/fixed

**Quality Metrics**:
- Test passage rate (should be 100%)
- TypeScript error count (should be 0)
- Coverage changes
- Performance impact
