// @module protocol
// @exports define, graph, check, verify, order, parallelOrder, batchConflicts, orient, advanceBatch, readyNodes, nextBatch, criticalPath, reconcile, merge, branch, analyze, modify, modifyAndCommit, validateNode, validateBatch, validateGraph, CompletionStore, optimize, utilizationRatio, levelReport, bottleneckNodes
// @types NodeSpec, Graph, SpecMeta, Orientation, ReadyNode, NextBatch, BatchConflict, Connection, Gap, ValidationRule, ValidationCheck, ValidationResult, ModifyAnalysis, ModificationRecord, ConsumeSpec, RuntimeExploreRule, ObservationSpec, ObservationResult, ExploreResult, IntentFailure, ConvergenceLimits, EscalationResult, IntentDiagnosis, OptimizeResult, LevelEntry, BottleneckEntry
// @entry roadmap/protocol
//
// Re-exports from split protocol modules. All implementations live in src/lib/protocol/.

export {
  // Types (re-exported as values where applicable)
  consumeArtifact, consumeResolvedBy, graph, CompletionStore,
  // Operations
  define, verify, check, reconcile, order, parallelOrder, batchConflicts,
  orient, advanceBatch, readyNodes, nextBatch, criticalPath,
  mergeCheck, branchWithWitness, merge, branch,
  analyze, modify, modifyAndCommit,
  // Validation
  validateNode, validateBatch, validateGraph,
  // Schema
  VALIDATORS,
} from './lib/protocol/index.ts';

// Optimizer
export {
  optimize, utilizationRatio, levelReport, bottleneckNodes,
} from './lib/optimize.ts';

export type {
  ValidationRule, IntentJudgment, ObservationSpec, ObservationResult, ExploreResult,
  ValidationCheck, ValidationResult, IntentFailure, ConvergenceLimits, EscalationResult,
  IntentDiagnosis, ConsumeSpec, NodeSpec, EmitGalleryNodeSpec, TermGate, SpecMeta,
  Graph, Connection, Gap, OptimizeResult, LevelEntry, BottleneckEntry,
  LoopSignal, PlanReceipt, Orientation, ReadyNode, NextBatch,
  BatchConflict, MergeConflict, BranchWitness, ModifyAnalysis, ModificationRecord,
  ValidatorRule, PerfReceipt, AuditSchema,
} from './lib/protocol/index.ts';
