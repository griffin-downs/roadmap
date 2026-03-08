// @module protocol
// @exports define, graph, check, verify, order, parallelOrder, batchConflicts, orient, advanceBatch, readyNodes, nextBatch, criticalPath, reconcile, merge, branch, analyze, modify, modifyAndCommit, validateNode, validateBatch, validateGraph, CompletionStore, optimize, utilizationRatio, levelReport, bottleneckNodes, fullNode
// @types NodeSpec, Graph, SpecMeta, Orientation, ReadyNode, NextBatch, BatchConflict, Connection, Gap, ValidationRule, ValidationCheck, ValidationResult, ModifyAnalysis, ModificationRecord, ConsumeSpec, IntentFailure, ConvergenceLimits, EscalationResult, IntentDiagnosis, OptimizeResult, LevelEntry, BottleneckEntry, CoreNodeSpec, CoreGraph, NodeMeta, ManagedNodeSpec, ManagedGraph
// @entry roadmap/protocol
//
// Re-exports from split protocol modules. All implementations live in src/lib/protocol/.
// Core types from src/core/ and runtime metadata from src/runtime/ also re-exported here.

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

// Core graph algebra types
export type { CoreNodeSpec, CoreGraph } from './core/types.ts';

// Runtime metadata types + bridge
export type { NodeMeta, ManagedNodeSpec, ManagedGraph } from './runtime/meta.ts';
export { fullNode } from './runtime/meta.ts';

// Optimizer
export {
  optimize, utilizationRatio, levelReport, bottleneckNodes,
} from './lib/optimize.ts';

export type {
  ValidationRule, IntentJudgment,
  ValidationCheck, ValidationResult, IntentFailure, ConvergenceLimits, EscalationResult,
  IntentDiagnosis, ConsumeSpec, NodeSpec, EmitGalleryNodeSpec, TermGate, SpecMeta,
  Graph, Connection, Gap, OptimizeResult, LevelEntry, BottleneckEntry,
  LoopSignal, PlanReceipt, Orientation, ReadyNode, NextBatch,
  BatchConflict, MergeConflict, BranchWitness, ModifyAnalysis, ModificationRecord,
  ValidatorRule, PerfReceipt, AuditSchema,
} from './lib/protocol/index.ts';
