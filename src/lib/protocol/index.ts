// @module protocol
// Barrel exports for protocol layer — split from src/protocol.ts

// Types
export type {
  ValidationRule, IntentJudgment, ObservationSpec, ObservationResult, ExploreResult,
  ValidationCheck, ValidationResult, IntentFailure, ConvergenceLimits, EscalationResult,
  IntentDiagnosis, ConsumeSpec, NodeSpec, EmitGalleryNodeSpec, TermGate, SpecMeta,
  Graph, Connection, Gap, OptimizeResult, LevelEntry, BottleneckEntry,
} from './types.ts';
export { consumeArtifact, consumeResolvedBy, graph, CompletionStore } from './types.ts';

// Operations
export type {
  LoopSignal, PlanReceipt, Orientation, ReadyNode, NextBatch,
  BatchConflict, MergeConflict, BranchWitness, ModifyAnalysis, ModificationRecord,
} from './operations.ts';
export {
  define, verify, check, reconcile, order, parallelOrder, batchConflicts,
  orient, advanceBatch, readyNodes, nextBatch, criticalPath,
  mergeCheck, branchWithWitness, merge, branch,
  analyze, modify, modifyAndCommit,
} from './operations.ts';

// Validation
export { validateNode, validateBatch, validateGraph } from './validation.ts';

// Schema (co-located)
export type { ValidatorRule, PerfReceipt, AuditSchema } from './schema.ts';
export { VALIDATORS } from './schema.ts';
