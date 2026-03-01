import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeActiveRun, readActiveRun, clearActiveRun, type ActiveRun } from '../../src/lib/metaflow/state/active-run.ts';

function makeRun(runId = 'run-1'): ActiveRun {
  return {
    schema_version: 1,
    runId: runId as any,
    stage: 'dispatch',
    startedAt: new Date().toISOString(),
    sessionIds: ['sess-1'],
  };
}

describe('active-run', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'active-run-'));
    mkdirSync(join(tmp, '.roadmap/metaflow'), { recursive: true });
    mkdirSync(join(tmp, '.roadmap/receipts'), { recursive: true });
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('writeActiveRun creates file', () => {
    writeActiveRun(makeRun(), tmp);
    expect(existsSync(join(tmp, '.roadmap/metaflow/active-run.json'))).toBe(true);
  });

  it('readActiveRun returns null if absent', () => {
    expect(readActiveRun(tmp)).toBeNull();
  });

  it('readActiveRun returns written data', () => {
    const run = makeRun('run-abc');
    writeActiveRun(run, tmp);
    const result = readActiveRun(tmp);
    expect(result).not.toBeNull();
    expect(result!.runId).toBe('run-abc');
    expect(result!.stage).toBe('dispatch');
  });

  it('clearActiveRun succeeds when mining+audit exist', () => {
    writeActiveRun(makeRun('run-clear'), tmp);
    // Create mining.json
    const runDir = join(tmp, '.roadmap/metaflow/runs/run-clear');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'mining.json'), '{}');
    // Create audit receipt
    writeFileSync(join(tmp, '.roadmap/receipts/audit-run-clear.json'), '{}');

    clearActiveRun(tmp, { requireMiningExists: true, requireAuditReceipt: true });
    expect(readActiveRun(tmp)).toBeNull();
  });

  it('clearActiveRun fails without mining', () => {
    writeActiveRun(makeRun('run-no-mine'), tmp);
    expect(() => clearActiveRun(tmp, { requireMiningExists: true }))
      .toThrow('ACTIVE_RUN_NOT_CLEARABLE');
  });

  it('clearActiveRun fails without audit receipt', () => {
    writeActiveRun(makeRun('run-no-audit'), tmp);
    // No audit receipt files
    expect(() => clearActiveRun(tmp, { requireAuditReceipt: true }))
      .toThrow('ACTIVE_RUN_NOT_CLEARABLE');
  });
});
