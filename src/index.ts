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
export { repoInfo, artifactAtRef, archivedFiles, fileHistory, restore, stageAndCommit, createBranch, trackedFiles, isTracked, shortHash, isClean } from './lib/git.ts';
export type { RepoInfo, FileHistory } from './lib/git.ts';

// Typed errors
export { RoadmapError } from './errors.ts';
export type { ErrorCode, RoadmapErrorContext } from './errors.ts';

// Recovery + execution
export { CheckpointManager } from './lib/checkpoint.ts';
export { AuditTrail } from './lib/audit.ts';
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
} from './protocol.ts';

export type {
  GitState,
  Checkpoint,
} from './lib/checkpoint.schema.ts';

export type {
  VersionInfo,
  CompatibilityResult,
} from './lib/versioning.schema.ts';

export type { AuditEntry, AuditSession } from './lib/audit.ts';

export type {
  Brief,
  FinalHandoff,
  InterimHandoff,
} from './lib/brief.ts';
