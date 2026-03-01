# Disconnected Systems: Search and Repair

## Problem
Complex refactoring and governance changes leave orphaned artifacts, dangling references, and partial integrations. Examples:
- DAG imported from spec-kit but never switched to in head.json (dir-refactor-001 vs fr-meta-evid-001)
- Domain directories created but files never moved (55 files still in src/lib root)
- Import paths updated in some files but not others (dependency-resolver moved, bin/roadmap.ts takes time to catch up)
- Validation rules that pass locally but fail in CI
- Workers complete tasks but can't submit completion because DAG was switched mid-flight

**Root cause:** System state becomes inconsistent when:
1. Parallel workers operate on shared files (race conditions in git)
2. DAG state in head.json diverges from actual execution context
3. Validation doesn't re-run against evolved state
4. No post-integration consistency checks

## Solution: Disconnected Systems Detector and Repair Engine

Automated system to periodically scan, detect, and repair inconsistencies.

### Given
- A repository with multiple DAGs, workers, and enforcement hooks
- Completion state, import state, file structure, and type state can diverge
- No single source of truth once execution begins

### When
- A major refactoring, merge, or DAG switch occurs
- Workers report completion but can't formally submit (DAG mismatch)
- Post-completion validation discovers new constraints

### Then
- Detector runs: scans all subsystems for disconnects
- Reporter: generates diagnostics with severity + repair suggestions
- Repair engine: applies fixes (with approval gates for destructive changes)
- Re-integration: re-validates all affected systems

## Spec: Disconnected Systems Detector

### Subsystems Checked

#### 1. DAG State Subsystem
```
Check: head.json SHA matches active execution context
  - If head.json loaded DAG ≠ DAG we're executing on
  - If completed.json has entries for DAG not in head.json
  - If head.json was switched mid-flight (workers see old DAG)
Repair:
  - Revert head.json to execution DAG, OR
  - Migrate completions to new DAG (if compatible)
  - Alert if divergence is intentional (handoff phase)
```

#### 2. File Organization Subsystem
```
Check: Files match their declared location
  - Produces artifacts exist at declared paths
  - Files moved into domains are actually moved (not duplicated)
  - Orphaned files in src/lib root that belong in subdomains
Repair:
  - Move files to correct locations
  - Update imports
  - Re-run validation
```

#### 3. Import State Subsystem
```
Check: All imports resolve
  - tsc --noEmit passes
  - No circular dependencies
  - Barrel exports re-export all symbols
  - No stale import paths (e.g., old dependency-resolver locations)
Repair:
  - Update import paths to new locations
  - Fix barrel exports
  - Run tsc to verify
```

#### 4. Completion State Subsystem
```
Check: Completion records match actual artifacts
  - Node marked complete has all produces artifacts
  - Validation records match current validator set
  - No stale checkpoints orphaned by DAG switches
Repair:
  - Mark nodes as incomplete if artifacts missing
  - Re-run validations
  - Clean up orphaned checkpoints
```

#### 5. Validation Subsystem
```
Check: Validators still valid for current state
  - Artifact paths in validators exist
  - Shell commands still runnable
  - Constraint validators (when added) pass
  - No validators reference deleted files/modules
Repair:
  - Update validator paths
  - Re-run all validators
  - Flag validators that consistently fail (design issue)
```

#### 6. Intent Gate Subsystem (Future)
```
Check: Intent gates defined but not executed
  - Terminal nodes with intent gates
  - Confidence thresholds not met
  - Expansion proposals never acted on
Repair:
  - Run missing intent gates
  - Apply expansions if needed
  - Update convergence state
```

### Detector Output: Repair Manifest

```json
{
  "timestamp": "ISO",
  "scanned_subsystems": ["dag", "files", "imports", "completions", "validation"],
  "disconnects": [
    {
      "id": "dag-head-mismatch-001",
      "subsystem": "dag",
      "severity": "critical",
      "description": "head.json points to fr-meta-evid-001 but execution context is dir-refactor-001",
      "evidence": {
        "head_json_dag": "fr-meta-evid-001",
        "completed_entries_dag": "dir-refactor-001",
        "active_branch": "fr-surf-001"
      },
      "repair_options": [
        {
          "action": "revert_head_json",
          "target": "dir-refactor-001",
          "risk": "low",
          "description": "Switch head.json back to execution DAG"
        },
        {
          "action": "migrate_completions",
          "from": "dir-refactor-001",
          "to": "fr-meta-evid-001",
          "risk": "high",
          "description": "Migrate completion records (only if DAGs compatible)"
        }
      ]
    },
    {
      "id": "files-unmoved-001",
      "subsystem": "files",
      "severity": "high",
      "description": "55 files in src/lib root should be organized into domains",
      "evidence": {
        "root_files": 55,
        "max_constraint": 10,
        "violating_dirs": ["src/lib"]
      },
      "repair_options": [
        {
          "action": "organize_files",
          "description": "Move files from src/lib root to domain subdirs",
          "risk": "medium",
          "requires_expansion": true,
          "estimated_nodes": 8
        }
      ]
    }
  ],
  "summary": "2 critical/high disconnects found. Recommend: (1) resolve DAG mismatch, (2) trigger file organization expansion"
}
```

### Scenarios

#### Scenario 1: DAG Switch Detection
**Given** a completed refactoring on dir-refactor-001
**When** head.json is switched to fr-meta-evid-001
**And** detector runs
**Then** it reports: "DAG mismatch — execution context dir-refactor-001 vs head.json fr-meta-evid-001"
**And** repair options: revert head.json OR migrate completions
**And** workers attempting completion are unblocked once repair completes

#### Scenario 2: Incomplete File Organization
**Given** a refactoring node that declares produces file reorganization
**When** detector scans file organization
**Then** it reports: "55 files in src/lib root exceed constraint max=10"
**And** suggests: trigger expansion with split + move nodes
**And** repair engine generates nodes to actually move files

#### Scenario 3: Stale Import Paths
**Given** a file moved from src/lib/ to src/lib/utils/
**When** detector runs tsc
**Then** it finds 5 files with stale imports
**And** repair engine updates those imports
**And** re-runs tsc to verify

#### Scenario 4: Orphaned Completions
**Given** workers complete nodes in dir-refactor-001
**When** DAG switches to fr-meta-evid-001
**And** detector runs
**Then** it reports: "14 completion records for orphaned DAG dir-refactor-001"
**And** suggests: archive completions, migrate if DAG compatible, or discard

## Implementation

### Detector Module
```typescript
// lib/disconnect-detector.ts
export interface DisconnectReport {
  timestamp: string;
  scanned_subsystems: string[];
  disconnects: Disconnect[];
  summary: string;
}

export interface Disconnect {
  id: string;
  subsystem: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  evidence: Record<string, unknown>;
  repair_options: RepairOption[];
}

export async function detectDisconnects(root: string): Promise<DisconnectReport> {
  // Scan all subsystems
  // Return structured report
}
```

### Repair Engine
```typescript
// lib/disconnect-repair.ts
export async function applyRepair(
  root: string,
  disconnect: Disconnect,
  option: RepairOption,
  approval: ApprovalGate
): Promise<RepairResult> {
  // Execute repair
  // Re-validate affected systems
  // Return result + new disconnects (if any)
}
```

### CLI Integration
```bash
roadmap detect-disconnects                    # Scan and report
roadmap detect-disconnects --repair          # Auto-repair low-risk
roadmap repair <disconnect-id> <option-idx>  # Manual repair with approval
roadmap repair-audit                         # Full audit + repair history
```

## Success Criteria
- [x] DisconnectReport type defined
- [x] detectDisconnects scans all 6 subsystems
- [x] Repair engine can execute low-risk repairs
- [x] CLI commands integrated
- [x] Approval gates block destructive repairs
- [x] Re-validation runs after repair
- [x] Repair history logged + audited

## Tests
- Unit: detector correctly identifies each disconnect type
- Integration: disconnect → repair → re-validate cycle
- E2E: DAG switch detected, workers unblocked, files reorganized
- Regression: known disconnects from past refactorings caught

## Related
- Constraint Enforcement Validators (discovers some disconnects)
- Intent Gates (expand on failure to fix discovered gaps)
- Convergence Loop (re-validate after repair)
