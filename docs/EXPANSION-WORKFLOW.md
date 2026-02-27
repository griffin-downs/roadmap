# Expansion Workflow Reference

## Data Flow: Intent Failure → Script → DAG

```
┌─────────────────────────────────────────────────────────────────┐
│ cmdComplete(nodeId)                                             │
│   ├─ Read node spec from DAG                                    │
│   ├─ Run validateNode() with intent judgments                   │
│   │                                                              │
│   ├─ PASS → checkpoint + advance + return { completed: true }   │
│   │                                                              │
│   └─ FAIL with expandOnFail=true                               │
│       │                                                          │
│       ├─ extractIntentFailures()                               │
│       │   └─ failures: IntentFailure[]                          │
│       │       ├─ statement: "JWT module implements rotation"    │
│       │       ├─ achieved: 0.42                                 │
│       │       ├─ threshold: 0.90                                │
│       │       ├─ reasoning: "..."                               │
│       │       └─ evidence: ["src/auth.ts:45"]                   │
│       │                                                          │
│       ├─ generateIntentExpansion()                             │
│       │   └─ fixNodes: FixNodeSpec[]                            │
│       │       ├─ id: "plan-auth-strategy-fix-0"                 │
│       │       ├─ desc: "Fix: JWT module implements rotation..." │
│       │       ├─ expandedFrom: "plan-auth-strategy"             │
│       │       ├─ produces: ["src/auth-rotation.ts", ...]        │
│       │       ├─ consumes: [...node.produces]                   │
│       │       ├─ validate: [<intent rule>, <deterministic>...]  │
│       │       └─ _intentDiagnosis: {                            │
│       │           statement: "JWT module implements rotation"   │
│       │           achievedConfidence: 0.42                      │
│       │           threshold: 0.90                               │
│       │           reasoning: "..."                              │
│       │           evidence: ["src/auth.ts:45"]                  │
│       │           expansionDepth: 1                             │
│       │         }                                               │
│       │                                                          │
│       ├─ writeExpansionScript()  [NEW FUNCTION]                │
│       │   ├─ Input: parentId, failures, fixNodes[]              │
│       │   ├─ Generate: complete TypeScript file                │
│       │   │   ├─ Header comment (nodeId, timestamp, parent)     │
│       │   │   ├─ Imports (fs, path, types)                      │
│       │   │   ├─ DAG load + for-loop to add nodes               │
│       │   │   ├─ Each node = dag.nodes[id] = {...}              │
│       │   │   ├─ _intentDiagnosis block (full audit trail)      │
│       │   │   ├─ Parent rewire (if plan node)                   │
│       │   │   └─ writeFileSync + console.log                    │
│       │   ├─ Create directory: .roadmap/expansions/ (if missing)│
│       │   ├─ Write: .roadmap/expansions/<nodeId>-<timestamp>.ts │
│       │   └─ Return: absolute path                              │
│       │                                                          │
│       └─ Return JSON response:                                  │
│           {                                                      │
│             "completed": false,                                 │
│             "node": "plan-auth-strategy",                        │
│             "validation": {                                      │
│               "passed": false,                                  │
│               "expandable": true,                               │
│               "script": ".roadmap/expansions/...-1709078400.ts", │
│               "failedIntents": [...],                           │
│               "nextStep": "Review script, then: roadmap expand..."
│             }                                                    │
│           }                                                      │
└─────────────────────────────────────────────────────────────────┘
                               ↓
                    [User reads script]
                               ↓
                    [User runs cmdExpand]
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ cmdExpand(scriptPath)                                           │
│   ├─ Validate file exists                                       │
│   ├─ Snapshot DAG before (node count)                           │
│   ├─ Execute: node --experimental-strip-types <scriptPath>      │
│   │   └─ Script modifies head.json, writes back                 │
│   ├─ Snapshot DAG after                                         │
│   ├─ Validate DAG (define + check + verify + terminal intent)   │
│   ├─ Commit: git add .roadmap/head.json                         │
│   ├─ Commit msg: "roadmap: expand — +N nodes via <scriptPath>"  │
│   ├─ Record trail entry with { script, added, commit }          │
│   └─ Return JSON: { expanded: true, added, addedIds, ... }      │
└─────────────────────────────────────────────────────────────────┘
```

## File Content Example

### Generated Script Structure

```typescript
#!/usr/bin/env node
// Expansion script for: plan-auth-strategy
// Generated: 2025-02-27T04:00:00Z
// Parent: plan-approvals
// Diagnosis: JWT rotation intent failed at confidence 0.42/0.90

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// ─────────────────────────────────────────────────────
// Expansion: Fix JWT Module Rotation Implementation
// ─────────────────────────────────────────────────────

dag.nodes['plan-auth-strategy-fix-0'] = {
  id: 'plan-auth-strategy-fix-0',
  desc: 'Fix: JWT module implements rotation (confidence 0.42/0.90)',
  expandedFrom: 'plan-auth-strategy',
  produces: ['src/auth-rotation.ts'],
  consumes: ['src/auth-core.ts'],
  ambient: ['docs/jwt-spec.md'],
  deps: ['plan-auth-strategy'],
  validate: [
    {
      type: 'intent',
      statement: 'JWT module implements rotation',
      confidence: 0.90,
      evaluator: 'self',
      expandOnFail: true,
      maxExpansionDepth: 3,
    },
    {
      type: 'artifact-exists',
      target: 'src/auth-rotation.ts',
    },
  ],
  idempotent: true,
  _intentDiagnosis: {
    statement: 'JWT module implements rotation',
    achievedConfidence: 0.42,
    threshold: 0.90,
    reasoning: 'Tokens rotate in-process but no refresh endpoint exists.',
    evidence: ['src/auth.ts:45', 'tests/auth.test.ts (no refresh tests)'],
    expansionDepth: 1,
  },
};

// ─────────────────────────────────────────────────────
// Connect: update parent dependency
// ─────────────────────────────────────────────────────

dag.nodes['plan-auth-strategy'] = {
  ...dag.nodes['plan-auth-strategy'],
  deps: ['plan-auth-strategy-fix-0'],  // now depends on fix nodes
};

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log('Expanded: plan-auth-strategy → plan-auth-strategy-fix-0 (+1 node)');
```

---

## Auditability Queries

### 1. Find All Expansions for a Node

```bash
ls -ltr .roadmap/expansions/ | grep "^plan-auth-strategy"
```

Output:
```
-rw-r--r-- 1 griffin griffin 2345 Feb 27 04:00 plan-auth-strategy-1709078400.ts
-rw-r--r-- 1 griffin griffin 2401 Feb 27 04:15 plan-auth-strategy-1709078401.ts  (second try)
```

### 2. Read Why a Node Was Expanded

```bash
head -5 .roadmap/expansions/plan-auth-strategy-1709078400.ts
```

Output:
```
// Expansion script for: plan-auth-strategy
// Generated: 2025-02-27T04:00:00Z
// Parent: plan-approvals
// Diagnosis: JWT rotation intent failed at confidence 0.42/0.90
```

### 3. Trace a Fix Node Back to Original Intent

```bash
# Which expansion created this node?
git log --all --oneline | grep "plan-auth-strategy-fix-0"

# Show the script
git show <commit>:.roadmap/expansions/plan-auth-strategy-1709078400.ts | \
  grep -A 20 "plan-auth-strategy-fix-0"

# Extract the diagnosis
git show <commit>:.roadmap/expansions/plan-auth-strategy-1709078400.ts | \
  grep -A 10 "_intentDiagnosis"
```

### 4. Find All Intent Failures Across All Expansions

```bash
grep -h "achievedConfidence" .roadmap/expansions/*.ts | \
  sed 's/.*achievedConfidence: //' | \
  awk -F/ '{print $1}' | \
  sort -n | uniq -c
```

---

## Integration Checklist

### writeExpansionScript() Function

**Location:** `src/lib/expansion-writer.ts`

**Signature:**
```typescript
export function writeExpansionScript(
  parentId: string,
  parentNode: NodeSpec<any>,
  failures: IntentFailure[],
  fixNodes: FixNodeSpec[],
  reason: 'intent-expansion' | 'runtime-explore' | 'escalation-recovery',
  repoRoot: string,
): string
```

**Returns:** Absolute path to written script

**Responsibilities:**
- [x] Create `.roadmap/expansions/` if missing
- [x] Generate filename: `<nodeId>-<timestamp>.ts`
- [x] Build complete TypeScript file with imports + boilerplate
- [x] Serialize each fix node as `dag.nodes[id] = {...}`
- [x] Include `_intentDiagnosis` metadata
- [x] Include header comments (node, timestamp, parent, diagnosis)
- [x] Handle parent node rewiring (if plan node)
- [x] Write to disk with `writeFileSync()`
- [x] Return path as string

### cmdComplete() Integration

**Location:** `bin/roadmap.ts`

**When to call:**
1. After intent failure detected
2. After `expandOnFail=true` check
3. Before JSON response

**What to pass:**
- `parentId` from `nodeId` parameter
- `parentNode` from DAG lookup
- `failures` from `extractIntentFailures()`
- `fixNodes` from `generateIntentExpansion()`
- `reason: 'intent-expansion'`
- `repoRoot` (already available)

**What to do with return value:**
- Include in JSON response: `script: <path>`
- Add to nextStep hint

### Tests

**File:** `tests/expansion-writer.test.ts`

**Scenarios:**
1. Single intent failure → single fix node
2. Multiple intent failures → multiple fix nodes
3. _intentDiagnosis attached correctly
4. expandedFrom backpointer set
5. consumes inherit from parent
6. Script is valid TypeScript (tsx parser)
7. Multiple expansions on same node → distinct filenames
8. Concurrent expansions from different nodes → no collision
9. Directory created if missing
10. Existing script not overwritten (new timestamp)

---

## Nomenclature

| Term | Meaning | Example |
|------|---------|---------|
| Plan node | Mode='plan'; decomposed into children | `plan-auth-strategy` |
| Fix node | Child created by expansion | `plan-auth-strategy-fix-0` |
| Expansion script | TypeScript file that adds fix nodes to DAG | `plan-auth-strategy-1709078400.ts` |
| IntentFailure | A single failed intent statement + diagnosis | {statement, achieved, threshold, reasoning} |
| FixNodeSpec | One fix node definition (ready to add to DAG) | {id, desc, expandedFrom, ...} |
| _intentDiagnosis | Provenance metadata attached to fix node | {statement, achievedConfidence, ...} |
| expandedFrom | Backpointer from fix node to parent plan node | "plan-auth-strategy" |

---

## Design Principles

1. **Scriptability** — Expansion scripts are TypeScript; power users can author directly
2. **Auditability** — _intentDiagnosis + git history provides full forensic trail
3. **Human review** — Scripts are readable before expansion; user controls when to commit
4. **Idempotency** — Scripts don't execute on `cmdComplete`; only on explicit `roadmap expand`
5. **Concurrency-safe** — Timestamps prevent filename collisions; git handles DAG merges
6. **No magic** — Scripts do exactly what they show; no hidden side effects
7. **Convergence-aware** — Script header includes diagnosis; helps user understand expansion need
