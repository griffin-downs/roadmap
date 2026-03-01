# dir-refactor-002: Directory Consolidation + Tree-Shaking

## Problem Statement

After **dir-refactor-001** (2026-03-01), the codebase achieved:
- ✅ All code files ≤400 lines
- ✅ 15 semantic domains organized
- ⚠️ 56 utility files still in `src/lib/` root (should be ≤10)
- ⚠️ 26 files in `src/` root (should be ≤10)
- ❓ Unknown dead code burden (unused exports, unreachable functions, stale modules)

**Two related problems**:
1. **Structural**: Perfect directory constraint (all dirs ≤10 files) not yet achieved
2. **Code quality**: Dead code accumulation reduces maintainability and increases cognitive load

## Goal

Achieve **"perfect" directory structure** (all dirs ≤10 files) AND **eliminate dead code** through:

1. **Directory consolidation**: Move 56 utility files from src/lib root into logical groupings (tools, utilities, helpers)
2. **Tree-shaking**: Identify and remove unused exports, functions, types, and modules
3. **Import optimization**: Clean up and rationalize import chains post-consolidation

## Success Criteria

### Structural (Directory Consolidation)
- ✅ Every directory has ≤10 files (no exceptions)
- ✅ src/lib root: ≤10 files (currently 57)
- ✅ src root: ≤10 files (currently 26)
- ✅ All subdirectories: ≤10 files each
- ✅ Semantic coherence: Related files grouped together

### Code Quality (Tree-Shaking)
- ✅ No unused top-level exports (verify with import analysis)
- ✅ No dead functions (remove unreachable code)
- ✅ No stale modules (files with zero external usage)
- ✅ No circular dependencies (maintain DAG properties)
- ✅ No broken imports post-consolidation
- ✅ Test suite passes (279+ tests)

### Integration
- ✅ tsc clean (zero TypeScript errors)
- ✅ All barrel exports working
- ✅ Backward compatibility maintained where possible
- ✅ Clean git history (atomic commits per consolidation)

## Key Constraints

- **No removal of public API surface** (exports used by consumers of roadmap library)
- **No breaking changes** to import paths (barrel exports shield downstream)
- **No performance regression** (tree-shaking should improve perf)
- **100% test passage** (no behavior changes, only dead code removal)
- **Safe refactoring** (changes committed atomically, easy rollback)

## Scope

### Phase 2 Consolidation (Directory)

**src/lib root (56 files) → reorganized into**:
- `src/lib/tools/` — build, generation, compile-related
- `src/lib/utilities/` — general utilities, helpers
- Remaining specialized domains (if not yet consolidated)

**src root (26 files) → reorganized into**:
- Move CLI components to `src/cli/` (already exists, expand if needed)
- Move test helpers to `tests/` (already exists)
- Move IO to `src/io/` (already exists)
- Reduce root to ≤10 essential files

### Tree-Shaking (Code Quality)

**Identify and remove**:
- Unused top-level exports in any module
- Dead functions (never called, only defined)
- Stale modules (zero external usage)
- Broken imports (from consolidation)
- Redundant re-exports

**Keep**:
- All public API surface (exports intended for library consumers)
- All test utilities and fixtures
- All validation and verification code
- All documentation helpers

## Related Work

**Previous phase**: dir-refactor-001 (2026-03-01)
- 15 semantic domains created
- 6 large files split
- All code files ≤400 lines
- 52% reduction in src/lib root files (109→57)

**Metrics from Phase 1**:
- 279 tests passing
- ~2200 exports across codebase
- ~900 import statements across files
- ~140 files moved, 6 split, 18 barrel exports created

## Execution Strategy

**Two-phase execution**:
1. **Phase 2A (Consolidation)**: Directory reorganization (5-7 parallel tasks)
2. **Phase 2B (Tree-shaking)**: Dead code removal and import cleanup (3-4 sequential tasks)

Rationale: Consolidation creates stable import targets; tree-shaking validates correctness.

## Out of Scope

- Adding new features
- Refactoring internal logic
- Changing test structure (tests follow code structure)
- Upgrading dependencies
- Performance optimization beyond dead code removal

## Success Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| src/lib root files | 57 | ≤10 | Phase 2A |
| src root files | 26 | ≤10 | Phase 2A |
| All dirs ≤10 files | 85% | 100% | Phase 2A |
| Unused exports | TBD | 0 | Phase 2B |
| Dead code coverage | TBD | <1% | Phase 2B |
| Tests passing | 279 | 279+ | Phase 2B |
| tsc errors | 0 | 0 | Phase 2B |
