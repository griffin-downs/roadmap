---
description: "RKG-7/8 — Federated Intake + Patch Absorption + External Governance Gates + Workflow Audit + Propagation Enforcement Kernel"
dagId: rkg-harvest
---

# Tasks: RKG-7/8 — Federated Governance + Audit Propagation

**Input**: existing roadmap src/ — kernel-config, completion-store, receipt infra, intent-expansion, validator-runner, blend, emit-gallery
**Prerequisites**: RKG-4 kernel-config, RKG-6 receipt infra fully wired

## Phase 0: Init

- [P0] init: Existing roadmap codebase — src/protocol.ts, src/lib/kernel-config.ts, src/lib/completion-store.ts, src/lib/validator-runner.ts, src/lib/blend.ts, src/lib/emit-gallery.ts, src/lib/intent-expansion.ts, bin/roadmap.ts
  - produces: src/protocol.ts, src/lib/kernel-config.ts, src/lib/completion-store.ts, src/lib/validator-runner.ts, bin/roadmap.ts

## Phase 1: Schemas (all parallel)

- [P1] rkg7-intake-schema: IntakeRecord type — commits[], treeSha, parentSha, touchedPaths, author, msg, detectedClusters[], proposedNodes[]. Write src/lib/intake.ts with type + schema constants + dir spec (.roadmap/intake/). Write IntakeReceipt type for intake-absorb-<sha>.json bound to range + treeSha set.
  - depends: init
  - produces: src/lib/intake.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg7-overlay-schema: OverlayRecord type — intakeId, headSha, treeSha, candidateNodes[] (NodeSpec[], not yet in DAG). Write src/lib/overlay.ts. Must not reference head.json mutation — candidates only.
  - depends: init
  - produces: src/lib/overlay.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg7-patch-schema: PatchRecord type — patchId, baseSha, commitShas[], nodeMapping (nodeId → commitSha[]), branchPattern (rm/stack/<id>/<n>-<node>). Write src/lib/patch-stack.ts. Reproducibility invariant: same nodes+base → same diff.
  - depends: init
  - produces: src/lib/patch-stack.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg7-merge-gate-schema: MergeGateResult type — pass: boolean, missingReceipts[], error.fix[], checked[] with receipt name + found flag. Write src/lib/merge-gate.ts. Required receipts list: plan-select, spec-origin (if configured), kernel-verify, no orphan receipts, intake receipt for external patches.
  - depends: init
  - produces: src/lib/merge-gate.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg7-completion-ux: completed.json ergonomics — `roadmap receipts ls --node <id>` lists evidence records + treeSha + validator outputs. `roadmap completion doctor` diagnoses why chart shows 0% (legacy receipt schema, missing completed.json, version mismatch). `roadmap completion compact` prunes legacy receipts while preserving proofs (--dry-run required before destructive). Wire into bin/roadmap.ts.
  - depends: init
  - produces: src/lib/receipts-ux.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg8-transcript-schema: TranscriptSession type — sessionId, toolCalls[], retries (repeated cmd+args), failures by error.code, bypassFlagsUsed[], envVarUsage[], orphanedAttempts (cmds outside roadmap CLI), crossWorkerContaminationEvents[]. Write src/lib/transcript-schema.ts with type guards.
  - depends: init
  - produces: src/lib/transcript-schema.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg8-escape-detector-schema: EscapeEvent type — UNACCOUNTED_COMMIT | OUT_OF_BOUNDS_TOOL | DIRECT_GIT_COMMIT. GovernanceBreach type — sha, eventType, missingReceiptTypes[], timestamp. GovernanceBreachReceipt format: governance-breach-<sha>.json. Write src/lib/escape-detector.ts.
  - depends: init
  - produces: src/lib/escape-detector.ts
  - validate: shell:npx tsc --noEmit

- [P1] rkg8-profile-schema: ProfileReport type — commandsPerNode: Record<nodeId, number>, validatorRunsPerNode, avgLatencyMs, batchParallelismUtilization (0–1), efficiencyWarnings[] (nodeId + reason when threshold exceeded). Write src/lib/profile-schema.ts. Deterministic across runs given same input data.
  - depends: init
  - produces: src/lib/profile-schema.ts
  - validate: shell:npx tsc --noEmit

## Phase 2: Implementations (parallel within track)

- [P2] rkg7-intake-absorb-cmd: `roadmap intake absorb --from <sha> --to <sha> [--since <date>]` command — iterates git log range, extracts commits[], touchedPaths via git diff-tree, writes .roadmap/intake/<intakeId>.json. Deterministic: sha256(range) → stable intakeId. Validates: range exists, no dirty working tree. Emits intake-absorb-<sha>.json receipt with range + treeSha set. Wire into bin/roadmap.ts.
  - depends: rkg7-intake-schema
  - produces: src/lib/intake-cmd.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg7-intake-cluster: Cluster detection — group commits by touchedPaths overlap (jaccard similarity). Each cluster becomes a proposedNodeSpec (id: intake::<intakeId>::<n>, produces: touchedPaths, consumes: []). Stable across reruns: same commits → same clusters → same NodeSpecs. Write src/lib/intake-cluster.ts. Wire into intake-absorb-cmd output.
  - depends: rkg7-intake-schema
  - produces: src/lib/intake-cluster.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg7-overlay-from-intake: `roadmap plan overlay --from-intake <intakeId>` — reads .roadmap/intake/<id>.json, writes .roadmap/overlays/intake-<id>.json with candidateNodes[]. Does NOT mutate head.json (--apply flag required for that, implement as error for now). Emits receipt bound to headSha + intakeId + treeSha.
  - depends: rkg7-overlay-schema, rkg7-intake-schema
  - produces: src/lib/overlay-cmd.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg7-patch-stack: `roadmap patch stack --nodes <id,...> --base <sha>` — creates branch rm/stack/<patchId>/<n>-<nodeId> with ordered commits per node. Writes .roadmap/patch/<patchId>.json. Reproducibility: same nodes+base → same diff (deterministic commit ordering). Wire into bin/roadmap.ts.
  - depends: rkg7-patch-schema
  - produces: src/lib/patch-stack-cmd.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg7-merge-gate: `roadmap gate merge [--target <branch>]` — checks plan-select receipt exists, spec-origin receipt if .roadmap/spec-origin.json present, kernel verify passes (loadKernel() + validateKernel()), no orphan receipts (receipts not bound to any node), intake receipt for any commit in range not tracked by roadmap. On any failure: exits non-zero with MergeGateResult.error.fix[]. Wire into bin/roadmap.ts.
  - depends: rkg7-merge-gate-schema
  - produces: src/lib/merge-gate-cmd.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg7-env-audit-hardening: Replace SKIP_PLAN_GATE, SKIP_BATCH_COMMIT, ROADMAP_VALIDATING env vars with kernel.json toggles (policy.skipPlanGate, policy.skipBatchCommit, policy.validating). CLI --bypass-* flags emit a bypass receipt (bypass-<flag>-<sha>.json) when used. `roadmap env-audit` command — scans process.env at runtime, fails with non-zero exit if any deprecated bypass env var is set, outputs which vars + recommended kernel.json keys. Wire into bin/roadmap.ts.
  - depends: rkg7-merge-gate-schema
  - produces: src/lib/env-audit.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg8-audit-ingest: `roadmap audit ingest <transcriptPath> [--dag-id <id>]` — parses regent JSONL or equivalent transcript, writes .roadmap/audit/<sessionId>.json with TranscriptSession. Extracts: toolCalls[], retryRate (repeated cmd+args), failures by error.code, bypassFlagsUsed[], timeBetweenBatches[], crossWorkerContaminationEvents (files staged outside produces allowlist), envVarUsage[], orphanedAttempts (shell invocations outside roadmap CLI). Wire into bin/roadmap.ts.
  - depends: rkg8-transcript-schema
  - produces: src/lib/audit-ingest.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg8-friction-engine: Friction heuristics — compute per-node metrics: toolEntropy (unique tool invocations / total), retryRate (retried cmds / total), crossIndexContamination (staged files outside produces / total staged), bypassUsage (bypass receipts emitted), headDrift (HEAD changes during execution window), expansionChurn (intent expansions > 1 depth). Output: frictionScore (0–1 weighted sum), frictionClassifications[]. Write src/lib/friction-engine.ts.
  - depends: rkg8-transcript-schema
  - produces: src/lib/friction-engine.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg8-profile: `roadmap profile [--node <id>] [--last-n <n>]` — reads .roadmap/audit/ session files, aggregates ProfileReport. Nodes exceeding commandsPerNode threshold (default: 20) emit efficiencyWarning. Outputs profile-report.json + console table. Deterministic: same audit inputs → same report. Wire into bin/roadmap.ts.
  - depends: rkg8-profile-schema
  - produces: src/lib/profile-cmd.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P2] rkg8-kernel-enforcement-hook: Kernel enforcement mode — when .roadmap/ exists, auto-enable merge gate enforcement (kernel.policy.mergeGateEnforced = true default) and escape detection. When .roadmap/kernel.json has federation.enabled, propagate kernel policy changes to sibling repos listed in federation.repos[] + emit federation receipt (federation-sync-<sha>.json). Write src/lib/kernel-enforcement.ts.
  - depends: rkg8-escape-detector-schema
  - produces: src/lib/kernel-enforcement.ts
  - validate: shell:npx tsc --noEmit

## Phase 3: Receipt Integration + Escape Convergence (parallel)

- [P3] rkg7-intake-receipt: intake receipt binding — intake-absorb-<sha>.json written by intake-absorb-cmd with: intakeId, fromSha, toSha, treeShaSet[], clusterCount, proposedNodeCount, inputHash (deterministic). Verify: rerun same range → same inputHash. Add receipt verification predicate isIntakeReceiptValid(). Wire into merge-gate checks for external patch ranges.
  - depends: rkg7-intake-absorb-cmd, rkg7-intake-cluster
  - produces: src/lib/intake-receipt.ts
  - validate: shell:npx tsc --noEmit

- [P3] rkg8-audit-recommend: `roadmap audit recommend [--session <id>]` — reads .roadmap/audit/<id>.json + frictionEngine output, emits candidate governance deltas: suggested kernel.json modifications (tolerance thresholds), new spec-kit node suggestions (high-friction patterns → structured DAG nodes), index-isolation warnings, env-var deprecation notices. Writes audit-recommendation-<sha>.json receipt. Wire into bin/roadmap.ts.
  - depends: rkg8-audit-ingest, rkg8-friction-engine
  - produces: src/lib/audit-recommend.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P3] rkg8-auto-intake: Auto-intake trigger — detectUnaccountedCommits() compares HEAD commit range against roadmap receipts (plan-select, dispatch, intake). On UNACCOUNTED_COMMIT: auto-invokes intake-absorb-cmd for the gap range, writes .roadmap/pending-certify.json, blocks advanceBatch() until intake-certify is run. `roadmap intake certify` clears pending-certify.json. In kernel.policy.strictMode, also blocks gate merge. Write src/lib/auto-intake.ts.
  - depends: rkg8-escape-detector-schema, rkg7-intake-absorb-cmd
  - produces: src/lib/auto-intake.ts, bin/roadmap.ts
  - validate: shell:npx tsc --noEmit

- [P3] rkg8-governance-breach-receipt: GovernanceBreach receipt emission — detectGovernanceBreach() checks: (1) commits without any roadmap receipt, (2) direct git commit detected in transcript outside patch-stack path, (3) OUT_OF_BOUNDS tool calls in session. On detection: writes governance-breach-<sha>.json to .roadmap/receipts/. Merge gate checks for breach receipts and fails with actionable error.fix[]. Write breach-detector into kernel-enforcement.ts.
  - depends: rkg8-auto-intake, rkg8-kernel-enforcement-hook
  - produces: src/lib/governance-breach.ts
  - validate: shell:npx tsc --noEmit

## Phase 4: Test Suites (parallel)

- [P4] rkg7-fixtures: Test suite for RKG-7. AT-1: intake absorb on range with no .roadmap/ touches → artifact produced, hash stable across reruns. AT-2: overlay from intake → candidateNodes written, head.json NOT mutated. AT-3: patch stack generated → applies cleanly onto baseSha, reruns produce identical diffs. AT-4: gate merge fails with error.fix[] when plan-select receipt missing. AT-5: env-audit catches SKIP_PLAN_GATE=1 and exits non-zero. AT-6: all commands emit envelope v1; --human prints stable output. Minimum 20 test cases.
  - depends: rkg7-intake-receipt, rkg7-overlay-from-intake, rkg7-patch-stack, rkg7-merge-gate, rkg7-env-audit-hardening, rkg7-completion-ux
  - produces: tests/rkg7-fixtures.test.ts
  - validate: shell:npx vitest run tests/rkg7-fixtures.test.ts

- [P4] rkg8-governance-breach-receipt: GovernanceBreach receipt emission — detectGovernanceBreach() checks: (1) commits without any roadmap receipt, (2) direct git commit detected in transcript outside patch-stack path, (3) OUT_OF_BOUNDS tool calls in session. On detection: writes governance-breach-<sha>.json to .roadmap/receipts/. Merge gate checks for breach receipts and fails with actionable error.fix[]. Write src/lib/governance-breach.ts.
  - depends: rkg8-auto-intake, rkg8-kernel-enforcement-hook
  - produces: src/lib/governance-breach.ts
  - validate: shell:npx tsc --noEmit

## Phase 5: RKG-8 Tests

- [P5] rkg8-fixtures: Test suite for RKG-8. AT-1: ingest transcript with crossIndexContamination → frictionScore > 0, recommendation emitted. AT-2: commit outside roadmap → escape detected, auto-intake triggered, certify required before advance. AT-3: direct git commit + no receipt → merge gate fails with actionable fix. AT-4: kernel strict mode blocks advanceBatch() until governance breach resolved. AT-5: profile report stable across deterministic reruns. Minimum 20 test cases.
  - depends: rkg8-audit-recommend, rkg8-governance-breach-receipt
  - produces: tests/rkg8-fixtures.test.ts
  - validate: shell:npx vitest run tests/rkg8-fixtures.test.ts

## Phase 6: Term

- [P6] term: RKG-7/8 complete — federated intake, overlay, patch stack, merge gate, env-audit hardening, completion UX, audit ingest, friction engine, auto-intake, governance breach, profile, kernel enforcement all verified.
  - depends: rkg7-fixtures, rkg8-fixtures
  - produces: .roadmap/completed.json
  - validate: shell:npx vitest run tests/rkg7-fixtures.test.ts && npx vitest run tests/rkg8-fixtures.test.ts
