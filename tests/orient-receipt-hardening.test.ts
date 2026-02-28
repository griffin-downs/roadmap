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

  it('hasPassingReceipt returns false for empty checks array', () => {
    const record: CompletionRecordWithEvidence = {
      nodeId: 'test-node',
      completedAt: new Date().toISOString(),
      validationChecks: [],
    };
    expect(hasPassingReceipt(record)).toBe(false);
  });

  it('hasPassingReceipt returns false for missing checks field', () => {
    const record: CompletionRecordWithEvidence = {
      nodeId: 'test-node',
      completedAt: new Date().toISOString(),
    };
    expect(hasPassingReceipt(record)).toBe(false);
  });

  // FR-GOV-003 behavioral contract: quarantined completions must NOT advance orient position.
  // This is enforced in getCompletionState() in bin/roadmap.ts:
  //   - passing receipt → included in completedIds → advances position
  //   - legacy (no checks) → included → backwards compatible
  //   - quarantined (has failed checks) → EXCLUDED → does not advance

  it('legacy records (no validationChecks) are distinct from quarantined', () => {
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

    // Both return false from hasPassingReceipt
    expect(hasPassingReceipt(legacy)).toBe(false);
    expect(hasPassingReceipt(quarantined)).toBe(false);

    // But getCompletionState treats them differently:
    // legacy → accepted (no checks = pre-receipt era)
    // quarantined → excluded (explicit failure)
    // This distinction is tested via the CLI orient behavior.
    expect(legacy.validationChecks).toBeUndefined();
    expect(quarantined.validationChecks).toBeDefined();
    expect(quarantined.validationChecks!.some(c => !c.passed)).toBe(true);
  });
});
