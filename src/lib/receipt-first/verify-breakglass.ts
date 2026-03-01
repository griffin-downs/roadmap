// @module receipt-first/verify-breakglass
// @exports BreakglassStatus, getBreakglassStatus, formatBreakglassStatus
// @types BreakglassStatus
// @entry roadmap

import { activeBreakglass } from './breakglass.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BreakglassStatus {
  active: boolean;
  id?: string;
  openedAt?: string;
  expiresAt?: string;
  remainingMs?: number;
  expired?: boolean;
  scope?: {
    commands: string[];
    invariantsBypassed: string[];
  };
  reason?: string;
  requiredFollowups?: string[];
  outstandingFollowups?: string[];
}

// ── Core ─────────────────────────────────────────────────────────────────────

/** Get current breakglass status for verify output. */
export function getBreakglassStatus(repoRoot: string): BreakglassStatus {
  const receipts = activeBreakglass(repoRoot);
  if (receipts.length === 0) return { active: false };

  // Use first active receipt (most recently opened if multiple)
  const bg = receipts[0];
  const remainingMs = new Date(bg.expiresAt).getTime() - Date.now();

  if (remainingMs < 0) {
    return { active: false, expired: true, id: bg.id };
  }

  return {
    active: true,
    id: bg.id,
    openedAt: bg.openedAt,
    expiresAt: bg.expiresAt,
    remainingMs,
    expired: false,
    scope: bg.scope,
    reason: bg.reason,
    requiredFollowups: bg.requiredFollowups,
    outstandingFollowups: bg.requiredFollowups, // completion tracking is future work
  };
}

/** Format breakglass status as human-readable string for verify output. */
export function formatBreakglassStatus(status: BreakglassStatus): string {
  if (!status.active) {
    if (status.expired) return `BREAKGLASS EXPIRED: ${status.id}`;
    return 'No active breakglass';
  }

  const lines: string[] = [];
  lines.push(`BREAKGLASS ACTIVE: ${status.id}`);

  if (status.remainingMs != null) {
    const totalSec = Math.floor(status.remainingMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    lines.push(`Expires in: ${min}m ${sec}s`);
  }

  if (status.scope) {
    lines.push(`Commands: ${status.scope.commands.join(', ')}`);
    if (status.scope.invariantsBypassed.length > 0) {
      lines.push(`Bypasses: ${status.scope.invariantsBypassed.join(', ')}`);
    }
  }

  if (status.outstandingFollowups && status.outstandingFollowups.length > 0) {
    lines.push(`Outstanding followups: ${status.outstandingFollowups.length}`);
  }

  return lines.join('\n');
}
