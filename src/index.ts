/**
 * roadmap: DAG expansion protocol library
 *
 * Public API surface. Internal functions (detectCycles, fwd, Flat, etc) not exported.
 */

// Core protocol
export {
  define,
  graph,
  check,
  verify,
  order,
  parallelOrder,
  orient,
  reconcile,
  merge,
  branch,
  analyze,
  modify,
  modifyAndCommit,
  readyNodes,
  nextBatch,
  criticalPath,
  validateNode,
  validateGraph,
} from './protocol.ts';

// Predicates for orient()
export { fileExists, gitArtifactExists, gitArtifactAt, siblingArtifactExists, compound, any } from './predicates.ts';

// Cross-repo orient
export { crossOrient } from './lib/cross-orient.ts';
export type { CrossOrientation, SiblingStatus } from './lib/cross-orient.ts';

// Git library
export { repoInfo, artifactAtRef, archivedFiles, fileHistory, restore, stageAndCommit, createBranch, trackedFiles, isTracked, shortHash, isClean } from './lib/utils/git/git.ts';
export type { RepoInfo, FileHistory } from './lib/utils/git/git.ts';

// Typed errors
export { RoadmapError } from './errors.ts';
export type { ErrorCode, RoadmapErrorContext } from './errors.ts';

// Recovery + execution
export { CheckpointManager } from './lib/checkpoint.ts';
export { AuditTrail } from './lib/audit/trail.ts';
export { computeTrailMetrics, loadTrailEntries } from './lib/trail-metrics.ts';
export type { TrailMetrics, BatchMetrics, NodeMetrics, TrailEntry } from './lib/trail-metrics.ts';

// Agent APIs (sealed, no DAG introspection)
export {
  getBrief,
  loadHandoffJournal,
} from './lib/brief.ts';

export {
  checkpoint,
  advance,
  verifyBootstrapSignature,
} from './lib/handoff.ts';

// Versioning + migration
export {
  loadDAG,
  loadDAGFromFile,
} from './lib/versioning.ts';

export {
  checkCompatibility,
  migrateDAG,
  CURRENT_PROTOCOL_VERSION,
} from './lib/versioning.schema.ts';

export { DAGMigrator } from './lib/migrations.ts';

// Type exports
export type {
  Graph,
  NodeSpec,
  Connection,
  Gap,
  Orientation,
  LoopSignal,
  ValidationRule,
  ValidationCheck,
  ValidationResult,
  ModifyAnalysis,
  ReadyNode,
  NextBatch,
  ModificationRecord,
  ObservationSpec,
  ObservationResult,
  ExploreResult,
  IntentFailure,
  ConvergenceLimits,
  EscalationResult,
  IntentDiagnosis,
} from './protocol.ts';

// Intent-driven expansion
export { generateIntentExpansion, resolveProduces, detectStall, buildEscalation, extractIntentFailures } from './lib/intent/intent-expansion.ts';
export type { FixNodeSpec, ExpansionResult } from './lib/intent/intent-expansion.ts';

// DAG-level validation (bookend intent gates: init + terminal)
export { validateTerminalIntentGate, validateInitIntentGate, findTerminalNodes, findInitBoundary } from './lib/validate-dag.ts';
export type { TerminalIntentError, InitIntentError } from './lib/validate-dag.ts';

// Plan clarity validation (init intent gate evaluator)
export { validatePlanClarity } from './lib/validate-plan-clarity.ts';
export type { PlanClarityGap, PlanClarityResult } from './lib/validate-plan-clarity.ts';

// Runtime exploration (CDP-based behavioral observation)
export { launchApp, runExploreScript, mapObservationsToChecks, teardown } from './lib/runtime-explore.ts';
export type { LaunchHandle, ExploreScriptResult } from './lib/runtime-explore.ts';

export type {
  GitState,
  Checkpoint,
} from './lib/checkpoint.schema.ts';

export type {
  VersionInfo,
  CompatibilityResult,
} from './lib/versioning.schema.ts';

export type { AuditEntry, AuditSession } from './lib/audit/trail.ts';

export type {
  Brief,
  FinalHandoff,
  InterimHandoff,
} from './lib/brief.ts';
