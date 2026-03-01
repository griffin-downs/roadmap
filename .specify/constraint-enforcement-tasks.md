# Constraint Enforcement: Metric Validators

Add mechanical validation of structural constraints (file counts, line counts, etc.) to block completion until constraints pass.

## Phase 1: Protocol Extension

- [P0] add-metric-validator-type: Extend `ValidationRule` type with `metric-threshold` rule. Produces: `src/lib/protocol/types.ts` (updated), `tests/protocol/metric-validator.test.ts`
- [P1] metric-functions-lib: Implement metric computation: `filesPerDir`, `linesPerFile`, `directoryDepth`, `cyclomaticComplexity`. Produces: `src/lib/validation/metrics.ts`, `tests/validation/metrics.test.ts`
- [P2] validate-metric-threshold: Implement metric validator integration into `validateNode`. Depends: add-metric-validator-type, metric-functions-lib. Produces: `src/lib/validation/metric-validator.ts`, `tests/validation/metric-validator.test.ts`

## Phase 2: Completion Integration

- [P1] complete-with-metrics: Wire metric validation into `roadmap complete` flow. Metric failures trigger expansion (expandOnFail). Depends: validate-metric-threshold. Produces: `src/lib/completion/metric-completion-gate.ts`, updated `bin/roadmap.ts`
- [P2] metric-expansion-nodes: Generate fix nodes on metric failure (e.g., "split-oversized-files", "organize-directories"). Produces: `src/lib/expansion/metric-expansion-gen.ts`
- [P1] metric-violation-diagnostics: Human-readable violation reports with repair suggestions. Produces: `src/lib/validation/metric-diagnostics.ts`

## Phase 3: Terminal Gate Integration

- [P2] terminal-metric-gates: Terminal nodes can declare metric constraints via intent gates. Example: "no directory > 10 files". Depends: complete-with-metrics. Produces: updated `bin/roadmap.ts`, `tests/completion/terminal-metrics.test.ts`
- [P3] metric-convergence-check: Convergence loop validates metrics at each iteration. Depends: terminal-metric-gates. Produces: `src/lib/expansion/convergence-metrics.ts`

## Phase 4: CLI Integration

- [P1] roadmap-metric-check: New CLI command `roadmap check --metrics <scope>`. List all metric violations. Produces: updated `bin/roadmap.ts`, `tests/cli/metric-check.test.ts`
- [P2] roadmap-metric-audit: New command `roadmap audit --metrics --fix`. Scan and auto-repair low-risk violations. Produces: updated `bin/roadmap.ts`, `tests/cli/metric-audit.test.ts`

## Terminal

- [P3] metrics-gate-active: Metric validation fully integrated, terminal gates enforce constraints, `roadmap complete` blocks on violations. Depends: terminal-metric-gates, roadmap-metric-audit. Produces: `docs/METRICS.md`

## Related Specs
- disconnected-systems-repair: Uses metric detection to find file organization gaps
