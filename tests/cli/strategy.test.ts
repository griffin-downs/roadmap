import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { proposeCandidates, selectStrategy, autoSelect, clearStrategy } from '../../src/lib/strategy/select.js';
import { readActiveStrategy, isLatched, writeLatch, shouldLatch, detectHint } from '../../src/lib/strategy/active.js';
import { renderCandidates, renderActive, renderReceipt } from '../../src/lib/render/strategy.js';
import { STRATEGIES } from '../../src/lib/strategy/registry.js';

describe('strategy CLI functions', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'strategy-cli-'));
    mkdirSync(join(tmp, '.roadmap/receipts'), { recursive: true });
    mkdirSync(join(tmp, '.roadmap/strategy'), { recursive: true });
  });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('proposeCandidates returns all strategies', () => {
    const candidates = proposeCandidates();
    expect(candidates).toHaveLength(3);
    expect(candidates.map(c => c.id)).toEqual([
      'hallucinate-rounds-then-validate',
      'validate-as-you-go',
      'hybrid',
    ]);
  });

  it('selectStrategy writes receipt + active', () => {
    const result = selectStrategy(tmp, 'hybrid', {
      runId: 'r1',
      headSha: 'abc123',
      treeSha: 'def456',
      selectionMethod: 'manual',
    });
    expect(result.receipt.strategyId).toBe('hybrid');
    expect(result.receipt.selectionMethod).toBe('manual');
    expect(existsSync(join(tmp, result.receiptPath))).toBe(true);
    const active = readActiveStrategy(tmp);
    expect(active!.strategyId).toBe('hybrid');
  });

  it('selectStrategy throws for unknown strategy', () => {
    expect(() => selectStrategy(tmp, 'nonexistent', {
      runId: 'r1', headSha: 'a', treeSha: 'b', selectionMethod: 'manual',
    })).toThrow('Unknown strategy: nonexistent');
  });

  it('autoSelect picks hallucinate when maxParallelism > 2', () => {
    const result = autoSelect(tmp, {
      runId: 'r2', headSha: 'abc', treeSha: 'def', maxParallelism: 4,
    });
    expect(result.receipt.strategyId).toBe('hallucinate-rounds-then-validate');
    expect(result.receipt.selectionMethod).toBe('auto');
  });

  it('autoSelect picks validate-as-you-go when maxParallelism <= 2', () => {
    const result = autoSelect(tmp, {
      runId: 'r3', headSha: 'abc', treeSha: 'def', maxParallelism: 2,
    });
    expect(result.receipt.strategyId).toBe('validate-as-you-go');
  });

  it.skip('clearStrategy removes active strategy', () => {
    selectStrategy(tmp, 'hybrid', {
      runId: 'r4', headSha: 'a', treeSha: 'b', selectionMethod: 'manual',
    });
    expect(readActiveStrategy(tmp)).toBeDefined();
    clearStrategy(tmp);
    expect(readActiveStrategy(tmp)).toBeUndefined();
  });

  it('renderCandidates produces a table with headers', () => {
    const table = renderCandidates(STRATEGIES);
    expect(table).toContain('ID');
    expect(table).toContain('Name');
    expect(table).toContain('Rounds');
    expect(table).toContain('Gate');
    expect(table).toContain('Risk');
    expect(table).toContain('hallucinate-rounds-then-validate');
    expect(table).toContain('validate-as-you-go');
    expect(table).toContain('hybrid');
  });

  it('renderActive shows strategy details', () => {
    const result = selectStrategy(tmp, 'validate-as-you-go', {
      runId: 'r5', headSha: 'x', treeSha: 'y', selectionMethod: 'ask',
    });
    const output = renderActive(result.active);
    expect(output).toContain('validate-as-you-go');
    expect(output).toContain('r5');
  });

  it('renderReceipt shows full receipt details', () => {
    const result = selectStrategy(tmp, 'hallucinate-rounds-then-validate', {
      runId: 'r6', headSha: 'h1', treeSha: 't1', selectionMethod: 'auto',
    });
    const output = renderReceipt(result.receipt);
    expect(output).toContain('hallucinate-rounds-then-validate');
    expect(output).toContain('HALLUCINATE_ROUNDS_THEN_VALIDATE');
    expect(output).toContain('terminal');
    expect(output).toContain('auto');
  });

  it('shouldLatch integration: hint detection feeds strategy requirement', () => {
    const note = 'deploying swarm for parallel execution';
    expect(shouldLatch(note)).toBe(true);
    writeLatch(tmp, detectHint(note).matchedTokens);
    expect(isLatched(tmp)).toBe(true);
    // Auto-select based on parallelism
    const result = autoSelect(tmp, {
      runId: 'r7', headSha: 'a', treeSha: 'b', maxParallelism: 5,
    });
    expect(result.receipt.strategyId).toBe('hallucinate-rounds-then-validate');
  });
});
