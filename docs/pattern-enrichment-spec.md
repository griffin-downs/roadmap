# Pattern Enrichment

## Problem

`inferPattern()` returns static strings like "Build the artifacts listed in produces." Orchestrators spawning background agents pass the brief, but the executor has to derive execution boundaries from structured JSON. They don't do this reliably.

## Solution

Replace `inferPattern()` with `renderPattern()` that interpolates brief data into a concrete execution prompt. Same `pattern` field, better content. Zero API surface change.

### Before
```
pattern: "Build the artifacts listed in produces. Satisfy consumes requirements."
```

### After
```
pattern: "TASK: Define receipt Zod schemas — SHA-linked, previousSha chain\nPRODUCE: src/lib/receipt.ts, tests/receipt.test.ts\nCONSUME: (none)\nSCOPE: only modify files in PRODUCE\nVERIFY: roadmap advance receipt-types\nBLOCKED: stop, surface the blocker\nMODE: execute — artifacts, not opinions"
```

## Flow

1. Orchestrator runs `roadmap orient`
2. Orient returns briefs with enriched `pattern`
3. Orchestrator reads structured fields (produces, topology, batch siblings) to decide parallelism
4. Orchestrator passes `brief.pattern` as the prompt to spawned background agents
5. Executor agent works constrained by the rendered pattern
6. Executor runs `roadmap advance <node-id>` to validate

## Scope

- Replace `inferPattern()` in `src/runtime/brief.ts`
- Replace `inferPattern()` in `src/lib/brief.ts`
- Both must produce identical output for the same inputs
- Test that rendered patterns contain the right fields
- Test execute vs plan mode produces different templates
