# Real Module API Specification

This document specifies the exact APIs of the 5 hardening modules as implemented.
Used to align mocks with real implementations.

## 1. HeadShaRecovery

**Location**: `src/lib/roadmap/headsha-recovery.ts`

**Constructor**:
```typescript
constructor(repoRoot: string)
```

**Methods**:
```typescript
detectMismatch(): MismatchDetection
{
  hasMismatch: boolean;
  headShaInFile: string | null;
  actualGitSha: string;
  headJsonSha: string;
  timestamp: string;
  reason?: string;
}

autoRecover(): RecoveryResult
{
  recovered: boolean;
  prevHeadSha?: string;
  newHeadSha?: string;
  prevGitState?: string;
  newGitState?: string;
  timestamp: string;
  error?: string;
}

validateConsistency(): {
  consistent: boolean;
  headJsonExists: boolean;
  headJsonValid: boolean;
  gitStateExists: boolean;
  gitStateValid: boolean;
  recoveryStateExists: boolean;
  errors: string[];
}
```

**Status**: ✅ No changes needed (matches mock spec)

---

## 2. PreflightValidator

**Location**: `src/lib/roadmap/preflight-validator.ts`

**Constructor**:
```typescript
constructor(repoRoot: string)
```

**Methods**:
```typescript
validateStateCoherence(): PreflightCheckResult
{
  valid: boolean;
  errors: string[];
  warnings: string[];
  timestamp: string;
}

validateArtifacts(): ArtifactCheckResult
{
  valid: boolean;
  errors: string[];
  warnings: string[];
  missing: string[];
  existing: string[];
  timestamp: string;
}

validateSchema(): SchemaCheckResult
{
  valid: boolean;
  errors: string[];
  warnings: string[];
  schemaErrors: string[];
  timestamp: string;
}

validateTypecheck(): TypecheckResult
{
  valid: boolean;
  errors: string[];
  warnings: string[];
  timestamp: string;
}

runAll(): {
  stateCoherence: PreflightCheckResult;
  artifacts: ArtifactCheckResult;
  schema: SchemaCheckResult;
  typecheck: TypecheckResult;
  allValid: boolean;
  timestamp: string;
}
```

**Mocks Need Update**:
- Old: `validate(artifacts)` + `checkGitState()`
- New: `validateStateCoherence()`, `validateArtifacts()`, `validateSchema()`, `validateTypecheck()`
- Also add: `runAll()` for combined validation

---

## 3. TrailManager

**Location**: `src/lib/roadmap/trail-manager.ts`

**Constructor**:
```typescript
constructor(config: TrailWatcherConfig)
{
  repoRoot: string;
  enabled?: boolean;           // default: true
  debounceMs?: number;         // default: 500
  autoCommit?: boolean;        // default: true
  dryRun?: boolean;
}
```

**Methods**:
```typescript
start(): void
// Starts watching trail.jsonl for changes

stop(): void
// Stops watching trail.jsonl

commit(): TrailCommitResult
{
  committed: boolean;
  reason?: string;            // 'nothing-dirty' | 'dryrun' | 'commit-failed' | 'watch-enabled'
  entriesAdded?: number;
  trailSha?: string;
  headSha?: string;
  message?: string;
}
```

**Mocks Need Update**:
- Old: `appendEntry()` + `autoCommit()`
- New: `start()`, `stop()`, `commit()`
- Note: Real uses file watching, not direct append

---

## 4. DagSwitcher

**Location**: `src/lib/roadmap/dag-switcher.ts`

**Constructor**:
```typescript
constructor(repoRoot: string)
```

**Methods**:
```typescript
async switch(dagId: string): Promise<SwitchResult>
{
  success: boolean;
  previousDag?: string;
  newDag?: string;
  backupPath?: string;
  error?: string;
  timestamp: string;
}

getAvailableDAGs(): string[]
// Returns list of all available DAG IDs from .roadmap/head.*.json files

getCurrentDAG(): string | null
// Returns current active DAG ID from .roadmap/head.json
```

**Note**: No separate `validateDAGStructure()` method - validation happens during switch.

**Mocks Need Update**:
- Old: `switchDAG(dagId)` (sync), `listAvailableDAGs()`, `validateDAGStructure(dagId)`
- New: `switch(dagId)` (async!), `getAvailableDAGs()`, `getCurrentDAG()`
- Remove: `validateDAGStructure()` (not exposed)

---

## 5. ArtifactGates

**Location**: `src/lib/roadmap/artifact-gates.ts`

**Constructor**:
```typescript
constructor(repoRoot: string)
```

**Methods**:
```typescript
checkExists(produces: string[]): GateResult
{
  passed: boolean;
  errors: string[];
  missing?: string[];
  timestamp: string;
}

checkTypecheck(srcPath?: string): GateResult
{
  passed: boolean;
  errors: string[];
  timestamp: string;
}

checkSchema(artifactPath: string, schema: string): GateResult
{
  passed: boolean;
  errors: string[];
  timestamp: string;
}

checkHash(artifactPath: string, expectedHash: string): GateResult
{
  passed: boolean;
  errors: string[];
  timestamp: string;
}

async validateBeforeCompletion(config: {
  nodeId?: string;
  produces?: string[];
  artifactPath?: string;
  schema?: string;
  expectedHash?: string;
}): Promise<GateResult[]>
// Runs all applicable gates based on config

allGatesPassed(results: GateResult[]): boolean
// Returns true if all gate results passed

formatResults(results: GateResult[]): string
// Returns formatted string representation of gate results
```

**Mocks Need Update**:
- Old: `gateCompletion(artifacts)` + `validateArtifactSchema(path, schema)`
- New: `checkExists()`, `checkTypecheck()`, `checkSchema()`, `checkHash()`, `validateBeforeCompletion()`
- Note: `validateBeforeCompletion()` is async

---

## Summary of Changes Needed

| Module | Old Methods | New Methods | Async? | Notes |
|--------|------------|------------|--------|-------|
| HeadShaRecovery | ✅ Match | N/A | No | No changes |
| PreflightValidator | ❌ 2 methods | ✅ 4+1 methods | No | Split into granular methods |
| TrailManager | ❌ 2 methods | ✅ 3 methods | No | File watching pattern |
| DagSwitcher | ❌ 3 methods | ✅ 2 methods | Yes | switch() is async |
| ArtifactGates | ❌ 2 methods | ✅ 7 methods | Mixed | Multiple granular gates |

**Total Mock Update Effort**: ~200-300 lines of changes across 4 adapter classes
