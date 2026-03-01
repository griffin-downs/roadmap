// @module recipes
// @exports (barrel re-export for recipe/instruction modules)
// @entry roadmap

// dispatch
export { createDispatchPlan, applyDispatchPlan, loadDispatchPlan, dispatchStatus } from './dispatch/dispatch.ts';
export type { DispatchPlan, DispatchWorktree, DispatchApplyResult } from './dispatch/dispatch.ts';
export { writeDispatchReceipt, loadDispatchReceipt, validateDispatchFreshness } from './dispatch/dispatch-receipt.ts';
export type { DispatchReceipt, AgentAssignment } from './dispatch/dispatch-receipt.ts';

// merge
export { REQUIRED_RECEIPTS, isMergeGateResult, formatMergeGateError } from './merge/merge-gate.ts';
export type { RequiredReceiptType, ReceiptCheck, MergeGateError, MergeGateResult } from './merge/merge-gate.ts';
export { runMergeGate } from './merge/merge-gate-cmd.ts';
export type { MergeGateOptions } from './merge/merge-gate-cmd.ts';

// patch
export { PATCH_DIR, PATCH_BRANCH_PREFIX, branchName, isPatchRecord, isPatchReceipt } from './patch/patch-stack.ts';
export type { NodeCommitMapping, PatchRecord, PatchReceipt } from './patch/patch-stack.ts';
export { runPatchStack } from './patch/patch-stack-cmd.ts';
export type { PatchStackOptions } from './patch/patch-stack-cmd.ts';

// plan
export { requirePlanGate } from './plan/plan-gate.ts';
export type { PlanGateResult } from './plan/plan-gate.ts';

// overlay
export { OVERLAY_DIR, isOverlayRecord, isOverlayReceipt } from './overlay/overlay.ts';
export type { CandidateNode, OverlayRecord, OverlayReceipt } from './overlay/overlay.ts';
export { runOverlayFromIntake } from './overlay/overlay-cmd.ts';
export type { OverlayFromIntakeOptions } from './overlay/overlay-cmd.ts';

// spawn
export { buildSpawnPlan } from './spawn/spawn-plan.ts';
export type { WorkerDirective, SpawnBatch, SpawnPlan } from './spawn/spawn-plan.ts';
