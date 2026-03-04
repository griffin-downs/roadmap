// @module completion-evidence
// @description Receipt-based completion evidence — extends CompletionRecord with validator proof
// @exports EvidenceRecord, CompletionRecordWithEvidence, hasPassingReceipt, saveCompletionWithEvidence, loadCompletionsWithEvidence, validateEntry, migrateEntry

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { ValidatorResult } from '../completion/completion-store.ts';

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

// Type guard: validates that an entry conforms to CompletionRecordWithEvidence
export function validateEntry(entry: unknown): entry is CompletionRecordWithEvidence {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return typeof e.nodeId === 'string' && typeof e.completedAt === 'string';
}

// Migrate legacy entries to new schema
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

// Receipt is passing when:
//   - record exists with validationChecks and all passed, OR
//   - record exists with completedAt but no validationChecks (pre-evidence legacy format)
// A record with checks where any check failed is NOT passing.
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
  writeFileSync(join(dirPath, 'completed.json'), JSON.stringify(recordArray, null, 2) + '\n');
}
