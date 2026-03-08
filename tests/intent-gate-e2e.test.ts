import { describe, it, expect } from 'vitest';
import { validateNode } from '../src/lib/protocol/validation.ts';
import { collectMakeErrors } from '../src/lib/make-validation.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

// E2E: make a spec without init-boundary intent rules (passes),
// advance term with structured report (passes),
// advance term with malformed report (fails with section-level errors).

function buildDAG(nodeOverrides: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const [id, spec] of Object.entries(nodeOverrides)) {
    nodes[id] = {
      id, desc: 'test', produces: [], consumes: [], deps: [], validate: [], idempotent: true,
      ...spec,
    };
  }
  return { id: 'test', desc: 'test', init: 'init', term: 'term', nodes } as any;
}

const REPORT_PROMPT = [
  'Provide a completion report:\n' +
  '1. COMMIT STATUS: Are all produces committed?\n' +
  '2. TEST EVIDENCE: What tests ran?\n' +
  '3. UNVALIDATED ASSUMPTIONS: What has no validator?\n' +
  '4. FAILURE SURFACE: What would break?\n' +
  '5. SCOPE DECISIONS: What was excluded?\n' +
  '6. AUDIT TRAIL: What artifacts exist?',
];

describe('E2E: intent gate hardening', () => {
  // DAG without init-boundary intent rules — should pass make validation
  const dag = buildDAG({
    init: { id: 'init', produces: ['init.marker'], deps: [] },
    'setup-db': {
      id: 'setup-db',
      desc: 'Create database schema',
      produces: ['db/schema.sql'],
      consumes: ['init.marker'],
      deps: ['init'],
      validate: [{ type: 'shell', command: 'echo ok' }],
    },
    term: {
      id: 'term',
      desc: 'Terminal node',
      produces: [],
      consumes: ['db/schema.sql'],
      deps: ['setup-db'],
      validate: [{
        type: 'intent',
        statement: 'Database setup is complete and tested',
        confidence: 0.8,
        evaluator: 'self' as const,
        prompt: REPORT_PROMPT,
      }],
    },
  });

  it('make validates DAG without init-boundary intent rules (no hard block)', () => {
    const errors = collectMakeErrors(dag);
    // init-intent is a warning, not a hard block
    const hardErrors = errors.filter((e: any) => !(e as any).severity || (e as any).severity !== 'warning');
    // terminal-intent gate should not block since we have an intent validator on term
    // define/verify/check should pass for this well-formed DAG
    const structuralErrors = hardErrors.filter(e => e.gate === 'define' || e.gate === 'verify' || e.gate === 'check');
    expect(structuralErrors).toHaveLength(0);
  });

  it('advance term passes with valid structured report', async () => {
    const validAnswer = [
      '1. COMMIT STATUS: db/schema.sql committed at sha abc123.',
      '2. TEST EVIDENCE: schema validation test passes (echo ok exit 0).',
      '3. UNVALIDATED ASSUMPTIONS: Assumes PostgreSQL 14+.',
      '4. FAILURE SURFACE: Malformed SQL in schema.sql crashes psql.',
      '5. SCOPE DECISIONS: Seed data deferred to next phase.',
      '6. AUDIT TRAIL: schema.sql, trail.jsonl.',
    ].join('\n');

    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Database setup is complete and tested',
        confidence: 0.9,
        reasoning: 'Schema created and validated',
        promptAnswers: [validAnswer],
      }],
    });
    expect(result.passed).toBe(true);
  });

  it('advance term fails with malformed report — section-level errors', async () => {
    // Missing 4 sections, only has COMMIT STATUS and TEST EVIDENCE
    const malformed = [
      '1. COMMIT STATUS: committed.',
      '2. TEST EVIDENCE: tests pass.',
    ].join('\n');

    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Database setup is complete and tested',
        confidence: 0.9,
        reasoning: 'Looks done',
        promptAnswers: [malformed],
      }],
    });
    expect(result.passed).toBe(false);

    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck).toBeDefined();
    expect(intentCheck!.evidence).toContain('report validation failed');
    expect(intentCheck!.evidence).toContain('UNVALIDATED ASSUMPTIONS');
    expect(intentCheck!.evidence).toContain('FAILURE SURFACE');
    expect(intentCheck!.evidence).toContain('SCOPE DECISIONS');
    expect(intentCheck!.evidence).toContain('AUDIT TRAIL');
  });

  it('advance term fails with freeform prose instead of report', async () => {
    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Database setup is complete and tested',
        confidence: 0.95,
        reasoning: 'Confident',
        promptAnswers: ['All work is done, everything looks good and tests pass.'],
      }],
    });
    expect(result.passed).toBe(false);
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck!.evidence).toContain('report validation failed');
  });

  it('advance term fails when confidence is below threshold even with valid report', async () => {
    const validAnswer = [
      '1. COMMIT STATUS: done.',
      '2. TEST EVIDENCE: passed.',
      '3. UNVALIDATED ASSUMPTIONS: none.',
      '4. FAILURE SURFACE: none.',
      '5. SCOPE DECISIONS: none.',
      '6. AUDIT TRAIL: logs.',
    ].join('\n');

    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Database setup is complete and tested',
        confidence: 0.5, // below 0.8 threshold
        reasoning: 'Not confident',
        promptAnswers: [validAnswer],
      }],
    });
    expect(result.passed).toBe(false);
    // Should fail on confidence, not report structure
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck!.evidence).toContain('confidence=0.50');
  });

  it('advance term fails when no judgment provided (unevaluated)', async () => {
    const result = await validateNode(dag, 'term', () => true);
    expect(result.passed).toBe(false);
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck!.intentStatus).toBe('unevaluated');
    expect(intentCheck!.evidence).toContain('--evaluate-file');
  });
});
