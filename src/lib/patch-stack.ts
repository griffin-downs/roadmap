// @module patch-stack
// @exports NodeCommitMapping, PatchRecord, PatchReceipt, PATCH_DIR, PATCH_BRANCH_PREFIX, branchName, isPatchRecord, isPatchReceipt
// @types NodeCommitMapping, PatchRecord, PatchReceipt
// @entry roadmap

/** Maps a single DAG node to its ordered git commits. */
export interface NodeCommitMapping {
  nodeId: string;
  commitShas: string[];
}

/** A patch stack: ordered commits per node applied to a base SHA. */
export interface PatchRecord {
  patchId: string;
  baseSha: string;
  nodeIds: string[];
  nodeMapping: NodeCommitMapping[];
  branchPrefix: string;
  branches: string[];
  timestamp: string;
  /** sha256(baseSha + sorted nodeIds) for reproducibility */
  inputHash: string;
}

/** Receipt emitted after patch stack creation. */
export interface PatchReceipt {
  schemaVersion: 1;
  receiptType: 'patch-stack';
  patchId: string;
  baseSha: string;
  nodeIds: string[];
  branchCount: number;
  inputHash: string;
  timestamp: string;
}

export const PATCH_DIR = '.roadmap/patch' as const;
export const PATCH_BRANCH_PREFIX = 'rm/stack' as const;

/** Deterministic branch name for a patch stack entry. */
export function branchName(patchId: string, index: number, nodeId: string): string {
  return `${PATCH_BRANCH_PREFIX}/${patchId}/${String(index).padStart(2, '0')}-${nodeId}`;
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function isPatchRecord(x: unknown): x is PatchRecord {
  if (!isObject(x)) return false;
  return (
    typeof x.patchId === 'string' &&
    typeof x.baseSha === 'string' &&
    Array.isArray(x.nodeIds) &&
    Array.isArray(x.nodeMapping) &&
    typeof x.branchPrefix === 'string' &&
    Array.isArray(x.branches) &&
    typeof x.timestamp === 'string' &&
    typeof x.inputHash === 'string'
  );
}

export function isPatchReceipt(x: unknown): x is PatchReceipt {
  if (!isObject(x)) return false;
  return (
    x.schemaVersion === 1 &&
    x.receiptType === 'patch-stack' &&
    typeof x.patchId === 'string' &&
    typeof x.baseSha === 'string' &&
    Array.isArray(x.nodeIds) &&
    typeof x.branchCount === 'number' &&
    typeof x.inputHash === 'string' &&
    typeof x.timestamp === 'string'
  );
}
