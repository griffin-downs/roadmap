// @module completion-evidence
// @description Receipt-based completion evidence — extends CompletionRecord with validator proof
// @exports EvidenceRecord, CompletionRecordWithEvidence, hasPassingReceipt, saveCompletionWithEvidence, loadCompletionsWithEvidence

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

export interface EvidenceRecord {
  rule: string;
  passed: boolean;
  evidence: string;
}

export interface CompletionRecordWithEvidence {
  nodeId: string;
  completedAt: string;
  owner?: string;
  checkpointId?: string;
  legacy?: boolean;
  validationChecks?: EvidenceRecord[];
  gitSha?: string;
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
      for (const record of data) records.set(record.nodeId, record);
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
): void {
  const dirPath = join(repoRoot, '.roadmap');
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true });

  let gitSha: string | undefined;
  try {
    gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    // Not a git repo or git not available
  }

  const completions = loadCompletionsWithEvidence(repoRoot);
  completions.set(nodeId, {
    nodeId,
    completedAt: new Date().toISOString(),
    owner,
    checkpointId,
    validationChecks: checks,
    ...(gitSha ? { gitSha } : {}),
  });

  const recordArray = Array.from(completions.values());
  writeFileSync(join(dirPath, 'completed.json'), JSON.stringify(recordArray, null, 2) + '\n');
}
