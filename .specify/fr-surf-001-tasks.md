# FR-SURF-001: Surface Consolidation + Audit + CLI + Perf

## Track A: Inventory + Audit

- [P0] surf-audit-schema: Schemas for SURFACE/PLAN/RESULT JSON envelopes + runtime validators. Produces: `src/lib/audit/audit-schema.ts`
- [P1] surf-audit-engine: Scans repo, builds import graph, detects side effects, scores archival candidates. Depends: surf-audit-schema. Produces: `src/lib/audit/audit-engine.ts`
- [P2] surf-audit-cli: CLI commands: `audit surface`, `audit archive --dry-run`, `audit archive --apply`, `audit report`. Depends: surf-audit-engine, surf-audit-schema. Produces: `src/cli/commands/audit.ts`, `src/cli/render/audit.ts`
- [P3] surf-audit-tests: Fixture suite covering audit operations, CLI invocation, determinism. Depends: surf-audit-schema, surf-audit-engine, surf-audit-cli. Produces: `tests/audit.test.ts`

## Track B: Archive Machinery

- [P1] surf-archive-plan: Generate PLAN.json from audit output (what moves, wraps, deletes, order). Depends: surf-audit-cli. Produces: `.audit/archive/PLAN.json`
- [P2] surf-archive-apply: Execute moves, rewrite imports, generate CLI wrappers for archived ops, write RESULT.json. Depends: surf-archive-plan. Produces: `archive/<yyyymmdd>/...`, `src/cli/commands/archive-*.ts`, `.audit/archive/RESULT.json`
- [P3] surf-archive-verify: Invariant: no dangling imports, CLI covers all moved ops. Depends: surf-archive-apply. Produces: `.audit/archive-verify.receipt.json`

## Track C: CLI-First Conversions

- [P0] surf-cli-registry: Single CLI entrypoint + command registry (bin/cli.ts). Enforce I5. Produces: `bin/cli.ts`
- [P1] surf-cli-wrap-core: Wrap 5–10 core ops (protocol.verify, receipts.list, dag.explain) behind CLI. Produces: `src/cli/commands/verify.ts`, `src/cli/commands/receipts.ts`, `src/cli/commands/dag.ts`
- [P1] surf-ts-input: TS-input CLI: `ts run --stdin`, `ts transform --stdin`, `ts typecheck --stdin` with allowlist sandbox. Produces: `src/cli/commands/ts.ts`, `src/lib/ts-sandbox.ts`

## Track D: Folder Reorganization

- [P0] surf-layout-plan: Derive target layout + move plan from spec rules. Produces: `src/lib/audit/layout-plan.ts`
- [P1] surf-layout-apply: Move modules per plan, rewrite imports, update exports. Depends: surf-layout-plan. Produces: (reorganized bin/, src/lib/, src/core/, src/cli/, src/audit/, src/perf/, tests/), `src/audit/layout-apply.receipt.json`
- [P2] surf-layout-verify: Invariant: src/lib/* modules are import-pure (no fs/process/network). Depends: surf-layout-apply. Produces: `src/lib/layout-verify.ts`, `.audit/layout-verify.receipt.json`

## Track E: Vitest Performance Budget

- [P0] surf-perf-schema: Perf receipt schemas + baseline/regression types. Produces: `src/lib/perf/perf-schema.ts`
- [P2] surf-perf-vitest-cmd: Run vitest, record timing, hotspots, emit LATEST.json. CLI: `perf vitest --record`. Depends: surf-perf-schema. Produces: `.perf/vitest/LATEST.json`, `src/cli/commands/perf.ts`
- [P3] surf-perf-budget-gate: Compare LATEST vs baseline, fail if p50 > 15s. Generate REGRESSION.json if fails. Depends: surf-perf-vitest-cmd. Produces: `.perf/vitest/budget-gate.receipt.json`

## Terminal

- [P3] intent-metaflow-audit-required: Audit compliance gate (required by metaflow). Depends: intent-surf-001. Produces: []
- [P4] intent-surf-001: All consolidations complete. Surface reduced, CLI canonical, vitest < 15s, all gates pass. Depends: surf-archive-verify, surf-layout-verify, surf-perf-budget-gate. Produces: `.roadmap/intent-surf-001.receipt.json`
