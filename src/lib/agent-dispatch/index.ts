// @module agent-dispatch
// @exports computeDispatch, executeSealed, validateBrief, saveInterim, saveFinal, loadJournal, loadFinal
// @types DispatchAssignment, HandoffInput, ExecutionResult, BriefValidation, JournalEntry
// @entry agent-dispatch

export { computeDispatch } from './dispatch-coordinator.ts';
export { executeSealed } from './agent-executor.ts';
export { validateBrief } from './brief-gate.ts';
export { saveInterim, saveFinal, loadJournal, loadFinal, journalDir } from './handoff-journal.ts';

export type { DispatchAssignment } from './dispatch-coordinator.ts';
export type { HandoffInput, ExecutionResult } from './agent-executor.ts';
export type { BriefValidation } from './brief-gate.ts';
export type { JournalEntry } from './handoff-journal.ts';
