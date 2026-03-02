# Real Module API Audit

**Purpose:** Document actual APIs of all 5 hardening modules for mock alignment.

---

## 1. HeadShaRecovery

**File:** src/lib/roadmap/headsha-recovery.ts

**Interfaces:**
```typescript
export interface MismatchDetection {
  hasMismatch: boolean;
  headShaInFile: string | null;
  actualGitSha: string;
  headJsonSha: string;
  timestamp: string;
  reason?: string;
}

export interface RecoveryResult {
  recovered: boolean;
  prevHeadSha?: string;
  newHeadSha?: string;
  prevGitState?: string;
  newGitState?: string;
  timestamp: string;
  error?: string;
}

export interface RecoveryState {
  lastHeadSha: string;
  lastGitState: string;
  recoveredAt: string;
  mismatchCount: number;
}
```

**Class Methods:**
```typescript
class HeadShaRecovery {
  constructor(repoRoot: string)
  detectMismatch(): MismatchDetection
  autoRecover(): RecoveryResult
  validateConsistency(): {
    consistent: boolean;
    headJsonExists: boolean;
    headJsonValid: boolean;
    gitStateExists: boolean;
    gitStateValid: boolean;
    recoveryStateExists: boolean;
    errors: string[];
  }
}
```

**Standalone Functions:**
```typescript
export function detectMismatch(repoRoot: string): MismatchDetection
export function autoRecover(repoRoot: string): RecoveryResult
export function validateConsistency(repoRoot: string): {...}
```

---

## 2. PreflightValidator

**File:** src/lib/roadmap/preflight-validator.ts

**Interfaces:**
```typescript
export interface PreflightCheckResult {
  passed: boolean;
  timestamp: string;
  errors: string[];
  warnings: string[];
}

export interface ArtifactCheckResult extends PreflightCheckResult {
  missing: string[];
  existing: string[];
}

export interface SchemaCheckResult extends PreflightCheckResult {
  valid: boolean;
  schemaErrors: string[];
}

export interface TypecheckResult extends PreflightCheckResult {
  srcChanged: boolean;
  typecheckPassed: boolean;
  output?: string;
}
```

**Class Methods:**
```typescript
class PreflightValidator {
  constructor(repoRoot: string)
  validateStateCoherence(): PreflightCheckResult
  validateArtifacts(): ArtifactCheckResult
  validateSchema(): SchemaCheckResult
  validateTypecheck(): TypecheckResult
}
```

**Standalone Functions:**
```typescript
export function validateStateCoherence(repoRoot: string): PreflightCheckResult
export function validateArtifacts(repoRoot: string): ArtifactCheckResult
export function validateSchema(repoRoot: string): SchemaCheckResult
export function validateTypecheck(repoRoot: string): TypecheckResult
```

---

## 3. TrailManager

**File:** src/lib/roadmap/trail-manager.ts

**(Details to be confirmed — check actual implementation for exact signatures)**

**Expected Class:**
```typescript
class TrailManager {
  constructor(repoRoot: string)
  appendEntry(entry: any): void
  autoCommit(message: string): boolean
  syncTrail(): void
}
```

---

## 4. DagSwitcher

**File:** src/lib/roadmap/dag-switcher.ts

**Interfaces:**
```typescript
export interface SwitchResult {
  success: boolean;
  previousDAG: string;
  newDAG: string;
  timestamp: string;
  message: string;
}
```

**Class Methods:**
```typescript
class DagSwitcher {
  constructor(repoRoot: string)
  switchToDAG(dagId: string): SwitchResult
  getCurrentDAG(): string | null
  validateDAGExists(dagId: string): boolean
  listAvailableDAGs(): string[]
}
```

**Standalone Functions:**
```typescript
export function validateDAGExists(repoRoot: string, dagId: string): string
export function getCurrentDAGId(repoRoot: string): string | null
export function loadDAGById(repoRoot: string, dagId: string): Graph<string>
```

---

## 5. ArtifactGates

**File:** src/lib/roadmap/artifact-gates.ts

**Interfaces:**
```typescript
export interface GateResult {
  passed: boolean;
  nodeId: string;
  gates: {
    artifactExists: boolean;
    typecheck: boolean;
    schema: boolean;
    hash: boolean;
  };
  errors: string[];
}

export interface ArtifactGateConfig {
  validateExists: boolean;
  validateTypecheck: boolean;
  validateSchema: boolean;
  validateHash: boolean;
}
```

**Class Methods:**
```typescript
class ArtifactGates {
  constructor(repoRoot: string, config?: ArtifactGateConfig)
  gateCompletion(nodeId: string): GateResult
  validateArtifactExists(path: string): boolean
  validateArtifactSchema(path: string, schema?: any): boolean
}
```

---

## Mocking Strategy

**For each module:**

1. Create mock class with same method signatures as real class
2. Mock methods return sample data (not actual git operations)
3. Update orchestrator to call correct method names
4. When ready, swap import: `import { RealClass } from '../src/lib/roadmap/real-module.ts'`

**Example swap:**
```typescript
// Before (mock):
import { HeadShaRecovery as MockHeadShaRecovery } from './mocks/mock-headsha-recovery.ts';
const recovery = new MockHeadShaRecovery(testRepo.repoPath);

// After (real):
import { HeadShaRecovery } from '../src/lib/roadmap/headsha-recovery.ts';
const recovery = new HeadShaRecovery(testRepo.repoPath);
```

---

## Next Steps

1. Confirm TrailManager exact API (check implementation)
2. Update mock stubs to match real method names + signatures
3. Update orchestrator calls to use correct method names
4. Verify test suite passes
5. Commit mock alignment updates
