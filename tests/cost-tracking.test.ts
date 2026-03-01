import { describe, it, expect } from 'vitest';
import {
  extractIntentFailures, generateIntentExpansion, fixNodeCost,
  detectStall, buildEscalation,
} from '../src/lib/intent/intent-expansion.ts';
import type { IntentFailure, FixNodeSpec, CostHistory } from '../src/lib/intent/intent-expansion.ts';
import type { ValidationRule, IntentJudgment, ValidationCheck } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function intentRule(overrides: Partial<{ statement: string; confidence: number; expandOnFail: boolean; maxExpansionDepth: number; maxExpansionCost: number; context: string[] }> = {}): ValidationRule & { type: 'intent' } {
  return {
    type: 'intent',
    statement: overrides.statement ?? 'app works correctly',
    confidence: overrides.confidence ?? 0.9,
    evaluator: 'self',
    context: overrides.context,
    expandOnFail: overrides.expandOnFail ?? true,
    maxExpansionDepth: overrides.maxExpansionDepth,
    maxExpansionCost: overrides.maxExpansionCost,
  };
}

function makeJudgment(statement: string, confidence: number): IntentJudgment {
  return { statement, confidence, reasoning: 'test reasoning', evidence: ['file.ts:10'] };
}

function makeFailure(overrides: Partial<IntentFailure> = {}): IntentFailure {
  return {
    statement: 'app works correctly',
    threshold: 0.9,
    achieved: 0.72,
    reasoning: 'test reasoning',
    evidence: ['file.ts:10'],
    rule: intentRule(),
    ...overrides,
  };
}

function makeFixNode(overrides: Partial<FixNodeSpec> = {}): FixNodeSpec {
  return {
    id: 'test-fix-0',
    desc: 'Fix: app works correctly',
    expandedFrom: 'parent',
    produces: ['output.ts'],
    consumes: ['input.ts'],
    validate: [],
    idempotent: true,
    _intentDiagnosis: {
      statement: 'app works correctly',
      achievedConfidence: 0.72,
      threshold: 0.9,
      reasoning: 'test reasoning',
      evidence: ['file.ts:10'],
      expansionDepth: 1,
    },
    ...overrides,
  };
}

// ── Cost Estimation ──────────────────────────────────────────────────────────

describe('fixNodeCost', () => {
  it('estimates base cost for simple node', () => {
    const node = makeFixNode({
      produces: ['output.ts'],
      consumes: ['input.ts'],
    });
    const cost = fixNodeCost(node, 0, 'opus-all');
    // baseTokens = 500
    // scopeMultiplier = 1 + 0.1 * 2 = 1.2
    // scopeTokens = 500 * 1.2 = 600
    // depthMultiplier = 1.0
    // totalTokens = 600
    // costUSD = 600 * 0.015 / 1000 = 0.009
    expect(cost).toBeCloseTo(0.009, 3);
  });

  it('scales cost by scope (produces + consumes count)', () => {
    const node = makeFixNode({
      produces: ['out1.ts', 'out2.ts', 'out3.ts'],
      consumes: ['in1.ts', 'in2.ts', 'in3.ts', 'in4.ts'],
    });
    const cost = fixNodeCost(node, 0, 'opus-all');
    // scopeMultiplier = 1 + 0.1 * 7 = 1.7
    // scopeTokens = 500 * 1.7 = 850
    // totalTokens = 850
    // costUSD = 850 * 0.015 / 1000 = 0.01275
    expect(cost).toBeCloseTo(0.01275, 4);
  });

  it('scales cost by depth', () => {
    const node = makeFixNode({
      produces: ['output.ts'],
      consumes: ['input.ts'],
    });
    const costDepth0 = fixNodeCost(node, 0, 'opus-all');
    const costDepth1 = fixNodeCost(node, 1, 'opus-all');
    const costDepth2 = fixNodeCost(node, 2, 'opus-all');

    // depth 0: multiplier = 1.0
    // depth 1: multiplier = 1.2
    // depth 2: multiplier = 1.4
    expect(costDepth1).toBeCloseTo(costDepth0 * 1.2, 5);
    expect(costDepth2).toBeCloseTo(costDepth0 * 1.4, 5);
  });

  it('applies opus-all model allocation (100% Opus)', () => {
    const node = makeFixNode({
      produces: ['output.ts'],
      consumes: ['input.ts'],
    });
    const cost = fixNodeCost(node, 0, 'opus-all');
    // 600 tokens * 0.015 / 1000 = 0.009
    expect(cost).toBeCloseTo(0.009, 3);
  });

  it('applies opus-emit+haiku-fix model allocation (60% Opus, 40% Haiku)', () => {
    const node = makeFixNode({
      produces: ['output.ts'],
      consumes: ['input.ts'],
    });
    const cost = fixNodeCost(node, 0, 'opus-emit+haiku-fix');
    // costPerToken = (0.015 * 0.6 + 0.00025 * 0.4) / 1000 = 0.000009100
    // totalTokens = 600
    // costUSD = 600 * 0.0000091 = 0.00546
    expect(cost).toBeCloseTo(0.00546, 4);
  });

  it('applies haiku-emit+opus-judge model allocation (70% Haiku, 30% Opus)', () => {
    const node = makeFixNode({
      produces: ['output.ts'],
      consumes: ['input.ts'],
    });
    const cost = fixNodeCost(node, 0, 'haiku-emit+opus-judge');
    // costPerToken = (0.00025 * 0.7 + 0.015 * 0.3) / 1000 = 0.0000046750
    // costUSD = 600 * 0.0000046750 = 0.002805
    expect(cost).toBeCloseTo(0.002805, 4);
  });
});

// ── Expansion with Cost Tracking ─────────────────────────────────────────────

describe('generateIntentExpansion — cost tracking', () => {
  it('includes costHistory in expanding result', () => {
    const failures = [makeFailure()];
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );

    expect(result.status).toBe('expanding');
    expect(result.costHistory).toBeDefined();
    expect(result.costHistory).toHaveLength(1);
    expect(result.costHistory[0]).toHaveProperty('depth');
    expect(result.costHistory[0]).toHaveProperty('fixNodeCount');
    expect(result.costHistory[0]).toHaveProperty('levelTotal');
    expect(result.costHistory[0]).toHaveProperty('cumulativeTotal');
  });

  it('tracks cumulative cost correctly', () => {
    const failures = [
      makeFailure({ statement: 'test 1' }),
      makeFailure({ statement: 'test 2' }),
    ];
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );

    expect(result.cumulativeCost).toBeDefined();
    expect(result.cumulativeCost).toBeGreaterThan(0);
    expect(result.costHistory[0].cumulativeTotal).toBe(result.cumulativeCost);
  });

  it('includes cost annotations on fix nodes', () => {
    const failures = [makeFailure()];
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );

    const node = result.fixNodes[0];
    expect(node._intentDiagnosis.estimatedCost).toBeDefined();
    expect(node._intentDiagnosis.estimatedCost).toBeGreaterThan(0);
  });

  it('calculates costRatio per node', () => {
    const failures = [makeFailure()];
    const budget = 0.050;
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { maxExpansionCost: budget },
      'opus-all',
    );

    const node = result.fixNodes[0];
    if (node._intentDiagnosis.costRatio !== undefined) {
      expect(node._intentDiagnosis.costRatio).toBeGreaterThan(0);
      expect(node._intentDiagnosis.costRatio).toBeLessThanOrEqual(1);
    }
  });

  it('computes perNodeEstimate in costHistory', () => {
    const failures = [
      makeFailure({ statement: 'test 1' }),
      makeFailure({ statement: 'test 2' }),
      makeFailure({ statement: 'test 3' }),
    ];
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );

    const history = result.costHistory[0];
    expect(history.fixNodeCount).toBe(3);
    expect(history.perNodeEstimate).toBeCloseTo(
      history.levelTotal / 3,
      5,
    );
  });
});

// ── Budget Gates ─────────────────────────────────────────────────────────────

describe('generateIntentExpansion — budget gates', () => {
  it('returns escalated if projected total exceeds budget', () => {
    const failures = [
      makeFailure({ statement: 'test 1' }),
      makeFailure({ statement: 'test 2' }),
    ];
    const budget = 0.005; // Very tight budget
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { maxExpansionCost: budget },
      'opus-all',
    );

    expect(result.status).toBe('escalated');
    expect(result.fixNodes).toHaveLength(0);
  });

  it('gates at correct threshold (all-or-nothing)', () => {
    const failures = [
      makeFailure({ statement: 'test 1' }),
      makeFailure({ statement: 'test 2' }),
      makeFailure({ statement: 'test 3' }),
    ];

    // Find a budget that's just under the level total
    const tempResult = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );
    const levelTotal = tempResult.costHistory?.[0]?.levelTotal ?? 0;
    const tightBudget = levelTotal * 0.9; // 90% of required cost

    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { maxExpansionCost: tightBudget },
      'opus-all',
    );

    expect(result.status).toBe('escalated');
    expect(result.fixNodes).toHaveLength(0);
  });

  it('allows expansion if projected total is within budget', () => {
    const failures = [makeFailure()];
    const budget = 1.00; // Generous budget
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { maxExpansionCost: budget },
      'opus-all',
    );

    expect(result.status).toBe('expanding');
    expect(result.fixNodes.length).toBeGreaterThan(0);
  });

  it('accumulates cost across recursion levels', () => {
    const failures = [makeFailure()];
    const result1 = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0, // depth 0
      undefined,
      'opus-all',
      0, // initial cumulative
    );

    const cost1 = result1.cumulativeCost ?? 0;
    expect(cost1).toBeGreaterThan(0);

    // Simulate second level (depth 1) with same cumulative from level 0
    const result2 = generateIntentExpansion(
      'parent-fix-0',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      1, // depth 1
      undefined,
      'opus-all',
      cost1, // carry forward cumulative
    );

    const cost2 = result2.cumulativeCost ?? 0;
    expect(cost2).toBeGreaterThan(cost1); // Accumulated
    expect(result2.costHistory?.[0]?.cumulativeTotal).toBe(cost2);
  });
});

// ── Escalation with Budget Info ──────────────────────────────────────────────

describe('generateIntentExpansion — escalation with cost evidence', () => {
  it('returns escalated status when budget exceeded', () => {
    const failures = [makeFailure()];
    const budget = 0.001; // Extremely tight
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { maxExpansionCost: budget },
      'opus-all',
    );

    expect(result.status).toBe('escalated');
  });

  it('includes costHistory on escalated result', () => {
    const failures = [makeFailure()];
    const budget = 0.001;
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { maxExpansionCost: budget },
      'opus-all',
    );

    expect(result.costHistory).toBeDefined();
    expect(result.costHistory).toHaveLength(1);
    expect(result.costHistory[0].levelTotal).toBeGreaterThan(budget);
  });

  it('includes budgetRemaining on escalated result', () => {
    const failures = [makeFailure()];
    const budget = 0.001;
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { maxExpansionCost: budget },
      'opus-all',
    );

    expect(result.budgetRemaining).toBeDefined();
    expect(result.budgetRemaining).toBe(Math.max(0, budget - (result.cumulativeCost ?? 0)));
  });
});

// ── Cost Scaling by Depth & Scope ────────────────────────────────────────────

describe('cost estimation — depth and scope penalties', () => {
  it('costs increase with scope', () => {
    const smallNode = makeFixNode({
      produces: ['output.ts'],
      consumes: ['input.ts'],
    });
    const largeNode = makeFixNode({
      produces: ['out1.ts', 'out2.ts', 'out3.ts', 'out4.ts', 'out5.ts'],
      consumes: ['in1.ts', 'in2.ts', 'in3.ts', 'in4.ts', 'in5.ts', 'in6.ts', 'in7.ts'],
    });

    const smallCost = fixNodeCost(smallNode, 0, 'opus-all');
    const largeCost = fixNodeCost(largeNode, 0, 'opus-all');

    expect(largeCost).toBeGreaterThan(smallCost);
  });

  it('costs increase exponentially with depth', () => {
    const node = makeFixNode();
    const c0 = fixNodeCost(node, 0, 'opus-all');
    const c1 = fixNodeCost(node, 1, 'opus-all');
    const c2 = fixNodeCost(node, 2, 'opus-all');

    // 1.0, 1.2, 1.4 ratios
    expect(c1 / c0).toBeCloseTo(1.2, 3);
    expect(c2 / c0).toBeCloseTo(1.4, 3);
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('cost tracking — edge cases', () => {
  it('handles zero-cost scenarios (no budget specified)', () => {
    const failures = [makeFailure()];
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      { /* no maxExpansionCost */ },
      'opus-all',
    );

    expect(result.status).toBe('expanding');
    expect(result.budgetRemaining).toBeUndefined();
  });

  it('handles concurrent fix nodes (multiple failures at same level)', () => {
    const failures = Array.from({ length: 5 }, (_, i) =>
      makeFailure({ statement: `test ${i}` }),
    );
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );

    expect(result.costHistory[0].fixNodeCount).toBe(5);
    expect(result.fixNodes).toHaveLength(5);
  });

  it('costs for concurrent nodes sum correctly', () => {
    const failures = Array.from({ length: 3 }, (_, i) =>
      makeFailure({ statement: `test ${i}` }),
    );
    const result = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );

    const sumOfNodeCosts = result.fixNodes
      .reduce((sum, node) => sum + (node._intentDiagnosis.estimatedCost ?? 0), 0);
    expect(sumOfNodeCosts).toBeCloseTo(result.cumulativeCost ?? 0, 4);
  });

  it('preserves cost history through multiple levels', () => {
    const failures = [makeFailure()];

    // Level 0
    const result0 = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
      0,
    );

    const cost0 = result0.cumulativeCost ?? 0;

    // Level 1 (fix-of-fix)
    const result1 = generateIntentExpansion(
      'parent-fix-0',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      1,
      undefined,
      'opus-all',
      cost0,
    );

    const cost1 = result1.cumulativeCost ?? 0;

    // Verify cumulative increases
    expect(cost1).toBeGreaterThan(cost0);
  });

  it('handles model allocation changes correctly', () => {
    const failures = [makeFailure()];

    const resultOpus = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'opus-all',
    );

    const resultHaiku = generateIntentExpansion(
      'parent',
      ['output.ts'],
      ['input.ts'],
      undefined,
      [],
      failures,
      0,
      undefined,
      'haiku-emit+opus-judge',
    );

    // Haiku allocation should be cheaper
    expect((resultHaiku.cumulativeCost ?? 0)).toBeLessThan(
      (resultOpus.cumulativeCost ?? 0),
    );
  });
});

// ── Accuracy Tests ──────────────────────────────────────────────────────────

describe('cost estimation — accuracy within 10%', () => {
  it('cost matches token calculation within tolerance', () => {
    const node = makeFixNode({
      produces: ['out1.ts', 'out2.ts'],
      consumes: ['in1.ts', 'in2.ts', 'in3.ts'],
    });

    const cost = fixNodeCost(node, 2, 'opus-all');

    // Manual calculation:
    // baseTokens = 500
    // scopeTokens = 500 * (1 + 0.1 * 5) = 500 * 1.5 = 750
    // depthMultiplier = 1 + 0.2 * 2 = 1.4
    // tokens = 750 * 1.4 = 1050
    // costUSD = 1050 * (0.015 / 1000) = 0.01575
    const expectedCost = 0.01575;
    expect(cost).toBeCloseTo(expectedCost, 4);
  });
});
