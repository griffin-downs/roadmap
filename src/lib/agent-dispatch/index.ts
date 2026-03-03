// @module agent-dispatch
// @exports computeDispatch, executeSealed, validateBrief, saveInterim, saveFinal, loadJournal, loadFinal
// @types DispatchAssignment, HandoffInput, ExecutionResult, BriefValidation, JournalEntry
// @entry agent-dispatch

export { computeDispatch } from './dispatch-coordinator.ts';
export { executeSealed } from './agent-executor.ts';
export { validateBrief, BriefGate } from './brief-gate.ts';
export { saveInterim, saveFinal, loadJournal, loadFinal, journalDir, HandoffJournal } from './handoff-journal.ts';

export type { DispatchPlan, AgentAssignment } from './dispatch-coordinator.ts';
export type { HandoffInput, ExecutionResult, AgentExecutor } from './agent-executor.ts';
export type { BriefValidationResult, BriefValidationError } from './brief-gate.ts';
export type { HandoffChain } from './handoff-journal.ts';
export type { InterimHandoff, FinalHandoff } from '../brief.ts';
