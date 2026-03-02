// @module agent-dispatch
// @exports computeDispatch, executeSealed, validateBrief, writeInterimHandoff, writeFinalHandoff, loadHandoffChain
// @types DispatchAssignment, HandoffInput, ExecutionResult, BriefValidation
// @entry agent-dispatch

export { computeDispatch } from './dispatch-coordinator.ts';
export { executeSealed } from './agent-executor.ts';
export { validateBrief } from './brief-gate.ts';
export { writeInterimHandoff, writeFinalHandoff, loadHandoffChain } from './handoff-journal.ts';

export type { DispatchAssignment } from './dispatch-coordinator.ts';
export type { HandoffInput, ExecutionResult } from './agent-executor.ts';
export type { BriefValidation } from './brief-gate.ts';
