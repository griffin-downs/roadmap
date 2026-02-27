# Expansion File I/O Architecture

## Module Dependency Graph

```
┌────────────────────────────────────────────────────────────┐
│ bin/roadmap.ts (CLI entrypoint)                            │
│   ├─ cmdComplete(nodeId)  ← INTEGRATION POINT              │
│   └─ cmdExpand(scriptPath)  (unchanged)                    │
└────────────────────────────────────────────────────────────┘
              ↓
┌────────────────────────────────────────────────────────────┐
│ NEW: src/lib/expansion-writer.ts                           │
│   └─ writeExpansionScript(parentId, node, failures, ...)  │
│      └─ Returns: absolute path to .ts file                │
└────────────────────────────────────────────────────────────┘
              ↓
        .roadmap/
        expansions/
          └─ <nodeId>-<timestamp>.ts  (written to disk)
              ↓
              └─ User reviews & runs: roadmap expand <path>
                  ↓
                  └─ cmdExpand executes script
                      ↓
                      └─ head.json updated + committed

EXISTING MODULES (unchanged):
  ├─ src/protocol.ts (types: NodeSpec, ValidationRule, Graph)
  ├─ src/lib/intent-expansion.ts (types: IntentFailure, FixNodeSpec)
  ├─ src/lib/intent-evaluator.ts (provides judgments)
  └─ src/predicates.ts (fileExists)
```

---

## Data Flow: Complete Intent → Script → DAG

```
┌─ User runs: roadmap complete <nodeId> ────────────────────┐
│                                                             │
├─ cmdComplete() loads DAG + node spec                       │
│                                                             │
├─ validateNode() with intent judgments                      │
│   └─ Evaluation phase: LLM judges each intent              │
│                                                             │
├─ intent fails + expandOnFail=true                          │
│   │                                                         │
│   ├─ extractIntentFailures()                               │
│   │   └─ failures: IntentFailure[]                         │
│   │       {                                                 │
│   │         statement: "JWT module implements...",         │
│   │         achieved: 0.42,                                │
│   │         threshold: 0.90,                               │
│   │         reasoning: "...",                              │
│   │         evidence: ["src/auth.ts:45"]                   │
│   │       }                                                 │
│   │                                                         │
│   ├─ generateIntentExpansion()                             │
│   │   └─ fixNodes: FixNodeSpec[]                           │
│   │       [{                                                │
│   │         id: "plan-auth-fix-0",                         │
│   │         expandedFrom: "plan-auth",                     │
│   │         produces: ["src/auth-rotation.ts"],            │
│   │         consumes: ["src/auth.ts"],  ← inherits parent  │
│   │         validate: [{type: 'intent', ...}, ...],        │
│   │         _intentDiagnosis: {  ← FULL PROVENANCE        │
│   │           statement: "JWT module implements...",       │
│   │           achievedConfidence: 0.42,                    │
│   │           threshold: 0.90,                             │
│   │           reasoning: "...",                            │
│   │           evidence: ["src/auth.ts:45"],                │
│   │           expansionDepth: 1                            │
│   │         }                                               │
│   │       }]                                                │
│   │                                                         │
│   └─ writeExpansionScript()  [NEW FUNCTION]                │
│       ├─ Input: parentId, node, failures, fixNodes         │
│       ├─ Create: .roadmap/expansions/<nodeId>-<ts>.ts     │
│       │   • Header: node ID, timestamp, parent, diagnosis  │
│       │   • Imports: fs, path                              │
│       │   • Load & modify head.json                        │
│       │   • Add each fixNode with _intentDiagnosis         │
│       │   • Write back + console.log                       │
│       └─ Return: absolute path (string)                    │
│                                                             │
├─ JSON response to user:                                    │
│   {                                                         │
│     "completed": false,                                    │
│     "node": "plan-auth",                                   │
│     "validation": {...},                                   │
│     "expansion": {                                          │
│       "script": ".roadmap/expansions/plan-auth-1709078400.ts",
│       "nextStep": "Review then run: roadmap expand ..."    │
│     }                                                       │
│   }                                                         │
│                                                             │
└─ User reviews script at: .roadmap/expansions/plan-auth-... ┘
                            │
                            ├─ cat .roadmap/expansions/...
                            │   Shows: nodeId, timestamp, parent, diagnosis
                            │   Shows: each fix node with full metadata
                            │
                            └─ User approves + runs: roadmap expand <path>
                                │
                                ├─ Validate file exists
                                ├─ Snapshot DAG before
                                ├─ Execute script (node --experimental-strip-types)
                                ├─ Script modifies head.json, writes back
                                ├─ Snapshot DAG after
                                ├─ Validate (define + check + verify + terminal intent)
                                ├─ Commit: "roadmap: expand — +1 nodes via plan-auth-..."
                                ├─ Record trail entry
                                │
                                └─ DAG now has fix nodes:
                                    {
                                      id: "plan-auth-fix-0",
                                      expandedFrom: "plan-auth",
                                      _intentDiagnosis: {...},
                                      ...
                                    }
```

---

## File Layout: Generated Script

### Template

```typescript
#!/usr/bin/env node
┌─ Shebang (executable)
│
├─ // Expansion script for: <parentId>
├─ // Generated: 2025-02-27T04:00:00Z
├─ // Parent: <parentId>
├─ // Diagnosis: <first failure reasoning, truncated>
│  └─ Header: Human-readable context (for git diff, audit)
│
├─ import { readFileSync, writeFileSync } from 'node:fs';
├─ import { join } from 'node:path';
│  └─ Imports: minimal stdlib only
│
├─ const headPath = join(process.cwd(), '.roadmap', 'head.json');
├─ const dag = JSON.parse(readFileSync(headPath, 'utf-8'));
│  └─ Load current DAG state
│
├─ // ─────────────────────────────────────────────────────
├─ // Expansion: intent-expansion
├─ // ─────────────────────────────────────────────────────
│
├─ dag.nodes['plan-auth-fix-0'] = { ... };
├─ dag.nodes['plan-auth-fix-1'] = { ... };
│  └─ One node assignment per fix node
│     • id, desc, expandedFrom
│     • produces, consumes, ambient, deps
│     • validate (includes original intent rule)
│     • idempotent
│     • _intentDiagnosis (FULL AUDIT TRAIL)
│
├─ // ─────────────────────────────────────────────────────
├─ // Connect: update parent dependency
├─ // ─────────────────────────────────────────────────────
│
├─ dag.nodes['plan-auth'] = {
│   ...dag.nodes['plan-auth'],
│   deps: ['plan-auth-fix-0', 'plan-auth-fix-1']  // was []
│ };
│  └─ Rewire: parent now depends on fix nodes
│     (Plan nodes don't execute; their children do)
│
├─ writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
├─ console.log('Expanded: plan-auth → plan-auth-fix-0, plan-auth-fix-1 (+2 nodes)');
│  └─ Persist & notify
```

### Example: Full Script

```typescript
#!/usr/bin/env node
// Expansion script for: plan-auth-strategy
// Generated: 2025-02-27T04:00:00Z
// Parent: plan-approvals
// Diagnosis: JWT rotation intent at depth 1 did not converge

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// ─────────────────────────────────────────────────────
// Expansion: intent-expansion
// ─────────────────────────────────────────────────────

dag.nodes['plan-auth-strategy-fix-0'] = {
  id: 'plan-auth-strategy-fix-0',
  desc: 'Fix: JWT module implements rotation (confidence 0.42/0.90)',
  expandedFrom: 'plan-auth-strategy',
  produces: ['src/auth-rotation.ts', 'tests/auth-rotation.test.ts'],
  consumes: ['src/auth-core.ts', 'src/auth.ts'],
  ambient: ['docs/jwt-spec.md'],
  deps: ['plan-auth-strategy'],
  validate: [
    {
      type: 'intent',
      statement: 'JWT module implements rotation',
      confidence: 0.9,
      evaluator: 'self',
      expandOnFail: true,
      maxExpansionDepth: 3,
    },
    {
      type: 'artifact-exists',
      target: 'src/auth-rotation.ts',
    },
    {
      type: 'artifact-exists',
      target: 'tests/auth-rotation.test.ts',
    },
  ],
  idempotent: true,
  _intentDiagnosis: {
    statement: 'JWT module implements rotation',
    achievedConfidence: 0.42,
    threshold: 0.9,
    reasoning: 'Tokens rotate in-process but no refresh endpoint exists; token lifetime logic present but incomplete.',
    evidence: [
      'src/auth.ts:45',
      'tests/auth.test.ts (no rotation scenario tests)',
    ],
    expansionDepth: 1,
  },
};

// ─────────────────────────────────────────────────────
// Connect: update parent dependency
// ─────────────────────────────────────────────────────

dag.nodes['plan-auth-strategy'] = {
  ...dag.nodes['plan-auth-strategy'],
  deps: ['plan-auth-strategy-fix-0'],
};

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log('Expanded: plan-auth-strategy → plan-auth-strategy-fix-0 (+1 node)');
```

---

## Auditability Trail

From intent failure → fix node → committed DAG:

```
1. User runs: roadmap complete plan-auth-strategy --evaluate '[{"statement":"...","confidence":0.42,"reasoning":"..."}]'

2. cmdComplete() validation fails, calls:
   writeExpansionScript(
     "plan-auth-strategy",
     parentNode,
     [IntentFailure{ statement, achieved: 0.42, threshold: 0.9, reasoning, evidence }],
     [FixNodeSpec{ id, expandedFrom, _intentDiagnosis }],
     "intent-expansion",
     repoRoot
   )

3. Script written to disk:
   .roadmap/expansions/plan-auth-strategy-1709078400.ts
   ├─ Header: "// Expansion script for: plan-auth-strategy"
   ├─ Node assignment: dag.nodes['plan-auth-strategy-fix-0'] = {...}
   └─ Diagnosis: _intentDiagnosis { statement, achieved, threshold, reasoning, evidence, depth }

4. User runs: roadmap expand .roadmap/expansions/plan-auth-strategy-1709078400.ts

5. cmdExpand() executes script, validates, commits:
   git commit -m "roadmap: expand — +1 nodes via plan-auth-strategy-1709078400.ts"

6. Full forensic trail exists:
   ├─ .roadmap/expansions/plan-auth-strategy-1709078400.ts (script source)
   ├─ git log (commit that added fix node)
   ├─ git show <commit>:head.json (DAG state after expansion)
   ├─ git show <commit>:.roadmap/expansions/... (script as committed)
   └─ head.json (current DAG with plan-auth-strategy-fix-0 + _intentDiagnosis)

7. Query: Why does plan-auth-strategy-fix-0 exist?
   $ git show <commit>:.roadmap/expansions/plan-auth-strategy-1709078400.ts | grep -A 15 "_intentDiagnosis"

   Output:
   _intentDiagnosis: {
     statement: 'JWT module implements rotation',
     achievedConfidence: 0.42,
     threshold: 0.9,
     reasoning: 'Tokens rotate in-process but no refresh endpoint exists...',
     evidence: ['src/auth.ts:45', ...],
     expansionDepth: 1,
   }
```

---

## Error Paths

### Scenario 1: Intent Fails, Not Expandable

```
validateNode(node) → { passed: false, checks: [...], expandable: false }
                                                      ↓
                                              cmdComplete() returns:
                                              {
                                                "completed": false,
                                                "validation": { ... }
                                              }
                   NO SCRIPT WRITTEN
```

### Scenario 2: Intent Fails, Expandable, Script Succeeds

```
validateNode() → expandable: true
   ↓
extractIntentFailures() → failures: IntentFailure[]
   ↓
generateIntentExpansion() → fixNodes: FixNodeSpec[]
   ↓
writeExpansionScript() → ".roadmap/expansions/plan-auth-1709078400.ts"
   ↓
JSON response: { completed: false, expansion: { script: "...", nextStep: "..." } }
   ↓
User: roadmap expand <path>
   ↓
cmdExpand() → script executes → DAG updated → committed
```

### Scenario 3: Intent Fails, Expandable, Script Error

```
writeExpansionScript() throws:
  RoadmapError('FILE_WRITE_FAILED', { fix: "Check permissions..." })
   ↓
cmdComplete() catches and returns error JSON
   ↓
User: fix permissions / disk space / etc.
   ↓
Retry: roadmap complete plan-auth (generates new script)
```

### Scenario 4: Expansion Script Syntax Error

```
User runs: roadmap expand .roadmap/expansions/plan-auth-1709078400.ts
   ↓
cmdExpand() executes: node --experimental-strip-types <path>
   ↓
Script throws (e.g., JSON.parse error)
   ↓
execSync() fails
   ↓
RoadmapError('VALIDATION_FAILED', { fix: "Fix the expansion script and re-run" })
   ↓
User: edits .roadmap/expansions/plan-auth-1709078400.ts
   ↓
Retry: roadmap expand .roadmap/expansions/plan-auth-1709078400.ts
```

---

## Invariants Maintained

| Invariant | Enforced By | Verified When |
|-----------|-------------|---------------|
| Every fix node has expandedFrom | generateIntentExpansion() | Before write + git history |
| Every fix node has _intentDiagnosis | generateIntentExpansion() | Before write + visible in script |
| _intentDiagnosis matches source failure | generateIntentExpansion() mapping | Code review + test |
| Script is valid TypeScript | Well-formed template | tsx parser (test) |
| Script modifies only head.json | Disciplined write (readFileSync → writeFileSync) | Code inspection |
| Fix nodes have consumes ⊇ parent produces | resolveProduces() in generateIntentExpansion() | Test + visual |
| Filenames don't collide | Timestamp + sequence counter | Empirical (rare) |
| Scripts are idempotent | defineNode as data (no side effects) | Re-run test |

All verifiable either in code, tests, or via `roadmap expand` validation.
