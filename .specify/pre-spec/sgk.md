# Strategy Governance Kernel (SGK-1)

## Problem

Strategy selection is advisory. An LLM agent can dispatch a swarm, complete nodes, and close a run without ever selecting or acknowledging a strategy. The existing `src/lib/strategy/registry.ts` defines three strategies (`hallucinate-rounds-then-validate`, `validate-as-you-go`, `hybrid`) and `src/lib/strategy/select.ts` writes `StrategyReceipt` + `ActiveStrategy` — but nothing in the CLI enforces that these exist before dispatch, during execution, or at run close. Intent gates (`init` + `term`) exist as validation concepts but are not bound to strategy state or run lifecycle receipts. Mining and audit are post-hoc — no gate prevents closing a run without them.

Result: strategies are decorative. Agents ignore them. No receipt chain proves compliance. No gate blocks non-compliant runs from closing.

## Desired State

Strategy usage is non-optional and self-propagating. A run cannot dispatch without a selected strategy receipt. A run cannot complete without init+term intent gates bound to strategy+plan SHAs. A run cannot close without mining+audit artifacts+receipts. CLI commands surface available strategies continuously — every orient/parallel/plan/dispatch output includes `availableStrategies[]` and `selectedStrategy`. The entire chain is receipt-backed: R0 (Run Manifest) through R7 (Run Close), with R8 (Display Receipt) binding term intent to rendered output evidence.

## Key Files

- `src/lib/strategy/registry.ts` — strategy definitions (3 strategies, `getStrategy`, `listStrategies`)
- `src/lib/strategy/select.ts` — `selectStrategy`, `autoSelect`, `clearStrategy`, `SelectionResult`
- `src/lib/strategy/schema.ts` — `StrategyConfig`, `StrategyReceipt`, `ActiveStrategy`
- `src/lib/metaflow/receipt-writer.ts` — `InteractionReceiptWriter` (interaction-level receipts)
- `src/lib/metaflow/command-registry.ts` — `COMMAND_REGISTRY`, `isReceiptRequired`
- `src/lib/metaflow/types.ts` — `RunId`, `RunMeta`, `InteractionReceipt`, `MiningResult`
- `src/lib/cli-envelope.ts` — `emit`, `emitError`, `ErrorCode`, `CliEnvelope`
- `bin/roadmap.ts` — CLI entry point
- `.roadmap/kernel.json` — governance policy config

## Constraints

- All receipts write to `.roadmap/runs/<runId>/` namespace — run-scoped, not global
- Receipt schemas are `schema_version: 1` with ISO timestamps
- Auto-select is deterministic, receipt-backed, policy-governed (`kernel.json` controls `allowDispatchAutoStrategy`)
- No env-variable bypasses — breakglass is the only escape hatch
- Intent gates bind to plan+strategy SHA — drift detection is structural, not heuristic
- CLI enforcement uses existing `emitError` + `ErrorCode` pattern from `cli-envelope.ts`
- Run close is all-or-nothing: missing any required receipt = CLOSE_INCOMPLETE
