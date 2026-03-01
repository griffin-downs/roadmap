// @module metaflow
// @exports (re-exports from types, fs, run-id, state/, execution/, phases/)
// @entry roadmap/metaflow

export * from './types.ts';
export * from './fs.ts';
export * from './run-id.ts';

// state
export { writeActiveRun, readActiveRun, clearActiveRun } from './state/active-run.ts';
export type { ActiveRun } from './state/active-run.ts';
export { SessionStore } from './state/session-store.ts';

// execution
export { wrapSubcommand } from './execution/wrap.ts';
export { ELIGIBLE_COMMANDS, isEligible, selfInsert } from './execution/self-insert.ts';
export { InteractionReceiptWriter } from './execution/receipt-writer.ts';
export { writeRenderReceipt, readRenderReceipt, lastRenderReceipt, requireRenderReceipt } from './execution/render-receipt.ts';
export { checkEnvBypass, writeBypassReceipt, BYPASS_ENV_VARS } from './execution/guards.ts';

// phases
export { mine, detectOrientChurn, detectValidateLoop, detectToolInflation, detectAskChurn, detectEnforcementRetry } from './phases/miner.ts';
export { mineRun, miningExists } from './phases/mine-run.ts';
export { buildOptimizationNodes, readMining, emitOptExpansion } from './phases/opt-dag.ts';
export { loadFlowIndex, loadFlow, listFlows } from './phases/flows.ts';
