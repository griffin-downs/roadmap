import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkStrategyGate } from '../../src/lib/strategy/exec-gate.js';
import { writeLatch, clearLatch } from '../../src/lib/strategy/active.js';
import { selectStrategy, clearStrategy } from '../../src/lib/strategy/select.js';

describe('strategy exec gate', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'gate-'));
    mkdirSync(join(tmp, '.roadmap/strategy'), { recursive: true });
    mkdirSync(join(tmp, '.roadmap/receipts'), { recursive: true });
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('not blocked when no latch exists', () => {
    const result = checkStrategyGate(tmp);
    expect(result.blocked).toBe(false);
  });

  it('blocked when latched but no active strategy', () => {
    writeLatch(tmp, ['swarm']);
    const result = checkStrategyGate(tmp);
    expect(result.blocked).toBe(true);
    expect(result.code).toBe('STRATEGY_REQUIRED');
    expect(result.fix).toBeDefined();
    expect(result.fix!.length).toBeGreaterThan(0);
  });

  it('not blocked when latched and strategy is active', () => {
    writeLatch(tmp, ['parallel']);
    selectStrategy(tmp, 'hybrid', {
      runId: 'r1', headSha: 'a', treeSha: 'b', selectionMethod: 'manual',
    });
    const result = checkStrategyGate(tmp);
    expect(result.blocked).toBe(false);
  });

  it('blocked again after clearing strategy but keeping latch', () => {
    writeLatch(tmp, ['hallucinate']);
    selectStrategy(tmp, 'validate-as-you-go', {
      runId: 'r2', headSha: 'a', treeSha: 'b', selectionMethod: 'auto',
    });
    expect(checkStrategyGate(tmp).blocked).toBe(false);
    // Clear strategy but keep latch
    clearStrategy(tmp);
    expect(checkStrategyGate(tmp).blocked).toBe(true);
  });

  it('not blocked after clearing latch', () => {
    writeLatch(tmp, ['swarm']);
    expect(checkStrategyGate(tmp).blocked).toBe(true);
    clearLatch(tmp);
    expect(checkStrategyGate(tmp).blocked).toBe(false);
  });

  it('fix suggestions include auto, select, and propose commands', () => {
    writeLatch(tmp, ['fidelity']);
    const result = checkStrategyGate(tmp);
    expect(result.fix!.some(f => f.includes('auto'))).toBe(true);
    expect(result.fix!.some(f => f.includes('select'))).toBe(true);
    expect(result.fix!.some(f => f.includes('propose'))).toBe(true);
  });
});
