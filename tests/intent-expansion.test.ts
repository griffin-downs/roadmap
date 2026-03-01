import { describe, it, expect } from 'vitest';
import {
  extractIntentFailures, resolveProduces, generateIntentExpansion,
  detectStall, buildEscalation,
} from '../src/lib/intent/intent-expansion.ts';
import type { IntentFailure } from '../src/lib/intent/intent-expansion.ts';
import { define, graph, validateNode } from '../src/protocol.ts';
import type { ValidationRule, ValidationCheck, IntentJudgment } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function intentRule(overrides: Partial<{ statement: string; confidence: number; expandOnFail: boolean; maxExpansionDepth: number; context: string[] }> = {}): ValidationRule & { type: 'intent' } {
  return {
    type: 'intent',
    statement: overrides.statement ?? 'app works correctly',
    confidence: overrides.confidence ?? 0.9,
    evaluator: 'self',
    context: overrides.context,
    expandOnFail: overrides.expandOnFail ?? true,
    maxExpansionDepth: overrides.maxExpansionDepth,
  };
}

function failedCheck(rule: ValidationRule, judgment?: IntentJudgment): ValidationCheck {
  return {
    rule,
    passed: false,
    evidence: 'failed',
    judgment,
    intentStatus: 'evaluated',
  };
}

function passedCheck(rule: ValidationRule): ValidationCheck {
  return { rule, passed: true, evidence: 'passed', intentStatus: 'evaluated' };
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

// ── extractIntentFailures ────────────────────────────────────────────────────

describe('extractIntentFailures', () => {
  it('extracts failures from intent checks with expandOnFail', () => {
    const rule = intentRule({ expandOnFail: true });
    const judgment = makeJudgment('app works correctly', 0.72);
    const checks = [failedCheck(rule, judgment)];

    const failures = extractIntentFailures(checks, [judgment]);
    expect(failures).toHaveLength(1);
    expect(failures[0].statement).toBe('app works correctly');
    expect(failures[0].achieved).toBe(0.72);
    expect(failures[0].threshold).toBe(0.9);
  });

  it('skips intent checks without expandOnFail', () => {
    const rule = intentRule({ expandOnFail: false });
    const judgment = makeJudgment('app works correctly', 0.72);
    const checks = [failedCheck(rule, judgment)];

    const failures = extractIntentFailures(checks, [judgment]);
    expect(failures).toHaveLength(0);
  });

  it('skips passing checks', () => {
    const rule = intentRule({ expandOnFail: true });
    const checks = [passedCheck(rule)];

    const failures = extractIntentFailures(checks, [makeJudgment('app works correctly', 0.95)]);
    expect(failures).toHaveLength(0);
  });

  it('skips non-intent rules', () => {
    const check: ValidationCheck = { rule: { type: 'artifact-exists', target: 'out.ts' }, passed: false, evidence: 'missing' };
    const failures = extractIntentFailures([check], []);
    expect(failures).toHaveLength(0);
  });

  it('skips failures without matching judgment', () => {
    const rule = intentRule({ expandOnFail: true, statement: 'X' });
    const checks = [failedCheck(rule)];
    const failures = extractIntentFailures(checks, [makeJudgment('Y', 0.5)]);
    expect(failures).toHaveLength(0);
  });

  it('extracts multiple failures', () => {
    const rule1 = intentRule({ statement: 'A', expandOnFail: true });
    const rule2 = intentRule({ statement: 'B', expandOnFail: true });
    const j1 = makeJudgment('A', 0.6);
    const j2 = makeJudgment('B', 0.7);
    const checks = [failedCheck(rule1, j1), failedCheck(rule2, j2)];

    const failures = extractIntentFailures(checks, [j1, j2]);
    expect(failures).toHaveLength(2);
    expect(failures[0].statement).toBe('A');
    expect(failures[1].statement).toBe('B');
  });
});

// ── resolveProduces ──────────────────────────────────────────────────────────

describe('resolveProduces', () => {
  it('returns parent produces when no context on rule', () => {
    const failure = makeFailure({ rule: intentRule({ context: undefined }) });
    const result = resolveProduces(['a.ts', 'b.ts'], failure);
    expect(result).toEqual(['a.ts', 'b.ts']);
  });

  it('scopes to context paths when present', () => {
    const failure = makeFailure({ rule: intentRule({ context: ['b.ts'] }) });
    const result = resolveProduces(['a.ts', 'b.ts', 'c.ts'], failure);
    expect(result).toEqual(['b.ts']);
  });

  it('falls back to parent produces when context paths not in produces', () => {
    const failure = makeFailure({ rule: intentRule({ context: ['x.ts'] }) });
    const result = resolveProduces(['a.ts', 'b.ts'], failure);
    expect(result).toEqual(['a.ts', 'b.ts']);
  });

  it('returns empty context intersection that matches', () => {
    const failure = makeFailure({ rule: intentRule({ context: ['a.ts', 'c.ts'] }) });
    const result = resolveProduces(['a.ts', 'b.ts', 'c.ts'], failure);
    expect(result).toEqual(['a.ts', 'c.ts']);
  });
});

// ── generateIntentExpansion ──────────────────────────────────────────────────

describe('generateIntentExpansion', () => {
  it('generates one fix node per failure', () => {
    const failures = [makeFailure({ statement: 'A' }), makeFailure({ statement: 'B' })];
    const result = generateIntentExpansion(
      'parent', ['out.ts'], ['in.ts'], ['spec.md'], [], failures, 0,
    );

    expect(result.status).toBe('expanding');
    expect(result.fixNodes).toHaveLength(2);
    expect(result.depth).toBe(1);
  });

  it('fix node ID format: parentId-fix-index', () => {
    const result = generateIntentExpansion(
      'component-toggle', ['out.ts'], [], undefined, [], [makeFailure()], 0,
    );
    expect(result.fixNodes[0].id).toBe('component-toggle-fix-0');
  });

  it('fix node has expandedFrom = parent ID', () => {
    const result = generateIntentExpansion('parent', [], [], undefined, [], [makeFailure()], 0);
    expect(result.fixNodes[0].expandedFrom).toBe('parent');
  });

  it('fix node consumes parent produces (reads current state)', () => {
    const result = generateIntentExpansion(
      'parent', ['out.ts', 'styles.css'], ['in.ts'], undefined, [], [makeFailure()], 0,
    );
    expect(result.fixNodes[0].consumes).toEqual(['out.ts', 'styles.css']);
  });

  it('fix node inherits parent ambient', () => {
    const result = generateIntentExpansion(
      'parent', [], [], ['spec.md', 'config.json'], [], [makeFailure()], 0,
    );
    expect(result.fixNodes[0].ambient).toEqual(['spec.md', 'config.json']);
  });

  it('fix node ambient is undefined when parent has none', () => {
    const result = generateIntentExpansion('parent', [], [], undefined, [], [makeFailure()], 0);
    expect(result.fixNodes[0].ambient).toBeUndefined();
  });

  it('fix node carries deterministic gates from parent, not intent/runtime-explore', () => {
    const parentValidate: ValidationRule[] = [
      { type: 'artifact-exists', target: 'out.ts' },
      { type: 'shell', command: 'tsc --noEmit' },
      intentRule({ statement: 'other intent' }),
      { type: 'runtime-explore', script: 'test.ts', observations: [] },
    ];
    const result = generateIntentExpansion(
      'parent', ['out.ts'], [], undefined, parentValidate, [makeFailure()], 0,
    );

    const fixValidate = result.fixNodes[0].validate;
    // First: the failing intent
    expect(fixValidate[0].type).toBe('intent');
    // Then: deterministic only
    expect(fixValidate[1].type).toBe('artifact-exists');
    expect(fixValidate[2].type).toBe('shell');
    // No other intent or runtime-explore
    expect(fixValidate).toHaveLength(3);
  });

  it('fix node expandOnFail = true when depth + 1 < maxDepth', () => {
    const failure = makeFailure({ rule: intentRule({ maxExpansionDepth: 3 }) });
    const result = generateIntentExpansion('parent', [], [], undefined, [], [failure], 0);
    const fixIntentRule = result.fixNodes[0].validate[0] as any;
    expect(fixIntentRule.expandOnFail).toBe(true);
  });

  it('fix node expandOnFail = false when depth + 1 >= maxDepth', () => {
    const failure = makeFailure({ rule: intentRule({ maxExpansionDepth: 2 }) });
    const result = generateIntentExpansion('parent', [], [], undefined, [], [failure], 1);
    const fixIntentRule = result.fixNodes[0].validate[0] as any;
    expect(fixIntentRule.expandOnFail).toBe(false);
  });

  it('carries _intentDiagnosis with correct depth', () => {
    const failure = makeFailure({ achieved: 0.72, threshold: 0.9 });
    const result = generateIntentExpansion('parent', [], [], undefined, [], [failure], 2);
    const diag = result.fixNodes[0]._intentDiagnosis;
    expect(diag.expansionDepth).toBe(3);
    expect(diag.achievedConfidence).toBe(0.72);
    expect(diag.threshold).toBe(0.9);
  });
});

// ── detectStall ──────────────────────────────────────────────────────────────

describe('detectStall', () => {
  it('returns false on empty history', () => {
    expect(detectStall([], 0.8)).toBe(false);
  });

  it('returns false when improvement exceeds threshold', () => {
    const history = [{ depth: 0, confidence: 0.72 }];
    expect(detectStall(history, 0.85)).toBe(false);
  });

  it('returns true when improvement below threshold (default 0.05)', () => {
    const history = [{ depth: 0, confidence: 0.72 }];
    expect(detectStall(history, 0.74)).toBe(true); // 0.02 < 0.05
  });

  it('returns true when confidence decreased', () => {
    const history = [{ depth: 0, confidence: 0.72 }];
    expect(detectStall(history, 0.70)).toBe(true);
  });

  it('returns true when confidence unchanged', () => {
    const history = [{ depth: 0, confidence: 0.72 }];
    expect(detectStall(history, 0.72)).toBe(true);
  });

  it('respects custom stallThreshold', () => {
    const history = [{ depth: 0, confidence: 0.72 }];
    // 0.74 - 0.72 = 0.02 < 0.03 threshold → stall
    expect(detectStall(history, 0.74, { stallThreshold: 0.03 })).toBe(true);
    // 0.76 - 0.72 = 0.04 >= 0.03 threshold → not stall
    expect(detectStall(history, 0.76, { stallThreshold: 0.03 })).toBe(false);
  });

  it('compares against last entry in history', () => {
    const history = [
      { depth: 0, confidence: 0.60 },
      { depth: 1, confidence: 0.72 },
    ];
    // 0.74 - 0.72 = 0.02 < 0.05 → stall (compares against 0.72, not 0.60)
    expect(detectStall(history, 0.74)).toBe(true);
  });
});

// ── buildEscalation ──────────────────────────────────────────────────────────

describe('buildEscalation', () => {
  it('builds depth-exceeded escalation', () => {
    const history = [{ depth: 0, confidence: 0.72 }, { depth: 1, confidence: 0.78 }, { depth: 2, confidence: 0.82 }];
    const result = buildEscalation('node-a', 'app works', history, 'depth-exceeded');
    expect(result.status).toBe('escalated');
    expect(result.node).toBe('node-a');
    expect(result.statement).toBe('app works');
    expect(result.reason).toBe('depth-exceeded');
    expect(result.history).toHaveLength(3);
    expect(result.diagnosis).toContain('Maximum expansion depth');
  });

  it('builds stalled escalation', () => {
    const history = [{ depth: 0, confidence: 0.72 }, { depth: 1, confidence: 0.74 }];
    const result = buildEscalation('node-a', 'dark mode works', history, 'stalled');
    expect(result.status).toBe('escalated');
    expect(result.reason).toBe('stalled');
    expect(result.diagnosis).toContain('stalled');
    expect(result.diagnosis).toContain('0.74');
  });

  it('builds budget-exceeded escalation', () => {
    const result = buildEscalation('node-a', 'works', [{ depth: 0, confidence: 0.5 }], 'budget-exceeded');
    expect(result.reason).toBe('budget-exceeded');
    expect(result.diagnosis).toContain('budget');
  });
});

// ── End-to-end: validateNode → expansion → re-validation ─────────────────────

describe('end-to-end intent expansion flow', () => {
  function node(id: string, overrides: Partial<{ produces: string[]; consumes: string[]; deps: string[]; validate: ValidationRule[]; idempotent: boolean }> = {}) {
    return {
      id, desc: id,
      produces: overrides.produces ?? [],
      consumes: overrides.consumes ?? [],
      deps: overrides.deps ?? [],
      validate: overrides.validate ?? [],
      idempotent: overrides.idempotent ?? true,
    };
  }

  it('intent failure with expandOnFail produces extractable failures', async () => {
    const rule = intentRule({ expandOnFail: true, confidence: 0.9 });
    const dag = define(graph({
      id: 'e2e', desc: 'test', init: 'init', term: 'app',
      nodes: {
        init: node('init', { produces: ['src/app.ts'] }),
        app: node('app', { deps: ['init'], produces: ['dist/app.js'], consumes: ['src/app.ts'], validate: [rule] }),
      },
    }));

    const judgment = makeJudgment('app works correctly', 0.72);
    const result = await validateNode(dag, 'app', () => true, { intentJudgments: [judgment] });

    // Validation fails
    expect(result.passed).toBe(false);

    // Extract expandable failures
    const failures = extractIntentFailures(result.checks, [judgment]);
    expect(failures).toHaveLength(1);
    expect(failures[0].achieved).toBe(0.72);

    // Generate expansion
    const expansion = generateIntentExpansion(
      'app', ['dist/app.js'], ['src/app.ts'], undefined, [rule], failures, 0,
    );
    expect(expansion.fixNodes).toHaveLength(1);
    expect(expansion.fixNodes[0].id).toBe('app-fix-0');
    expect(expansion.fixNodes[0].expandedFrom).toBe('app');
    expect(expansion.fixNodes[0]._intentDiagnosis.expansionDepth).toBe(1);
  });

  it('depth limit prevents infinite recursion', () => {
    const failure = makeFailure({ rule: intentRule({ maxExpansionDepth: 2 }) });

    // Depth 0 → fix nodes with expandOnFail = true (1 < 2)
    const exp0 = generateIntentExpansion('parent', [], [], undefined, [], [failure], 0);
    expect((exp0.fixNodes[0].validate[0] as any).expandOnFail).toBe(true);

    // Depth 1 → fix nodes with expandOnFail = false (2 >= 2)
    const exp1 = generateIntentExpansion('parent-fix-0', [], [], undefined, [], [failure], 1);
    expect((exp1.fixNodes[0].validate[0] as any).expandOnFail).toBe(false);
  });

  it('stall detection triggers escalation instead of expansion', () => {
    const history = [{ depth: 0, confidence: 0.72 }];
    const isStalled = detectStall(history, 0.74); // improvement 0.02 < 0.05
    expect(isStalled).toBe(true);

    const escalation = buildEscalation('app', 'dark mode', [...history, { depth: 1, confidence: 0.74 }], 'stalled');
    expect(escalation.status).toBe('escalated');
    expect(escalation.reason).toBe('stalled');
  });
});
