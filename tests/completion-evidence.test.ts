import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  hasPassingReceipt,
  saveCompletionWithEvidence,
  loadCompletionsWithEvidence,
  type CompletionRecordWithEvidence,
} from '../src/lib/completion-evidence.ts';

describe('completion-evidence', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'ce-test-')); mkdirSync(join(tmp, '.roadmap')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe('hasPassingReceipt', () => {
    it('returns false for undefined record', () => {
      expect(hasPassingReceipt(undefined)).toBe(false);
    });

    it('returns true for legacy record with completedAt but no checks (pre-evidence format)', () => {
      const r: CompletionRecordWithEvidence = { nodeId: 'a', completedAt: '2026-01-01T00:00:00Z' };
      expect(hasPassingReceipt(r)).toBe(true);
    });

    it('returns true for legacy record with completedAt but empty checks array', () => {
      const r: CompletionRecordWithEvidence = { nodeId: 'a', completedAt: '2026-01-01T00:00:00Z', validationChecks: [] };
      expect(hasPassingReceipt(r)).toBe(true);
    });

    it('returns false when any check failed', () => {
      const r: CompletionRecordWithEvidence = {
        nodeId: 'a', completedAt: '2026-01-01T00:00:00Z',
        validationChecks: [
          { rule: 'tsc', passed: true, evidence: 'clean' },
          { rule: 'test', passed: false, evidence: '1 failure' },
        ],
      };
      expect(hasPassingReceipt(r)).toBe(false);
    });

    it('returns true when all checks passed', () => {
      const r: CompletionRecordWithEvidence = {
        nodeId: 'a', completedAt: '2026-01-01T00:00:00Z',
        validationChecks: [
          { rule: 'tsc', passed: true, evidence: 'clean' },
          { rule: 'test', passed: true, evidence: '5 tests pass' },
        ],
      };
      expect(hasPassingReceipt(r)).toBe(true);
    });

    it('returns true for legacy-flagged record with completedAt but no checks', () => {
      const r: CompletionRecordWithEvidence = {
        nodeId: 'a', completedAt: '2026-01-01T00:00:00Z', legacy: true,
      };
      expect(hasPassingReceipt(r)).toBe(true);
    });
  });

  describe('saveCompletionWithEvidence + loadCompletionsWithEvidence', () => {
    it('round-trips completion with evidence', () => {
      const checks = [
        { rule: 'artifact-exists', passed: true, evidence: 'src/foo.ts exists' },
        { rule: 'tsc', passed: true, evidence: 'clean' },
      ];
      saveCompletionWithEvidence(tmp, 'node-a', checks, 'agent-1', 'cp-001');
      const loaded = loadCompletionsWithEvidence(tmp);

      expect(loaded.has('node-a')).toBe(true);
      const record = loaded.get('node-a')!;
      expect(record.owner).toBe('agent-1');
      expect(record.checkpointId).toBe('cp-001');
      expect(record.validationChecks).toHaveLength(2);
      expect(record.validationChecks![0].rule).toBe('artifact-exists');
      expect(record.validationChecks![1].passed).toBe(true);
      expect(hasPassingReceipt(record)).toBe(true);
    });

    it('preserves existing records when adding new ones', () => {
      saveCompletionWithEvidence(tmp, 'a', [{ rule: 'r1', passed: true, evidence: 'ok' }]);
      saveCompletionWithEvidence(tmp, 'b', [{ rule: 'r2', passed: true, evidence: 'ok' }]);
      const loaded = loadCompletionsWithEvidence(tmp);
      expect(loaded.size).toBe(2);
      expect(loaded.has('a')).toBe(true);
      expect(loaded.has('b')).toBe(true);
    });

    it('failed check produces non-passing receipt', () => {
      saveCompletionWithEvidence(tmp, 'c', [{ rule: 'test', passed: false, evidence: 'FAIL' }]);
      const loaded = loadCompletionsWithEvidence(tmp);
      expect(hasPassingReceipt(loaded.get('c'))).toBe(false);
    });
  });
});
