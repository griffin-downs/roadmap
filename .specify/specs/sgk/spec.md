# SGK-1: Strategy Governance Kernel — Specification

## Overview

Make strategy usage non-optional and self-propagating. A run cannot dispatch without a selected strategy receipt. A run cannot complete without init+term intent gates. A run cannot close without mining+audit artifacts+receipts. CLI surfaces strategies continuously.

## Concepts

### Run
Durable execution unit identified by `runId: RunId`. Scoped to `.roadmap/runs/<runId>/`. Contains all receipts for a single governed execution — from manifest through close.

### Strategy
Named execution policy from `src/lib/strategy/registry.ts`. Governs gate frequency, risk tolerance, bypass allowances. Selection is receipt-backed — no silent latching.

### Kernel Gates
- **Init Intent Gate**: front gate — bound to plan+strategy SHA before dispatch
- **Terminal Intent Gate**: back gate — bound to display+mine receipt IDs at run close

### Post-Run Obligations
Mining + audit must complete before run close. Run close receipt references all prerequisite receipts. Missing any = `CLOSE_INCOMPLETE`.

---

## Receipt Schemas

### R0: Run Manifest
**Path**: `.roadmap/runs/<runId>/RUN.json`
```typescript
{
  schema_version: 1,
  runId: string,
  dagId: string,
  scenario: string,          // human description of what this run does
  createdAt: string,         // ISO
  bindings: {
    headSha: string,
    treeSha: string,
    repoRoot: string,
  },
  strategyState: 'pending' | 'selected' | 'overridden',
  teamBinding: {
    teamId?: string,
    workerCount: number,
  },
  policyHashes: {
    kernelSha: string,       // sha256 of kernel.json
    registrySha: string,     // sha256 of strategy registry
  },
}
```

### R1: Strategy Selection
**Path**: `.roadmap/runs/<runId>/strategy/SELECT.json`
```typescript
{
  schema_version: 1,
  runId: string,
  strategyId: string,
  selectionMode: 'auto' | 'ask' | 'manual',
  autoSelectEvidence?: {
    maxParallelism: number,
    rule: string,
  },
  strategyConfigSha: string, // sha256 of selected StrategyConfig
  candidateSetDigest: string, // sha256 of all strategy IDs
  constraints: string[],      // from kernel.json policies
  selectedAt: string,         // ISO
}
```

### R2: Plan Selection
**Path**: `.roadmap/runs/<runId>/plan/SELECT.json`
```typescript
{
  schema_version: 1,
  runId: string,
  planId: string,            // DAG id
  candidateSetDigest: string,
  bindingSha: string,        // sha256 of plan overlay or head.json
  selectedAt: string,        // ISO
}
```

### R3: Init Intent Gate
**Path**: `.roadmap/runs/<runId>/intent/INIT.json`
```typescript
{
  schema_version: 1,
  runId: string,
  statements: Array<{
    text: string,
    threshold: number,       // 0-1 confidence
  }>,
  judgmentStatus: 'passed' | 'failed' | 'unevaluated',
  policyFlags: {
    allowUnevaluated: boolean,
    boundPlanSha: string,
    boundStrategySha: string,
  },
  evaluatedAt: string,       // ISO
}
```

### R4: Terminal Intent Gate
**Path**: `.roadmap/runs/<runId>/intent/TERM.json`
```typescript
{
  schema_version: 1,
  runId: string,
  statements: Array<{
    text: string,
    threshold: number,
    evidence: string[],
  }>,
  judgmentStatus: 'passed' | 'failed' | 'unevaluated',
  policyFlags: {
    allowUnevaluated: boolean,
  },
  evidencePointers: {
    displayReceiptId: string,
    mineReceiptId: string,
  },
  evaluatedAt: string,       // ISO
}
```

### R5: Mining Receipt
**Path**: `.roadmap/runs/<runId>/mine/MINE.json`
```typescript
{
  schema_version: 1,
  runId: string,
  toolCallCounts: Record<string, number>,
  latencyP50Ms: number,
  latencyP95Ms: number,
  hotspots: Array<{ tool: string, count: number, agentIds: string[] }>,
  friction: Array<{ category: string, detail: string }>,
  minedAt: string,           // ISO
}
```

### R6: Audit Receipt
**Path**: `.roadmap/runs/<runId>/audit/AUDIT.json`
```typescript
{
  schema_version: 1,
  runId: string,
  complianceVerdicts: Array<{
    code: string,
    passed: boolean,
    evidence: string[],
    fix: string[],
  }>,
  bypassUsage: Array<{
    type: string,
    scope: string,
    receiptPath: string,
  }>,
  overallPassed: boolean,
  auditedAt: string,         // ISO
}
```

### R7: Run Close
**Path**: `.roadmap/runs/<runId>/CLOSE.json`
```typescript
{
  schema_version: 1,
  runId: string,
  requiredReceipts: {
    manifest: string,        // path to RUN.json
    strategySelection: string,
    planSelection: string,
    initIntent: string,
    termIntent: string,
    mining: string,
    audit: string,
  },
  allSatisfied: boolean,
  closedAt: string,          // ISO
}
```

### R8: Display Receipt
**Path**: `.roadmap/runs/<runId>/display/<stamp>.json`
```typescript
{
  schema_version: 1,
  runId: string,
  renderedBlocks: Array<{
    id: string,
    title: string,
    body: string,
  }>,
  cmd: string,
  humanMode: boolean,
  stamp: string,             // ISO or monotonic
}
```

---

## CLI Enforcement Rules

### E1: Mandatory --run injection
Governed commands: `orient`, `parallel`, `plan`, `strategy`, `dispatch`, `complete`, `mine`, `audit`, `opt`, `verify`.
If `--run <runId>` is absent and no active run exists, emit `RUN_ID_REQUIRED` error via `emitError`.

### E2: Dispatch gated by strategy+plan+init intent
`roadmap dispatch` requires:
1. R1 (Strategy Selection) exists for active run → else `STRATEGY_NOT_SELECTED`
2. R2 (Plan Selection) exists → else `PLAN_NOT_SELECTED`
3. R3 (Init Intent Gate) exists and `judgmentStatus !== 'failed'` → else `INIT_INTENT_MISSING`

### E3: Complete attaches node receipt
`roadmap complete <nodeId>` writes node completion receipt to `.roadmap/runs/<runId>/nodes/<nodeId>.json` referencing `strategyId` and `gateMode`.

### E4: Run close requires TERM + mine + audit
`roadmap run close` requires:
1. R4 (Terminal Intent Gate) exists and `judgmentStatus !== 'failed'`
2. R5 (Mining Receipt) exists
3. R6 (Audit Receipt) exists and `overallPassed === true`
Missing any → `CLOSE_INCOMPLETE` with list of absent receipts.

### E5: Strategy surface in output
Every `orient`, `parallel`, `plan`, `dispatch` output includes `availableStrategies: StrategyConfig[]` and `selectedStrategy: ActiveStrategy | null` in the data envelope.

### E6: Auto-select deterministic and receipt-backed
Auto-select writes R1 receipt. Deterministic rule: `maxParallelism > 2 → hallucinate-rounds-then-validate`, else `validate-as-you-go`. Policy control: `kernel.json.allowDispatchAutoStrategy` enables/disables.

### E7: Init intent binds to plan+strategy SHA
R3 `policyFlags.boundPlanSha` = sha256 of plan overlay. `boundStrategySha` = sha256 of strategy config. Drift = `INIT_INTENT_DRIFT` error on dispatch.

### E8: Term intent requires display + mine receipt IDs
R4 `evidencePointers.displayReceiptId` and `mineReceiptId` must reference existing receipts. Missing = `TERM_EVIDENCE_MISSING`.

---

## Kernel Config Additions

New fields in `.roadmap/kernel.json`:
```json
{
  "requireRunId": true,
  "allowDispatchAutoStrategy": true,
  "allowUnevaluatedInitIntent": false,
  "allowUnevaluatedTermIntent": false,
  "breakglassEnabled": true
}
```

---

## Acceptance Tests

### AT1: Strategies surfaced in orient
**Given** a run with no strategy selected
**When** `roadmap orient --run <runId>` executes
**Then** output includes `availableStrategies[]` with 3 entries and `selectedStrategy: null`

### AT2: Dispatch fails without chain
**Given** a run with no strategy receipt (R1)
**When** `roadmap dispatch --run <runId>` executes
**Then** error `STRATEGY_NOT_SELECTED` emitted, exit code 1
**And Given** R1 exists but no R2
**Then** error `PLAN_NOT_SELECTED`
**And Given** R1+R2 exist but no R3
**Then** error `INIT_INTENT_MISSING`

### AT3: Dispatch auto-select writes receipt
**Given** `kernel.json.allowDispatchAutoStrategy: true` and no R1
**When** `roadmap dispatch --run <runId>` with `--auto-strategy` flag
**Then** R1 written to `.roadmap/runs/<runId>/strategy/SELECT.json` with `selectionMode: 'auto'` and `autoSelectEvidence` populated

### AT4: Run close enforces obligations
**Given** a run with R1+R2+R3 but missing R5 (mining)
**When** `roadmap run close --run <runId>` executes
**Then** error `CLOSE_INCOMPLETE` with `missing: ['mine']`

### AT5: Term intent requires display receipt
**Given** a run with R4 where `evidencePointers.displayReceiptId` references non-existent receipt
**When** term intent is validated
**Then** error `TERM_EVIDENCE_MISSING` with fix pointing to display receipt path

### AT6: Audit detects strategy ignorance
**Given** a completed run where no strategy was selected but dispatch occurred (breakglass)
**When** `roadmap audit --run <runId>` executes
**Then** audit detector `SGK-STRATEGY-IGNORED` fires with `passed: false` and evidence listing the dispatch receipt without strategy binding
