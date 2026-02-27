import { describe, it, expect } from 'vitest';
import {
  isInitGateFailure, extractPlanClarityGaps, generateInitGateExpansion,
} from '../src/lib/intent-expansion.ts';
import type { IntentFailure, PlanClarityGap } from '../src/lib/intent-expansion.ts';
import type { ValidationRule, IntentJudgment } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function intentRule(overrides: Partial<{
  statement: string;
  confidence: number;
  expandOnFail: boolean;
  maxExpansionDepth: number;
}> = {}): ValidationRule & { type: 'intent' } {
  return {
    type: 'intent',
    statement: overrides.statement ?? 'Plan is unambiguous and executable',
    confidence: overrides.confidence ?? 0.95,
    evaluator: 'self',
    expandOnFail: overrides.expandOnFail ?? true,
    maxExpansionDepth: overrides.maxExpansionDepth,
  };
}

function makeFailure(overrides: Partial<IntentFailure> = {}): IntentFailure {
  return {
    statement: 'Plan is unambiguous and executable',
    threshold: 0.95,
    achieved: 0.60,
    reasoning: 'node-api produces are vague; missing validation on node-db; overlapping ownership on schema',
    evidence: ['src/nodes.ts:45', 'spec.md:section-data-layer'],
    rule: intentRule(),
    ...overrides,
  };
}

// ── isInitGateFailure ──────────────────────────────────────────────────────────

describe('isInitGateFailure', () => {
  it('detects plan clarity failures', () => {
    const failure = makeFailure({ statement: 'Plan is unambiguous and executable' });
    expect(isInitGateFailure(failure)).toBe(true);
  });

  it('detects "clear" keyword', () => {
    const failure = makeFailure({ statement: 'Plan must be clear and testable' });
    expect(isInitGateFailure(failure)).toBe(true);
  });

  it('detects "concrete" keyword', () => {
    const failure = makeFailure({ statement: 'All produces must be concrete file paths' });
    expect(isInitGateFailure(failure)).toBe(true);
  });

  it('detects "resolvable" keyword', () => {
    const failure = makeFailure({ statement: 'All consumes must be resolvable by predecessors' });
    expect(isInitGateFailure(failure)).toBe(true);
  });

  it('detects "produces" keyword in context', () => {
    const failure = makeFailure({ statement: 'Node produces are ambiguous' });
    expect(isInitGateFailure(failure)).toBe(true);
  });

  it('detects "consumes" keyword in context', () => {
    const failure = makeFailure({ statement: 'Consumes references invalid artifacts' });
    expect(isInitGateFailure(failure)).toBe(true);
  });

  it('rejects non-plan failures', () => {
    const failure = makeFailure({ statement: 'Dark mode works correctly' });
    expect(isInitGateFailure(failure)).toBe(false);
  });

  it('rejects "app correctness" intent', () => {
    const failure = makeFailure({ statement: 'Application launches and renders correctly' });
    expect(isInitGateFailure(failure)).toBe(false);
  });
});

// ── extractPlanClarityGaps ───────────────────────────────────────────────────────

describe('extractPlanClarityGaps', () => {
  it('extracts VagueProduces gap', () => {
    const failure = makeFailure({
      reasoning: 'node-api produces are vague: ["output"] instead of concrete paths',
      evidence: ['node-api produces vague placeholders'],
    });
    const gaps = extractPlanClarityGaps(failure);
    expect(gaps.some(g => g.type === 'VagueProduces')).toBe(true);
  });

  it('extracts UnresolvableConsumes gap', () => {
    const failure = makeFailure({
      reasoning: 'node-handler consumes "src/db.ts" but no producer exists',
      evidence: ['no producer for src/db.ts'],
    });
    const gaps = extractPlanClarityGaps(failure);
    expect(gaps.some(g => g.type === 'UnresolvableConsumes')).toBe(true);
  });

  it('extracts NoValidate gap', () => {
    const failure = makeFailure({
      reasoning: 'node-schema has no validate rules defined',
      evidence: ['validate array is empty'],
    });
    const gaps = extractPlanClarityGaps(failure);
    expect(gaps.some(g => g.type === 'NoValidate')).toBe(true);
  });

  it('extracts OwnershipConflict gap', () => {
    const failure = makeFailure({
      reasoning: 'overlapping ownership: node-a and node-b both produce src/schema.ts',
      evidence: ['duplicate produces in node-a and node-b'],
    });
    const gaps = extractPlanClarityGaps(failure);
    expect(gaps.some(g => g.type === 'OwnershipConflict')).toBe(true);
  });

  it('extracts BroadScope gap', () => {
    const failure = makeFailure({
      reasoning: 'node-setup scope too broad: builds database AND creates API AND configures middleware',
      evidence: ['node description has multiple "and" concerns'],
    });
    const gaps = extractPlanClarityGaps(failure);
    expect(gaps.some(g => g.type === 'BroadScope')).toBe(true);
  });

  it('returns default VagueProduces when no specific pattern matches', () => {
    const failure = makeFailure({
      reasoning: 'Something unclear about the plan',
      evidence: ['no specifics given'],
    });
    const gaps = extractPlanClarityGaps(failure);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].type).toBe('VagueProduces');
  });

  it('can extract multiple gaps from same failure', () => {
    const failure = makeFailure({
      reasoning: 'node-api has vague produces and missing validation rules and overlapping ownership',
      evidence: ['multiple issues found'],
    });
    const gaps = extractPlanClarityGaps(failure);
    expect(gaps.length).toBeGreaterThan(1);
  });
});

// ── generateInitGateExpansion ───────────────────────────────────────────────────

describe('generateInitGateExpansion', () => {
  it('generates one clarify node per gap', () => {
    const failure = makeFailure({
      reasoning: 'vague produces and missing validate and ownership conflict',
      evidence: ['multiple clarity issues'],
    });
    const result = generateInitGateExpansion(
      'gate', ['plan.md'], [], undefined, [], failure, 0,
    );

    expect(result.status).toBe('expanding');
    expect(result.fixNodes.length).toBeGreaterThan(0);
    expect(result.depth).toBe(1);
  });

  it('fix node ID format: parentId-clarify-index', () => {
    const failure = makeFailure();
    const result = generateInitGateExpansion('init-gate', [], [], undefined, [], failure, 0);
    const ids = result.fixNodes.map(n => n.id);
    expect(ids.every(id => id.startsWith('init-gate-clarify-'))).toBe(true);
  });

  it('fix node has expandedFrom = parent ID', () => {
    const failure = makeFailure();
    const result = generateInitGateExpansion('parent-gate', [], [], undefined, [], failure, 0);
    expect(result.fixNodes.every(n => n.expandedFrom === 'parent-gate')).toBe(true);
  });

  it('VagueProduces fix node produces concrete file paths', () => {
    const failure = makeFailure({
      reasoning: 'produces are vague placeholders',
      evidence: ['node produces ["database"] not ["schema.ts", "crud.ts"]'],
    });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    const vagueFixNode = result.fixNodes.find(n => n._intentDiagnosis.statement.includes('VagueProduces'));
    if (vagueFixNode) {
      expect(vagueFixNode.produces).toContain('schema.ts');
      expect(vagueFixNode.produces).toContain('crud.ts');
      expect(vagueFixNode.produces).toContain('migration.ts');
    }
  });

  it('UnresolvableConsumes fix node produces producer backlink', () => {
    const failure = makeFailure({
      reasoning: 'consumes src/db.ts but no producer',
      evidence: ['unresolvable artifact'],
    });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    const unresolvedFixNode = result.fixNodes.find(n => n._intentDiagnosis.statement.includes('UnresolvableConsumes'));
    if (unresolvedFixNode) {
      expect(unresolvedFixNode.produces).toContain('producer-backlink.ts');
    }
  });

  it('NoValidate fix node produces validation rules', () => {
    const failure = makeFailure({
      reasoning: 'no validate rules on node',
      evidence: ['missing validation'],
    });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    const validateFixNode = result.fixNodes.find(n => n._intentDiagnosis.statement.includes('NoValidate'));
    if (validateFixNode) {
      expect(validateFixNode.produces).toContain('validate-rules.ts');
    }
  });

  it('OwnershipConflict fix node produces reassignment doc', () => {
    const failure = makeFailure({
      reasoning: 'overlapping ownership',
      evidence: ['multiple nodes claim same output'],
    });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    const conflictFixNode = result.fixNodes.find(n => n._intentDiagnosis.statement.includes('OwnershipConflict'));
    if (conflictFixNode) {
      expect(conflictFixNode.produces).toContain('ownership-reassignment.md');
    }
  });

  it('BroadScope fix node produces decomposed spec', () => {
    const failure = makeFailure({
      reasoning: 'scope too broad, covers multiple concerns',
      evidence: ['multiple "and" in description'],
    });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    const scopeFixNode = result.fixNodes.find(n => n._intentDiagnosis.statement.includes('BroadScope'));
    if (scopeFixNode) {
      expect(scopeFixNode.produces).toContain('decomposed-spec.md');
    }
  });

  it('fix node intent is "Plan is now clear for: <GapType>"', () => {
    const failure = makeFailure();
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    expect(result.fixNodes.length).toBeGreaterThan(0);
    for (const node of result.fixNodes) {
      const intentRule = node.validate[0];
      expect(intentRule?.type).toBe('intent');
      expect((intentRule as any)?.statement).toContain('Plan is now clear for:');
    }
  });

  it('fix node confidence threshold is 0.95 (high bar)', () => {
    const failure = makeFailure();
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    expect(result.fixNodes.length).toBeGreaterThan(0);
    for (const node of result.fixNodes) {
      const intentRule = node.validate[0];
      expect((intentRule as any)?.confidence).toBe(0.95);
    }
  });

  it('fix node consumes parent produces when present', () => {
    const result = generateInitGateExpansion(
      'gate', ['plan.md', 'nodes.json'], [], undefined, [], makeFailure(), 0,
    );
    expect(result.fixNodes.every(n => n.consumes.includes('plan.md'))).toBe(true);
    expect(result.fixNodes.every(n => n.consumes.includes('nodes.json'))).toBe(true);
  });

  it('fix node inherits parent ambient', () => {
    const result = generateInitGateExpansion(
      'gate', [], [], ['spec.md', 'config.json'], [], makeFailure(), 0,
    );
    expect(result.fixNodes.every(n => n.ambient?.includes('spec.md'))).toBe(true);
    expect(result.fixNodes.every(n => n.ambient?.includes('config.json'))).toBe(true);
  });

  it('fix node carries deterministic rules from parent (not intent)', () => {
    const parentValidate: ValidationRule[] = [
      { type: 'artifact-exists', target: 'plan.md' },
      { type: 'shell', command: 'tsc --noEmit' },
      intentRule({ statement: 'other intent' }),
    ];
    const result = generateInitGateExpansion('gate', [], [], undefined, parentValidate, makeFailure(), 0);

    for (const fixNode of result.fixNodes) {
      // First: the plan clarity intent
      expect(fixNode.validate[0].type).toBe('intent');
      // Then: deterministic rules only (artifact-exists, shell)
      expect(fixNode.validate[1].type).toBe('artifact-exists');
      expect(fixNode.validate[2].type).toBe('shell');
      // No other intent rules
      expect(fixNode.validate.filter(r => r.type === 'intent')).toHaveLength(1);
    }
  });

  it('fix node expandOnFail = true when depth + 1 < maxDepth', () => {
    const failure = makeFailure({ rule: intentRule({ maxExpansionDepth: 3 }) });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    const fixIntentRule = result.fixNodes[0]?.validate[0] as any;
    expect(fixIntentRule?.expandOnFail).toBe(true);
  });

  it('fix node expandOnFail = false when depth + 1 >= maxDepth', () => {
    const failure = makeFailure({ rule: intentRule({ maxExpansionDepth: 2 }) });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 1);
    const fixIntentRule = result.fixNodes[0]?.validate[0] as any;
    expect(fixIntentRule?.expandOnFail).toBe(false);
  });

  it('carries _intentDiagnosis with gap detail as evidence', () => {
    const failure = makeFailure({
      reasoning: 'vague produces and no validate',
      evidence: ['multiple issues'],
    });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);
    for (const node of result.fixNodes) {
      const diag = node._intentDiagnosis;
      expect(diag.statement).toContain('Clarify:');
      expect(diag.expansionDepth).toBe(1);
      expect(diag.evidence.length).toBeGreaterThan(0);
    }
  });
});

// ── Fallback: non-init-gate intent uses standard expansion ──────────────────────

describe('generateInitGateExpansion fallback', () => {
  it('falls back to standard expansion for non-plan-clarity failures', () => {
    const failure = makeFailure({
      statement: 'Dark mode works correctly',
      reasoning: 'CSS is incomplete',
      evidence: ['styles.css:10'],
    });
    const result = generateInitGateExpansion('component', ['out.ts'], [], undefined, [], failure, 0);

    // Should generate standard intent fix, not clarity fix
    expect(result.status).toBe('expanding');
    expect(result.fixNodes).toHaveLength(1);
    // ID should still be parent-fix-index (standard format)
    expect(result.fixNodes[0].id).toBe('component-fix-0');
  });
});

// ── Recursive clarity expansion ──────────────────────────────────────────────────

describe('recursive clarity expansion', () => {
  it('clarity fix node can fail and expand further', () => {
    const failure = makeFailure();
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 0);

    // depth=0, so depth+1=1 < maxDepth=3 → expandOnFail = true
    for (const fixNode of result.fixNodes) {
      const intentRule = fixNode.validate[0] as any;
      expect(intentRule?.expandOnFail).toBe(true);
      expect(intentRule?.maxExpansionDepth).toBeUndefined(); // inherits from parent
    }
  });

  it('second-level clarity expansion stops expanding at depth 2 when maxDepth=3', () => {
    const failure = makeFailure({ rule: intentRule({ maxExpansionDepth: 3 }) });
    const result = generateInitGateExpansion('gate', [], [], undefined, [], failure, 2);

    // depth=2, so depth+1=3 >= maxDepth=3 → expandOnFail = false
    for (const fixNode of result.fixNodes) {
      const intentRule = fixNode.validate[0] as any;
      expect(intentRule?.expandOnFail).toBe(false);
    }
  });
});
