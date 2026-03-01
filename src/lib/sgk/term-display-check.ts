// @module sgk/term-display-check
// @exports checkTermDisplayRequirement, TermDisplayResult
// @entry roadmap

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TermDisplayResult {
  satisfied: boolean;
  displayReceiptId?: string;
  reason?: string;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Check that a DisplayReceipt exists for this run before term intent can be written.
 * Returns satisfied:true if at least one display receipt exists.
 */
export function checkTermDisplayRequirement(repoRoot: string, runId: string): TermDisplayResult {
  const dir = join(repoRoot, '.roadmap', 'runs', runId, 'display');
  if (!existsSync(dir)) {
    return { satisfied: false, reason: `No display directory found for run ${runId}` };
  }

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    return { satisfied: false, reason: `No display receipts found for run ${runId}` };
  }

  // Return the most recent (last alphabetically — stamps are ISO-derived)
  files.sort();
  const latest = files[files.length - 1].replace('.json', '');

  return { satisfied: true, displayReceiptId: latest };
}
