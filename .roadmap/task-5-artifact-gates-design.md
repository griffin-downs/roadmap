# Task #5 Design: artifact-gates.ts

## Overview
Implement artifact validation gates for the `roadmap complete` command. Gates enforce that produced artifacts meet quality criteria before node completion is allowed.

## Gate Definitions

### 1. artifact-exists
**Purpose**: Verify all declared produces files exist in working tree
**Source**: Already implemented in protocol/validation.ts (line 41-49)
**Behavior**:
- Input: artifact path(s) from produces[] or explicit rule.path/rule.target
- Output: passed=true if all files exist, false if any missing
- Evidence: list of existing files or missing file names

**Integration**: Already part of ValidationRule (protocol/types.ts:12)

### 2. artifact-typecheck
**Purpose**: Verify TypeScript compilation passes for src/ changes
**Pattern**: Shell validation rule with tsc
**Behavior**:
- Run: `tsc --noEmit` on src/ directory
- Exit code 0 = pass, non-zero = fail with stderr
- Cached via ROADMAP_VALIDATING env to prevent recursive validation
- Should only run if src/ files were modified

**Integration**: Existing shell rule runner (protocol/validation.ts:87-120)
**Implementation**: Wrap as validation rule in node.validate[]

### 3. artifact-schema
**Purpose**: Verify JSON artifacts conform to declared schema
**Pattern**: Custom validator for JSON structure validation
**Behavior**:
- Consume: rule.schema (path to .schema.ts or JSON Schema)
- Validate: JSON artifact against schema using Zod or JSON Schema validator
- Evidence: validation errors or "schema valid"

**Integration**: Currently TODO in protocol/validation.ts:50-53
**Implementation**: Deferred; task #5 focuses on exists + typecheck

### 4. artifact-hash
**Purpose**: Verify artifact hash matches expected (immutability check)
**Pattern**: Computed hash comparison
**Behavior**:
- Compute: SHA256(artifact content)
- Compare: against rule.expectedHash
- Evidence: computed hash + expected hash
- Use case: Prevent tampering with published artifacts

**Integration**: New validation rule type
**Implementation**: Deferred; task #5 focuses on exists + typecheck

## artifact-gates.ts Class Structure

```typescript
export class ArtifactGates {
  constructor(repoRoot: string) {}

  // Check artifact existence
  checkExists(produces: string[]): GateResult

  // Check TypeScript compilation
  checkTypecheck(srcPath?: string): GateResult

  // Schema validation (stub)
  checkSchema(artifact: string, schema: any): GateResult

  // Hash validation (stub)
  checkHash(artifact: string, expectedHash: string): GateResult

  // Integrate with completion flow
  validateBeforeCompletion(nodeId: string, node: NodeSpec, exists: FileExistsPredicate): Promise<GateResult[]>
}

export interface GateResult {
  gate: string                 // 'artifact-exists', 'artifact-typecheck', etc.
  passed: boolean
  evidence: string
  error?: string
  severity: 'error' | 'warning'
}
```

## Integration Points

### 1. Consume: preflight-validator.ts
- Import types: PreflightValidator interface
- Use: Determine pre-flight state coherence before gates run
- Pattern: Gates validate produces exist after preflight confirms DAG state is consistent

### 2. Integrate with: roadmap complete
**Current flow** (cmdComplete, line 2683+):
1. Load DAG
2. Strategy gate check (line 2691)
3. Plan gate check (line 2699)
4. Validate node (line 2822)

**Where artifact-gates fit**:
- Pre-validation: artifact-exists check (before validateNode)
- Alternative: Wrap validateNode to include artifact gates
- Recommendation: Add as first check in validateNode (existing flow)

**Modification scope**: None to bin/roadmap.ts
- Existing shell/artifact-exists rules already run via validateNode
- Task #5 is defining the ArtifactGates class for explicit gate orchestration
- Used by integration-tests (#6) to verify gates work

## Implementation Plan

### Phase 1: artifact-exists gate
1. Wrapper around existing artifact-exists rule logic
2. Accept produces[] array
3. Return GateResult

### Phase 2: artifact-typecheck gate
1. Run `tsc --noEmit` in src/
2. Capture stderr on failure
3. Guard against recursive validation with ROADMAP_VALIDATING env

### Phase 3: Tests
- Test 1: artifact-exists with missing file → fail
- Test 2: artifact-exists with all files → pass
- Test 3: artifact-typecheck with TS errors → fail
- Test 4: artifact-typecheck clean → pass
- Test 5: Multiple gates chained → correct ordering

## Error Messages

### artifact-exists failure
```
Gate failed: artifact-exists
  Missing artifacts: ["src/lib/roadmap/foo.ts", "tests/foo.test.ts"]
  Fix: Ensure produces files are created before completion
```

### artifact-typecheck failure
```
Gate failed: artifact-typecheck
  TypeScript compilation failed:
  src/lib/roadmap/foo.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'
  Fix: Resolve TypeScript errors and retry completion
```

## Testing Strategy

### Unit tests (artifact-gates.test.ts)
- Mock fileExists predicate
- Create temporary TS files with errors/valid code
- Verify gate results

### Integration tests (task #6)
- Full roadmap-hardening-001 execution
- Verify gates prevent completion when artifacts missing
- Verify gates allow completion when artifacts valid

## Dependencies

**Produces**: artifact-gates.ts, artifact-gates.test.ts
**Consumes**: preflight-validator.ts (from task #2)
**Used by**: integration-tests (task #6)

## Readiness Criteria

- [ ] Task #2 (preflight-validator.ts) committed
- [ ] Review preflight-validator.ts exports and types
- [ ] Implement ArtifactGates class
- [ ] Tests pass (artifact-exists + artifact-typecheck)
- [ ] Integrate with roadmap complete (doc only; no code changes required)
- [ ] git add + commit
- [ ] roadmap complete artifact-gates --note "..."
