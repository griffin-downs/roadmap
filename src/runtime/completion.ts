// @module runtime/completion
// @description Unified completion module — types, persistence, store, evidence
// @exports ValidatorResult, RunnerInfo, CompletionRecord, EvidenceRecord, CompletionRecordWithEvidence, CompletionStore, CompletionStoreError, loadCompletions, saveCompletion, isNodeComplete, getCompletedNodeIds, validateEntry, migrateEntry, hasPassingReceipt, loadCompletionsWithEvidence, saveCompletionWithEvidence
// @entry roadmap/completion

import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/** Atomic write: write to tmp, then rename. Prevents partial writes on crash or race. */
function atomicWriteJson(filePath: string, data: unknown): void {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  renameSync(tmp, filePath);
}

// ── Types (from completion-store.ts) ────────────────────────────────────────

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
 * Base fields (nodeId, completedAt, owner, checkpointId) match the legacy shape.
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

// ── Evidence types (from completion-evidence.ts) ────────────────────────────

export interface EvidenceRecord {
  rule: string;
  passed: boolean;
  evidence: string;
}

export interface CompletionRecordWithEvidence {
  nodeId: string;
  completedAt: string;
  dagId?: string;
  owner?: string;
  checkpointId?: string;
  legacy?: boolean;
  validationChecks?: EvidenceRecord[];
  validatorResults?: ValidatorResult[];
  gitSha?: string;
  treeSha?: string;
  branch?: string;
}

// ── Evidence helpers (from completion-evidence.ts) ──────────────────────────

/** Type guard: validates that an entry conforms to CompletionRecordWithEvidence */
export function validateEntry(entry: unknown): entry is CompletionRecordWithEvidence {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return typeof e.nodeId === 'string' && typeof e.completedAt === 'string';
}

/** Migrate legacy entries to new schema */
export function migrateEntry(entry: Record<string, unknown>): CompletionRecordWithEvidence {
  const nodeId = String(entry.nodeId ?? '');
  const completedAt = String(entry.completedAt ?? new Date().toISOString());

  // Normalize evidence field
  let validationChecks: EvidenceRecord[] = [];
  if (Array.isArray(entry.validationChecks)) {
    validationChecks = entry.validationChecks;
  } else if (Array.isArray(entry.evidence)) {
    // evidence as array of objects
    validationChecks = entry.evidence;
  } else if (typeof entry.evidence === 'string') {
    // Old format: single evidence string — convert to empty checks but keep legacy flag
    validationChecks = [];
  }

  return {
    nodeId,
    completedAt,
    ...(typeof entry.owner === 'string' ? { owner: entry.owner } : {}),
    ...(typeof entry.checkpointId === 'string' ? { checkpointId: entry.checkpointId } : {}),
    ...(validationChecks.length > 0 ? { validationChecks } : {}),
    ...(Array.isArray(entry.validatorResults) ? { validatorResults: entry.validatorResults } : {}),
    ...(typeof entry.gitSha === 'string' ? { gitSha: entry.gitSha } : {}),
    ...(typeof entry.treeSha === 'string' ? { treeSha: entry.treeSha } : {}),
    legacy: true,
  };
}

/**
 * Receipt is passing when:
 *   - record exists with validationChecks and all passed, OR
 *   - record exists with completedAt but no validationChecks (pre-evidence legacy format)
 * A record with checks where any check failed is NOT passing.
 */
export function hasPassingReceipt(record: CompletionRecordWithEvidence | undefined): boolean {
  if (!record) return false;
  if (!record.validationChecks || record.validationChecks.length === 0) {
    // Legacy: record exists (has completedAt) but no evidence checks — treat as passing
    return !!record.completedAt;
  }
  return record.validationChecks.every(c => c.passed);
}

export function loadCompletionsWithEvidence(repoRoot: string): Map<string, CompletionRecordWithEvidence> {
  const completionPath = join(repoRoot, '.roadmap', 'completed.json');
  if (!existsSync(completionPath)) return new Map();

  try {
    const data = JSON.parse(readFileSync(completionPath, 'utf-8'));
    const records = new Map<string, CompletionRecordWithEvidence>();
    if (Array.isArray(data)) {
      for (const entry of data) {
        // Migrate if not valid
        const record = validateEntry(entry) ? entry : migrateEntry(entry as Record<string, unknown>);
        records.set(record.nodeId, record);
      }
    }
    // Non-array or unparseable completion files degrade silently; orient
    // surfaces "no nodes done" via its JSON envelope. The repair path is to
    // delete .roadmap/completed.json and re-advance.
    return records;
  } catch {
    return new Map();
  }
}

export function saveCompletionWithEvidence(
  repoRoot: string,
  nodeId: string,
  checks: EvidenceRecord[],
  owner?: string,
  checkpointId?: string,
  validatorResults?: ValidatorResult[],
  dagId?: string,
): void {
  const dirPath = join(repoRoot, '.roadmap');
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

  // Read current dag_id from head.json if not provided
  let currentDagId = dagId;
  if (!currentDagId) {
    try {
      const headJsonPath = join(dirPath, 'head.json');
      if (existsSync(headJsonPath)) {
        const headData = JSON.parse(readFileSync(headJsonPath, 'utf-8'));
        currentDagId = headData.id;
      }
    } catch {
      // If head.json doesn't exist or can't be parsed, continue without dagId
    }
  }

  let gitSha: string | undefined;
  let treeSha: string | undefined;
  let branch: string | undefined;
  try {
    gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    treeSha = execSync('git rev-parse HEAD^{tree}', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    // Not a git repo or git not available
  }

  const completions = loadCompletionsWithEvidence(repoRoot);
  const newEntry: CompletionRecordWithEvidence = {
    nodeId,
    completedAt: new Date().toISOString(),
    ...(currentDagId ? { dagId: currentDagId } : {}),
    owner,
    checkpointId,
    validationChecks: checks,
    ...(validatorResults && validatorResults.length > 0 ? { validatorResults } : {}),
    ...(gitSha ? { gitSha } : {}),
    ...(treeSha ? { treeSha } : {}),
    ...(branch ? { branch } : {}),
  };

  // Validate before setting
  if (!validateEntry(newEntry)) {
    const migrated = migrateEntry(newEntry as unknown as Record<string, unknown>);
    completions.set(nodeId, migrated);
  } else {
    completions.set(nodeId, newEntry);
  }

  const recordArray = Array.from(completions.values());
  atomicWriteJson(join(dirPath, 'completed.json'), recordArray);
}

// ── Tracker functions (from completion-tracker.ts) ──────────────────────────

/** Load completed node records from .roadmap/completed.json */
export function loadCompletions(repoRoot: string): Map<string, CompletionRecord> {
  const completionPath = join(repoRoot, '.roadmap', 'completed.json');

  if (!existsSync(completionPath)) {
    return new Map();
  }

  try {
    const data = JSON.parse(readFileSync(completionPath, 'utf-8'));
    const records = new Map<string, CompletionRecord>();

    if (Array.isArray(data)) {
      for (const record of data) {
        records.set(record.nodeId, record);
      }
    }

    return records;
  } catch {
    return new Map();
  }
}

/** Save a node completion record */
export function saveCompletion(
  repoRoot: string,
  nodeId: string,
  owner?: string,
  checkpointId?: string,
): void {
  const completionPath = join(repoRoot, '.roadmap', 'completed.json');
  const dirPath = join(repoRoot, '.roadmap');

  // Ensure .roadmap directory exists
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }

  // Load existing completions
  const completions = loadCompletions(repoRoot);

  // Add/update the new completion
  completions.set(nodeId, {
    nodeId,
    completedAt: new Date().toISOString(),
    owner,
    checkpointId,
  });

  // Write back to file (atomic: tmp + rename)
  const recordArray = Array.from(completions.values());
  atomicWriteJson(completionPath, recordArray);
}

/** Check if a node has been completed */
export function isNodeComplete(completions: Map<string, CompletionRecord>, nodeId: string): boolean {
  return completions.has(nodeId);
}

/** Get set of completed node IDs */
export function getCompletedNodeIds(completions: Map<string, CompletionRecord>): Set<string> {
  return new Set(completions.keys());
}

// ── CompletionStore class (from completion-context.ts) ──────────────────────

/**
 * Receipt-only completion store. A node is "done" iff it has a passing receipt.
 * No artifact-existence fallback. No implicit legacy mode.
 *
 * Usage:
 *   CompletionStore.load(repoRoot)  — from completed.json (throws if missing)
 *   CompletionStore.empty()         — test fixture: nothing done
 *   CompletionStore.from(['a','b']) — test fixture: listed nodes done
 */
export class CompletionStore {
  private records: Map<string, CompletionRecordWithEvidence>;

  private constructor(records: Map<string, CompletionRecordWithEvidence>) {
    this.records = records;
  }

  filterByDagId(dagId: string): CompletionStore {
    const filtered = new Map<string, CompletionRecordWithEvidence>();
    for (const [id, record] of this.records) {
      if (record.dagId === dagId || record.dagId === undefined) {
        filtered.set(id, record);
      }
    }
    return new CompletionStore(filtered);
  }

  /** Is this node completed with passing evidence? */
  hasPassing(nodeId: string): boolean {
    const record = this.records.get(nodeId);
    if (!record) return false;
    return hasPassingReceipt(record);
  }

  /** Get evidence records for a node (empty array if none). */
  evidence(nodeId: string): EvidenceRecord[] {
    return this.records.get(nodeId)?.validationChecks ?? [];
  }

  /** Does this node have any record (passing or failing)? */
  hasRecord(nodeId: string): boolean {
    return this.records.has(nodeId);
  }

  /** Does this node have a record with at least one failing check? */
  hasFailing(nodeId: string): boolean {
    const record = this.records.get(nodeId);
    if (!record) return false;
    if (!record.validationChecks || record.validationChecks.length === 0) return false;
    return record.validationChecks.some(c => !c.passed);
  }

  /** Get raw completion record for a node (undefined if none). */
  record(nodeId: string): CompletionRecordWithEvidence | undefined {
    return this.records.get(nodeId);
  }

  /** All node IDs in the store (passing, failing, or empty checks). */
  allIds(): Set<string> {
    return new Set(this.records.keys());
  }

  /** All node IDs with passing receipts. */
  passingIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id] of this.records) {
      if (this.hasPassing(id)) ids.add(id);
    }
    return ids;
  }

  /** Node IDs that pass only because they're legacy (no validationChecks). */
  legacyIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id, record] of this.records) {
      if (!this.hasPassing(id)) continue;
      if (!record.validationChecks || record.validationChecks.length === 0) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** All node IDs with at least one failing check. */
  failingIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id] of this.records) {
      if (this.hasFailing(id)) ids.add(id);
    }
    return ids;
  }

  /**
   * Load from .roadmap/completed.json.
   * Throws if file is missing — caller must handle (e.g. suggest `roadmap init`).
   */
  static load(repoRoot: string): CompletionStore {
    const completedPath = join(repoRoot, '.roadmap', 'completed.json');
    if (!existsSync(completedPath)) {
      throw new CompletionStoreError(
        `No completion store at ${completedPath}`,
        'Run `roadmap init` to create one, or `roadmap migrate` to upgrade an existing repo.',
      );
    }
    return new CompletionStore(loadCompletionsWithEvidence(repoRoot));
  }

  /**
   * Load from .roadmap/completed.json, or return empty store if missing.
   * Use only where missing store is expected (e.g. sibling repo checks).
   */
  static loadOrEmpty(repoRoot: string): CompletionStore {
    const completedPath = join(repoRoot, '.roadmap', 'completed.json');
    if (!existsSync(completedPath)) return CompletionStore.empty();
    return new CompletionStore(loadCompletionsWithEvidence(repoRoot));
  }

  /** Empty store — no nodes are done. */
  static empty(): CompletionStore {
    return new CompletionStore(new Map());
  }

  /** Test fixture — listed nodes are done with synthetic passing receipts. */
  static from(ids: Iterable<string>): CompletionStore {
    const records = new Map<string, CompletionRecordWithEvidence>();
    for (const id of ids) {
      records.set(id, {
        nodeId: id,
        completedAt: new Date().toISOString(),
        validationChecks: [{ rule: 'fixture', passed: true, evidence: 'test fixture' }],
      });
    }
    return new CompletionStore(records);
  }

  /** Test fixture — build from explicit records (passing, failing, or empty checks). */
  static fromRecords(records: CompletionRecordWithEvidence[]): CompletionStore {
    const map = new Map<string, CompletionRecordWithEvidence>();
    for (const r of records) map.set(r.nodeId, r);
    return new CompletionStore(map);
  }
}

export class CompletionStoreError extends Error {
  fix: string;
  constructor(message: string, fix: string) {
    super(message);
    this.name = 'CompletionStoreError';
    this.fix = fix;
  }
}
