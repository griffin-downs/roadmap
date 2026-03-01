// @module auto-intake
// @exports detectUnaccountedCommits, triggerAutoIntake, certifyAutoIntake, isPendingCertify, AutoIntakeResult
// @types AutoIntakeResult
// @entry roadmap

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { runIntakeAbsorb } from './intake-cmd.ts';

const PENDING_CERTIFY_PATH = '.roadmap/pending-certify.json';

/**
 * Find recent commits not referenced by any receipt in .roadmap/receipts/.
 * Returns array of SHAs with no matching receipt.
 */
export function detectUnaccountedCommits(repoRoot: string): string[] {
  let logOutput: string;
  try {
    logOutput = execFileSync('git', ['log', '--format=%H', '-20'], {
      cwd: repoRoot, encoding: 'utf-8',
    }).trim();
  } catch {
    return [];
  }
  if (!logOutput) return [];

  const shas = logOutput.split('\n').filter(Boolean);

  // Build set of SHAs referenced in any receipt
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  const referencedShas = new Set<string>();

  if (existsSync(receiptsDir)) {
    for (const file of readdirSync(receiptsDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = readFileSync(join(receiptsDir, file), 'utf-8');
        // Fast path: check if any sha appears in the raw string before parsing
        const matchingShas = shas.filter(sha => content.includes(sha));
        for (const sha of matchingShas) referencedShas.add(sha);
      } catch {
        // skip unreadable files
      }
    }
  }

  // Also check completed.json for gitSha references
  const completedPath = join(repoRoot, '.roadmap', 'completed.json');
  if (existsSync(completedPath)) {
    try {
      const content = readFileSync(completedPath, 'utf-8');
      for (const sha of shas) {
        if (content.includes(sha)) referencedShas.add(sha);
      }
    } catch { /* skip */ }
  }

  return shas.filter(sha => !referencedShas.has(sha));
}

export interface AutoIntakeResult {
  triggered: boolean;
  pendingCertify: boolean;
  intakeId?: string;
}

/**
 * Trigger auto-intake for unaccounted commits.
 * Calls runIntakeAbsorb from intake-cmd.ts and writes pending-certify.json.
 */
export function triggerAutoIntake(repoRoot: string, unaccountedShas: string[]): AutoIntakeResult {
  if (unaccountedShas.length === 0) {
    return { triggered: false, pendingCertify: false };
  }

  // oldest = last in array (git log returns newest first), newest = first
  const newest = unaccountedShas[0];
  const oldest = unaccountedShas[unaccountedShas.length - 1];

  const record = runIntakeAbsorb({
    fromSha: oldest,
    toSha: newest,
    repoRoot,
  });

  // Write pending-certify marker
  const pendingPath = join(repoRoot, PENDING_CERTIFY_PATH);
  writeFileSync(pendingPath, JSON.stringify({
    pendingAt: new Date().toISOString(),
    intakeId: record.intakeId,
    unaccountedShas,
  }, null, 2) + '\n');

  return {
    triggered: true,
    pendingCertify: true,
    intakeId: record.intakeId,
  };
}

/**
 * Clear pending-certify.json after reviewing auto-intake results.
 * Throws if no pending certify exists.
 */
export function certifyAutoIntake(repoRoot: string): void {
  const pendingPath = join(repoRoot, PENDING_CERTIFY_PATH);
  if (!existsSync(pendingPath)) {
    throw new Error('No pending auto-intake to certify (.roadmap/pending-certify.json does not exist)');
  }
  unlinkSync(pendingPath);
}

/** Check whether an auto-intake is pending certification. */
export function isPendingCertify(repoRoot: string): boolean {
  return existsSync(join(repoRoot, PENDING_CERTIFY_PATH));
}
