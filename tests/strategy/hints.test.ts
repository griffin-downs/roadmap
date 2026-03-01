import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectHint, shouldLatch, HINT_TOKENS, writeLatch, readActiveLatch, isLatched, clearLatch, writeActiveStrategy, readActiveStrategy } from '../../src/lib/strategy/active.js';

describe('hint detection', () => {
  it('detects hallucinate token in text', () => {
    const r = detectHint('using our hallucinate approach');
    expect(r.latched).toBe(true);
    expect(r.matchedTokens).toContain('hallucinate');
  });

  it('returns latched:false for normal text', () => {
    const r = detectHint('normal work on the project');
    expect(r.latched).toBe(false);
    expect(r.matchedTokens).toEqual([]);
  });

  it('shouldLatch matches on any token', () => {
    for (const token of HINT_TOKENS) {
      expect(shouldLatch(`doing ${token} things`)).toBe(true);
    }
  });

  it('is case-insensitive', () => {
    expect(detectHint('SWARM mode activated').latched).toBe(true);
  });

  it('detects multiple tokens', () => {
    const r = detectHint('parallel swarm with lookahead');
    expect(r.matchedTokens).toContain('parallel');
    expect(r.matchedTokens).toContain('swarm');
    expect(r.matchedTokens).toContain('lookahead');
  });
});

describe('latch persistence', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'latch-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('writeLatch/isLatched/clearLatch round-trip', () => {
    expect(isLatched(tmp)).toBe(false);
    writeLatch(tmp, ['hallucinate']);
    expect(isLatched(tmp)).toBe(true);
    const latch = readActiveLatch(tmp);
    expect(latch!.matchedTokens).toEqual(['hallucinate']);
    clearLatch(tmp);
    expect(isLatched(tmp)).toBe(false);
  });

  it.skip('writeActiveStrategy/readActiveStrategy round-trip', () => {
    expect(readActiveStrategy(tmp)).toBeUndefined();
    const strat = {
      schema_version: 1 as const,
      strategyId: 'hybrid',
      runId: 'r1',
      latchedAt: '2026-01-01T00:00:00Z',
      boundAt: '2026-01-01T00:01:00Z',
      receiptPath: '.roadmap/receipts/r1.json',
    };
    writeActiveStrategy(tmp, strat);
    expect(readActiveStrategy(tmp)).toEqual(strat);
  });

  it.skip('latch and strategy coexist in active.json', () => {
    writeLatch(tmp, ['swarm']);
    const strat = {
      schema_version: 1 as const,
      strategyId: 'validate-as-you-go',
      runId: 'r2',
      latchedAt: '2026-01-01T00:00:00Z',
      boundAt: '2026-01-01T00:01:00Z',
      receiptPath: '.roadmap/receipts/r2.json',
    };
    writeActiveStrategy(tmp, strat);
    expect(isLatched(tmp)).toBe(true);
    expect(readActiveStrategy(tmp)).toEqual(strat);
  });
});
