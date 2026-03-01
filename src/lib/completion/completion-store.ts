// @module completion-store
// @description Extended CompletionRecord with validator evidence, runner identity, and git provenance
// @exports ValidatorResult, RunnerInfo, CompletionRecord
// @entry roadmap

// Extends the base CompletionRecord shape (nodeId, completedAt, owner, checkpointId) with
// structured validator evidence, runner identity, and git commit/tree provenance.
// All new fields are optional — existing completed.json records deserialise without error.

/** Per-validator execution result captured at completion time. */
export interface ValidatorResult {
  /** Validator identifier, e.g. "shell:npx tsc", "artifact-exists:foo.ts" */
  id: string;
  passed: boolean;
  exitCode: number;
  /** sha256 of captured stdout, if any */
  stdoutSha?: string;
  /** sha256 of captured stderr, if any */
  stderrSha?: string;
  /** Paths under .roadmap/artifacts/<nodeId>/<sha>/ produced by this validator */
  artifactPaths: string[];
}

/** Identity of the agent or runner that executed the node. */
export interface RunnerInfo {
  /** Runner identifier (e.g. agent name or CLI invocation label) */
  id: string;
  version: string;
}

/**
 * Persisted completion record for a single DAG node.
 *
 * Base fields (nodeId, completedAt, owner, checkpointId) match the legacy shape
 * written by completion-tracker.ts and completion-evidence.ts so that existing
 * completed.json files deserialise without coercion.
 *
 * Extended fields are all optional to preserve backwards compatibility.
 */
export interface CompletionRecord {
  nodeId: string;
  completedAt: string;
  owner?: string;
  checkpointId?: string;

  // Extended evidence fields (additive — safe to omit on legacy records)
  validatorResults?: ValidatorResult[];
  runner?: RunnerInfo;
  commitSha?: string;
  treeSha?: string;
}
