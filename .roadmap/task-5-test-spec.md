# Task #5 Test Spec: artifact-gates.test.ts

## Test Scenarios

### Suite 1: artifact-exists gate

**Test 1.1: Single artifact exists**
- Input: produces = ["foo.ts"]
- Setup: Create foo.ts
- Expected: passed=true, evidence="artifact exists: foo.ts"

**Test 1.2: Single artifact missing**
- Input: produces = ["foo.ts"]
- Setup: Don't create foo.ts
- Expected: passed=false, evidence="artifact missing: foo.ts"

**Test 1.3: Multiple artifacts all exist**
- Input: produces = ["foo.ts", "foo.test.ts", "foo.schema.ts"]
- Setup: Create all three
- Expected: passed=true, evidence="all artifacts exist: foo.ts, foo.test.ts, foo.schema.ts"

**Test 1.4: Multiple artifacts partial missing**
- Input: produces = ["foo.ts", "foo.test.ts"]
- Setup: Create foo.ts, skip foo.test.ts
- Expected: passed=false, evidence="missing artifacts: foo.test.ts"

**Test 1.5: Empty produces**
- Input: produces = []
- Expected: passed=true (no artifacts required)

**Test 1.6: Glob patterns (if supported)**
- Input: produces = ["src/**/*.ts"]
- Setup: Create src/lib/foo.ts, src/lib/bar.ts
- Expected: passed=true (glob expands and all match exist)

### Suite 2: artifact-typecheck gate

**Test 2.1: Clean TypeScript compiles**
- Setup: Create src/test-module.ts with valid TS
- Expected: passed=true, evidence="tsc passed"

**Test 2.2: TS compilation error**
- Setup: Create src/test-module.ts with syntax/type error
- Expected: passed=false, evidence includes "error TS####: ..."
- Verify stderr is captured

**Test 2.3: ROADMAP_VALIDATING env guard**
- Setup: Set ROADMAP_VALIDATING=1 in environment
- Call: checkTypecheck()
- Expected: passed=true, evidence="skipped (already inside validation)"
- Rationale: Prevent infinite recursion during validation

**Test 2.4: Empty src/ (no changes)**
- Setup: No .ts files in src/
- Expected: passed=true (no-op, nothing to typecheck)

**Test 2.5: Multiple files with one error**
- Setup: Create src/good.ts (valid), src/bad.ts (TS error)
- Expected: passed=false, error points to bad.ts

### Suite 3: Integration scenarios

**Test 3.1: Both gates pass**
- Setup: All produces exist + TS compiles
- Expected: Both gates passed=true
- Verify: Gate order is consistent

**Test 3.2: First gate fails, second not checked**
- Setup: Missing produces, TS doesn't matter
- Expected: artifact-exists fails, may short-circuit

**Test 3.3: Gate invoked on node with no TS changes**
- Input: node.produces contains non-TS files only
- Expected: artifact-typecheck skipped or passed trivially

**Test 3.4: Concurrent gate validation**
- Setup: Run multiple gates in parallel (if applicable)
- Expected: All complete without interference

### Suite 4: Error handling

**Test 4.1: Unreadable file**
- Setup: Create file with no read permissions
- Expected: Graceful error with suggestion

**Test 4.2: tsc not in PATH**
- Setup: Mock missing tsc
- Expected: Error message suggests installing TypeScript

**Test 4.3: Invalid node spec**
- Input: nodeId that doesn't exist
- Expected: Error, not crash

## Mock/Setup Patterns

```typescript
// Mock fileExists predicate
const mockFileExists = (files: Set<string>) => (path: string) => files.has(path);

// Create temporary test files
const testDir = createTempDir();
writeFileSync(join(testDir, 'foo.ts'), 'export const x = 1;');

// Verify gate result structure
expect(result).toEqual({
  gate: 'artifact-exists' | 'artifact-typecheck',
  passed: boolean,
  evidence: string,
  severity: 'error' | 'warning',
  error?: string
});
```

## Test Coverage Goals

- artifact-exists: 6 tests
- artifact-typecheck: 5 tests
- Integration: 4 tests
- Error handling: 3 tests
- **Total**: ~18 tests

## Success Criteria

- All test suites pass
- Coverage: 90%+ line coverage on ArtifactGates class
- No flaky tests (gates are deterministic)
- Error messages are actionable
