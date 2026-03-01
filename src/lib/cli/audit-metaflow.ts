// @module cli/audit-metaflow
// @exports MetaflowComplianceResult, auditMetaflowCompliance

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandEntry } from './inventory.ts';
import { ELIGIBLE_COMMANDS } from '../metaflow/self-insert.ts';

export type MetaflowState = 'COMPLIANT' | 'NONCOMPLIANT' | 'EXEMPT';

export interface MetaflowComplianceResult {
  id: string;
  tokens: string[];
  state: MetaflowState;
  selfInsert: boolean;
  header: boolean;
  evidence: string[];
}

function isEligible(tokens: string[]): boolean {
  const cmd = tokens.join(' ');
  return ELIGIBLE_COMMANDS.some(e => cmd.startsWith(e) || cmd === e);
}

function hasSelfInsertReceipt(base: string, cmd: string): boolean {
  const dir = join(base, '.roadmap', 'receipts');
  if (!existsSync(dir)) return false;
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('metaflow-self-insert-') || !f.endsWith('.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (data.cmd === cmd) return true;
    } catch { /* skip */ }
  }
  return false;
}

function hasSurfaceHeaderReceipt(base: string, cmd: string): boolean {
  const dir = join(base, '.roadmap', 'receipts');
  if (!existsSync(dir)) return false;
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('metaflow-surface-') || !f.endsWith('.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (data.cmd === cmd) return true;
    } catch { /* skip */ }
  }
  return false;
}

export function auditMetaflowCompliance(entries: CommandEntry[], base = process.cwd()): MetaflowComplianceResult[] {
  return entries.map(entry => {
    // Exempt commands skip metaflow checks
    if (entry.exempt) {
      return {
        id: entry.id,
        tokens: entry.tokens,
        state: 'EXEMPT' as MetaflowState,
        selfInsert: false,
        header: false,
        evidence: [`exempt: ${entry.exempt.exemptClass} — ${entry.exempt.exemptReason}`],
      };
    }

    // Non-eligible commands are exempt from metaflow
    if (!isEligible(entry.tokens)) {
      return {
        id: entry.id,
        tokens: entry.tokens,
        state: 'EXEMPT' as MetaflowState,
        selfInsert: false,
        header: false,
        evidence: ['not in ELIGIBLE_COMMANDS — metaflow not required'],
      };
    }

    const cmd = entry.tokens.join(' ');
    const selfInsert = hasSelfInsertReceipt(base, cmd);
    const header = hasSurfaceHeaderReceipt(base, cmd);
    const evidence: string[] = [];

    if (!selfInsert) evidence.push(`no self-insert receipt for "${cmd}"`);
    if (!header) evidence.push(`no surface header receipt for "${cmd}"`);

    if (selfInsert && header) {
      evidence.push('self-insert and surface header receipts present');
      return { id: entry.id, tokens: entry.tokens, state: 'COMPLIANT' as MetaflowState, selfInsert, header, evidence };
    }

    return { id: entry.id, tokens: entry.tokens, state: 'NONCOMPLIANT' as MetaflowState, selfInsert, header, evidence };
  });
}

export function renderMetaflowAuditTable(results: MetaflowComplianceResult[]): string {
  const lines: string[] = [];
  const border = '━'.repeat(80);
  lines.push(border);
  lines.push(
    'Command'.padEnd(20) + ' | ' +
    'Receipt'.padEnd(12) + ' | ' +
    'MetaFlow'.padEnd(12) + ' | ' +
    'Self-Insert'.padEnd(12) + ' | ' +
    'Header'
  );
  lines.push(border);
  for (const r of results) {
    const cmd = r.tokens.join(' ').padEnd(20);
    const receipt = r.state.padEnd(12);
    const mf = r.state.padEnd(12);
    const si = (r.selfInsert ? 'yes' : 'no').padEnd(12);
    const hdr = r.header ? 'yes' : 'no';
    lines.push(`${cmd} | ${receipt} | ${mf} | ${si} | ${hdr}`);
  }
  lines.push(border);
  return lines.join('\n');
}
