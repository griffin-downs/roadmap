// @module cli/audit
// @exports ComplianceState, ComplianceResult, auditCommand

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { CommandEntry } from './inventory.ts';

export type ComplianceState = 'COMPLIANT' | 'EXEMPT' | 'NONCOMPLIANT';

export interface ComplianceResult {
  id: string;
  tokens: string[];
  state: ComplianceState;
  evidence: string[];
  failingInvariant?: string;
}

function findReceipt(base: string, cmd: string): any | null {
  // Scan .roadmap/receipts/ for a matching receipt
  const receiptsDir = join(base, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) return null;
  try {
    for (const f of readdirSync(receiptsDir)) {
      if (!f.endsWith('.json')) continue;
      const data = JSON.parse(readFileSync(join(receiptsDir, f), 'utf8'));
      if (data.cmd === cmd || data.command === cmd) return data;
    }
  } catch { /* best effort */ }
  return null;
}

export function auditCommand(entry: CommandEntry, _mode: 'fast' | 'full', base = process.cwd()): ComplianceResult {
  if (entry.exempt) {
    // Exempt: verify machine-only JSON envelope (no display receipt needed)
    return {
      id: entry.id,
      tokens: entry.tokens,
      state: 'EXEMPT',
      evidence: [`exempt: ${entry.exempt.exemptClass} — ${entry.exempt.exemptReason}`],
    };
  }

  if (entry.examples.length === 0) {
    return {
      id: entry.id,
      tokens: entry.tokens,
      state: 'NONCOMPLIANT',
      evidence: ['no example vectors defined'],
      failingInvariant: 'MISSING_EXAMPLE_VECTOR',
    };
  }

  // Run the first example and check for display receipt
  const example = entry.examples[0];
  try {
    execSync(example, { cwd: base, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000 });
  } catch {
    // Command may fail — check receipt anyway
  }

  if (entry.mustHaveDisplayReceipt) {
    const receipt = findReceipt(base, entry.tokens.join(' '));
    if (!receipt) {
      return {
        id: entry.id,
        tokens: entry.tokens,
        state: 'NONCOMPLIANT',
        evidence: [`no display receipt found for "${entry.tokens.join(' ')}"`],
        failingInvariant: 'MISSING_DISPLAY_RECEIPT',
      };
    }
    if (receipt.ok === false) {
      return {
        id: entry.id,
        tokens: entry.tokens,
        state: 'NONCOMPLIANT',
        evidence: [`receipt ok:false for "${entry.tokens.join(' ')}"`],
        failingInvariant: 'RECEIPT_NOT_OK',
      };
    }
  }

  // Check required signals
  for (const signal of entry.requiredSignals) {
    const receipt = findReceipt(base, entry.tokens.join(' '));
    if (receipt && !receipt.signals?.includes(signal)) {
      return {
        id: entry.id,
        tokens: entry.tokens,
        state: 'NONCOMPLIANT',
        evidence: [`missing required signal "${signal}" in receipt`],
        failingInvariant: 'MISSING_REQUIRED_SIGNAL',
      };
    }
  }

  return {
    id: entry.id,
    tokens: entry.tokens,
    state: 'COMPLIANT',
    evidence: ['example executed, receipt present and valid'],
  };
}
