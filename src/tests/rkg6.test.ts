// RKG-6 intent guard fixture suite
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  diagnosisCode,
  buildIntentDiagnosis,
  validateEvidenceAlgebra,
  checkSiblingInvariants,
  recordConvergenceIteration,
  readConvergenceHistory,
  detectStall,
} from '../lib/intent-expansion.ts';
import type { IntentFailure, EvidenceItem } from '../lib/intent-expansion.ts';

// -- FR-IG-002: Structured diagnosis --

describe('RKG-6: structured diagnosis (FR-IG-002)', () => {
  it('diagnosisCode derives code from numeric gap, not string matching', () => {
    expect(diagnosisCode(0, 0.95)).toBe('intent-no-confidence');
    expect(diagnosisCode(0.3, 0.95)).toBe('intent-confidence-critical');
    // gap = 0.15, not > 0.2, so marginal
    expect(diagnosisCode(0.8, 0.95)).toBe('intent-confidence-marginal');
    expect(diagnosisCode(0.92, 0.95)).toBe('intent-confidence-marginal');
    // gap = 0.25, > 0.2, so low
    expect(diagnosisCode(0.7, 0.95)).toBe('intent-confidence-low');
  });

  it('diagnosisCode boundary: gap exactly 0.5 → low (not critical)', () => {
    // gap = 0.95 - 0.45 = 0.5, which is NOT > 0.5 so it should be 'low'
    expect(diagnosisCode(0.45, 0.95)).toBe('intent-confidence-low');
  });

  it('diagnosisCode boundary: gap exactly 0.2 → marginal (not low)', () => {
    // gap = 0.95 - 0.75 = 0.2, which is NOT > 0.2 so it should be 'marginal'
    expect(diagnosisCode(0.75, 0.95)).toBe('intent-confidence-marginal');
  });

  it('buildIntentDiagnosis produces structured IntentDiagnosis with known code', () => {
    const failure: IntentFailure = {
      statement: 'App renders todo items',
      threshold: 0.95,
      achieved: 0.4,
      reasoning: 'Missing DOM elements',
      evidence: ['src/app.ts:10', 'src/todo.ts:20'],
      rule: {
        type: 'intent',
        statement: 'App renders todo items',
        confidence: 0.95,
        evaluator: 'self',
        expandOnFail: true,
      },
    };
    const diag = buildIntentDiagnosis('node-a', failure, 1);
    expect(diag.code).toBe('intent-confidence-critical');
    expect(diag.affectedNode).toBe('node-a');
    expect(diag.statement).toBe('App renders todo items');
    expect(diag.achievedConfidence).toBe(0.4);
    expect(diag.threshold).toBe(0.95);
    expect(diag.expansionDepth).toBe(1);
    expect(diag.evidenceIds.length).toBe(2);
    expect(diag.remediationSteps.length).toBeGreaterThan(0);
    // Code is one of the known structural codes — no free-text
    expect(['intent-no-confidence', 'intent-confidence-critical', 'intent-confidence-low', 'intent-confidence-marginal']).toContain(diag.code);
  });

  it('buildIntentDiagnosis includes cost info when provided', () => {
    const failure: IntentFailure = {
      statement: 'Test statement',
      threshold: 0.95,
      achieved: 0.5,
      reasoning: 'reason',
      evidence: [],
      rule: { type: 'intent', statement: 'Test statement', confidence: 0.95, evaluator: 'self', expandOnFail: true },
    };
    const diag = buildIntentDiagnosis('n', failure, 0, { estimatedCost: 0.05, costRatio: 0.1 });
    expect(diag.estimatedCost).toBe(0.05);
    expect(diag.costRatio).toBe(0.1);
  });
});

// -- FR-IG-003: intentPolicy confidence gate --

describe('RKG-6: intentPolicy confidence gate (FR-IG-003)', () => {
  it('confidence below threshold produces failing diagnosis code', () => {
    // gap = 0.7 - 0.5 = 0.2, not > 0.2, so marginal
    // To get 'low', need gap > 0.2: e.g. 0.4, 0.7 → gap = 0.3
    const code = diagnosisCode(0.4, 0.7);
    expect(code).toBe('intent-confidence-low');
    expect(code).not.toBe('intent-confidence-marginal');
  });

  it('confidence at or above threshold still produces marginal code (gap <= 0.2)', () => {
    // When achieved is close to threshold, code is marginal
    const code = diagnosisCode(0.65, 0.7);
    expect(code).toBe('intent-confidence-marginal');
  });

  it('zero confidence produces no-confidence code regardless of threshold', () => {
    expect(diagnosisCode(0, 0.5)).toBe('intent-no-confidence');
    expect(diagnosisCode(0, 0.7)).toBe('intent-no-confidence');
    expect(diagnosisCode(0, 0.95)).toBe('intent-no-confidence');
  });
});

// -- FR-IG-004: evidence algebra --

describe('RKG-6: evidence algebra (FR-IG-004)', () => {
  it('counter-evidence blocks confirmation', () => {
    const evidence: EvidenceItem[] = [
      { id: 'obs-1', content: 'UI rendered', mode: 'observation' },
      { id: 'assert-1', content: 'passes test', mode: 'assertion' },
      { id: 'counter-1', content: 'color contrast fails', mode: 'counter' },
    ];
    const result = validateEvidenceAlgebra(evidence);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('counter-evidence');
    expect(result.reason).toContain('counter-1');
  });

  it('observation + assertion required for pass', () => {
    // Missing observation
    const noObs: EvidenceItem[] = [
      { id: 'assert-1', content: 'passes', mode: 'assertion' },
    ];
    expect(validateEvidenceAlgebra(noObs).valid).toBe(false);
    expect(validateEvidenceAlgebra(noObs).reason).toContain('observation');

    // Missing assertion
    const noAssert: EvidenceItem[] = [
      { id: 'obs-1', content: 'visible', mode: 'observation' },
    ];
    expect(validateEvidenceAlgebra(noAssert).valid).toBe(false);
    expect(validateEvidenceAlgebra(noAssert).reason).toContain('assertion');
  });

  it('valid evidence passes: observation + assertion + no counter', () => {
    const evidence: EvidenceItem[] = [
      { id: 'obs-1', content: 'UI rendered', mode: 'observation' },
      { id: 'assert-1', content: 'test passes', mode: 'assertion' },
    ];
    const result = validateEvidenceAlgebra(evidence);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('empty evidence fails (no observation)', () => {
    expect(validateEvidenceAlgebra([]).valid).toBe(false);
  });
});

// -- FR-IG-005: sibling invariant enforcement --

describe('RKG-6: sibling invariant enforcement (FR-IG-005)', () => {
  it('two nodes with same produces path trigger sibling conflict', () => {
    const violations = checkSiblingInvariants([
      { nodeId: 'fix-0', produces: ['shared.ts', 'other.ts'] },
      { nodeId: 'fix-1', produces: ['shared.ts', 'unique.ts'] },
    ]);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('fix-0');
    expect(violations[0]).toContain('fix-1');
    expect(violations[0]).toContain('shared.ts');
  });

  it('disjoint produces have no violations', () => {
    const violations = checkSiblingInvariants([
      { nodeId: 'a', produces: ['a.ts'] },
      { nodeId: 'b', produces: ['b.ts'] },
    ]);
    expect(violations).toEqual([]);
  });

  it('three-way conflict reported', () => {
    const violations = checkSiblingInvariants([
      { nodeId: 'a', produces: ['x.ts'] },
      { nodeId: 'b', produces: ['x.ts'] },
      { nodeId: 'c', produces: ['x.ts'] },
    ]);
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('a');
    expect(violations[0]).toContain('b');
    expect(violations[0]).toContain('c');
  });
});

// -- FR-IG-006: convergence stall escalation --

describe('RKG-6: convergence stall escalation (FR-IG-006)', () => {
  it('detectStall returns true when improvement below stallThreshold', () => {
    const history = [
      { depth: 0, confidence: 0.3 },
      { depth: 1, confidence: 0.32 },
    ];
    // current = 0.34, improvement over last = 0.02 < default stallThreshold (0.05)
    expect(detectStall(history, 0.34)).toBe(true);
  });

  it('detectStall returns false when improvement meets threshold', () => {
    const history = [
      { depth: 0, confidence: 0.3 },
    ];
    // current = 0.4, improvement = 0.1 > 0.05
    expect(detectStall(history, 0.4)).toBe(false);
  });

  it('detectStall returns false on empty history', () => {
    expect(detectStall([], 0.5)).toBe(false);
  });

  it('convergence history file I/O: record and read iterations', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg6-'));
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });

    recordConvergenceIteration({ recursionLevel: 0, coverageDelta: 0.1, expandedCount: 3 }, tmp);
    recordConvergenceIteration({ recursionLevel: 1, coverageDelta: 0.05, expandedCount: 2 }, tmp);
    recordConvergenceIteration({ recursionLevel: 2, coverageDelta: 0.01, expandedCount: 1 }, tmp);

    const history = readConvergenceHistory(tmp);
    expect(history.iterations.length).toBe(3);
    expect(history.iterations[0].recursionLevel).toBe(0);
    expect(history.iterations[2].coverageDelta).toBe(0.01);
  });

  it('readConvergenceHistory detects stall after 3 low-delta iterations', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg6-stall-'));
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });

    // 3 consecutive iterations with coverageDelta < 0.02 (STALL_THRESHOLD)
    recordConvergenceIteration({ recursionLevel: 0, coverageDelta: 0.01, expandedCount: 2 }, tmp);
    recordConvergenceIteration({ recursionLevel: 1, coverageDelta: 0.005, expandedCount: 1 }, tmp);
    recordConvergenceIteration({ recursionLevel: 2, coverageDelta: 0.001, expandedCount: 1 }, tmp);

    const history = readConvergenceHistory(tmp);
    expect(history.stalled).toBe(true);
    expect(history.stalledAt).toBe(2);
  });

  it('readConvergenceHistory returns non-stalled when deltas are healthy', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg6-healthy-'));
    mkdirSync(join(tmp, '.roadmap'), { recursive: true });

    recordConvergenceIteration({ recursionLevel: 0, coverageDelta: 0.1, expandedCount: 3 }, tmp);
    recordConvergenceIteration({ recursionLevel: 1, coverageDelta: 0.08, expandedCount: 2 }, tmp);
    recordConvergenceIteration({ recursionLevel: 2, coverageDelta: 0.05, expandedCount: 1 }, tmp);

    const history = readConvergenceHistory(tmp);
    expect(history.stalled).toBe(false);
    expect(history.stalledAt).toBeUndefined();
  });

  it('readConvergenceHistory on missing file returns empty non-stalled', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'rkg6-empty-'));
    const history = readConvergenceHistory(tmp);
    expect(history.iterations).toEqual([]);
    expect(history.stalled).toBe(false);
  });
});
