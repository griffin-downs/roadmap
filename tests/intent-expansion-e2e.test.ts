import { describe, it, expect } from 'vitest';
import { define, graph, validateNode } from '../src/protocol.ts';
import type { ValidationRule, IntentJudgment, ValidationResult, EscalationResult } from '../src/protocol.ts';
import {
  extractIntentFailures, generateIntentExpansion, detectStall, buildEscalation,
} from '../src/lib/intent/intent-expansion.ts';
import type { IntentFailure, ExpansionResult } from '../src/lib/intent/intent-expansion.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function intentRule(overrides: Partial<{
  statement: string; confidence: number; expandOnFail: boolean;
  maxExpansionDepth: number; context: string[];
}> = {}): ValidationRule & { type: 'intent' } {
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

function judgment(statement: string, confidence: number): IntentJudgment {
  return { statement, confidence, reasoning: 'test reasoning', evidence: ['file.ts:10'] };
}

function node(id: string, overrides: Partial<{
  produces: string[]; consumes: string[]; deps: string[];
  validate: ValidationRule[]; expandedFrom: string;
  _intentDiagnosis: any;
}> = {}) {
  return {
    id, desc: id,
    produces: overrides.produces ?? [],
    consumes: overrides.consumes ?? [],
    deps: overrides.deps ?? [],
    validate: overrides.validate ?? [],
    idempotent: true,
    expandedFrom: overrides.expandedFrom,
    _intentDiagnosis: overrides._intentDiagnosis,
  };
}

// ── Convergence loop simulation ──────────────────────────────────────────────

/**
 * Simulates the convergence loop that cmdComplete implements:
 * 1. Validate node with intent judgments
 * 2. If intent fails with expandOnFail → extract failures → generate expansion
 * 3. Check depth/stall → either expand or escalate
 * 4. Simulate fix execution + re-validation
 */
async function simulateConvergenceLoop(opts: {
  parentId: string;
  parentProduces: string[];
  parentConsumes: string[];
  parentValidate: ValidationRule[];
  parentAmbient?: string[];
  /** Sequence of judgment sets — first for parent, then for each fix round */
  judgmentRounds: IntentJudgment[][];
  maxDepth?: number;
}): Promise<{
  result: 'converged' | 'escalated' | 'expanding' | 'bare-rejection';
  totalExpansions: number;
  finalExpansion?: ExpansionResult;
  escalation?: EscalationResult;
  convergenceHistory: Array<{ depth: number; confidence: number }>;
}> {
  const history: Array<{ depth: number; confidence: number }> = [];
  let currentId = opts.parentId;
  let currentProduces = opts.parentProduces;
  let currentConsumes = opts.parentConsumes;
  let currentValidate = opts.parentValidate;
  let currentAmbient = opts.parentAmbient;
  let currentDepth = 0;
  let totalExpansions = 0;
  let priorDiagnosis: any = undefined;

  for (let round = 0; round < opts.judgmentRounds.length; round++) {
    const judgments = opts.judgmentRounds[round];

    // Build DAG for this round
    const dagNodes: Record<string, any> = {
      init: node('init', { produces: ['init.txt'] }),
    };
    dagNodes[currentId] = node(currentId, {
      produces: currentProduces,
      consumes: currentConsumes,
      deps: ['init'],
      validate: currentValidate,
      _intentDiagnosis: priorDiagnosis,
    });

    const g = define(graph({
      id: 'loop-test', desc: 'convergence loop', init: 'init', term: currentId,
      nodes: dagNodes as any,
    }));

    // Validate
    const result = await validateNode(g, currentId, () => true, { intentJudgments: judgments });

    if (result.passed) {
      return { result: 'converged', totalExpansions, convergenceHistory: history };
    }

    // Extract expandable failures
    const failures = extractIntentFailures(result.checks, judgments);
    if (failures.length === 0) {
      // Non-expandable failures: bare rejection (intent failed but expandOnFail is false, or
      // depth limit already set expandOnFail: false on this fix node)
      return { result: 'bare-rejection', totalExpansions, convergenceHistory: history };
    }

    // Record confidence in history
    const avgConfidence = failures.reduce((s, f) => s + f.achieved, 0) / failures.length;
    history.push({ depth: currentDepth, confidence: avgConfidence });

    // Check stall
    if (history.length >= 2 && detectStall(history.slice(0, -1), avgConfidence)) {
      const escalation = buildEscalation(currentId, failures[0].statement, history, 'stalled');
      return { result: 'escalated', totalExpansions, escalation, convergenceHistory: history };
    }

    // Check depth
    const maxDepth = opts.maxDepth ?? 3;
    if (currentDepth >= maxDepth) {
      const escalation = buildEscalation(currentId, failures[0].statement, history, 'depth-exceeded');
      return { result: 'escalated', totalExpansions, escalation, convergenceHistory: history };
    }

    // Generate expansion
    const expansion = generateIntentExpansion(
      currentId, currentProduces, currentConsumes, currentAmbient, currentValidate,
      failures, currentDepth,
    );
    totalExpansions++;

    // Simulate: next round uses the first fix node's parameters
    const fixNode = expansion.fixNodes[0];
    currentId = fixNode.id;
    currentProduces = fixNode.produces;
    currentConsumes = fixNode.consumes;
    currentValidate = fixNode.validate;
    currentAmbient = fixNode.ambient;
    currentDepth = fixNode._intentDiagnosis.expansionDepth;
    priorDiagnosis = fixNode._intentDiagnosis;

    // If this is the last round with no more judgments to provide, return expanding
    if (round === opts.judgmentRounds.length - 1) {
      return {
        result: 'expanding',
        totalExpansions,
        finalExpansion: expansion,
        convergenceHistory: history,
      };
    }
  }

  return { result: 'expanding', totalExpansions, convergenceHistory: history };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('convergence loop: intent fails → expansion → fix → re-validate → pass', () => {
  it('converges after one expansion when fix improves confidence above threshold', async () => {
    const rule = intentRule({ expandOnFail: true, confidence: 0.9 });

    const result = await simulateConvergenceLoop({
      parentId: 'app',
      parentProduces: ['dist/app.js'],
      parentConsumes: ['src/app.ts'],
      parentValidate: [rule],
      judgmentRounds: [
        // Round 0: fails at 0.72
        [judgment('app works correctly', 0.72)],
        // Round 1: fix node achieves 0.95 → converges
        [judgment('app works correctly', 0.95)],
      ],
    });

    expect(result.result).toBe('converged');
    expect(result.totalExpansions).toBe(1);
    expect(result.convergenceHistory).toHaveLength(1);
    expect(result.convergenceHistory[0]).toEqual({ depth: 0, confidence: 0.72 });
  });

  it('converges after two expansions (recursive)', async () => {
    const rule = intentRule({ expandOnFail: true, confidence: 0.9, maxExpansionDepth: 3 });

    const result = await simulateConvergenceLoop({
      parentId: 'app',
      parentProduces: ['dist/app.js'],
      parentConsumes: ['src/app.ts'],
      parentValidate: [rule],
      judgmentRounds: [
        [judgment('app works correctly', 0.60)],  // depth 0: 0.60
        [judgment('app works correctly', 0.80)],  // depth 1: 0.80 (improvement > 0.05)
        [judgment('app works correctly', 0.95)],  // depth 2: converges
      ],
    });

    expect(result.result).toBe('converged');
    expect(result.totalExpansions).toBe(2);
    expect(result.convergenceHistory).toHaveLength(2);
  });
});

describe('convergence loop: stall detection triggers escalation', () => {
  it('escalates when confidence does not improve between levels', async () => {
    const rule = intentRule({ expandOnFail: true, confidence: 0.9, maxExpansionDepth: 5 });

    const result = await simulateConvergenceLoop({
      parentId: 'app',
      parentProduces: ['dist/app.js'],
      parentConsumes: ['src/app.ts'],
      parentValidate: [rule],
      judgmentRounds: [
        [judgment('app works correctly', 0.72)],  // depth 0
        [judgment('app works correctly', 0.74)],  // depth 1: 0.02 improvement < 0.05 threshold → stall
      ],
    });

    expect(result.result).toBe('escalated');
    expect(result.totalExpansions).toBe(1);
    expect(result.escalation).toBeDefined();
    expect(result.escalation!.reason).toBe('stalled');
    expect(result.escalation!.status).toBe('escalated');
  });

  it('escalates when confidence decreases', async () => {
    const rule = intentRule({ expandOnFail: true, confidence: 0.9, maxExpansionDepth: 5 });

    const result = await simulateConvergenceLoop({
      parentId: 'app',
      parentProduces: ['dist/app.js'],
      parentConsumes: ['src/app.ts'],
      parentValidate: [rule],
      judgmentRounds: [
        [judgment('app works correctly', 0.72)],  // depth 0
        [judgment('app works correctly', 0.65)],  // depth 1: regression → stall
      ],
    });

    expect(result.result).toBe('escalated');
    expect(result.escalation!.reason).toBe('stalled');
  });
});

describe('convergence loop: depth limit prevents infinite recursion', () => {
  it('bare-rejects at max depth when fix node expandOnFail becomes false', async () => {
    // maxExpansionDepth 2: depth 0 → fix has expandOnFail true (depth 1 < 2).
    // depth 1 → fix has expandOnFail false (depth 2 >= 2).
    // At depth 2 (expandOnFail false), intent fails → no expandable failures → bare rejection.
    const rule = intentRule({ expandOnFail: true, confidence: 0.9, maxExpansionDepth: 2 });

    const result = await simulateConvergenceLoop({
      parentId: 'app',
      parentProduces: ['dist/app.js'],
      parentConsumes: ['src/app.ts'],
      parentValidate: [rule],
      maxDepth: 2,
      judgmentRounds: [
        [judgment('app works correctly', 0.50)],  // depth 0: fails, expand
        [judgment('app works correctly', 0.70)],  // depth 1: improved but still fails, expand
        [judgment('app works correctly', 0.85)],  // depth 2: fails, but expandOnFail=false → bare rejection
      ],
    });

    // The fix node at depth 2 has expandOnFail: false, so extractIntentFailures returns 0 expandable failures
    // In the actual CLI (cmdComplete), the depth check happens before expansion, yielding escalation.
    // At the library level, the depth manifests as expandOnFail: false on the fix node.
    expect(result.result).toBe('bare-rejection');
    expect(result.totalExpansions).toBe(2);
  });

  it('cmdComplete escalates at depth via explicit depth check (simulated)', () => {
    // This tests the cmdComplete path: when currentDepth >= maxDepth, escalate directly.
    // cmdComplete reads _intentDiagnosis.expansionDepth and compares to maxExpansionDepth.
    const history = [
      { depth: 0, confidence: 0.50 },
      { depth: 1, confidence: 0.70 },
    ];
    const currentDepth = 2;
    const maxDepth = 2;

    // cmdComplete checks: currentDepth >= maxDepth → escalate
    expect(currentDepth >= maxDepth).toBe(true);
    const escalation = buildEscalation('app', 'app works correctly', history, 'depth-exceeded');
    expect(escalation.status).toBe('escalated');
    expect(escalation.reason).toBe('depth-exceeded');
  });

  it('fix nodes at max depth have expandOnFail: false', () => {
    const rule = intentRule({ expandOnFail: true, maxExpansionDepth: 2 });
    const failure: IntentFailure = {
      statement: 'app works', threshold: 0.9, achieved: 0.5,
      reasoning: 'test', evidence: ['a.ts:1'], rule,
    };

    // Depth 1 → maxDepth 2 → next would be depth 2 which is >= maxDepth → expandOnFail false
    const expansion = generateIntentExpansion('parent', [], [], undefined, [], [failure], 1);
    const fixIntent = expansion.fixNodes[0].validate[0] as any;
    expect(fixIntent.expandOnFail).toBe(false);
  });
});

describe('convergence loop: multiple failing intents', () => {
  it('generates one fix node per failing intent', async () => {
    const ruleA = intentRule({ statement: 'renders correctly', expandOnFail: true });
    const ruleB = intentRule({ statement: 'dark mode works', expandOnFail: true });

    const dagNodes: Record<string, any> = {
      init: node('init', { produces: ['init.txt'] }),
      app: node('app', { deps: ['init'], produces: ['dist/app.js'], validate: [ruleA, ruleB] }),
    };

    const g = define(graph({
      id: 'multi', desc: 'multi intent', init: 'init', term: 'app',
      nodes: dagNodes as any,
    }));

    const judgments = [
      judgment('renders correctly', 0.65),
      judgment('dark mode works', 0.70),
    ];

    const result = await validateNode(g, 'app', () => true, { intentJudgments: judgments });
    expect(result.passed).toBe(false);
    expect(result.expansionStatus).toBe('expanding');

    const failures = extractIntentFailures(result.checks, judgments);
    expect(failures).toHaveLength(2);

    const expansion = generateIntentExpansion(
      'app', ['dist/app.js'], ['src/app.ts'], undefined, [ruleA, ruleB], failures, 0,
    );
    expect(expansion.fixNodes).toHaveLength(2);
    expect(expansion.fixNodes[0].id).toBe('app-fix-0');
    expect(expansion.fixNodes[1].id).toBe('app-fix-1');
    // Each fix node targets one statement
    expect((expansion.fixNodes[0].validate[0] as any).statement).toBe('renders correctly');
    expect((expansion.fixNodes[1].validate[0] as any).statement).toBe('dark mode works');
  });
});

describe('convergence loop: mixed expandOnFail and bare intent failures', () => {
  it('only expands for expandOnFail intents; bare failures remain as rejection', async () => {
    const ruleExpand = intentRule({ statement: 'expand this', expandOnFail: true });
    const ruleBare = intentRule({ statement: 'bare fail', expandOnFail: false });

    const dagNodes: Record<string, any> = {
      init: node('init'),
      app: node('app', { deps: ['init'], validate: [ruleExpand, ruleBare] }),
    };

    const g = define(graph({
      id: 'mixed', desc: 'mixed', init: 'init', term: 'app',
      nodes: dagNodes as any,
    }));

    const judgments = [
      judgment('expand this', 0.5),
      judgment('bare fail', 0.5),
    ];

    const result = await validateNode(g, 'app', () => true, { intentJudgments: judgments });
    expect(result.passed).toBe(false);
    expect(result.expansionStatus).toBe('expanding');

    // Only expandOnFail failures generate fix nodes
    const failures = extractIntentFailures(result.checks, judgments);
    expect(failures).toHaveLength(1);
    expect(failures[0].statement).toBe('expand this');
  });
});

describe('convergence loop: escalation output structure', () => {
  it('escalation includes full convergence history', () => {
    const history = [
      { depth: 0, confidence: 0.50 },
      { depth: 1, confidence: 0.65 },
      { depth: 2, confidence: 0.67 }, // stalled
    ];
    const esc = buildEscalation('app', 'app renders correctly', history, 'stalled');

    expect(esc.status).toBe('escalated');
    expect(esc.node).toBe('app');
    expect(esc.statement).toBe('app renders correctly');
    expect(esc.history).toEqual(history);
    expect(esc.reason).toBe('stalled');
    expect(esc.diagnosis).toContain('stalled');
    expect(esc.diagnosis).toContain('0.67');
  });

  it('depth-exceeded escalation includes depth info', () => {
    const history = [
      { depth: 0, confidence: 0.50 },
      { depth: 1, confidence: 0.70 },
      { depth: 2, confidence: 0.85 },
    ];
    const esc = buildEscalation('app', 'app works', history, 'depth-exceeded');

    expect(esc.reason).toBe('depth-exceeded');
    expect(esc.diagnosis).toContain('Maximum expansion depth');
    expect(esc.diagnosis).toContain('3'); // history length
  });
});

describe('convergence loop: fix node provenance chain', () => {
  it('recursive expansion creates correct provenance chain', () => {
    const rule = intentRule({ expandOnFail: true, maxExpansionDepth: 4 });
    const failure: IntentFailure = {
      statement: 'app works', threshold: 0.9, achieved: 0.5,
      reasoning: 'test', evidence: ['a.ts:1'], rule,
    };

    // First expansion: depth 0 → 1
    const exp0 = generateIntentExpansion('app', ['out.ts'], ['in.ts'], undefined, [rule], [failure], 0);
    expect(exp0.fixNodes[0].id).toBe('app-fix-0');
    expect(exp0.fixNodes[0].expandedFrom).toBe('app');
    expect(exp0.fixNodes[0]._intentDiagnosis.expansionDepth).toBe(1);

    // Second expansion: depth 1 → 2
    const exp1 = generateIntentExpansion('app-fix-0', ['out.ts'], ['out.ts'], undefined, exp0.fixNodes[0].validate, [failure], 1);
    expect(exp1.fixNodes[0].id).toBe('app-fix-0-fix-0');
    expect(exp1.fixNodes[0].expandedFrom).toBe('app-fix-0');
    expect(exp1.fixNodes[0]._intentDiagnosis.expansionDepth).toBe(2);

    // Third expansion: depth 2 → 3
    const exp2 = generateIntentExpansion('app-fix-0-fix-0', ['out.ts'], ['out.ts'], undefined, exp1.fixNodes[0].validate, [failure], 2);
    expect(exp2.fixNodes[0].id).toBe('app-fix-0-fix-0-fix-0');
    expect(exp2.fixNodes[0]._intentDiagnosis.expansionDepth).toBe(3);

    // At depth 3 (= maxDepth 4 - 1), expandOnFail still true
    expect((exp2.fixNodes[0].validate[0] as any).expandOnFail).toBe(true);

    // Fourth expansion: depth 3 → 4, which is maxDepth → expandOnFail false
    const exp3 = generateIntentExpansion('app-fix-0-fix-0-fix-0', ['out.ts'], ['out.ts'], undefined, exp2.fixNodes[0].validate, [failure], 3);
    expect((exp3.fixNodes[0].validate[0] as any).expandOnFail).toBe(false);
    expect(exp3.fixNodes[0]._intentDiagnosis.expansionDepth).toBe(4);
  });
});
