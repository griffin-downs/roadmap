import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CLI_COMPLIANCE, CLI_COMPLIANCE_FULL } from '../../src/lib/verify/invariants/cli-compliance.ts';
import { DEFAULT_INVARIANTS, KERNEL_INVARIANTS } from '../../src/lib/verify/kernel-config.ts';
import type { CommandEntry } from '../../src/lib/cli/inventory.ts';

function makeBase(entries: CommandEntry[]): string {
  const base = mkdtempSync(join(tmpdir(), 'verify-cli-'));
  mkdirSync(join(base, '.roadmap', 'cli'), { recursive: true });
  mkdirSync(join(base, '.roadmap', 'receipts'), { recursive: true });
  writeFileSync(join(base, '.roadmap', 'cli', 'commands.json'), JSON.stringify(entries));
  return base;
}

const compliantEntry: CommandEntry = {
  id: 'test-ok', tokens: ['test-ok'], description: 'test', flags: [],
  mustHaveDisplayReceipt: false, requiredSignals: [], examples: ['echo ok'],
};

const exemptEntry: CommandEntry = {
  id: 'test-exempt', tokens: ['test-exempt'], description: 'exempt test', flags: [],
  mustHaveDisplayReceipt: false, exempt: { exemptClass: 'plumbing', exemptReason: 'test' },
  requiredSignals: [], examples: [],
};

const failEntry: CommandEntry = {
  id: 'orient', tokens: ['orient'], description: 'fail test', flags: [],
  mustHaveDisplayReceipt: true, requiredSignals: [], examples: ['echo fail'],
};

describe('CLI_COMPLIANCE invariant', () => {
  it('passes on all-compliant audit', () => {
    const base = makeBase([compliantEntry, exemptEntry]);
    try {
      const result = CLI_COMPLIANCE(base);
      expect(result.passed).toBe(true);
      expect(result.code).toBe('CLI_COMPLIANCE');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('fails on one NONCOMPLIANT command', () => {
    const base = makeBase([failEntry]);
    try {
      const result = CLI_COMPLIANCE(base);
      expect(result.passed).toBe(false);
      expect(result.evidence.length).toBeGreaterThan(0);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('kernel config includes CLI_COMPLIANCE', () => {
    expect(DEFAULT_INVARIANTS).toContain('CLI_COMPLIANCE');
    expect(KERNEL_INVARIANTS).toContain('CLI_COMPLIANCE');
    expect(KERNEL_INVARIANTS).toContain('CLI_COMPLIANCE_FULL');
  });

  it('fast mode called by default', () => {
    const base = makeBase([compliantEntry]);
    try {
      const result = CLI_COMPLIANCE(base);
      expect(result.code).toBe('CLI_COMPLIANCE');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('full mode via CLI_COMPLIANCE_FULL', () => {
    const base = makeBase([compliantEntry, exemptEntry]);
    try {
      const result = CLI_COMPLIANCE_FULL(base);
      expect(result.code).toBe('CLI_COMPLIANCE_FULL');
      expect(result.passed).toBe(true);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('invariant result has code + evidence + fix[]', () => {
    const base = makeBase([failEntry]);
    try {
      const result = CLI_COMPLIANCE(base);
      expect(typeof result.code).toBe('string');
      expect(Array.isArray(result.evidence)).toBe(true);
      expect(Array.isArray(result.fix)).toBe(true);
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});
