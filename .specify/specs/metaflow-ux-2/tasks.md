---
description: "RENDER/UX-2 — MetaFlow: interaction receipts, session binding, transcript mining, guided flows, gantt, optimization DAG"
dagId: metaflow-ux-2
---

# Tasks: RENDER/UX-2 — MetaFlow

**Input**: src/lib/cli-envelope.ts (CliEnvelope, emit, RenderV1), src/lib/render/ (render library), bin/roadmap.ts
**Goal**: User interaction is a governed, receipt-backed flow. Every human-facing CLI emission writes an InteractionReceipt. MetaFlow wraps any subflow, binds agent sessions, mines completed runs for friction + latency, and generates optimization DAGs. Gantt derives from DAG structure (parallelOrder). No env vars for enforcement — all config in JSON files.

## Phase 0: Init

- [P0] mf-init: Existing codebase — cli-envelope.ts, render library, bin/roadmap.ts, existing DAG engine
  - produces: src/lib/cli-envelope.ts, src/lib/render/index.ts, bin/roadmap.ts

## Phase 1: Schemas + FS Layout

- [P1] mf-init-schemas: TypeScript types and filesystem helpers for MetaFlow. **Types** in src/lib/metaflow/types.ts: `RunId` (branded string: `mf_${YYYYMMDD}_${HHMMSSz}_${sha6}`), `StepId` (branded string), `RunMeta` ({ schema_version:1, runId, repoRoot, headSha, createdAt, strictReceipts: boolean }), `InteractionReceipt` ({ schema_version:1, runId, stepId, cmd, intent, audience, render: { plainPath, ansiPath, width, emoji, color }, tutorial?: TutorialBlock, evidence: { headSha, toolCalls, latencyMs } }), `TutorialBlock` ({ mode: 'guided'|'inform', askedQuestions?: QuestionBlock[], nextStepHints: string[] }), `QuestionBlock` ({ id, text, type: 'choice'|'text', choices?: string[] }), `AnswerRecord` ({ questionId, value, recordedAt }), `SessionBinding` ({ workerId, agentSessionId, headSha, gitIndexFile, hookProfile, lastSeenAt, capabilities: string[], status: 'idle'|'running'|'blocked' }), `SessionsStore` ({ schema_version:1, teamId, sessions: SessionBinding[] }), `MiningResult` ({ schema_version:1, runId, computedAt, latencyP50Ms, latencyP95Ms, toolCallTotal, hotspots: ToolHotspot[], friction: FrictionFinding[], teamReuseMissed: boolean }), `ToolHotspot` ({ tool, count, agentIds: string[] }), `FrictionFinding` ({ category: FrictionCategory, subcategory: string, agent: string, detail: string, time?: number }), `FrictionCategory` ('orient-churn'|'validate-loop'|'tool-inflation'|'ask-churn'|'enforcement-retry'), `GanttEntry` ({ nodeId, batchLevel, deps: string[], startOffset?: number, endOffset?: number }), `GanttChart` ({ schema_version:1, runId, entries: GanttEntry[], generatedAt }), `OptimizationNode` ({ id, desc, produces: string[], consumes: string[], rationale: string }). **FS helpers** in src/lib/metaflow/fs.ts: `runDir(runId, base?)` → string, `renderDir(runId, base?)` → string, `plainPath(runId, stepId, base?)` → string, `ansiPath(runId, stepId, base?)` → string, `ensureRunDir(runId, base?)` → void (mkdirSync recursive), `readMeta(runId, base?)` → RunMeta, `writeMeta(runId, meta, base?)` → void, `appendReceipt(runId, receipt, base?)` → void (append NDJSON line), `readSphinctreceipts(runId, base?)` → InteractionReceipt[], `readSessions(runId, base?)` → SessionsStore, `writeSessions(runId, store, base?)` → void. **runId generation** in src/lib/metaflow/run-id.ts: `generateRunId(headSha)` → RunId. **Command** `roadmap mf init [--run <id>] --note "..."` in bin/roadmap.ts: creates `.roadmap/metaflow/runs/<runId>/` directory tree, writes meta.json with strictReceipts defaulting to true (from .roadmap/metaflow/config.json if present, else true), prints JSON envelope with runId.
  - depends: mf-init
  - produces: src/lib/metaflow/types.ts, src/lib/metaflow/fs.ts, src/lib/metaflow/run-id.ts
  - validate: shell:npx tsc --noEmit

## Phase 2: Receipt Writer + Session Binding (parallel)

- [P2] mf-interaction-receipt-writer: `InteractionReceiptWriter` class in src/lib/metaflow/receipt-writer.ts. Constructor: `(runId: RunId, opts: { base?: string })`. Methods: `begin(stepId, cmd, intent, audience)` → starts a step timer; `writeSnapshot(stepId, plain: string, ansi?: string)` → writes render/<stepId>.plain.txt and render/<stepId>.ansi.txt; `commit(stepId, evidence: { toolCalls: number })` → builds InteractionReceipt, appends to interactions.ndjson via appendReceipt(), returns receipt. **Envelope integration**: add optional `receiptRequired?: boolean` field to command registry (src/lib/metaflow/command-registry.ts — a JSON-keyed map of commandKey → { receiptRequired: boolean }; commandKey = first two argv tokens e.g. "mf step"). In bin/roadmap.ts emit(), after writing JSON to stdout: if strictReceipts (from current run meta.json if --mf-run is active, else false) AND commandKey is receipt-required AND no receipt committed → process.stderr.write error JSON + process.exit(3) with code INTERACTION_RECEIPT_MISSING. No env vars — strictReceipts comes only from meta.json or .roadmap/metaflow/config.json.
  - depends: mf-init-schemas
  - produces: src/lib/metaflow/receipt-writer.ts, src/lib/metaflow/command-registry.ts
  - validate: shell:npx tsc --noEmit

- [P2] mf-session-binding: `SessionStore` class in src/lib/metaflow/session-store.ts. Methods: `register(runId, binding: Omit<SessionBinding, 'lastSeenAt' | 'status'>)` → writes/merges entry into sessions.json, status='running'; `touch(runId, workerId)` → updates lastSeenAt; `retire(runId, workerId)` → status='idle'; `findReusable(runId, capabilities: string[])` → returns first SessionBinding with status='idle' and superset capabilities, or null; `validate(runId)` → if sessions.json absent or empty → throws with code SESSION_BINDING_MISSING. **Command** `roadmap mf dispatch --run <runId> --worker-id <id> --agent-session <id> --git-index <path> --hook-profile <path> --capabilities <csv> --note "..."` → registers session; if findReusable() returns non-null AND a new registration is being added → appends TEAM_REUSE_MISSED finding to mining pre-findings (sessions.json reuse field). **Command** `roadmap mf retire-team --run <runId> --note "..."` → sets all sessions to idle. **Exit code enforcement**: any dispatch subcommand (mf dispatch, mf wrap) calls validate() first; SESSION_BINDING_MISSING → exit(3).
  - depends: mf-init-schemas
  - produces: src/lib/metaflow/session-store.ts
  - validate: shell:npx tsc --noEmit

## Phase 3: Guided Ask/Answer + Gantt Renderer + Transcript Miner (parallel)

- [P3] mf-guided-ask-answer: Commands in bin/roadmap.ts and logic in src/lib/metaflow/ask.ts. `roadmap mf ask --run <runId> --step <stepId> --question-id <id> --text "..." --type choice --choices "a,b,c" --note "..."` → builds QuestionBlock, appends to meta.json questions[] array, emits it as a TutorialBlock in a receipt via InteractionReceiptWriter (receipt-required for this command). `roadmap mf answer --run <runId> --question-id <id> --value "..." --note "..."` → validates questionId exists in meta.json questions, appends AnswerRecord to meta.json answers[] array. Export types from src/lib/metaflow/ask.ts: `buildQuestionBlock`, `recordAnswer`, `getAnswers`.
  - depends: mf-interaction-receipt-writer
  - produces: src/lib/metaflow/ask.ts
  - validate: shell:npx tsc --noEmit

- [P3] mf-gantt-render: `render.gantt(dag, receipts, opts)` function in src/lib/render/gantt.ts. **Primary input**: DAG graph — uses `parallelOrder(g)` to compute batch levels → GanttEntry[]. Each node gets batchLevel = its parallelOrder index, deps from NodeSpec.deps, startOffset/endOffset from receipt latencyMs if a matching stepId exists in receipts[] (match by nodeId === stepId prefix). **ASCII renderer**: `renderGantt(chart: GanttChart, opts: RenderOpts)` → string with batch-level columns: node labels left-padded, bar blocks `█` proportional to endOffset-startOffset (or unit if no timing data), batch level as column header. **Command** `roadmap mf gantt --run <runId> [--dag-id <id>] --note "..."` → loads DAG from .roadmap/head.json, reads receipts via readReceipts(), calls gantt(), writes .roadmap/metaflow/runs/<runId>/gantt.json, renders ASCII to RenderV1 in envelope. Export from src/lib/render/index.ts. Snapshot-test against a fixture DAG.
  - depends: mf-init-schemas
  - produces: src/lib/render/gantt.ts, src/lib/render/index.ts
  - validate: shell:npx tsc --noEmit

- [P3] mf-transcript-miner: First-class miner module in src/lib/metaflow/miner.ts. **Inputs**: InteractionReceipt[] (from readReceipts), SessionsStore (from readSessions), optional hooks.log path. **Friction detectors** (port + extend from regent transcript-pathology pattern): (1) `detectOrientChurn(receipts)` — counts receipts where cmd starts with "roadmap orient" within a run; flags if >3 sequential orients with no intervening "complete"; (2) `detectValidateLoop(receipts)` — cmd "roadmap complete" → "roadmap validate" pattern repeating >2x; (3) `detectToolInflation(sessions)` — same tool appearing in hotspots >5x for a single workerId within 60s window; (4) `detectAskChurn(receipts)` — mf ask/answer cycles >4 for same questionId; (5) `detectEnforcementRetry(hooksLog?)` — port of extractRetryPatterns from regent-transcript-pathology (denial of same tool within 10s). **Output**: `mine(receipts, sessions, hooksLogPath?)` → MiningResult: latencyP50/P95 computed from receipt evidence.latencyMs array, toolCallTotal summed, hotspots ranked, friction[] assembled, teamReuseMissed from sessions reuse field. Export: `mine`, `detectOrientChurn`, `detectValidateLoop`, `detectToolInflation`, `detectAskChurn`, `detectEnforcementRetry`.
  - depends: mf-init-schemas
  - produces: src/lib/metaflow/miner.ts
  - validate: shell:npx tsc --noEmit

## Phase 4: Wrap Subcommand

- [P4] mf-wrap-subcommand: `roadmap mf wrap --run <runId> --cmd "roadmap complete X" --step <stepId> --note "..."` in bin/roadmap.ts + src/lib/metaflow/wrap.ts. Logic: (1) validate run exists (readMeta); (2) validate session binding (SessionStore.validate); (3) begin receipt (InteractionReceiptWriter.begin); (4) spawn subprocess via `spawnSync` passing the command with shell:true; capture stdout+stderr buffers; (5) writeSnapshot with captured stderr as plain; (6) commit receipt with toolCalls:0 (subcommand is opaque) and actual latency; (7) write subprocess stdout to own stdout, subprocess stderr to own stderr. If strictReceipts and receipt not committed on subprocess error → exit(3) INTERACTION_RECEIPT_MISSING. `--mf-run <runId>` flag: wrap passes it as an extra arg to the subcommand if the subcommand is a roadmap command (detected by argv[0] === "roadmap"). Not an env var.
  - depends: mf-interaction-receipt-writer, mf-session-binding
  - produces: src/lib/metaflow/wrap.ts
  - validate: shell:npx tsc --noEmit

## Phase 5: Mine Run

- [P5] mf-mine-run: `roadmap mf mine --run <runId> --note "..."` in bin/roadmap.ts + src/lib/metaflow/mine-run.ts. Logic: (1) readReceipts(runId); (2) readSessions(runId); (3) optionally read ~/.claude/regent/hooks.log if it exists; (4) call mine(receipts, sessions, hooksLogPath); (5) write mining.json to run dir; (6) render MiningResult as RenderV1: latency table (p50/p95/total), hotspots table (tool | count | agents), friction list with category badges, teamReuseMissed warning if true; (7) emit envelope. A run is not "complete" until mining.json exists — mf-complete command (bonus: add `roadmap mf complete --run <runId>`) checks for mining.json presence and exits 3 with MINING_REQUIRED if absent.
  - depends: mf-transcript-miner, mf-wrap-subcommand
  - produces: src/lib/metaflow/mine-run.ts
  - validate: shell:npx tsc --noEmit

## Phase 6: Optimization DAG Generator

- [P6] mf-opt-dag-generator: `roadmap mf opt --run <runId> [--emit] --note "..."` in bin/roadmap.ts + src/lib/metaflow/opt-dag.ts. Reads mining.json. **Mapping rules** (friction → optimization node): orient-churn → `opt-reduce-orient-churn` (desc: "Cache orient result in run context; skip re-orient if headSha unchanged"); validate-loop → `opt-validate-cache` (desc: "Cache validator output keyed by nodeId+headSha"); tool-inflation → `opt-merge-toolcalls` (desc: "Batch repeated tool calls into single aggregate call"); ask-churn → `opt-streamline-questions` (desc: "Merge redundant questions into single decision block"); enforcement-retry → `opt-fix-enforcement-gaps` (desc: "Add pre-check before blocked tool call"). teamReuseMissed → `opt-enforce-team-reuse` node. Each OptimizationNode gets: id, desc, produces: [`mining.json` patch path], consumes: [`mining.json`], rationale (friction detail). With `--emit`: writes optimization nodes to .roadmap/expansions/expand-opt-<runId>.ts and runs `roadmap expand` on it to commit the sub-DAG. Without `--emit`: dry-run, prints proposed nodes as JSON.
  - depends: mf-mine-run
  - produces: src/lib/metaflow/opt-dag.ts
  - validate: shell:npx tsc --noEmit

## Phase 7: Term — Fixture-Backed Demonstration + Full Test Suite

- [P7] intent-metaflow-guided-ux: Fixture-backed demonstration and full acceptance test suite. **Fixture run**: commit a synthetic MF run at `.roadmap/metaflow/runs/mf-fixture-001/` containing: meta.json (strictReceipts:true, runId:"mf-fixture-001"), interactions.ndjson (4 receipts: mf-init, mf ask, mf answer, mf wrap), sessions.json (1 session, status:idle), gantt.json (DAG-derived from mf-init-schemas node), mining.json (computed from fixture receipts — latencyP50:120, 2 friction findings). **Test file** tests/metaflow.test.ts — minimum 15 tests: (1) INTERACTION_RECEIPT_MISSING: invoke mf step with strictReceipts:true + no receipt committed → process exits 3; (2) receipt written: InteractionReceiptWriter.commit() → appends valid NDJSON to interactions.ndjson; (3) plain snapshot deterministic: same receipt input → identical .plain.txt on two writes; (4) ansi snapshot deterministic: same receipt → identical .ansi.txt; (5) SESSION_BINDING_MISSING: mf dispatch without prior register → exit 3; (6) session register + retire round-trip: register → status running, retire → idle; (7) TEAM_REUSE_MISSED: register when findReusable() non-null → reuse field set; (8) gantt from DAG: parallelOrder produces correct batchLevel assignments; (9) gantt ASCII render: stable snapshot against fixture; (10) orient churn detection: >3 sequential orient receipts → FrictionFinding category=orient-churn; (11) validate loop detection: complete→validate>2x → friction finding; (12) tool inflation: same tool >5x in 60s → hotspot; (13) mine produces mining.json with p50/p95; (14) opt-dag-generator maps friction → OptimizationNode correctly; (15) mf complete exits 3 MINING_REQUIRED if mining.json absent. tsc clean. All tests passing.
  - depends: mf-opt-dag-generator, mf-gantt-render, mf-guided-ask-answer
  - produces: tests/metaflow.test.ts, .roadmap/metaflow/runs/mf-fixture-001/meta.json, .roadmap/metaflow/runs/mf-fixture-001/interactions.ndjson, .roadmap/metaflow/runs/mf-fixture-001/sessions.json, .roadmap/metaflow/runs/mf-fixture-001/gantt.json, .roadmap/metaflow/runs/mf-fixture-001/mining.json
  - validate: shell:npx tsc --noEmit && npx vitest run tests/metaflow.test.ts
