# Task #5 Integration Flow: Where artifact-gates Fit

## Current Complete Flow (bin/roadmap.ts cmdComplete, lines 2683+)

```
cmdComplete(note)
  ├─ Load DAG from .roadmap/head.json
  ├─ Strategy gate (line 2691) — verify strategy is active
  ├─ Plan gate (line 2699) — verify plan clarity
  ├─ Validate node (line 2822) — run all validation rules
  │   └─ For each rule in node.validate[]:
  │       ├─ artifact-exists
  │       ├─ artifact-schema
  │       ├─ build-produces
  │       ├─ launch-check
  │       ├─ intent
  │       └─ runtime-explore
  └─ Save completion receipt
```

## What artifact-gates Class Adds

The ArtifactGates class is **not a new gate in the validation flow**. Instead, it:
1. **Encapsulates** the logic for checking artifact existence
2. **Provides utilities** for orchestrating multiple gate checks
3. **Supplies test-friendly interface** for integration tests (task #6)
4. **Documents** gate semantics (what makes a valid artifact)

## Architecture Decision: Where Does ArtifactGates Live?

### Option A: Wrapper around existing validators (CHOSEN)
- ArtifactGates is a utility class
- Used by: integration-tests to verify gates work
- Does not change: bin/roadmap.ts or cmdComplete flow
- Benefit: Minimal coupling, clear separation of concerns

```typescript
// In integration-tests (task #6):
const gates = new ArtifactGates(repoRoot);
const result = await gates.validateBeforeCompletion(nodeId, node, fileExists(repoRoot));
// Verify result.passed === true before calling complete
```

### Option B: Replace validation flow (NOT CHOSEN)
- Would modify cmdComplete to use ArtifactGates
- Centralize all gates in one class
- Risk: Over-engineering; existing validateNode already handles all gates

## Artifact Validation Already Exists

The current system already validates artifact existence:
- **artifact-exists rule** (protocol/types.ts:12, validation.ts:41-49)
  - Checks produces files exist before completion
  - Part of standard node.validate[] rules

- **build-produces rule** (validation.ts:120+)
  - Compiles TypeScript and verifies outputs exist

- **launch-check rule** (validation.ts:140+)
  - Runs integration tests, verifies app launches

## What artifact-gates.ts Adds (Specifically)

1. **Unified interface** for gate orchestration
   - Single class with checkExists(), checkTypecheck(), etc.
   - Clear naming: "gates" (vs. nebulous "validators")

2. **Test harness**
   - Decoupled from validateNode logic
   - Can be unit-tested independently
   - Used by integration-tests for gate verification

3. **Type safety**
   - Explicit GateResult interface
   - Clear contract for gate behavior

4. **Error messages**
   - Tailored messaging per gate type
   - Evidence capture for debugging

## Execution Sequence: Task #2 → Task #5 → Task #6

```
Task #2 (preflight-validation) COMPLETES
  └─ Produces: src/lib/roadmap/preflight-validator.ts
       └─ Exports: PreflightValidator class
            └─ Interface: state coherence checks

Task #5 (artifact-gates) STARTS
  ├─ Consumes: preflight-validator.ts
  ├─ Implements: ArtifactGates class
  │   ├─ checkExists(produces)
  │   ├─ checkTypecheck()
  │   ├─ checkSchema() [stub]
  │   └─ checkHash() [stub]
  └─ Produces: artifact-gates.ts + tests/artifact-gates.test.ts

Task #6 (integration-tests) STARTS
  ├─ Consumes: All hardening modules
  │   ├─ headsha-recovery.ts
  │   ├─ preflight-validator.ts
  │   ├─ trail-manager.ts
  │   ├─ dag-switcher.ts
  │   └─ artifact-gates.ts
  └─ Verifies: Full hardening system works end-to-end
       ├─ Create DAG with errors
       ├─ Run preflight validation
       ├─ Run artifact gates
       ├─ Verify gates block invalid completions
       └─ Verify gates allow valid completions
```

## No Code Changes Required to bin/roadmap.ts

**Why**: The existing validation infrastructure already executes all gates via validateNode(). The artifact-gates.ts class is a:
- Companion utility (for testing)
- Documentation (for gate semantics)
- Not a replacement for the validation system

**If artifact gates become a bottleneck**, a future optimization might:
1. Call ArtifactGates.validateBeforeCompletion() early in cmdComplete
2. Exit before running expensive validation rules (e.g., runtime-explore)
3. Still use existing validateNode() as final gate

**Current task scope**: Implement the class, write tests, verify it works.

## Dependencies Flow

```
task-2 (preflight-validator)
  ↓ produces
task-5 (artifact-gates) ← consumes preflight output (types, interfaces)
  ↓ produces
task-6 (integration-tests) ← uses artifact-gates for verification
```

Task #5 reads preflight-validator.ts to understand:
- PreflightValidator class interface
- What pre-validation checks already exist
- What contract preflight establishes

This allows artifact-gates to:
- Build on preflight state coherence
- Add artifact-specific validation
- Layer gates logically (preflight → artifacts → validation rules)
