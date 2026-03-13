# Fleet Intelligence

## Problem

The roadmap CLI completes DAGs but never learns from execution. Terminal nodes report `chainReady: true, gaps: []` because gap detection is structural (spec-time). Nobody reads trail, handoffs, or chain history to assess whether the root intent was actually satisfied. Agents can't propose successor roadmaps. The `loop` command duplicates `make/orient/advance` semantics. Fleet orient can't discover multiple DAGs per repo or unify frontiers across repos.

## Root Intent

Agents autonomously mine execution evidence, assess convergence across iterations, propose successor roadmaps, and execute them — closing the loop from "human states intent" to "intent satisfied" without manual spec authoring at each iteration boundary. Fleet scheduling unifies work across repos and DAGs into a single global frontier.

## Design

### 1. Fold `loop` into existing commands

`loop start` → `make --chain` (new iteration from predecessor).
`loop generate` → `make` in target repo (already works).
`loop mine` → `advance` at terminal (execution mining built into terminal advance).
`loop close` → `advance --fleet` (fleet-level terminal assessment).

The `loop` CLI command is removed. The `loops/` directory and SHA-chained receipts remain as internal bookkeeping written by `make --chain` and `advance`.

Remove `loop` from: router (`bin/roadmap.ts`), `KNOWN_COMMANDS`, `BRANCH_EXEMPT`, import. Delete `src/cli/loop.ts`. Move receipt-writing into `src/runtime/loop.ts` (already exists, keep it).

### 2. Execution Mining

New pure module: `src/runtime/execution-miner.ts`.

Input: `Context` (which already contains completion, handoffs, chain, scoring, trail metrics).
Output: `ExecutionFindings`.

```typescript
interface ExecutionFindings {
  // What agents discovered but no node addressed
  unaddressedDiscoveries: { source: string; nodeId: string; item: string }[];
  // Files changed outside any node's produces
  scopeDrift: { file: string; nodeId?: string }[];
  // Nodes where only grep/artifact-exists validators ran (no behavioral test)
  weakEvidence: { nodeId: string; validators: string[] }[];
  // Handoff blockers that were never resolved
  unresolvedBlockers: { nodeId: string; blocker: string }[];
  // Velocity signals: batches that retried or stalled
  velocitySignals: { level: number; signal: string }[];
}
```

Sources:
- `context.handoffs` — discovered[] items, blockers[], gotchas[]
- `context.completion` — validator evidence per node (grep-only = weak)
- `context.scoring` (TrailMetrics) — batch durations, retry counts
- Attribution warnings from advance output (files outside produces)

This is a pure function. No IO. All data comes through Context.

### 3. Trajectory Assessment

New pure module: `src/runtime/trajectory.ts`.

Input: `ExecutionFindings` + `ChainLink[]` (from `context.chain`) + `rootIntent` (from DAG desc or chain history).
Output: `TrajectoryAssessment`.

```typescript
interface TrajectoryAssessment {
  trend: 'converging' | 'stable' | 'orbiting' | 'diverging';
  // Per-iteration: what was the scope, what was resolved, what was new
  iterationSummaries: {
    iteration: number;
    dagId: string;
    nodesExecuted: number;
    findingsCount: number;
    resolvedFromPrevious: string[];
    newFindings: string[];
  }[];
  // Findings that appeared in 2+ iterations (orbiting signal)
  persistentFindings: string[];
  // Is the distance to root intent decreasing?
  intentDistance: 'decreasing' | 'flat' | 'increasing';
  // Recommendation
  recommendation: string;
}
```

Key logic:
- Compare current `ExecutionFindings` against previous iteration's findings (from archived heads' execution reports)
- If persistent findings grow or scope doesn't shrink → `orbiting`
- If findings decrease each iteration → `converging`
- `diverging` = new findings exceed resolved findings for 2+ iterations

### 4. Successor Proposal

New pure module: `src/runtime/successor.ts`.

Input: `TrajectoryAssessment` + `ExecutionFindings` + `rootIntent` + current DAG.
Output: `SuccessorProposal`.

```typescript
interface SuccessorProposal {
  action: 'continue' | 'converged' | 'orbit-break';
  rationale: string;
  // Only present when action === 'continue'
  specDraft?: {
    dagId: string;
    dagDesc: string;
    nodes: { id: string; desc: string; produces: string[]; consumes: string[]; mode: 'execute' | 'plan' }[];
  };
  // Only present when action === 'orbit-break'
  orbitDiagnosis?: string;
}
```

Logic:
- `converged`: no execution findings, trajectory decreasing or stable with 0 findings
- `continue`: findings exist, trajectory not orbiting → build spec from unaddressed items
- `orbit-break`: trajectory orbiting or diverging → stop, surface to human

The spec draft maps findings to nodes:
- Each `unaddressedDiscovery` → a node
- Each `weakEvidence` item → a test-hardening node
- Each `unresolvedBlocker` → a node
- `scopeDrift` → captured as produces in relevant nodes

### 5. Wire into Terminal Advance

When `advance` completes the terminal node:

1. Build `ExecutionFindings` via miner
2. Build `TrajectoryAssessment` via trajectory assessor
3. Build `SuccessorProposal` via proposer
4. Include all three in the advance response

The advance response at terminal gets three new fields:
- `executionFindings: ExecutionFindings`
- `trajectoryAssessment: TrajectoryAssessment`
- `successorProposal: SuccessorProposal`

When `action === 'continue'`, the agent can write the spec draft to a file and `roadmap make` it. When `action === 'orbit-break'`, the agent surfaces the diagnosis. When `action === 'converged'`, the work is done.

### 6. Multi-DAG Discovery

Enhance `orient --fleet` to scan `heads/` directories, not just `head.json`:

- Per repo: read `head.json` (if exists) + all `heads/*.json`
- Filter to active DAGs (not completed in chain history)
- Return all active frontiers per repo

This fixes the bug where stratum's `head.json` points at cycle-3 while cycle-7 lives in `heads/`.

### 7. Unified Fleet Frontier

Enhance `orient --fleet` to perform cross-repo toposort:

- Load all active DAGs from all repos
- Resolve cross-DAG dependencies (from `consumes` referencing paths in other repos)
- Topological sort across the unified graph
- Return the global frontier: all nodes that are unblocked across all repos and DAGs

Output adds `globalFrontier: { repo: string; dagId: string; nodeId: string; produces: string[] }[]`.

### 8. API/Help Enforcement Gate

New build-time validator: `src/lib/api-enforcement.ts`.

Reads:
- `KNOWN_COMMANDS` from router (or a canonical list)
- `schemas` registry from `src/lib/schemas.ts`
- Help text from `src/cli/help.ts`

Checks:
1. Every command in the router has a schema in `schemas.ts`
2. Every command in `schemas.ts` appears in `help` output
3. Every schema has: `description`, `input` (or explicit "no input"), `output`, at least one `example`
4. No orphan schemas (schema exists but command doesn't)

This runs as a shell validator in the spec and as a pre-commit gate.

## Nodes

### Phase 1: Fold loop, add enforcement

1. `fold-loop` — Remove loop CLI, fold receipts into make/advance
2. `api-enforcement` — Build-time validator for help/api parity

### Phase 2: Execution intelligence

3. `execution-miner` — Pure function: Context → ExecutionFindings
4. `trajectory-assessor` — Pure function: findings + chain → TrajectoryAssessment
5. `successor-proposer` — Pure function: assessment → SuccessorProposal
6. `wire-terminal` — Integrate miner/trajectory/successor into advance terminal flow

### Phase 3: Fleet scheduler

7. `multi-dag-discovery` — orient --fleet scans heads/, returns active frontiers
8. `unified-frontier` — Cross-repo toposort, global frontier in orient --fleet

### Phase 4: Tests + terminal verification

9. `test-intelligence` — Tests for miner, trajectory, successor
10. `test-fleet` — Tests for multi-dag discovery, unified frontier
11. `term` — Verify all produces, run full test suite, confirm API enforcement passes

## File Topology

```
src/runtime/
  execution-miner.ts   NEW — Context → ExecutionFindings (pure)
  trajectory.ts        NEW — findings + chain → TrajectoryAssessment (pure)
  successor.ts         NEW — assessment → SuccessorProposal (pure)
  fleet.ts             MODIFY — add heads/ scanning
  loop.ts              KEEP — receipt writing (internal, no CLI)

src/cli/
  advance.ts           MODIFY — wire intelligence into terminal
  orient.ts            MODIFY — multi-dag + unified frontier
  loop.ts              DELETE
  help.ts              MODIFY — remove loop, update text

src/lib/
  api-enforcement.ts   NEW — build-time parity validator
  schemas.ts           MODIFY — remove loop schemas, add enforcement
  fleet-types.ts       MODIFY — add multi-dag + frontier types

bin/roadmap.ts         MODIFY — remove loop import/route

tests/
  execution-miner.test.ts    NEW
  trajectory.test.ts         NEW
  successor.test.ts          NEW
  fleet-discovery.test.ts    NEW
  api-enforcement.test.ts    NEW
```
