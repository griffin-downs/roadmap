// @module governance-breach
// @exports detectGovernanceBreach, emitGovernanceBreachReceipt, GovernanceBreachDetector
// @entry roadmap

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { GovernanceBreach, GovernanceBreachReceipt, EscapeEvent } from './escape-detector.ts';
import { GOVERNANCE_BREACH_PREFIX } from './escape-detector.ts';
import { checkKernelEnforcement } from './kernel-enforcement.ts';
import { isPendingCertify } from './intake/auto-intake.ts';
import { AUDIT_DIR, ROADMAP_CLI_COMMANDS, isTranscriptSession } from './metaloop/transcript-schema.ts';

/**
 * Check three breach conditions:
 * 1. UNACCOUNTED_COMMIT — recent commits not referenced in any receipt
 * 2. PENDING_CERTIFY — auto-intake awaiting certification
 * 3. OUT_OF_BOUNDS_TOOL — orphaned attempts from audit session files
 */
export function detectGovernanceBreach(repoRoot: string): GovernanceBreach | null {
  const enforcement = checkKernelEnforcement(repoRoot);
  if (!enforcement.escapeDetectionEnabled) return null;

  const events: EscapeEvent[] = [];
  const now = new Date().toISOString();

  // 1. UNACCOUNTED_COMMIT — recent commits missing from receipts
  const unaccountedShas = findUnaccountedCommits(repoRoot);
  for (const sha of unaccountedShas) {
    events.push({
      eventType: 'UNACCOUNTED_COMMIT',
      sha,
      missingReceiptTypes: ['plan-select', 'dispatch'],
      timestamp: now,
      detail: `commit ${sha.slice(0, 7)} not referenced by any receipt`,
    });
  }

  // 2. PENDING_CERTIFY
  if (isPendingCertify(repoRoot)) {
    events.push({
      eventType: 'UNACCOUNTED_COMMIT',
      missingReceiptTypes: ['intake'],
      timestamp: now,
      detail: 'intake certify required',
    });
  }

  // 3. OUT_OF_BOUNDS_TOOL — orphaned attempts from audit sessions
  const auditDir = join(repoRoot, AUDIT_DIR);
  if (existsSync(auditDir)) {
    for (const file of readdirSync(auditDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(readFileSync(join(auditDir, file), 'utf-8'));
        if (!isTranscriptSession(raw)) continue;
        for (const attempt of raw.orphanedAttempts) {
          events.push({
            eventType: 'OUT_OF_BOUNDS_TOOL',
            tool: attempt.command,
            missingReceiptTypes: [],
            timestamp: attempt.timestamp,
            detail: attempt.command,
          });
        }
      } catch {
        // skip unreadable/invalid files
      }
    }
  }

  if (events.length === 0) return null;

  const breachId = createHash('sha256')
    .update(events.map(e => e.eventType + (e.sha ?? '')).join(':'))
    .digest('hex');

  const mostRecentSha = unaccountedShas[0] ?? '';

  return {
    breachId,
    sha: mostRecentSha,
    events,
    timestamp: now,
    resolved: false,
  };
}

/** Emit a GovernanceBreachReceipt JSON to the receipts directory. */
export function emitGovernanceBreachReceipt(
  breach: GovernanceBreach,
  receiptsDir: string,
): string {
  const receipt: GovernanceBreachReceipt = {
    schemaVersion: 1,
    receiptType: 'governance-breach',
    breachId: breach.breachId,
    sha: breach.sha,
    eventTypes: [...new Set(breach.events.map(e => e.eventType))],
    missingReceiptTypes: [...new Set(breach.events.flatMap(e => e.missingReceiptTypes))],
    timestamp: breach.timestamp,
    resolved: breach.resolved,
  };

  const shortSha = breach.sha.slice(0, 6) || breach.breachId.slice(0, 6);
  const filePath = join(receiptsDir, `${GOVERNANCE_BREACH_PREFIX}-${shortSha}.json`);
  writeFileSync(filePath, JSON.stringify(receipt, null, 2) + '\n');
  return filePath;
}

export const GovernanceBreachDetector = {
  detect: detectGovernanceBreach,
  emit: emitGovernanceBreachReceipt,
  hasActiveBreach: (repoRoot: string): boolean => detectGovernanceBreach(repoRoot) !== null,
} as const;

// --- internal ---

function findUnaccountedCommits(repoRoot: string): string[] {
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
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  const referencedShas = new Set<string>();

  if (existsSync(receiptsDir)) {
    for (const file of readdirSync(receiptsDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = readFileSync(join(receiptsDir, file), 'utf-8');
        for (const sha of shas) {
          if (content.includes(sha)) referencedShas.add(sha);
        }
      } catch {
        // skip
      }
    }
  }

  // Also check completed.json
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
