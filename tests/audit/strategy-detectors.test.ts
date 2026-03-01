import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectLatchWithoutStrategy,
  detectStrategyHeadShaMatch,
  detectMissingStrategyReceipt,
  detectStrategyCompliance,
} from '../../src/lib/metaflow/audit/detectors/strategy.js';

describe('strategy compliance detectors', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'strat-det-'));
    mkdirSync(join(tmp, '.roadmap/strategy'), { recursive: true });
    mkdirSync(join(tmp, '.roadmap/receipts'), { recursive: true });
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe('STRAT-001: detectLatchWithoutStrategy', () => {
    it('passes when no latch exists', () => {
      const r = detectLatchWithoutStrategy(tmp);
      expect(r.code).toBe('STRAT-001');
      expect(r.passed).toBe(true);
    });

    it('fails when latched but no strategy', () => {
      writeFileSync(join(tmp, '.roadmap/strategy/active.json'), JSON.stringify({
        latch: { latched: true, matchedTokens: ['swarm'] },
      }));
      const r = detectLatchWithoutStrategy(tmp);
      expect(r.passed).toBe(false);
      expect(r.fix.length).toBeGreaterThan(0);
    });

    it('passes when latched with active strategy', () => {
      writeFileSync(join(tmp, '.roadmap/strategy/active.json'), JSON.stringify({
        latch: { latched: true, matchedTokens: ['parallel'] },
        strategy: { strategyId: 'hybrid', runId: 'r1' },
      }));
      const r = detectLatchWithoutStrategy(tmp);
      expect(r.passed).toBe(true);
    });
  });

  describe('STRAT-002: detectStrategyHeadShaMatch', () => {
    it('passes when no receipts directory', () => {
      rmSync(join(tmp, '.roadmap/receipts'), { recursive: true });
      const r = detectStrategyHeadShaMatch(tmp);
      expect(r.code).toBe('STRAT-002');
      expect(r.passed).toBe(true);
    });

    it('passes when no strategy receipts exist', () => {
      const r = detectStrategyHeadShaMatch(tmp);
      expect(r.passed).toBe(true);
    });
  });

  describe('STRAT-003: detectMissingStrategyReceipt', () => {
    it('passes when no dispatch/complete receipts', () => {
      const r = detectMissingStrategyReceipt(tmp);
      expect(r.code).toBe('STRAT-003');
      expect(r.passed).toBe(true);
    });

    it('fails when dispatch receipt exists without strategy receipt', () => {
      writeFileSync(join(tmp, '.roadmap/receipts/dispatch-abc.json'), '{}');
      const r = detectMissingStrategyReceipt(tmp);
      expect(r.passed).toBe(false);
      expect(r.fix.length).toBeGreaterThan(0);
    });

    it('passes when both dispatch and strategy receipts exist', () => {
      writeFileSync(join(tmp, '.roadmap/receipts/dispatch-abc.json'), '{}');
      writeFileSync(join(tmp, '.roadmap/receipts/strategy-select-2026.json'), '{}');
      const r = detectMissingStrategyReceipt(tmp);
      expect(r.passed).toBe(true);
    });
  });

  describe('detectStrategyCompliance', () => {
    it('returns all 3 detector results', () => {
      const results = detectStrategyCompliance(tmp);
      expect(results).toHaveLength(3);
      expect(results.map(r => r.code)).toEqual(['STRAT-001', 'STRAT-002', 'STRAT-003']);
    });
  });
});
