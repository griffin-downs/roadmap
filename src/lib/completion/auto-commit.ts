// @module completion/auto-commit
// @exports isCompletionDirty, autoCommitCompletion

import { execSync } from 'node:child_process';
import type { AuditReceipt } from '../metaflow/audit/required-schema.ts';

export function isCompletionDirty(repoRoot: string): boolean {
  try {
    const out = execSync('git status --porcelain .roadmap/completed.json .roadmap/receipts/', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.trim().length > 0;
  } catch {
    return false;
  }
}

export interface AutoCommitResult {
  committed: boolean;
  reason?: string;
  receipt?: AuditReceipt;
}

export function autoCommitCompletion(nodeId: string, repoRoot: string): AutoCommitResult {
  if (!isCompletionDirty(repoRoot)) {
    return { committed: false, reason: 'nothing-dirty' };
  }

  try {
    execSync('git add .roadmap/completed.json .roadmap/receipts/', {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    execSync(`git commit --no-verify -m "roadmap: auto-commit completion state — ${nodeId}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { committed: true };
  } catch {
    const receipt: AuditReceipt = {
      schema_version: 1,
      runId: `autocommit-${nodeId}`,
      treeSha: 'unknown',
      sessionIds: [],
      passed: false,
      reason: 'completion-autocommit-failed',
      reportPath: '',
      emittedAt: new Date().toISOString(),
    };
    return { committed: false, receipt };
  }
}
