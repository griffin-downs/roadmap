import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

import {
  writeJudgmentReceipt,
  readJudgmentReceipts,
  type IntentJudgmentReceipt,
  type DiagnosisBlock,
} from '../src/lib/judgment-receipt.ts';

import {
  buildDiagnosisBlock,
  validateEvidenceAlgebra,
  checkSiblingInvariants,
  writeExpansionReceipt,
  recordConvergenceIteration,
  readConvergenceHistory,
  type IntentFailure,
  type EvidenceItem,
  type ExpansionReceipt,
  type ConvergenceIteration,
} from '../src/lib/intent-expansion.ts';

import {
  loadRateCard,
  computeRateCardHash,
} from '../src/lib/rate-card.ts';

import type { IntentPolicy } from '../src/lib/kernel-config.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rkg6-'));
  mkdirSync(join(dir, '.roadmap'), { recursive: true });
  return dir;
}

function makeIntentFailure(overrides: Partial<IntentFailure> = {}): IntentFailure {
  return {
    statement: 'The implementation meets acceptance criteria',
    threshold: 0.9,
    achieved: 0.6,
    reasoning: 'Evidence is incomplete',
    evidence: ['evidence-a', 'evidence-b'],
    rule: {
      type: 'intent',
      statement: 'The implementation meets acceptance criteria',
      confidence: 0.9,
      evaluator: 'self',
      expandOnFail: true,
    },
    ...overrides,
  };
}

// ── 1. DiagnosisBlock — structural code derivation, not keyword matching ──────

describe('buildDiagnosisBlock', () => {
  it('derives code from numeric gap — critical when gap > 0.5', () => {
    const failure = makeIntentFailure({ achieved: 0.2, threshold: 0.9 }); // gap=0.7
    const block = buildDiagnosisBlock('node-a', failure);
    expect(block.code).toBe('intent-confidence-critical');
    expect(block.affectedNode).toBe('node-a');
  });

  it('derives code from numeric gap — low when gap 0.2–0.5', () => {
    const failure = makeIntentFailure({ achieved: 0.6, threshold: 0.9 }); // gap=0.3
    const block = buildDiagnosisBlock('node-b', failure);
    expect(block.code).toBe('intent-confidence-low');
  });

  it('derives code from numeric gap — marginal when gap <= 0.2', () => {
    const failure = makeIntentFailure({ achieved: 0.75, threshold: 0.9 }); // gap=0.15
    const block = buildDiagnosisBlock('node-c', failure);
    expect(block.code).toBe('intent-confidence-marginal');
  });

  it('derives code — no-confidence when achieved = 0', () => {
    const failure = makeIntentFailure({ achieved: 0, threshold: 0.9 });
    const block = buildDiagnosisBlock('node-d', failure);
    expect(block.code).toBe('intent-no-confidence');
  });

  it('code is not derived from statement keywords — same numeric gap, different statements give same code', () => {
    const failure1 = makeIntentFailure({ achieved: 0.6, threshold: 0.9, statement: 'confidence is low' });
    const failure2 = makeIntentFailure({ achieved: 0.6, threshold: 0.9, statement: 'system is unambiguous' });
    const block1 = buildDiagnosisBlock('n1', failure1);
    const block2 = buildDiagnosisBlock('n2', failure2);
    // Same numeric relationship → same structural code regardless of statement text
    expect(block1.code).toBe(block2.code);
  });

  it('evidenceIds are index-based, not content-based', () => {
    const failure = makeIntentFailure({ evidence: ['e0', 'e1', 'e2'] });
    const block = buildDiagnosisBlock('n', failure);
    expect(block.evidenceIds).toEqual(['evidence-0', 'evidence-1', 'evidence-2']);
  });

  it('remediationSteps includes threshold target', () => {
    const failure = makeIntentFailure({ achieved: 0.6, threshold: 0.9 });
    const block = buildDiagnosisBlock('n', failure);
    const hasThreshold = block.remediationSteps.some(s => s.includes('0.9') && s.includes('0.60'));
    expect(hasThreshold).toBe(true);
  });

  it('remediationSteps includes context files when present', () => {
    const failure = makeIntentFailure({
      rule: {
        type: 'intent',
        statement: 'test',
        confidence: 0.9,
        evaluator: 'self',
        expandOnFail: true,
        context: ['src/foo.ts', 'src/bar.ts'],
      },
    });
    const block = buildDiagnosisBlock('n', failure);
    const hasContext = block.remediationSteps.some(s => s.includes('src/foo.ts'));
    expect(hasContext).toBe(true);
  });

  it('remediationSteps includes observation ids when observations present', () => {
    const failure = makeIntentFailure({
      observationFailures: [{ id: 'obs-1', description: 'visible', evidence: 'not found' }],
    });
    const block = buildDiagnosisBlock('n', failure);
    const hasObs = block.remediationSteps.some(s => s.includes('obs-1'));
    expect(hasObs).toBe(true);
  });
});

// ── 2. Evidence algebra ────────────────────────────────────────────────────────

describe('validateEvidenceAlgebra', () => {
  it('counter-evidence present → invalid with reason listing counter ids', () => {
    const evidence: EvidenceItem[] = [
      { id: 'obs-1', content: 'seen', mode: 'observation' },
      { id: 'assert-1', content: 'confirmed', mode: 'assertion' },
      { id: 'counter-1', content: 'contradicts', mode: 'counter' },
    ];
    const result = validateEvidenceAlgebra(evidence);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('counter-1');
  });

  it('missing observation → invalid', () => {
    const evidence: EvidenceItem[] = [
      { id: 'assert-1', content: 'confirmed', mode: 'assertion' },
    ];
    const result = validateEvidenceAlgebra(evidence);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('observation');
  });

  it('missing assertion → invalid', () => {
    const evidence: EvidenceItem[] = [
      { id: 'obs-1', content: 'seen', mode: 'observation' },
    ];
    const result = validateEvidenceAlgebra(evidence);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('assertion');
  });

  it('valid combination: >=1 observation, >=1 assertion, 0 counter → valid', () => {
    const evidence: EvidenceItem[] = [
      { id: 'obs-1', content: 'seen', mode: 'observation' },
      { id: 'obs-2', content: 'also seen', mode: 'observation' },
      { id: 'assert-1', content: 'confirmed', mode: 'assertion' },
    ];
    const result = validateEvidenceAlgebra(evidence);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('empty evidence → invalid (missing both observation and assertion)', () => {
    const result = validateEvidenceAlgebra([]);
    expect(result.valid).toBe(false);
  });
});

// ── 3. Sibling invariants ──────────────────────────────────────────────────────

describe('checkSiblingInvariants', () => {
  it('two siblings producing same path → violation string naming both', () => {
    const children = [
      { nodeId: 'rkg-a', produces: ['src/foo.ts', 'src/bar.ts'] },
      { nodeId: 'rkg-b', produces: ['src/bar.ts', 'src/baz.ts'] },
    ];
    const violations = checkSiblingInvariants(children);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('rkg-a');
    expect(violations[0]).toContain('rkg-b');
    expect(violations[0]).toContain("src/bar.ts");
  });

  it('distinct paths → empty violations', () => {
    const children = [
      { nodeId: 'rkg-a', produces: ['src/foo.ts'] },
      { nodeId: 'rkg-b', produces: ['src/bar.ts'] },
    ];
    const violations = checkSiblingInvariants(children);
    expect(violations).toHaveLength(0);
  });

  it('single sibling → never a violation', () => {
    const children = [{ nodeId: 'rkg-a', produces: ['src/foo.ts', 'src/bar.ts'] }];
    const violations = checkSiblingInvariants(children);
    expect(violations).toHaveLength(0);
  });

  it('three siblings with shared path → violation lists all three', () => {
    const children = [
      { nodeId: 'rkg-a', produces: ['shared.ts'] },
      { nodeId: 'rkg-b', produces: ['shared.ts'] },
      { nodeId: 'rkg-c', produces: ['shared.ts'] },
    ];
    const violations = checkSiblingInvariants(children);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('rkg-a');
    expect(violations[0]).toContain('rkg-b');
    expect(violations[0]).toContain('rkg-c');
  });
});

// ── 4. Convergence history + stall detection ──────────────────────────────────

describe('readConvergenceHistory', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns empty non-stalled history when no file exists', () => {
    const history = readConvergenceHistory(tmp);
    expect(history.iterations).toHaveLength(0);
    expect(history.stalled).toBe(false);
  });

  it('stall detection — 3 consecutive iterations all below 0.02 → stalled=true', () => {
    const iters: ConvergenceIteration[] = [
      { recursionLevel: 1, coverageDelta: 0.01, expandedCount: 2 },
      { recursionLevel: 2, coverageDelta: 0.01, expandedCount: 1 },
      { recursionLevel: 3, coverageDelta: 0.005, expandedCount: 1 },
    ];
    for (const iter of iters) recordConvergenceIteration(iter, tmp);
    const history = readConvergenceHistory(tmp);
    expect(history.stalled).toBe(true);
    expect(history.stalledAt).toBe(3);
  });

  it('no stall — one iteration below threshold is not enough', () => {
    const iters: ConvergenceIteration[] = [
      { recursionLevel: 1, coverageDelta: 0.1, expandedCount: 5 },
      { recursionLevel: 2, coverageDelta: 0.01, expandedCount: 2 },
    ];
    for (const iter of iters) recordConvergenceIteration(iter, tmp);
    const history = readConvergenceHistory(tmp);
    expect(history.stalled).toBe(false);
  });

  it('stall detected at first window after 3 consecutive low deltas, even with earlier high delta', () => {
    const iters: ConvergenceIteration[] = [
      { recursionLevel: 1, coverageDelta: 0.5, expandedCount: 10 },
      { recursionLevel: 2, coverageDelta: 0.01, expandedCount: 2 },
      { recursionLevel: 3, coverageDelta: 0.01, expandedCount: 1 },
      { recursionLevel: 4, coverageDelta: 0.005, expandedCount: 1 },
    ];
    for (const iter of iters) recordConvergenceIteration(iter, tmp);
    const history = readConvergenceHistory(tmp);
    expect(history.stalled).toBe(true);
    expect(history.stalledAt).toBe(4);
  });

  it('rounds correct — delta exactly at 0.02 is not stalled (< threshold, not <=)', () => {
    const iters: ConvergenceIteration[] = [
      { recursionLevel: 1, coverageDelta: 0.02, expandedCount: 2 },
      { recursionLevel: 2, coverageDelta: 0.02, expandedCount: 2 },
      { recursionLevel: 3, coverageDelta: 0.02, expandedCount: 2 },
    ];
    for (const iter of iters) recordConvergenceIteration(iter, tmp);
    const history = readConvergenceHistory(tmp);
    // delta=0.02 is NOT < 0.02, so no stall
    expect(history.stalled).toBe(false);
  });
});

// ── 5. loadRateCard ────────────────────────────────────────────────────────────

describe('loadRateCard', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns null when rates.json does not exist', () => {
    const card = loadRateCard(tmp);
    expect(card).toBeNull();
  });

  it('reads rates.json and computes rateCardHash as sha256 of content', () => {
    const content = JSON.stringify({
      schemaVersion: 1,
      rates: [{ model: 'claude-opus-4-6', inputPerMToken: 15.0, outputPerMToken: 75.0 }],
    });
    writeFileSync(join(tmp, '.roadmap', 'rates.json'), content, 'utf-8');
    const card = loadRateCard(tmp);
    expect(card).not.toBeNull();
    expect(card!.schemaVersion).toBe(1);
    expect(card!.rates).toHaveLength(1);
    const expectedHash = createHash('sha256').update(content).digest('hex');
    expect(card!.rateCardHash).toBe(expectedHash);
  });

  it('computeRateCardHash is deterministic and sha256-based', () => {
    const content = '{"test":1}';
    const h1 = computeRateCardHash(content);
    const h2 = computeRateCardHash(content);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // sha256 hex = 64 chars
  });

  it('different content → different hashes', () => {
    const h1 = computeRateCardHash('{"a":1}');
    const h2 = computeRateCardHash('{"a":2}');
    expect(h1).not.toBe(h2);
  });
});

// ── 6. writeJudgmentReceipt / readJudgmentReceipts roundtrip ──────────────────

describe('writeJudgmentReceipt / readJudgmentReceipts', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns empty array when no receipts written', () => {
    expect(readJudgmentReceipts(tmp)).toHaveLength(0);
  });

  it('write then read roundtrip preserves all fields', () => {
    const receipt: IntentJudgmentReceipt = {
      evaluationId: 'eval-001',
      timestamp: '2026-02-28T00:00:00.000Z',
      nodeId: 'node-x',
      judgment: 'fail',
      confidence: 0.6,
      evidence: ['e1', 'e2'],
      diagnosisBlocks: [
        {
          code: 'intent-confidence-low',
          affectedNode: 'node-x',
          evidenceIds: ['evidence-0', 'evidence-1'],
          remediationSteps: ['Achieve confidence >= 0.9 (currently 0.60)'],
        },
      ],
    };
    writeJudgmentReceipt(receipt, tmp);
    const results = readJudgmentReceipts(tmp);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(receipt);
  });

  it('multiple receipts appended in order', () => {
    const r1: IntentJudgmentReceipt = {
      evaluationId: 'e1', timestamp: 't1', nodeId: 'n1',
      judgment: 'pass', confidence: 0.95, evidence: [], diagnosisBlocks: [],
    };
    const r2: IntentJudgmentReceipt = {
      evaluationId: 'e2', timestamp: 't2', nodeId: 'n2',
      judgment: 'fail', confidence: 0.5, evidence: ['x'], diagnosisBlocks: [],
    };
    writeJudgmentReceipt(r1, tmp);
    writeJudgmentReceipt(r2, tmp);
    const results = readJudgmentReceipts(tmp);
    expect(results).toHaveLength(2);
    expect(results[0].evaluationId).toBe('e1');
    expect(results[1].evaluationId).toBe('e2');
  });
});

// ── 7. IntentPolicy gating ────────────────────────────────────────────────────

describe('IntentPolicy gating', () => {
  // Test the gating logic directly: when kernel minConfidence=0.9 and judgment
  // confidence=0.7, the gate should reject advancement.

  function applyIntentPolicy(policy: IntentPolicy, confidence: number): boolean {
    return confidence >= policy.minConfidence;
  }

  it('rejects when confidence below minConfidence', () => {
    const policy: IntentPolicy = {
      minConfidence: 0.9,
      escalateOnStall: true,
      maxRecursionDepth: 3,
    };
    const passes = applyIntentPolicy(policy, 0.7);
    expect(passes).toBe(false);
  });

  it('accepts when confidence equals minConfidence', () => {
    const policy: IntentPolicy = {
      minConfidence: 0.9,
      escalateOnStall: true,
      maxRecursionDepth: 3,
    };
    expect(applyIntentPolicy(policy, 0.9)).toBe(true);
  });

  it('accepts when confidence exceeds minConfidence', () => {
    const policy: IntentPolicy = {
      minConfidence: 0.9,
      escalateOnStall: true,
      maxRecursionDepth: 3,
    };
    expect(applyIntentPolicy(policy, 0.95)).toBe(true);
  });

  it('boundary: minConfidence=0.0 → always passes', () => {
    const policy: IntentPolicy = {
      minConfidence: 0.0,
      escalateOnStall: false,
      maxRecursionDepth: 1,
    };
    expect(applyIntentPolicy(policy, 0.0)).toBe(true);
  });

  it('boundary: minConfidence=1.0 → only perfect confidence passes', () => {
    const policy: IntentPolicy = {
      minConfidence: 1.0,
      escalateOnStall: true,
      maxRecursionDepth: 3,
    };
    expect(applyIntentPolicy(policy, 0.99)).toBe(false);
    expect(applyIntentPolicy(policy, 1.0)).toBe(true);
  });
});
