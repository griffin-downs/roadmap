/**
 * roadmap/agent — sealed APIs for regent-style executors
 *
 * Agents import from here. They cannot reach the DAG directly — getBrief/checkpoint/
 * advance are the only operations agents need. This boundary is intentional.
 */

export { getBrief, loadHandoffJournal } from './lib/brief.ts';
export { checkpoint, advance, verifyBootstrapSignature } from './lib/handoff.ts';

export type { Brief, FinalHandoff, InterimHandoff } from './lib/brief.ts';

// Agent dispatch — orchestrator, executor, brief validation
export { AgentExecutor, executeSealed } from './lib/agent-dispatch/agent-executor.ts';
export { BriefGate, validateBrief } from './lib/agent-dispatch/brief-gate.ts';
export { Orchestrator, runOrchestrator } from './lib/agent-dispatch/orchestrator.ts';
export { computeDispatch } from './lib/agent-dispatch/dispatch-coordinator.ts';
export { HandoffJournal, saveInterim, saveFinal, loadJournal, loadFinal } from './lib/agent-dispatch/handoff-journal.ts';

export type { ExecutionResult, ExecutionContext, HandoffInput } from './lib/agent-dispatch/agent-executor.ts';
export type { BriefValidationResult, BriefValidationError } from './lib/agent-dispatch/brief-gate.ts';
export type { OrchestratorResult, OrchestratorConfig } from './lib/agent-dispatch/orchestrator.ts';
export type { DispatchPlan, AgentAssignment } from './lib/agent-dispatch/dispatch-coordinator.ts';
export type { HandoffChain } from './lib/agent-dispatch/handoff-journal.ts';
