# Constraint Enforcement Validators

## Problem
Roadmap validation accepts completion when artifacts exist and validators pass, but ignores emergent structural properties (file counts, line counts, directory depth). Constraints documented in plans are aspirational, not enforced.

**Example:** dir-refactor-001 completed with 55 files in src/lib root despite "max 10 files/dir" requirement.

## Solution: Metric Threshold Validators

Add new `ValidationRule` type to enforce quantitative constraints at completion time.

### Given
- A roadmap node produces code artifacts
- Those artifacts have measurable properties (file count, lines per file, directory depth, cyclomatic complexity, etc.)
- Constraints are defined in specs (e.g., "no directory > 10 files")

### When
- A node reaches completion validation
- The validators array includes metric threshold rules
- The shell command or metric check runs against the produced artifacts

### Then
- If metric exceeds threshold, validation fails
- If `expandOnFail` is true, the node triggers expansion to add fix nodes
- If no expansion, completion is blocked with clear diagnostic

## Spec: Metric Threshold Validator

```typescript
type ValidationRule =
  | ... existing types ...
  | {
      type: 'metric-threshold';
      metric: 'filesPerDir' | 'linesPerFile' | 'directoryDepth' | 'cyclomaticComplexity';
      max: number;
      scope: string; // glob pattern (e.g., 'src/lib/**')
      violationMode: 'fail' | 'warn'; // fail = blocks completion, warn = logged
    }
```

### Scenarios

#### Scenario 1: Structure Audit with Metric Thresholds
**Given** a refactoring node that moves files into semantic directories
**When** the node completes and declares produces: "file reorganization"
**Then** validation runs: `{ type: 'metric-threshold', metric: 'filesPerDir', max: 10, scope: 'src/lib/**' }`
**And** if any dir > 10 files, expansion triggers to add fix nodes (split oversized dirs)
**And** completion blocks until all metrics pass

#### Scenario 2: Line Count Enforcement on File Splits
**Given** a module split node that breaks large files into smaller ones
**When** completion runs
**Then** validation checks: `{ type: 'metric-threshold', metric: 'linesPerFile', max: 400, scope: 'src/lib/**/*.ts' }`
**And** any file still over 400 lines triggers re-expansion with more granular splits

#### Scenario 3: Complexity Bounds on New Features
**Given** a feature implementation node
**When** it completes with validator: `{ type: 'metric-threshold', metric: 'cyclomaticComplexity', max: 5 }`
**Then** complexity analysis runs on new functions
**And** if any function > CC5, expansion proposes refactoring

## Implementation

### validator Type in validation.ts
```typescript
export function validateMetricThreshold(
  root: string,
  rule: MetricThresholdRule,
  node: NodeSpec
): ValidationResult {
  // Scan produces artifacts
  // Apply metric function (filesPerDir, linesPerFile, etc.)
  // Compare against threshold
  // Return pass/fail + diagnostic evidence
}
```

### Metric Functions
- `filesPerDir(root, glob)` → Map<dir, count>
- `linesPerFile(root, glob)` → Map<file, lines>
- `directoryDepth(root, glob)` → Map<dir, depth>
- `cyclomaticComplexity(root, glob)` → Map<file, cc>

### Integration with Completion
- `roadmap complete` runs metric validators after artifact validators
- If metric fails + expandOnFail, generate expansion with fix nodes (e.g., "split oversized files", "move files to subdirs")
- Expansion consumes the diagnostic and produces fix nodes

## Success Criteria
- [x] MetricThresholdRule type defined in protocol/types.ts
- [x] Metric functions implemented in validation module
- [x] validateMetricThreshold integrated into validateNode
- [x] completion flow triggers expansion on metric failure
- [x] `roadmap complete` respects metric thresholds before allowing terminal
- [x] Terminal nodes can declare metric gates (intent-like, but metric-driven)

## Tests
- Unit: metric functions compute correctly on sample codebases
- Integration: node completes → metric fails → expansion triggered
- E2E: refactoring node with metric thresholds blocks bad merges
