# Audit Required — Operator Contract

Schema version: 1 | Contract: `.roadmap/metaflow/audit/REQUIRED.json`
Types: `src/lib/metaflow/audit/required-schema.ts`

## Detector Registry

### Display Regression (RD-001..003)

| Code | Checks | Failure fix |
|------|--------|-------------|
| RD-001 | Chart output contains all expected node IDs and status markers | Re-run `roadmap chart`; if node missing, check `head.json` node list |
| RD-002 | Orient output includes batch position, level, and progress bar | Verify `orient()` return shape matches `Orientation` type; check `parallelOrder()` |
| RD-003 | Trail entries render with timestamp, command, and position | Inspect `trail.jsonl` for malformed entries; re-record with `--note` |

### Integration Rough Points (IR-001..005)

| Code | Checks | Failure fix |
|------|--------|-------------|
| IR-001 | `define(g)` accepts the DAG without cycle or structural errors | Fix dependency edges in `head.json`; run `define()` locally to get error detail |
| IR-002 | `verify(g)` confirms all `consumes` satisfied by predecessor `produces` | Add missing `produces` to upstream node or add dependency edge |
| IR-003 | `check(g)` confirms all nodes reachable from init to term | Ensure disconnected nodes have at least one dep and one dependent |
| IR-004 | `orient(g, exists)` returns valid batch position for current filesystem | Check that produced artifacts exist on disk; `fileExists` predicate must resolve |
| IR-005 | `validateBatch()` passes for current batch | Complete all nodes in current batch before advancing; check `completed.json` |

### Process Escape (PE-001..002)

| Code | Checks | Failure fix |
|------|--------|-------------|
| PE-001 | No node completed without validation (`complete` always runs `validate[]`) | Never use `--skip-validate`; re-run `complete` for any manually advanced nodes |
| PE-002 | MetaFlow surface header present on all human-facing output | Add `wrapSubcommand` to CLI command registration; check `metaflow-surface-header` |

### MetaFlow Surface (MF-001..005)

| Code | Checks | Failure fix |
|------|--------|-------------|
| MF-001 | Active run binding (`active-run.json`) present during execution | Ensure `startRun()` called before dispatch; check `active-run.json` lifecycle |
| MF-002 | Strategy hint latch persists across orient cycles | Verify `hint-latch.json` written on first hint; check latch read path |
| MF-003 | Completion autocommit fires on `complete` success | Check `completion-autocommit` hook registration; verify git add + commit runs |
| MF-004 | Audit tail gate enforced at import time | Ensure `import --from speckit` calls `validateTerminalIntentGate()`; check terminal node has `expandOnFail: true` |
| MF-005 | Self-inserting layer injects MetaFlow wrapper on CLI subcommands | Verify `wrapSubcommand` auto-injection in CLI dispatch; check `self-insert-layer` |

## Wiring Audit Tail into a New Spec

1. Import spec via `roadmap import --from speckit <tasks.md> --id <dag-id>`
2. Terminal node must include `expandOnFail: true` — import gate validates this (MF-004)
3. Add `intent-metaflow-audit-required` as `requiredTerminalNodeId` in your DAG's audit contract
4. Run `roadmap validate --note "audit wiring check"` to confirm detector coverage
5. On `complete <terminal-node>`, audit engine runs all `requiredDetectors` from `REQUIRED.json`
6. Receipt emitted to `.roadmap/receipts/` with pass/fail + report path

## Thresholds

| Threshold | Value | Meaning |
|-----------|-------|---------|
| `latencyP95MaxMs` | 5000 | P95 command latency must stay under 5s |
| `toolCallInflationMax` | 10 | Max tool calls per orient cycle before flagging |
| `orientChurnMax` | 3 | Max consecutive orients without progress before escalation |

## Exemption Taxonomy

None currently defined. All detectors are mandatory. Future exemption mechanism will require explicit `exemptions[]` in the contract with per-detector justification and expiry.
