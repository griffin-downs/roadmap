import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditCommand, type ComplianceResult } from '../../src/lib/cli/audit.ts';
import { runComplianceAudit, FAST_SAMPLE } from '../../src/lib/cli/audit-samples.ts';
import type { CommandEntry } from '../../src/lib/cli/inventory.ts';

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'audit-e2e-'));
  mkdirSync(join(base, '.roadmap', 'receipts'), { recursive: true });
  mkdirSync(join(base, '.roadmap', 'cli'), { recursive: true });
  return base;
}

function makeEntry(overrides: Partial<CommandEntry> = {}): CommandEntry {
  return {
    id: 'test-cmd',
    tokens: ['test-cmd'],
    description: 'test',
    flags: [],
    mustHaveDisplayReceipt: true,
    requiredSignals: [],
    examples: ['echo "ok"'],
    ...overrides,
  };
}

describe('audit CLI', () => {
  let base: string;
  beforeEach(() => { base = makeBase(); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('auditCommand COMPLIANT on well-formed receipt', () => {
    const entry = makeEntry({ tokens: ['test-cmd'], mustHaveDisplayReceipt: true });
    writeFileSync(join(base, '.roadmap', 'receipts', 'test.json'), JSON.stringify({ cmd: 'test-cmd', ok: true }));
    const result = auditCommand(entry, 'fast', base);
    expect(result.state).toBe('COMPLIANT');
  });

  it('auditCommand NONCOMPLIANT on missing receipt', () => {
    const entry = makeEntry({ tokens: ['missing-cmd'], mustHaveDisplayReceipt: true });
    const result = auditCommand(entry, 'fast', base);
    expect(result.state).toBe('NONCOMPLIANT');
    expect(result.failingInvariant).toBe('MISSING_DISPLAY_RECEIPT');
  });

  it('auditCommand EXEMPT on exempt entry', () => {
    const entry = makeEntry({
      exempt: { exemptClass: 'plumbing', exemptReason: 'internal' },
      examples: [],
    });
    const result = auditCommand(entry, 'fast', base);
    expect(result.state).toBe('EXEMPT');
  });

  it('fast mode runs only sample subset', () => {
    const entries: CommandEntry[] = [
      makeEntry({ id: 'orient', tokens: ['orient'], mustHaveDisplayReceipt: false }),
      makeEntry({ id: 'chart', tokens: ['chart'], mustHaveDisplayReceipt: false }),
      makeEntry({ id: 'non-sample', tokens: ['non-sample'], mustHaveDisplayReceipt: false }),
    ];
    writeFileSync(join(base, '.roadmap', 'cli', 'commands.json'), JSON.stringify(entries));
    const results = runComplianceAudit('fast', base);
    // Only orient and chart are in FAST_SAMPLE
    const ids = results.map(r => r.id);
    expect(ids).toContain('orient');
    expect(ids).toContain('chart');
    expect(ids).not.toContain('non-sample');
  });

  it('full mode runs all entries', () => {
    const entries: CommandEntry[] = [
      makeEntry({ id: 'orient', tokens: ['orient'], mustHaveDisplayReceipt: false }),
      makeEntry({ id: 'non-sample', tokens: ['non-sample'], mustHaveDisplayReceipt: false }),
    ];
    writeFileSync(join(base, '.roadmap', 'cli', 'commands.json'), JSON.stringify(entries));
    const results = runComplianceAudit('full', base);
    expect(results.map(r => r.id)).toContain('non-sample');
  });

  it('compliance report has schema structure', () => {
    const entries: CommandEntry[] = [makeEntry({ id: 'orient', tokens: ['orient'], mustHaveDisplayReceipt: false })];
    writeFileSync(join(base, '.roadmap', 'cli', 'commands.json'), JSON.stringify(entries));
    const results = runComplianceAudit('fast', base);
    expect(Array.isArray(results)).toBe(true);
    for (const r of results) {
      expect(['COMPLIANT', 'EXEMPT', 'NONCOMPLIANT']).toContain(r.state);
      expect(Array.isArray(r.evidence)).toBe(true);
    }
  });
});
