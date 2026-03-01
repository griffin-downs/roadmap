---
description: "SGK-1 — Strategy Governance Kernel: receipt-chain enforcement for strategy selection, intent gates, mining, audit, display, and run close"
dagId: sgk
---

# Tasks: SGK-1

**Input**: src/lib/strategy/ (registry.ts, select.ts, schema.ts, active.ts), src/lib/metaflow/ (types.ts, receipt-writer.ts, command-registry.ts, mine-run.ts, audit/), src/lib/cli-envelope.ts, bin/roadmap.ts, .roadmap/kernel.json
**Goal**: Non-optional strategy governance. 9 receipt types (R0-R8), CLI enforcement (E1-E8), kernel config extensions, audit detectors, and end-to-end run flow test. ~28 nodes across 8 batches.

## Phase 0: Init

- [P0] sgk-init: Existing codebase — src/lib/strategy/, src/lib/metaflow/, src/lib/cli-envelope.ts, bin/roadmap.ts, .roadmap/kernel.json
  - produces: src/lib/strategy/registry.ts, src/lib/strategy/select.ts, src/lib/strategy/schema.ts

## Phase 1: Foundation (L00)

- [P1] sgk-run-manifest: Run manifest schema + writer. `src/lib/sgk/run-manifest.ts`: types `RunManifest` (R0 schema), `createRunManifest(runId, dagId, scenario, opts:{headSha,treeSha,repoRoot,teamId?,workerCount,kernelSha,registrySha})` → writes `.roadmap/runs/<runId>/RUN.json`, returns RunManifest. `readRunManifest(runId, base?)` → RunManifest. `runManifestExists(runId, base?)` → boolean. Test `tests/sgk/run-manifest.test.ts`: 5 tests — creates RUN.json at correct path; reads back matching schema_version; policyHashes populated; strategyState defaults to 'pending'; idempotent re-write.
  - depends: sgk-init
  - produces: src/lib/sgk/run-manifest.ts, tests/sgk/run-manifest.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/run-manifest.test.ts

- [P1] sgk-error-codes: SGK error codes in cli-envelope. Add to `ErrorCode` in `src/lib/cli-envelope.ts`: `RUN_ID_REQUIRED`, `STRATEGY_NOT_SELECTED`, `INIT_INTENT_MISSING`, `CLOSE_INCOMPLETE`, `INIT_INTENT_DRIFT`, `TERM_EVIDENCE_MISSING`, `SGK_RECEIPT_INVALID`. Export type union. Test `tests/sgk/error-codes.test.ts`: 3 tests — all 7 codes are unique strings; ErrorCode object is frozen-compatible; codes importable from cli-envelope.
  - depends: sgk-init
  - produces: src/lib/cli-envelope.ts, tests/sgk/error-codes.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/error-codes.test.ts

- [P1] sgk-kernel-config: Kernel config SGK extensions. `src/lib/sgk/kernel-ext.ts`: types `SGKKernelConfig` extending kernel schema with `requireRunId`, `allowDispatchAutoStrategy`, `allowUnevaluatedInitIntent`, `allowUnevaluatedTermIntent`, `breakglassEnabled`. `loadSGKConfig(base?)` → reads `.roadmap/kernel.json`, returns SGKKernelConfig with defaults. `writeSGKDefaults(base?)` → merges SGK fields into existing kernel.json. Test `tests/sgk/kernel-config.test.ts`: 4 tests — loadSGKConfig returns defaults when fields absent; writeSGKDefaults merges without overwriting existing; requireRunId defaults true; allowDispatchAutoStrategy defaults true.
  - depends: sgk-init
  - produces: src/lib/sgk/kernel-ext.ts, tests/sgk/kernel-config.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/kernel-config.test.ts

## Phase 2: Receipt Types (L01)

- [P2] sgk-receipt-strategy: Strategy selection receipt (R1). `src/lib/sgk/receipts/strategy.ts`: `writeStrategyReceipt(runId, strategyId, mode, opts)` → writes `.roadmap/runs/<runId>/strategy/SELECT.json`. `readStrategyReceipt(runId, base?)` → R1. `strategyReceiptExists(runId, base?)` → boolean. Test `tests/sgk/receipts/strategy.test.ts`: 4 tests — writes correct path; autoSelectEvidence populated for mode=auto; strategyConfigSha is deterministic; candidateSetDigest matches registry.
  - depends: sgk-run-manifest, sgk-error-codes
  - produces: src/lib/sgk/receipts/strategy.ts, tests/sgk/receipts/strategy.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/receipts/strategy.test.ts

- [P2] sgk-receipt-plan: Plan selection receipt (R2). `src/lib/sgk/receipts/plan.ts`: `writePlanReceipt(runId, planId, bindingSha, opts)` → writes `.roadmap/runs/<runId>/plan/SELECT.json`. `readPlanReceipt(runId, base?)` → R2. `planReceiptExists(runId, base?)` → boolean. Test `tests/sgk/receipts/plan.test.ts`: 3 tests — writes correct path; bindingSha matches input; candidateSetDigest populated.
  - depends: sgk-run-manifest, sgk-error-codes
  - produces: src/lib/sgk/receipts/plan.ts, tests/sgk/receipts/plan.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/receipts/plan.test.ts

- [P2] sgk-receipt-intent: Intent gate receipts (R3 init + R4 term). `src/lib/sgk/receipts/intent.ts`: `writeInitIntentReceipt(runId, statements, judgment, policyFlags)` → writes `.roadmap/runs/<runId>/intent/INIT.json`. `writeTermIntentReceipt(runId, statements, judgment, evidencePointers, policyFlags)` → writes `.roadmap/runs/<runId>/intent/TERM.json`. Read + exists helpers for both. Test `tests/sgk/receipts/intent.test.ts`: 5 tests — init writes INIT.json; term writes TERM.json; init binds plan+strategy SHA; term requires evidencePointers; judgmentStatus round-trips.
  - depends: sgk-run-manifest, sgk-error-codes
  - produces: src/lib/sgk/receipts/intent.ts, tests/sgk/receipts/intent.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/receipts/intent.test.ts

- [P2] sgk-receipt-mine: Mining receipt (R5). `src/lib/sgk/receipts/mine.ts`: `writeMineReceipt(runId, miningResult)` → writes `.roadmap/runs/<runId>/mine/MINE.json`. Read + exists. Test `tests/sgk/receipts/mine.test.ts`: 3 tests — writes correct path; latency fields populated; round-trips.
  - depends: sgk-run-manifest
  - produces: src/lib/sgk/receipts/mine.ts, tests/sgk/receipts/mine.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/receipts/mine.test.ts

- [P2] sgk-receipt-audit: Audit receipt (R6). `src/lib/sgk/receipts/audit.ts`: `writeAuditReceipt(runId, verdicts, bypassUsage)` → writes `.roadmap/runs/<runId>/audit/AUDIT.json`. Read + exists. Test `tests/sgk/receipts/audit.test.ts`: 3 tests — writes correct path; overallPassed derived from verdicts; bypassUsage array populated.
  - depends: sgk-run-manifest
  - produces: src/lib/sgk/receipts/audit.ts, tests/sgk/receipts/audit.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/receipts/audit.test.ts

- [P2] sgk-receipt-close: Run close receipt (R7). `src/lib/sgk/receipts/close.ts`: `writeCloseReceipt(runId, base?)` → reads all required receipts, checks existence, writes `.roadmap/runs/<runId>/CLOSE.json`. Returns `{allSatisfied, missing[]}`. Test `tests/sgk/receipts/close.test.ts`: 4 tests — all receipts present → allSatisfied:true; missing mine → allSatisfied:false with missing:['mine']; CLOSE.json references all receipt paths; idempotent.
  - depends: sgk-receipt-strategy, sgk-receipt-plan, sgk-receipt-intent, sgk-receipt-mine, sgk-receipt-audit
  - produces: src/lib/sgk/receipts/close.ts, tests/sgk/receipts/close.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/receipts/close.test.ts

- [P2] sgk-receipt-display: Display receipt (R8). `src/lib/sgk/receipts/display.ts`: `writeDisplayReceipt(runId, cmd, blocks, humanMode)` → writes `.roadmap/runs/<runId>/display/<stamp>.json`. `listDisplayReceipts(runId, base?)` → R8[]. Test `tests/sgk/receipts/display.test.ts`: 3 tests — writes to display/ subdir; stamp is ISO-derived; renderedBlocks round-trip.
  - depends: sgk-run-manifest
  - produces: src/lib/sgk/receipts/display.ts, tests/sgk/receipts/display.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/receipts/display.test.ts

## Phase 3: CLI Enforcement (L02)

- [P3] sgk-cli-runid-enforce: E1 — mandatory --run injection. `src/lib/sgk/cli/run-enforce.ts`: `requireRunId(args, cmd)` → extracts `--run <runId>` from args, falls back to `.roadmap/runs/active.json`, emits `RUN_ID_REQUIRED` if neither. Wire into `bin/roadmap.ts` for governed commands list. Test `tests/sgk/cli/run-enforce.test.ts`: 4 tests — extracts --run from args; reads active.json fallback; emits RUN_ID_REQUIRED on missing; non-governed commands pass without --run.
  - depends: sgk-error-codes, sgk-run-manifest
  - produces: src/lib/sgk/cli/run-enforce.ts, tests/sgk/cli/run-enforce.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/cli/run-enforce.test.ts

- [P3] sgk-cli-dispatch-gates: E2 — dispatch gated by strategy+plan+init intent. `src/lib/sgk/cli/dispatch-gates.ts`: `checkDispatchPrereqs(runId, base?)` → checks R1+R2+R3 existence, returns `{ok, missing, errorCode}`. Wire into `bin/roadmap.ts` cmdDispatch. Test `tests/sgk/cli/dispatch-gates.test.ts`: 5 tests — all present → ok:true; missing R1 → STRATEGY_NOT_SELECTED; missing R2 → PLAN_NOT_SELECTED; missing R3 → INIT_INTENT_MISSING; R3 judgmentStatus=failed → INIT_INTENT_MISSING.
  - depends: sgk-receipt-strategy, sgk-receipt-plan, sgk-receipt-intent
  - produces: src/lib/sgk/cli/dispatch-gates.ts, tests/sgk/cli/dispatch-gates.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/cli/dispatch-gates.test.ts

- [P3] sgk-cli-complete-binding: E3 — complete attaches node receipt to run namespace. `src/lib/sgk/cli/complete-binding.ts`: `writeNodeReceipt(runId, nodeId, strategyId, gateMode, base?)` → writes `.roadmap/runs/<runId>/nodes/<nodeId>.json`. Test `tests/sgk/cli/complete-binding.test.ts`: 3 tests — writes to correct path; references strategyId+gateMode; readable after write.
  - depends: sgk-receipt-strategy
  - produces: src/lib/sgk/cli/complete-binding.ts, tests/sgk/cli/complete-binding.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/cli/complete-binding.test.ts

- [P3] sgk-cli-close-gates: E4 — run close requires TERM+mine+audit. `src/lib/sgk/cli/close-gates.ts`: `checkClosePrereqs(runId, base?)` → checks R4+R5+R6 existence, returns `{ok, missing}`. If not ok, emits `CLOSE_INCOMPLETE`. Wire into `bin/roadmap.ts` cmdRunClose. Test `tests/sgk/cli/close-gates.test.ts`: 4 tests — all present → ok:true; missing R4 → missing:['termIntent']; missing R5 → missing:['mine']; R6 overallPassed=false → missing:['audit'].
  - depends: sgk-receipt-intent, sgk-receipt-mine, sgk-receipt-audit
  - produces: src/lib/sgk/cli/close-gates.ts, tests/sgk/cli/close-gates.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/cli/close-gates.test.ts

## Phase 4: Strategy Surface (L03)

- [P4] sgk-strategy-ls-surface: E5 — strategy listing in CLI output. `src/lib/sgk/strategy-surface.ts`: `buildStrategySurface(runId?, base?)` → `{availableStrategies: StrategyConfig[], selectedStrategy: ActiveStrategy|null}`. Wire into orient/parallel/plan/dispatch data envelopes. Test `tests/sgk/strategy-surface.test.ts`: 3 tests — lists all 3 strategies; selectedStrategy null when none; selectedStrategy populated when active.
  - depends: sgk-cli-runid-enforce
  - produces: src/lib/sgk/strategy-surface.ts, tests/sgk/strategy-surface.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/strategy-surface.test.ts

- [P4] sgk-strategy-auto-receipt: E6 — auto-select writes R1 receipt. `src/lib/sgk/strategy-auto.ts`: `autoSelectWithReceipt(runId, maxParallelism, base?)` → calls existing `autoSelect` + writes R1 receipt. Policy check: reads `kernel.json.allowDispatchAutoStrategy`. Test `tests/sgk/strategy-auto.test.ts`: 4 tests — writes R1 with selectionMode:auto; policy:false rejects with error; deterministic for same parallelism; autoSelectEvidence includes rule.
  - depends: sgk-cli-runid-enforce, sgk-receipt-strategy, sgk-kernel-config
  - produces: src/lib/sgk/strategy-auto.ts, tests/sgk/strategy-auto.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/strategy-auto.test.ts

- [P4] sgk-orient-surface-strategy: E5 continued — orient output includes strategy. Wire `buildStrategySurface` into cmdOrient in `bin/roadmap.ts`. Extend orient data type to include `availableStrategies` and `selectedStrategy`. Test `tests/sgk/orient-strategy.test.ts`: 3 tests — orient JSON includes availableStrategies array; includes selectedStrategy null; after select includes selectedStrategy with strategyId.
  - depends: sgk-strategy-ls-surface
  - produces: bin/roadmap.ts, tests/sgk/orient-strategy.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/orient-strategy.test.ts

## Phase 5: Intent Commands (L04)

- [P5] sgk-intent-init-cmd: Init intent CLI command. `roadmap intent init --run <runId> --statements '<json>'` → evaluates statements, writes R3. `src/lib/sgk/cli/intent-init.ts`: `cmdIntentInit(runId, statements, opts)` → reads plan+strategy SHAs, writes INIT.json. Test `tests/sgk/cli/intent-init.test.ts`: 4 tests — writes INIT.json; binds plan+strategy SHAs (E7); unevaluated respects kernel policy; failed judgment blocks dispatch.
  - depends: sgk-cli-dispatch-gates, sgk-receipt-intent, sgk-kernel-config
  - produces: src/lib/sgk/cli/intent-init.ts, tests/sgk/cli/intent-init.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/cli/intent-init.test.ts

- [P5] sgk-intent-term-cmd: Terminal intent CLI command. `roadmap intent term --run <runId> --statements '<json>'` → validates evidence pointers, writes R4. `src/lib/sgk/cli/intent-term.ts`: `cmdIntentTerm(runId, statements, evidencePointers, opts)` → validates display+mine receipt existence (E8), writes TERM.json. Test `tests/sgk/cli/intent-term.test.ts`: 4 tests — writes TERM.json; requires displayReceiptId exists; requires mineReceiptId exists; TERM_EVIDENCE_MISSING on absent.
  - depends: sgk-cli-close-gates, sgk-receipt-intent, sgk-receipt-display, sgk-receipt-mine
  - produces: src/lib/sgk/cli/intent-term.ts, tests/sgk/cli/intent-term.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/cli/intent-term.test.ts

- [P5] sgk-intent-binding: E7 — init intent drift detection. `src/lib/sgk/intent-binding.ts`: `checkIntentDrift(runId, base?)` → reads R3 boundPlanSha + boundStrategySha, compares against current plan overlay SHA + strategy config SHA. Returns `{drifted, fields[]}`. Wire into dispatch gate. Test `tests/sgk/intent-binding.test.ts`: 3 tests — no drift when SHAs match; detects plan drift; detects strategy drift.
  - depends: sgk-intent-init-cmd, sgk-cli-dispatch-gates
  - produces: src/lib/sgk/intent-binding.ts, tests/sgk/intent-binding.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/intent-binding.test.ts

## Phase 6: Mining + Audit (L05)

- [P6] sgk-mine-run: Mining for SGK runs. `src/lib/sgk/mine.ts`: `mineSGKRun(runId, base?)` → reads interaction receipts from run namespace, computes R5 fields, writes MINE.json. Test `tests/sgk/mine.test.ts`: 3 tests — writes MINE.json; toolCallCounts aggregated; latency percentiles computed.
  - depends: sgk-intent-binding
  - produces: src/lib/sgk/mine.ts, tests/sgk/mine.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/mine.test.ts

- [P6] sgk-audit-run: Audit for SGK runs. `src/lib/sgk/audit.ts`: `auditSGKRun(runId, detectors, base?)` → runs SGK detectors, writes R6 AUDIT.json. Test `tests/sgk/audit.test.ts`: 3 tests — writes AUDIT.json; overallPassed true when all pass; false when any fail.
  - depends: sgk-intent-binding
  - produces: src/lib/sgk/audit.ts, tests/sgk/audit.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/audit.test.ts

- [P6] sgk-audit-detectors-strategy: Strategy ignorance detector. `src/lib/sgk/detectors/strategy.ts`: `detectStrategyIgnored(runId, base?)` → checks dispatch occurred without R1; `detectStrategyDrift(runId, base?)` → checks strategy config changed mid-run. Test `tests/sgk/detectors/strategy.test.ts`: 4 tests — fires on dispatch without R1; passes with R1; detects config drift; passes when stable.
  - depends: sgk-audit-run, sgk-receipt-strategy
  - produces: src/lib/sgk/detectors/strategy.ts, tests/sgk/detectors/strategy.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/detectors/strategy.test.ts

- [P6] sgk-audit-detectors-chain: Receipt chain completeness detector. `src/lib/sgk/detectors/chain.ts`: `detectChainGaps(runId, base?)` → checks all R0-R7 exist with valid schema_version and timestamps. Test `tests/sgk/detectors/chain.test.ts`: 3 tests — all present → passed; missing R5 → failed with evidence; invalid schema_version → failed.
  - depends: sgk-audit-run, sgk-receipt-close
  - produces: src/lib/sgk/detectors/chain.ts, tests/sgk/detectors/chain.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/detectors/chain.test.ts

## Phase 7: Display + Terminal Requirement (L06)

- [P7] sgk-display-receipt-writer: Display receipt writer integration. `src/lib/sgk/display.ts`: `writeRunDisplayReceipt(runId, cmd, renderOutput, humanMode, base?)` → writes R8 to display/ subdir. Hook into InteractionReceiptWriter or CLI emit path. Test `tests/sgk/display.test.ts`: 3 tests — writes R8 with stamp; renderedBlocks populated from RenderV1 sections; listDisplayReceipts returns all.
  - depends: sgk-audit-detectors-strategy, sgk-audit-detectors-chain
  - produces: src/lib/sgk/display.ts, tests/sgk/display.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/display.test.ts

- [P7] sgk-human-render-hooks: Human render hooks for SGK receipts. `src/lib/sgk/render.ts`: `renderRunSummary(runId, base?)` → reads R0+R1+R7, produces human-readable summary. `renderReceiptChain(runId, base?)` → table of R0-R8 with status icons. Test `tests/sgk/render.test.ts`: 3 tests — summary includes strategyId; chain table shows all receipt types; missing receipts marked with X.
  - depends: sgk-display-receipt-writer
  - produces: src/lib/sgk/render.ts, tests/sgk/render.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/render.test.ts

- [P7] sgk-term-intent-display-requirement: E8 enforcement — term intent requires display receipt. Wire `checkTermEvidencePointers(runId, base?)` into intent-term command. Validates that `evidencePointers.displayReceiptId` maps to an actual R8 file. Test `tests/sgk/term-display-req.test.ts`: 3 tests — passes with valid R8 reference; TERM_EVIDENCE_MISSING on invalid reference; TERM_EVIDENCE_MISSING when no R8 files exist.
  - depends: sgk-display-receipt-writer, sgk-intent-term-cmd
  - produces: src/lib/sgk/term-display-check.ts, tests/sgk/term-display-req.test.ts
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/term-display-req.test.ts

## Phase 8: Contract Tests + Terminal (L07)

- [P8] sgk-contract-tests: Contract tests for all receipt types. `tests/sgk/contract.test.ts`: validates every R0-R8 schema against TypeScript types, round-trip serialization, required field presence, schema_version enforcement. 9 test cases — one per receipt type.
  - depends: sgk-human-render-hooks, sgk-term-intent-display-requirement
  - produces: tests/sgk/contract.test.ts
  - validate: shell:npx vitest run tests/sgk/contract.test.ts

- [P8] sgk-e2e-run-flow-test: End-to-end run flow. `tests/sgk/e2e-run-flow.test.ts`: creates run → selects strategy → selects plan → evaluates init intent → dispatches → completes nodes → mines → audits → evaluates term intent → closes. Asserts all R0-R8 exist and CLOSE.json.allSatisfied === true. 1 integration test.
  - depends: sgk-contract-tests
  - produces: tests/sgk/e2e-run-flow.test.ts
  - validate: shell:npx vitest run tests/sgk/e2e-run-flow.test.ts

- [P8] sgk-terminal: Terminal gate — all SGK tests pass, receipt chain complete, tsc clean. Runs full SGK test suite.
  - depends: sgk-e2e-run-flow-test, sgk-contract-tests
  - produces: .roadmap/runs/sgk-validation/CLOSE.json
  - validate: shell:npx tsc --noEmit && npx vitest run tests/sgk/
