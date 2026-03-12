# Fleet Loop Protocol

## Problem

Donjon runs a compiler bootstrap loop: improve generators → fan-out L0 scaffolds to N repos → agents mature each repo L1-L4 via roadmap → mine agent work → loop. This loop is the unit of donjon progress, but roadmap doesn't model it. The loop lives in a CLAUDE.md bullet list. There's no fleet manifest, no cross-repo orient, no loop receipt, no rollup advance.

## Solution

Three primitives make the loop first-class:

1. **Fleet manifest** — `.roadmap/fleet.json` declares repos in a compiler loop, their request files, and their relationship to the compiler repo.
2. **Fleet orient** — `roadmap orient --fleet` loads chain state from every repo in the fleet and returns global position: per-repo status, stalled nodes, loop-readiness.
3. **Loop receipts** — each iteration gets a receipt linking compiler commit → generation commits per repo → mining findings. The loop itself gets a flight recorder.

## Fleet Manifest

```json
{
  "compiler": ".",
  "repos": [
    {
      "name": "keel",
      "path": "~/src/keel",
      "request": "request-gallery/keel.json"
    },
    {
      "name": "stratum",
      "path": "~/src/stratum",
      "request": "request-gallery/mono-fusion.json"
    },
    {
      "name": "assay",
      "path": "~/src/assay",
      "request": "request-gallery/assay.json"
    }
  ]
}
```

`compiler` is the repo that owns the loop. `repos[].path` resolves to absolute paths. `repos[].request` is relative to the compiler repo.

## Fleet Orient

`roadmap orient --fleet` reads `fleet.json`, calls `loadContext()` per repo, and returns:

```json
{
  "iteration": 3,
  "compiler": { "repo": ".", "headCommit": "abc123" },
  "repos": [
    { "name": "keel", "dagId": "seed", "status": "complete", "level": "L4" },
    { "name": "stratum", "dagId": "seed", "status": "stalled", "level": "L2", "stalledAt": "validate-bridge", "reason": "shell validator failed" },
    { "name": "assay", "dagId": "seed", "status": "active", "level": "L3", "batch": ["lint-clean"] }
  ],
  "loopReady": false,
  "blockers": ["stratum stalled at L2: validate-bridge"]
}
```

`loopReady: true` when all repos are either complete or explicitly marked stalled-with-findings. This is the signal to start the mining step.

## Loop Lifecycle

```
roadmap loop start --note "iteration 3: added bridge-composables generator"
  → records compiler commit, begins iteration

roadmap loop generate --repo keel --note "L0 scaffold"
  → records generation commit in target repo, links to loop iteration

roadmap loop mine --note "extracted bridge-composables pattern"
  → structured mining findings: extracted[], requestFixes[], stalled[]

roadmap loop close --note "iteration 3 complete"
  → writes loop receipt, increments iteration counter
  → requires loopReady: true or --force
```

## Loop Receipt

Stored at `.roadmap/loops/<iteration>.json`:

```json
{
  "iteration": 3,
  "startedAt": "2026-03-12T10:00:00Z",
  "closedAt": "2026-03-12T18:00:00Z",
  "compilerCommit": "abc123",
  "generations": [
    { "repo": "keel", "dagId": "seed-3", "headCommit": "def456", "status": "complete" },
    { "repo": "stratum", "dagId": "seed-3", "headCommit": "789abc", "status": "stalled", "stalledAt": "validate-bridge" },
    { "repo": "assay", "dagId": "seed-3", "headCommit": "cde012", "status": "complete" }
  ],
  "mining": {
    "extracted": ["bridge-composables → generator"],
    "requestFixes": ["keel.json: added authorityModel field"],
    "stalled": [{ "repo": "stratum", "node": "validate-bridge", "reason": "NAPI bridge not yet implemented" }],
    "observations": ["All three repos independently wrote the same topic-validator pattern"]
  },
  "previousSha": "sha256-of-iteration-2-receipt"
}
```

Loop receipts are SHA-linked (same pattern as protocol receipts). The chain of loop receipts IS the compiler's convergence history.

## Cross-Repo Context

`loadFleetContext()` in `src/runtime/fleet.ts`:
- Reads `.roadmap/fleet.json` from compiler repo
- Resolves `~` in paths, validates repos exist
- Calls `loadContext()` per repo (read-only — never writes to other repos)
- Returns `FleetContext` with per-repo `Context` + fleet metadata

Fleet context is strictly read-only for non-compiler repos. Only the compiler repo's `.roadmap/loops/` directory is written to.

## Rollup Advance (Future)

Not in this DAG — requires receipt protocol to land first. The pattern:
- Parent DAG node with `validate: [{ "type": "fleet-complete", "repo": "keel" }]`
- Validator reads target repo's chain, checks DAG terminated
- Child's termination receipt IS parent's validation evidence

## Architecture Constraint

Fleet is a **runtime** concept, not core. The graph algebra doesn't change:

```
src/core/          UNTOUCHED — pure algebra, zero IO
src/runtime/
  ├── context.ts     loadContext() — single repo (existing)
  ├── fleet.ts       loadFleetContext() — multi-repo (NEW)
  └── loop.ts        LoopReceipt, writeLoop, readLoopHistory (NEW)
src/cli/
  ├── orient.ts      --fleet flag → fleet orient (MODIFIED)
  └── loop.ts        roadmap loop {start|generate|mine|close} (NEW)
src/lib/
  └── fleet-types.ts FleetManifest, FleetStatus, LoopReceipt schemas (NEW)
```

## Scope Boundary

IN: fleet manifest, fleet orient, loop lifecycle CLI, loop receipts
OUT: rollup advance (needs receipt-protocol), cross-repo consumes resolution, multi-head orient within a single repo
