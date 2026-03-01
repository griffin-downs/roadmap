# Disconnected Systems: Search and Repair

Automated detection and repair of inconsistencies: DAG state mismatches, orphaned files, broken imports, stale completion records, and validation gaps.

## Phase 1: Detector Implementation

- [P0] detector-dag-subsystem: Scan DAG state (head.json vs execution context vs completed.json). Detect mismatches, divergence, orphaned DAGs. Produces: `src/lib/disconnect-detector/dag-subsystem.ts`, `tests/detector/dag.test.ts`
- [P1] detector-file-subsystem: Scan file organization (files in correct locations, no duplicates, no orphaned files in wrong places). Produces: `src/lib/disconnect-detector/file-subsystem.ts`, `tests/detector/files.test.ts`
- [P1] detector-import-subsystem: Scan imports (tsc clean, no broken paths, barrel exports complete, no circular deps). Produces: `src/lib/disconnect-detector/import-subsystem.ts`, `tests/detector/imports.test.ts`
- [P1] detector-completion-subsystem: Scan completion state (records match artifacts, no stale checkpoints, DAG consistency). Produces: `src/lib/disconnect-detector/completion-subsystem.ts`, `tests/detector/completion.test.ts`
- [P1] detector-validation-subsystem: Scan validation rules (artifact paths exist, commands runnable, metrics pass). Produces: `src/lib/disconnect-detector/validation-subsystem.ts`, `tests/detector/validation.test.ts`
- [P1] detector-intent-subsystem: Scan intent gates (gates defined but not run, confidence thresholds not met, expansions pending). Produces: `src/lib/disconnect-detector/intent-subsystem.ts`, `tests/detector/intent.test.ts`
- [P2] disconnect-aggregator: Aggregate findings from all subsystems, generate `DisconnectReport` with severity + repair options. Depends: all detector subsystems. Produces: `src/lib/disconnect-detector/aggregator.ts`, `tests/detector/report.test.ts`

## Phase 2: Repair Engine

- [P1] repair-execution-engine: Execute repair operations (file moves, import updates, completion record migrations). Supports rollback. Produces: `src/lib/disconnect-repair/executor.ts`, `tests/repair/executor.test.ts`
- [P1] repair-approval-gates: Approval gates for destructive repairs (moves, deletions, migrations). Non-destructive (updates, re-runs) auto-approve. Produces: `src/lib/disconnect-repair/approval.ts`, `tests/repair/approval.test.ts`
- [P1] repair-validators: Re-validate system state after repair (tsc, imports, file structure, completions). Produces: `src/lib/disconnect-repair/post-repair-validation.ts`
- [P2] repair-history-log: Log all repairs applied, who approved, what state before/after, any errors. Produces: `.roadmap/repairs/history.jsonl`, `src/lib/disconnect-repair/history.ts`

## Phase 3: CLI Integration

- [P1] cli-detect-disconnects: `roadmap detect-disconnects [--subsystems dag,files,imports]`. Scan and report. Produces: updated `bin/roadmap.ts`, `tests/cli/detect.test.ts`
- [P2] cli-repair-interactive: `roadmap repair <disconnect-id> <option-idx>`. Interactive repair with approval. Produces: updated `bin/roadmap.ts`, `tests/cli/repair-interactive.test.ts`
- [P2] cli-repair-auto: `roadmap repair --auto [--dry-run]`. Auto-repair low-risk disconnects. Produces: updated `bin/roadmap.ts`, `tests/cli/repair-auto.test.ts`
- [P1] cli-repair-audit: `roadmap repair-audit [--history] [--last N]`. Show repair history + decisions. Produces: updated `bin/roadmap.ts`, `tests/cli/repair-audit.test.ts`

## Phase 4: Integration with Constraint Enforcement

- [P2] detector-metric-constraints: Metric violations (file counts, line counts) detected as disconnects. Repair options: expand node with fix, split files, move files. Depends: constraint-enforcement-tasks. Produces: updated `src/lib/disconnect-detector/validation-subsystem.ts`
- [P2] auto-repair-file-organization: Auto-repair for common case: files unmoved to domains. Generates expansion nodes + applies moves. Produces: `src/lib/disconnect-repair/auto-file-repair.ts`
- [P3] detector-intent-convergence-gap: Detect intent gates not run, expansions not applied. Suggest re-run. Depends: intent convergence spec (future). Produces: updated `src/lib/disconnect-detector/intent-subsystem.ts`

## Phase 5: Heuristics + Learning

- [P3] detector-pattern-learning: Learn common disconnect patterns (DAG switches mid-flight, incomplete refactorings, parallel worker races). Suggest preventive measures. Produces: `src/lib/disconnect-detector/patterns.ts`
- [P4] preventive-gates: Add gates to block known bad patterns (DAG switch mid-flight without migration, completion on incomplete refactoring). Produces: updated validation rules in roadmap protocol

## Terminal

- [P4] disconnect-repair-fully-integrated: Detector + repair fully automated for common cases, interactive for complex cases. CLI available. Repair history audited. Depends: all phases. Produces: `docs/DISCONNECT-REPAIR.md`, `docs/REPAIR-PATTERNS.md`

## Related Specs
- constraint-enforcement: Metric violations trigger disconnect detection + repair
