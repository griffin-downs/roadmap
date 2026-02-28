import { describe, it, expect } from 'vitest';
import { hasPassingReceipt } from '../src/lib/completion-evidence.ts';
import type { CompletionRecordWithEvidence } from '../src/lib/completion-evidence.ts';

describe('FR-GOV-003: orient receipt hardening', () => {
  it('hasPassingReceipt returns true for all-passing checks', () => {
    const record: CompletionRecordWithEvidence = {
      nodeId: 'test-node',
      completedAt: new Date().toISOString(),
      validationChecks: [
        { rule: 'artifact-exists', passed: true, evidence: 'file exists' },
        { rule: 'shell', passed: true, evidence: 'exit 0' },
      ],
    };
    expect(hasPassingReceipt(record)).toBe(true);
  });

  it('hasPassingReceipt returns false for quarantined receipt (--skip-validate)', () => {
    const record: CompletionRecordWithEvidence = {
      nodeId: 'test-node',
      completedAt: new Date().toISOString(),
      validationChecks: [
        { rule: 'skip-validate', passed: false, evidence: 'validation skipped by --skip-validate flag' },
      ],
    };
    expect(hasPassingReceipt(record)).toBe(false);
  });

  it('hasPassingReceipt returns false for mixed pass/fail', () => {
    const record: CompletionRecordWithEvidence = {
      nodeId: 'test-node',
      completedAt: new Date().toISOString(),
      validationChecks: [
        { rule: 'artifact-exists', passed: true, evidence: 'file exists' },
        { rule: 'shell', passed: false, evidence: 'exit 1' },
      ],
    };
    expect(hasPassingReceipt(record)).toBe(false);
  });

  it('hasPassingReceipt returns false for undefined record', () => {
    expect(hasPassingReceipt(undefined)).toBe(false);
  });

  it('hasPassingReceipt returns true for legacy record with completedAt but empty checks', () => {
    const record: CompletionRecordWithEvidence = {
      nodeId: 'test-node',
      completedAt: new Date().toISOString(),
      validationChecks: [],
    };
    expect(hasPassingReceipt(record)).toBe(true);
  });

  it('hasPassingReceipt returns true for legacy record with completedAt but no checks field', () => {
    const record: CompletionRecordWithEvidence = {
      nodeId: 'test-node',
      completedAt: new Date().toISOString(),
    };
    expect(hasPassingReceipt(record)).toBe(true);
  });

  // FR-GOV-009 + legacy compat: receipt-only truth, but pre-evidence records
  // (completedAt set, no validationChecks) are treated as legacy-passing.
  // Failed checks still block advancement.

  it('legacy records (completedAt, no checks) advance position; quarantined do not', () => {
    const legacy: CompletionRecordWithEvidence = {
      nodeId: 'legacy-node',
      completedAt: '2026-01-01T00:00:00Z',
    };
    const quarantined: CompletionRecordWithEvidence = {
      nodeId: 'quarantined-node',
      completedAt: '2026-02-28T00:00:00Z',
      validationChecks: [
        { rule: 'skip-validate', passed: false, evidence: 'skipped' },
      ],
    };

    expect(hasPassingReceipt(legacy)).toBe(true);
    expect(hasPassingReceipt(quarantined)).toBe(false);
  });
});
