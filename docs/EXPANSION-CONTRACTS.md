# Expansion File I/O — Type Contracts

## New Module: `src/lib/expansion-writer.ts`

### Primary Export

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

**Parameters:**

| Parameter | Type | Required | Source | Notes |
|-----------|------|----------|--------|-------|
| `parentId` | `string` | Yes | `cmdComplete(nodeId)` | Plan node that failed |
| `parentNode` | `NodeSpec<any>` | Yes | `loadDAG().nodes[parentId]` | Full node spec from DAG |
| `failures` | `IntentFailure[]` | Yes | `extractIntentFailures(checks, judgments)` | 1+ failing intents |
| `fixNodes` | `FixNodeSpec[]` | Yes | `generateIntentExpansion(...)` | Expansion output; 1:1 with failures |
| `reason` | enum | Yes | Context-dependent | Explains why expansion occurred |
| `repoRoot` | `string` | Yes | `process.cwd()` | Root of repo; used for `.roadmap/` path |

**Return value:**

| Type | Value | Meaning |
|------|-------|---------|
| `string` | Absolute path | `.roadmap/expansions/<nodeId>-<timestamp>.ts` |

**Throws:**

| Error | Condition | Recovery |
|-------|-----------|----------|
| `RoadmapError('FILE_WRITE_FAILED', ...)` | Can't create .roadmap/expansions/ | Check disk space / permissions |
| `RoadmapError('INVALID_FIXNODES', ...)` | fixNodes array is empty or malformed | Fix calling code |
| `RoadmapError('TIMESTAMP_COLLISION', ...)` | File already exists (same timestamp) | Rare; retry adds sequence number |

### Imported Types

```typescript
import type { IntentFailure } from './intent-expansion.ts';
import type { FixNodeSpec } from './intent-expansion.ts';
import type { NodeSpec } from '../protocol.ts';
```

These are **already exported** from intent-expansion module; no new type definitions needed.

---

## Integration Points

### In `cmdComplete()` (bin/roadmap.ts)

**Before:**
```typescript
async function cmdComplete(nodeId: string, note: string) {
  const dag = loadDAG();
  const node = dag.nodes[nodeId];

  const result = await validateNode(dag, nodeId, exists, options);

  if (result.passed) {
    // ... success path
  }

  // Non-expandable rejection (before, no script written)
  json({ completed: false, validation: result });
}
```

**After:**
```typescript
async function cmdComplete(nodeId: string, note: string) {
  const dag = loadDAG();
  const node = dag.nodes[nodeId];

  const result = await validateNode(dag, nodeId, exists, options);

  if (result.passed) {
    // ... success path
  }

  // Check if expansible
  if (result.expansionStatus === 'expanding' && result.failingIntents) {
    const fixNodes = generateIntentExpansion(
      nodeId,
      node.produces,
      node.consumes.map(consumeArtifact),
      node.ambient,
      node.validate,
      result.failingIntents,
      0,  // initial depth
    );

    // NEW: write script to disk
    const scriptPath = writeExpansionScript(
      nodeId,
      node,
      result.failingIntents,
      fixNodes.fixNodes,
      'intent-expansion',
      repoRoot,
    );

    // Enhanced JSON response
    json({
      completed: false,
      node: nodeId,
      validation: result,
      expansion: {
        script: scriptPath,
        nextStep: `Review then run: roadmap expand ${scriptPath}`,
      },
    });
  } else {
    // Non-expandable failure
    json({ completed: false, validation: result });
  }
}
```

### Imports Needed in `bin/roadmap.ts`

```typescript
import { writeExpansionScript } from '../src/lib/expansion-writer.ts';
import { generateIntentExpansion } from '../src/lib/intent-expansion.ts';
import { consumeArtifact } from '../src/protocol.ts';
```

---

## Generated Script Structure

### File Template

Every script follows this shape:

```typescript
#!/usr/bin/env node
// Expansion script for: <parentId>
// Generated: <ISO 8601 timestamp>
// Parent: <parentNode.id>
// Diagnosis: <one-line summary from first failure's reasoning>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// ─────────────────────────────────────────────────────
// Expansion: <reason enum value>
// ─────────────────────────────────────────────────────

// For each fixNode in fixNodes:
dag.nodes['<fixNode.id>'] = {
  id: '<fixNode.id>',
  desc: '<fixNode.desc>',
  expandedFrom: '<fixNode.expandedFrom>',
  produces: <JSON.stringify(fixNode.produces)>,
  consumes: <JSON.stringify(fixNode.consumes)>,
  ambient: <fixNode.ambient ? JSON.stringify(fixNode.ambient) : undefined>,
  deps: <JSON.stringify(fixNode.deps)>,
  validate: <JSON.stringify(fixNode.validate)>,
  idempotent: <fixNode.idempotent>,
  _intentDiagnosis: <JSON.stringify(fixNode._intentDiagnosis, null, 2)>,
};

// ─────────────────────────────────────────────────────
// Connect: update dependencies
// ─────────────────────────────────────────────────────

// If parentNode.mode === 'plan', rewire deps
dag.nodes['<parentId>'] = {
  ...dag.nodes['<parentId>'],
  deps: <JSON.stringify(fixNodes.map(n => n.id))>,
};

// Write back to disk
writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log('Expanded: <parentId> → <fixNode IDs> (+<N> nodes)');
```

### Serialization Rules

- `produces`, `consumes`, `deps`, `validate`: use `JSON.stringify()`
- `_intentDiagnosis`: use pretty-print `JSON.stringify(..., null, 2)` for readability
- All values must be JSON-serializable (no functions, symbols, etc.)
- Existing DAG nodes accessed via spread: `...dag.nodes['<id>']`

---

## Filename Convention

### Pattern
```
<nodeId>-<timestamp>.ts
```

### Components

| Part | Format | Example | Notes |
|------|--------|---------|-------|
| nodeId | kebab-case | `plan-auth-strategy` | From `parentId` parameter |
| timestamp | Unix seconds | `1709078400` | `Date.now() / 1000 \| 0` |
| extension | Literal `.ts` | `.ts` | Always TypeScript |

### Collision Handling

**Scenario:** Two invocations within same second on same node.

**Behavior:**
1. First write: `plan-auth-strategy-1709078400.ts`
2. Second write: Append sequence: `plan-auth-strategy-1709078400-1.ts`
3. Continue: `-2`, `-3`, etc.

**Implementation:**
```typescript
let path = `${nodeId}-${timestamp}.ts`;
let seq = 0;
while (existsSync(join(expansionDir, path))) {
  seq++;
  path = `${nodeId}-${timestamp}-${seq}.ts`;
}
```

Rare in practice (sub-second collision requires two agents, same second, same parent).

---

## Error Handling

### Validation Before Write

Before calling `writeExpansionScript()`, caller must ensure:

- [x] `failures.length > 0` (at least one intent failure)
- [x] `fixNodes.length === failures.length` (1:1 correspondence)
- [x] Every `fixNode.id` is unique
- [x] Every `fixNode.expandedFrom === parentId`
- [x] `parentNode` exists in DAG

**If violated:** `generateIntentExpansion()` output is malformed; don't call write.

### Exceptions During Write

| Exception | Message | Fix |
|-----------|---------|-----|
| `EACCES` | Permission denied | Check `.roadmap/` ownership |
| `ENOENT` | `.roadmap/` missing | Should auto-create; if fails, check parent |
| `ENOSPC` | Disk full | Free space |
| JSON serialization error | `_intentDiagnosis` has non-JSON | Validate fixNode data |

**Handling:** All wrapped in `RoadmapError`; user gets actionable message.

---

## Auditability Contracts

### _intentDiagnosis Invariant

Every fix node's `_intentDiagnosis` MUST have:

```typescript
{
  statement: string;           // matches one IntentFailure.statement
  achievedConfidence: number;  // 0.0–1.0, from IntentFailure.achieved
  threshold: number;           // 0.0–1.0, from IntentFailure.threshold
  reasoning: string;           // from IntentFailure.reasoning
  evidence: string[];          // from IntentFailure.evidence
  expansionDepth: number;      // 0 for first expansion, 1 for second, etc.
}
```

**Origin:** Maps 1:1 to `IntentFailure` from `extractIntentFailures()`.

### expandedFrom Invariant

Every fix node's `expandedFrom` MUST equal `parentId`.

**Enforced:** `generateIntentExpansion()` sets it; write just serializes.

### Consumes Inheritance Invariant

Every fix node's `consumes` MUST include parent node's `produces`.

**Origin:** `generateIntentExpansion()` calls `resolveProduces()`, which includes parent produces.

---

## CLI Integration

### Command: `roadmap expand <scriptPath>`

**Existing behavior (no changes):**

```bash
roadmap expand .roadmap/expansions/plan-auth-strategy-1709078400.ts
```

1. Validate file exists
2. Snapshot DAG before
3. Execute: `node --experimental-strip-types <scriptPath>`
4. Snapshot DAG after
5. Validate (define, check, verify, terminal intent)
6. Commit with message: `roadmap: expand — +N nodes via <path>`
7. Record trail entry

**Script interaction:**
- Script receives: CWD = repo root
- Script reads: `.roadmap/head.json`
- Script writes: `.roadmap/head.json` (modified)
- Script outputs: `console.log()` for user visibility

**Postcondition:** DAG is updated; `roadmap expand` validates and commits.

---

## Testing Strategy

### Unit: `writeExpansionScript()` directly

```typescript
it('writes valid TypeScript with all metadata', () => {
  const script = writeExpansionScript(
    'plan-test',
    parentNode,
    [failure],
    [fixNode],
    'intent-expansion',
    tmpDir,
  );

  // Check file exists
  expect(existsSync(script)).toBe(true);

  // Check syntax (tsx parser)
  const parsed = parseSync(readFileSync(script, 'utf-8'), { isModule: true });
  expect(parsed).toBeDefined();

  // Check content
  const content = readFileSync(script, 'utf-8');
  expect(content).toContain('// Expansion script for: plan-test');
  expect(content).toContain('expandedFrom: \'plan-test\'');
  expect(content).toContain('_intentDiagnosis');
});
```

### Integration: Script execution + DAG update

```typescript
it('script modifies head.json without errors', () => {
  const beforeCount = Object.keys(dag.nodes).length;

  execSync(`node --experimental-strip-types ${scriptPath}`, { cwd: repoRoot });

  const dagAfter = JSON.parse(readFileSync(headPath, 'utf-8'));
  expect(Object.keys(dagAfter.nodes).length).toBe(beforeCount + 1);

  // Validate structure
  expect(define(dagAfter)).toBeDefined();
  expect(check(dagAfter).done).toBe(true);
});
```

### Edge cases

- Multiple failures → multiple fix nodes (N:N)
- Concurrent timestamps → sequence suffix
- Empty failures (should error before write)
- Parent with `mode: 'plan'` → deps rewired

---

## Summary of Contracts

| Contract | Enforced By | Checked When |
|----------|-------------|--------------|
| `fixNodes.length > 0` | `generateIntentExpansion()` | Before write |
| `fixNodes[i]._intentDiagnosis` exists | `generateIntentExpansion()` | Before write + on read (test) |
| `fixNodes[i].expandedFrom === parentId` | `generateIntentExpansion()` | Before write + git history |
| Script is valid TypeScript | `writeExpansionScript()` (well-formed template) | `tsx` parser in test |
| Filename is unique | Collision-detection loop | Before write |
| Consumes include parent produces | `generateIntentExpansion()` via `resolveProduces()` | Visual inspection + test |
| DAG valid after script execution | `cmdExpand()` calls `define/check/verify` | On `roadmap expand` |

All are **verifiable** either at write-time, in tests, or via `roadmap expand` validation.
