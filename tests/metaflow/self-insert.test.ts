import { describe, it, expect } from 'vitest';
import { ELIGIBLE_COMMANDS, readActiveRun, isEligible } from '../../src/lib/metaflow/self-insert.ts';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('self-insert', () => {
  it('ELIGIBLE_COMMANDS contains expected commands', () => {
    expect(ELIGIBLE_COMMANDS).toContain('orient');
    expect(ELIGIBLE_COMMANDS).toContain('complete');
    expect(ELIGIBLE_COMMANDS).toContain('chart');
    expect(ELIGIBLE_COMMANDS).toContain('import');
  });

  it('isEligible returns true for eligible commands', () => {
    expect(isEligible(['orient', '--note', 'test'])).toBe(true);
    expect(isEligible(['complete', 'node-a'])).toBe(true);
    expect(isEligible(['mf', 'audit', '--run', 'x'])).toBe(true);
  });

  it('isEligible returns false for non-eligible commands', () => {
    expect(isEligible(['help'])).toBe(false);
    expect(isEligible(['trail'])).toBe(false);
    expect(isEligible(['show', 'node-a'])).toBe(false);
  });

  it('readActiveRun returns null when file missing', () => {
    const base = mkdtempSync(join(tmpdir(), 'si-test-'));
    try {
      expect(readActiveRun(base)).toBeNull();
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('readActiveRun reads valid active-run.json', () => {
    const base = mkdtempSync(join(tmpdir(), 'si-test-'));
    const dir = join(base, '.roadmap', 'metaflow');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'active-run.json'), JSON.stringify({
      runId: 'run-1',
      startedAt: '2026-01-01T00:00:00Z',
      headSha: 'abc123',
    }));
    try {
      const run = readActiveRun(base);
      expect(run).not.toBeNull();
      expect(run!.runId).toBe('run-1');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });

  it('ELIGIBLE_COMMANDS has mf subcommands', () => {
    const mfCmds = ELIGIBLE_COMMANDS.filter(c => c.startsWith('mf'));
    expect(mfCmds.length).toBeGreaterThan(0);
  });
});
