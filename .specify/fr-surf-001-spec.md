# FR-SURF-001: Surface Consolidation + Audit + CLI + Perf

## Goal
Reduce repo surface via continuous audit/archive cycle, enforce CLI-first contract, reorganize folder structure, and gate vitest to ≤15s.

## Acceptance Criteria

### Given: existing roadmap repo with scattered surfaces
### When: FR-SURF-001 is executed
### Then:
1. **Audit surface** produces deterministic SURFACE.json inventory (S1)
2. **5–10 core ops wrapped** behind CLI commands emitting JSON (S2)
3. **Single CLI registry** enforced; no scattered entrypoints (S3)
4. **TS-input sandbox** active with allowlist enforcement (S4)
5. **Vitest ≤15s wall-clock** on p50 (S5)
6. **Archived files moved** to archive/, CLI wrappers callable, behavior preserved (S6)
7. **lib/ modules pure** (no fs/process/network imports) (S7)
8. **Target layout** achieved: bin/, src/{lib,core,cli,audit,perf}, tests/, archive/ (S8)

## Constraints
- No breaking changes to existing APIs during reorg (CLI wrapper if needed)
- Vitest full suite ≤15s (p50), ≤18s (p95)
- Archive JSON schemas stable and deterministic
- All audit/archive/perf outputs must be JSON

## Key Decisions
- Single CLI entrypoint (bin/cli.ts) owns command registry
- TS-input CLI for power users (escape hatch without surface explosion)
- Audit engine non-destructive (plan first, apply separately)
- Perf budget is hard gate (regression blocks terminal)

---

# Implementation Nodes

## Track A: Inventory + Audit (4 nodes)

### `surf-audit-schema`
Schemas for SURFACE/PLAN/RESULT JSON envelopes + runtime validators.
**Produces**: `src/lib/audit/audit-schema.ts`

### `surf-audit-engine`
Scans repo, builds import graph, detects side effects, scores archival candidates.
**Produces**: `src/lib/audit/audit-engine.ts`
**Consumes**: `surf-audit-schema`

### `surf-audit-cli`
CLI commands: `audit surface`, `audit archive --dry-run`, `audit archive --apply`, `audit report`.
**Produces**: `src/cli/commands/audit.ts`, `src/cli/render/audit.ts`
**Consumes**: `surf-audit-engine`, `surf-audit-schema`

### `surf-audit-tests`
Fixture suite covering audit operations, CLI invocation, determinism.
**Produces**: `tests/audit.test.ts`
**Consumes**: `surf-audit-schema`, `surf-audit-engine`, `surf-audit-cli`

---

## Track B: Archive Machinery (3 nodes)

### `surf-archive-plan`
Generate PLAN.json from audit output (what moves, wraps, deletes, order).
**Produces**: `.audit/archive/PLAN.json`
**Consumes**: `surf-audit-cli` (reads SURFACE.json)

### `surf-archive-apply`
Execute moves, rewrite imports, generate CLI wrappers for archived ops, write RESULT.json.
**Produces**: `archive/<yyyymmdd>/...`, `src/cli/commands/archive-*.ts`, `.audit/archive/RESULT.json`
**Consumes**: `surf-archive-plan`

### `surf-archive-verify`
Invariant: no dangling imports, CLI covers all moved ops.
**Produces**: `.audit/archive-verify.receipt.json`
**Consumes**: `surf-archive-apply`

---

## Track C: CLI-First Conversions (3 nodes)

### `surf-cli-registry`
Single CLI entrypoint + command registry (bin/cli.ts). Enforce I5.
**Produces**: `bin/cli.ts`

### `surf-cli-wrap-core`
Wrap 5–10 core ops (protocol.verify, receipts.list, dag.explain) behind CLI.
**Produces**: `src/cli/commands/verify.ts`, `src/cli/commands/receipts.ts`, `src/cli/commands/dag.ts` (+ others)
**Consumes**: existing core modules

### `surf-ts-input`
TS-input CLI: `ts run --stdin`, `ts transform --stdin`, `ts typecheck --stdin` with allowlist sandbox.
**Produces**: `src/cli/commands/ts.ts`, `src/lib/ts-sandbox.ts`

---

## Track D: Folder Reorganization (3 nodes)

### `surf-layout-plan`
Derive target layout + move plan from spec rules.
**Produces**: `src/lib/audit/layout-plan.ts`

### `surf-layout-apply`
Move modules per plan, rewrite imports, update exports.
**Produces**: (reorganized bin/, src/lib/, src/core/, src/cli/, src/audit/, src/perf/, tests/), `src/audit/layout-apply.receipt.json`
**Consumes**: `surf-layout-plan`

### `surf-layout-verify`
Invariant: src/lib/* modules are import-pure (no fs/process/network).
**Produces**: `src/lib/layout-verify.ts`, `.audit/layout-verify.receipt.json`
**Consumes**: `surf-layout-apply`

---

## Track E: Vitest Performance Budget (5+ nodes)

### `surf-perf-schema`
Perf receipt schemas + baseline/regression types.
**Produces**: `src/lib/perf/perf-schema.ts`

### `surf-perf-vitest-cmd`
Run vitest, record timing, hotspots, emit LATEST.json. CLI: `perf vitest --record`.
**Produces**: `.perf/vitest/LATEST.json`, `src/cli/commands/perf.ts`
**Consumes**: `surf-perf-schema`, all reorg'd code

### `surf-perf-budget-gate`
Compare LATEST vs baseline, fail if p50 > 15s. Generate REGRESSION.json if fails.
**Produces**: `.perf/vitest/budget-gate.receipt.json` (with expansion proposals)
**Consumes**: `surf-perf-vitest-cmd`
**Validate**: `launch-check: vitest <= 15s (p50)`

### `surf-perf-fix-<hotspot>` *(generated per REGRESSION.json)*
Per-file optimization if vitest budget exceeded.
**Produces**: optimization receipt
**Consumes**: REGRESSION.json analysis
*(0–N nodes, generated on demand)*

---

## Terminal

### `intent-surf-001` *(mode: plan, expandOnFail: true)*
All consolidations complete. Surface reduced, CLI canonical, vitest < 15s, all gates pass.
**Produces**: `.roadmap/intent-surf-001.receipt.json`
**Consumes**: `surf-archive-verify`, `surf-layout-verify`, `surf-perf-budget-gate`
**Validate**: `expanded` (children from perf failures)

---

# Dependency Graph

```
L1: surf-audit-schema, surf-cli-registry, surf-perf-schema
L2: surf-audit-engine, surf-layout-plan, surf-cli-wrap-core, surf-ts-input
L3: surf-audit-cli, surf-audit-tests
L4: surf-archive-plan
L5: surf-layout-apply
L6: surf-archive-apply, surf-layout-verify
L7: surf-archive-verify
L8: surf-perf-vitest-cmd
L9: surf-perf-budget-gate
L10: intent-surf-001
L11+: surf-perf-fix-<hotspot> (if triggered)
```

---

# Test Coverage

| Node | Test | Acceptance |
|------|------|-----------|
| surf-audit-schema | AT-1 | SURFACE.json deterministic |
| surf-audit-engine | AT-2 | Graph built correctly |
| surf-audit-cli | AT-3 | CLI emits JSON, covers ops |
| surf-audit-tests | AT-4 | Roundtrip audit+archive |
| surf-archive-plan | AT-5 | PLAN.json stable ordering |
| surf-archive-apply | AT-6 | Files moved, imports rewritten, CLI wrapper callable |
| surf-archive-verify | AT-7 | No dangling imports, CLI covers all moved ops |
| surf-cli-registry | AT-8 | bin/cli.ts is only entry, subcommand dispatch works |
| surf-cli-wrap-core | AT-9 | 5–10 core ops callable via CLI, JSON output |
| surf-ts-input | AT-10 | Sandbox rejects unlisted imports |
| surf-layout-plan | AT-11 | Target layout derivable from rules |
| surf-layout-apply | AT-12 | Reorg'd structure matches target |
| surf-layout-verify | AT-13 | src/lib/* is pure |
| surf-perf-schema | AT-14 | Receipt types compile |
| surf-perf-vitest-cmd | AT-15 | vitest runs, LATEST.json emitted |
| surf-perf-budget-gate | AT-16 | Gate passes if p50 ≤ 15s, fails if > 15s |
| intent-surf-001 | AT-17 | Terminal gate passes when all prereqs done |
