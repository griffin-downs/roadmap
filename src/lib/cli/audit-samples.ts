// @module cli/audit-samples
// @exports FAST_SAMPLE, runComplianceAudit

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandEntry } from './inventory.ts';
import { auditCommand, type ComplianceResult } from './audit.ts';

export const FAST_SAMPLE = ['orient', 'chart', 'mf-audit', 'mf-gantt', 'mf-mine', 'mf-wrap', 'receipts'];

export function runComplianceAudit(mode: 'fast' | 'full', base = process.cwd()): ComplianceResult[] {
  const commandsPath = join(base, '.roadmap', 'cli', 'commands.json');
  if (!existsSync(commandsPath)) {
    return [{ id: '_missing', tokens: [], state: 'NONCOMPLIANT', evidence: ['commands.json not found — run: roadmap cli inventory --write'] }];
  }

  const entries: CommandEntry[] = JSON.parse(readFileSync(commandsPath, 'utf8'));
  const filtered = mode === 'fast'
    ? entries.filter(e => FAST_SAMPLE.includes(e.id))
    : entries;

  return filtered.map(entry => auditCommand(entry, mode, base));
}
