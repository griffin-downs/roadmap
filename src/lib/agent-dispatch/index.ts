// @module agent-dispatch
// @exports computeDispatch, executeSealed, validateBrief, saveInterim, saveFinal, loadJournal, loadFinal
// @types DispatchAssignment, HandoffInput, ExecutionResult, BriefValidation, JournalEntry
// @entry agent-dispatch

export { computeDispatch } from './dispatch-coordinator';
export { executeSealed } from './agent-executor';
export { validateBrief, BriefGate } from './brief-gate';
export { saveInterim, saveFinal, loadJournal, loadFinal, journalDir, HandoffJournal } from './handoff-journal';

export type { DispatchPlan, AgentAssignment } from './dispatch-coordinator';
export type { HandoffInput, ExecutionResult, AgentExecutor } from './agent-executor';
export type { BriefValidationResult, BriefValidationError } from './brief-gate';
export type { HandoffChain, InterimHandoff } from './handoff-journal';
