# FR: Enforce `validate` on `roadmap complete`

## Problem

`roadmap complete` accepts any completion unconditionally. The `validate` array on
every `NodeSpec` is fully typed (`artifact-exists`, `shell`, `function`, `expanded`,
`manual-approval`) and `validateNode()` in `protocol.ts:975` is fully implemented
— but `cmdComplete` in `bin/roadmap.ts:1233` never calls it.

Validation is decorative. Agents self-report completion and the DAG believes them.

### Evidence from todo-app iteration 1

- 99 agents (17 named + 82 subagents) completed all 42 nodes
- Council reviewed and found 0 expansion proposals
- App did not launch — 10 integration bugs at node boundaries
- Every bug was catchable by existing `validate` types:

| Bug | Missed by | Catchable by |
|---|---|---|
| `emptyOutDir` wipes main.js | unit tests | `shell: electron-vite build && test -f dist/electron/main.js` |
| Preload ESM in CJS sandbox | unit tests | `shell: node -e "require('./dist/electron/preload.cjs')"` |
| Wrong preload path in main | unit tests | `artifact-exists: dist/electron/preload.cjs` + `shell` grep |
| Missing `@tailwindcss/vite` | unit tests | `shell: grep -q flex dist/renderer/assets/*.css` |
| Tailwind v4 dark mode config | unit tests | `shell: grep -q '\.dark' dist/renderer/assets/*.css` |
| Theme not applied on mount | manual test | new type: `spec-conformance` |
| `:memory:` db in dev mode | test mocks | `shell: npx electron . --run-and-quit` (new) |
| Mac menu missing theme toggle | code review | new type: `spec-conformance` |
| better-sqlite3 ABI mismatch | test mocks | `shell: npx electron -e "require('better-sqlite3')"` |
| Electron binary not installed | — | `artifact-exists: node_modules/.../electron/dist/electron` |

7 of 10 bugs are catchable with existing `shell` and `artifact-exists` types.
3 require a new `spec-conformance` type.

## Proposal

### 1. Wire `validateNode` into `cmdComplete`

In `bin/roadmap.ts`, between claim (step 1) and checkpoint (step 2):

```typescript
// 1.5 Validate — run all validation rules before accepting completion
const validationResult = await validateNode(dag, nodeId, fileExists(repoRoot));
if (!validationResult.passed) {
  // Release claim on failure
  delete claimStore[nodeId];
  saveClaims(repoRoot, claimStore);

  json({
    error: `Validation failed for "${nodeId}"`,
    checks: validationResult.checks,
    failedCount: validationResult.checks.filter(c => !c.passed).length,
    fix: 'Fix the failing validations and retry complete',
  });
  process.exit(1);
}
```

`roadmap complete` becomes a request that can be denied.

### 2. Add `--skip-validate` escape hatch

For manual overrides when a validator is wrong or flaky:

```
roadmap complete <node-id> --skip-validate --note "reason for skip"
```

Records the skip in the trail with the reason. Auditable, not silent.

### 3. New validation type: `spec-conformance`

For acceptance criteria that require semantic judgment, not just shell exit codes:

```typescript
| { type: 'spec-conformance'; spec: string; stories: number[]; criteria?: number[] }
```

Implementation in `validateNode`:
- Reads the spec file at `spec` path
- Extracts the listed story acceptance scenarios
- Reads the produced artifacts for this node
- Spawns a scoped validation agent (lightweight, max 2 turns, ~30s):
  - Agent receives: spec criteria + produced files
  - Agent returns: `{ passed: boolean, evidence: string }` per criterion
- Agent lifetime: seconds, not the 30-43 minutes from round 1's named workers

Example on a node:

```typescript
'component-themetoggle': {
  produces: ['src/components/ThemeToggle.vue'],
  consumes: ['shared/types.ts'],
  validate: [
    { type: 'artifact-exists', target: 'src/components/ThemeToggle.vue' },
    { type: 'shell', command: 'vitest run tests/components/ThemeToggle.test.ts' },
    { type: 'spec-conformance', spec: '.specify/specs/001-todo-app/spec.md', stories: [4], criteria: [1, 2, 3] },
  ],
}
```

### 4. New validation type: `build-produces`

Validates that a build command produces expected outputs:

```typescript
| { type: 'build-produces'; command: string; outputs: string[] }
```

Runs the command, then checks all outputs exist. Catches the entire class of
"build succeeded but file is missing" bugs:

```typescript
validate: [
  { type: 'build-produces', command: 'npx electron-vite build', outputs: ['dist/electron/main.js', 'dist/electron/preload.cjs', 'dist/renderer/index.html'] },
]
```

### 5. New validation type: `launch-check`

Validates that an application starts without crashing:

```typescript
| { type: 'launch-check'; command: string; timeout?: number; successSignal?: string }
```

Starts the process, waits for `successSignal` in stdout (or just exit code 0 within
timeout), then kills it:

```typescript
validate: [
  { type: 'launch-check', command: 'npx electron .', timeout: 10000, successSignal: '[main] window created' },
]
```

## Architectural impact

### What this replaces

| Round 1 (agent-supervised) | Round 2 (DAG-supervised) |
|---|---|
| 17 named agents (coordination layer) | 0 — DAG is the coordinator |
| 82 subagents (18 wasted, 44 trivial) | ~6 workers, no sub-delegation |
| Council (3 agents, 30min, 0 findings) | `spec-conformance` validators at node boundaries |
| Evidence collection phase | Validation results ARE the evidence |
| Reflect-expand phase | Gap report from aggregated `ValidationResult[]` |
| 1.6M tokens on message routing | 0 — agents talk to DAG, not each other |

### What the agent workflow becomes

```
1. Agent receives brief: node-id, consumes, produces, ambient
2. Agent does work
3. Agent calls: roadmap complete <node-id>
4. Roadmap runs validate array:
   - artifact-exists checks
   - shell commands (tests, builds, lint)
   - build-produces (build + verify outputs)
   - launch-check (start app, verify it runs)
   - spec-conformance (scoped agent, 30s, checks acceptance criteria)
5a. All pass → node closes, downstream unblocks
5b. Any fail → agent gets structured error, fixes, retries step 3
```

No team. No messages. No council. The DAG is the authority.

### Self-improvement signal

Aggregated `ValidationResult[]` across all nodes at end of run = the gap report.
Failed validations that were fixed = known friction points.
`spec-conformance` results = spec-vs-actual delta.

This replaces the council + evidence + reflect-expand pipeline with one data
structure that falls out of normal execution.

## Implementation scope

1. **Wire validateNode into cmdComplete** — ~15 lines in `bin/roadmap.ts` (the code block above)
2. **Add --skip-validate flag** — ~5 lines
3. **`build-produces` type** — ~20 lines in `validateNode`
4. **`launch-check` type** — ~30 lines in `validateNode` (spawn, wait for signal, kill)
5. **`spec-conformance` type** — ~50 lines (spawn scoped agent, parse response)
6. **Aggregate gap report** — new `roadmap report` command, reads all ValidationResults

Total: ~120 lines of new code. The validation engine already exists.
The types already exist. The schema already exists.
The wiring is missing.

## Non-goals

- Removing `validate` from NodeSpec (it stays required, as today)
- Changing the DAG structure (nodes, deps, batches unchanged)
- Removing the council from the DAG schema (projects can still use it if they want)
- Making validation async/parallel (sequential per node is fine; nodes are already parallel across the batch)
