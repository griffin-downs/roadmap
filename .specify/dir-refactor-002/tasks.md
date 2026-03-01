# Tasks: dir-refactor-002

Decomposed into phases for roadmap DAG import.

---

## Phase 2A: Directory Consolidation (Parallel)

### audit-consolidation-opportunities
Analyze current src/lib and src root files to determine optimal grouping.

**Consumes**: STRUCTURE.md, current codebase structure
**Produces**: consolidation-plan.json (file → target directory mapping)
**Validates**: Plan identifies all 56 utility files and assigns to groups

### consolidate-tools-domain
Move build, generation, and compilation utilities to src/lib/tools/

Files to move:
- auto-integrate*.ts → tools/
- build-discoverer.ts → tools/
- compile-brief.ts → tools/
- emit-gallery.ts → tools/
- gallery.ts → tools/
- install-skills.ts → tools/
- (others identified in consolidation-plan)

**Validates**: tsc clean, tests pass, barrel exports work

### consolidate-utilities-domain
Move general helpers, algorithms, formatters to src/lib/utilities/

Files to move:
- algo-report.ts → utilities/
- batch-conflicts.ts → utilities/
- brief.ts → utilities/
- cross-orient.ts → utilities/
- (others identified in consolidation-plan)

**Validates**: tsc clean, tests pass, barrel exports work

### consolidate-src-root
Move CLI, IO, and config from src/ root to appropriate subdirectories

**Consolidates**: src root from 26 → ≤10 files
**Validates**: tsc clean, tests pass

### verify-consolidation
Verify all directories ≤10 files, all imports working, tests passing

**Produces**: consolidation-verification.json
**Validates**:
- No directory > 10 files
- Zero broken imports
- Tests all pass
- tsc clean

---

## Phase 2B: Tree-Shaking (Sequential)

### analyze-unused-exports
Identify unused top-level exports across codebase.

Tool approach:
- Build import graph (import analysis)
- Cross-reference with exports
- Flag exports used nowhere
- Categorize by severity (truly unused vs. API surface)

**Produces**: unused-exports-report.json
**Format**:
```json
{
  "unused_exports": [
    { "module": "src/lib/file.ts", "export": "name", "reason": "no imports found", "severity": "high" }
  ],
  "api_surface": [
    { "module": "src/lib/index.ts", "export": "name", "reason": "public export", "severity": "keep" }
  ]
}
```

### analyze-dead-functions
Identify functions that are never called (neither internally nor externally).

Approach:
- Parse function definitions
- Build call graph
- Find functions with zero call sites
- Exclude test utilities, callbacks

**Produces**: dead-functions-report.json
**Format**:
```json
{
  "dead_functions": [
    { "module": "src/lib/file.ts", "function": "unused()", "lines": "123-150", "severity": "high" }
  ]
}
```

### analyze-stale-modules
Identify modules with zero external imports (potentially stale).

Approach:
- Build import dependency graph
- Find modules never imported
- Categorize by type (entry points, test fixtures, etc.)

**Produces**: stale-modules-report.json
**Format**:
```json
{
  "stale_modules": [
    { "module": "src/lib/old-utility.ts", "external_imports": 0, "reason": "never imported", "severity": "medium" }
  ],
  "exclusions": [
    { "module": "src/index.ts", "reason": "entry point", "severity": "keep" }
  ]
}
```

### remove-unused-code
Remove identified unused exports, dead functions, and stale modules.

Based on reports from previous tasks:
- Delete stale modules
- Remove dead functions
- Remove unused exports (or refactor to internal)
- Update barrel exports to remove re-exports of deleted items

**Validates**:
- tsc clean
- Tests all pass
- No broken imports from removals
- No new circular dependencies

**Produces**: tree-shaking-summary.json (what was removed)

### cleanup-imports
Post-tree-shaking import cleanup.

Tasks:
- Remove dangling imports (to deleted modules)
- Simplify import chains
- Remove redundant re-exports
- Optimize barrel exports

**Validates**:
- tsc clean
- Zero unused imports
- Tests all pass

---

## Phase 2 Integration

### verify-phase-2-complete
Final verification that all Phase 2 objectives met.

**Verifies**:
- All directories ≤10 files (100% compliance)
- Zero dead code (or documented as intentional)
- Zero broken imports
- Tests passing (279+)
- tsc clean
- Public API stable
- Documentation updated

**Produces**: phase-2-verification.json (complete checklist)

### update-structure-documentation
Update STRUCTURE.md with Phase 2 results.

**Produces**: Updated STRUCTURE.md
- New directory map (reflecting consolidation)
- Tree-shaking results summary
- Updated import guidelines
- Phase 2 changelog

---

## Execution Notes

### Phase 2A (Consolidation)

**Parallel execution** (4 worker teams):
1. consolidate-tools-domain
2. consolidate-utilities-domain
3. consolidate-src-root (can overlap with lib consolidation)
4. verify-consolidation (gate for Phase 2B)

**Key tasks**:
- Use `git mv` for file moves
- Create barrel exports (index.ts) in each new directory
- Update src/lib/index.ts with new imports
- Update all import statements throughout codebase

### Phase 2B (Tree-Shaking)

**Sequential execution** (3 analysis tasks + 2 action tasks):
1. analyze-unused-exports (parallel)
2. analyze-dead-functions (parallel)
3. analyze-stale-modules (parallel)
4. remove-unused-code (depends on all analyses)
5. cleanup-imports (depends on removals)

**Key tasks**:
- Use code analysis (AST parsing or grep/regex)
- Generate reports (JSON format for review)
- Remove code carefully (atomic commits per removal)
- Verify tests still pass after each removal

### Handoff

Create summary reports:
- consolidation-plan.json (what was moved)
- unused-exports-report.json (what could be removed)
- dead-functions-report.json (what to clean)
- stale-modules-report.json (what to delete)
- phase-2-verification.json (final checklist)
- Updated STRUCTURE.md

---

## Metrics

**Consolidation Metrics**:
- Files moved: 56+ utilities
- Directories created: 2-4 new utility domains
- Barrel exports added: 3-5
- Import statements updated: 100+

**Tree-Shaking Metrics**:
- Lines of code removed: TBD (target: 5-10%)
- Unused exports eliminated: TBD
- Dead functions removed: TBD
- Stale modules deleted: TBD
- Circular dependencies fixed: TBD

**Quality Metrics**:
- Test passage rate: 100% (279+ tests)
- TypeScript errors: 0
- Import errors: 0
- Coverage impact: improved (dead code removed)

---

## Import Notes

Use `roadmap import --from speckit dir-refactor-002 --id dir-refactor-002` to convert these tasks to a roadmap DAG.

Recommended structure:
- L0: audit-consolidation-opportunities (serial gate)
- L1: consolidate-tools, consolidate-utilities, consolidate-src-root (parallel, 3 teams)
- L2: verify-consolidation (gate for Phase 2B)
- L3: analyze-unused-exports, analyze-dead-functions, analyze-stale-modules (parallel, 3 analyses)
- L4: remove-unused-code (serial, depends on all analyses)
- L5: cleanup-imports, verify-phase-2-complete (parallel)
- L6: update-structure-documentation (final)
