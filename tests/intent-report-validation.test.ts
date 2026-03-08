import { describe, it, expect } from 'vitest';
import { validateReport, isReportPrompt, REQUIRED_SECTIONS } from '../src/lib/intent/report-validation.ts';
import { validateNode } from '../src/lib/protocol/validation.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

// -- Unit tests for report-validation module --

describe('validateReport', () => {
  const VALID_REPORT = [
    '1. COMMIT STATUS: All files committed. src/foo.ts at abc123.',
    '2. TEST EVIDENCE: vitest run passed 12/12.',
    '3. UNVALIDATED ASSUMPTIONS: None identified.',
    '4. FAILURE SURFACE: Empty input to parser in node parse-spec.',
    '5. SCOPE DECISIONS: Deferred dashboard to next phase.',
    '6. AUDIT TRAIL: trail.jsonl, completed.json, test output.',
  ].join('\n');

  it('accepts a valid report with all 6 sections', () => {
    const result = validateReport(VALID_REPORT);
    expect(result.valid).toBe(true);
    expect(result.missingSections).toEqual([]);
    expect(result.emptySections).toEqual([]);
    expect(result.sections).toHaveLength(6);
  });

  it('rejects when a section is missing', () => {
    const partial = VALID_REPORT.replace(/^.*AUDIT TRAIL.*$/m, '');
    const result = validateReport(partial);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toContain('AUDIT TRAIL');
  });

  it('rejects when a section is present but empty', () => {
    const emptySection = VALID_REPORT.replace(
      /FAILURE SURFACE:.*$/m,
      'FAILURE SURFACE:',
    );
    const result = validateReport(emptySection);
    expect(result.valid).toBe(false);
    expect(result.emptySections).toContain('FAILURE SURFACE');
  });

  it('handles sections without numbering prefix', () => {
    const unnumbered = [
      'COMMIT STATUS: done.',
      'TEST EVIDENCE: passed.',
      'UNVALIDATED ASSUMPTIONS: none.',
      'FAILURE SURFACE: none.',
      'SCOPE DECISIONS: none.',
      'AUDIT TRAIL: logs.',
    ].join('\n');
    expect(validateReport(unnumbered).valid).toBe(true);
  });

  it('is case-insensitive on section headers', () => {
    const lower = [
      '1. commit status: done.',
      '2. test evidence: passed.',
      '3. unvalidated assumptions: none.',
      '4. failure surface: none.',
      '5. scope decisions: none.',
      '6. audit trail: logs.',
    ].join('\n');
    expect(validateReport(lower).valid).toBe(true);
  });

  it('rejects completely empty input', () => {
    const result = validateReport('');
    expect(result.valid).toBe(false);
    expect(result.missingSections).toHaveLength(6);
  });

  it('rejects freeform text without section headers', () => {
    const result = validateReport('Everything looks good, all tests pass and code is committed.');
    expect(result.valid).toBe(false);
    expect(result.missingSections).toHaveLength(6);
  });

  it('reports multiple missing sections', () => {
    const partial = [
      '1. COMMIT STATUS: done.',
      '2. TEST EVIDENCE: passed.',
    ].join('\n');
    const result = validateReport(partial);
    expect(result.valid).toBe(false);
    expect(result.missingSections).toHaveLength(4);
  });
});

describe('isReportPrompt', () => {
  it('detects the terminal report prompt', () => {
    const prompt =
      'Provide a completion report:\n' +
      '1. COMMIT STATUS: Are all produces committed?\n' +
      '2. TEST EVIDENCE: What tests ran?\n' +
      '3. UNVALIDATED ASSUMPTIONS: What has no validator?\n' +
      '4. FAILURE SURFACE: What would break?\n' +
      '5. SCOPE DECISIONS: What was excluded?\n' +
      '6. AUDIT TRAIL: What artifacts exist?';
    expect(isReportPrompt(prompt)).toBe(true);
  });

  it('returns false for generic prompts', () => {
    expect(isReportPrompt('Why did you choose this approach?')).toBe(false);
  });

  it('returns false for prompts with only 1-2 section names', () => {
    expect(isReportPrompt('Describe the COMMIT STATUS and overall quality')).toBe(false);
  });
});

// -- Integration: validateNode with structured report validation --

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

const VALID_ANSWER = [
  '1. COMMIT STATUS: All committed at abc123.',
  '2. TEST EVIDENCE: 5/5 vitest tests pass.',
  '3. UNVALIDATED ASSUMPTIONS: None.',
  '4. FAILURE SURFACE: Malformed JSON input to parser.',
  '5. SCOPE DECISIONS: Deferred telemetry.',
  '6. AUDIT TRAIL: trail.jsonl, completed.json.',
].join('\n');

describe('validateNode with report prompts', () => {
  const dag = buildDAG({
    init: { id: 'init', produces: ['init.marker'] },
    term: {
      id: 'term',
      deps: ['init'],
      validate: [{
        type: 'intent',
        statement: 'Work is complete',
        confidence: 0.8,
        evaluator: 'self' as const,
        prompt: REPORT_PROMPT,
      }],
    },
  });

  it('passes with valid structured report', async () => {
    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Work is complete',
        confidence: 0.95,
        reasoning: 'All done',
        promptAnswers: [VALID_ANSWER],
      }],
    });
    expect(result.passed).toBe(true);
  });

  it('fails when report is missing sections', async () => {
    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Work is complete',
        confidence: 0.95,
        reasoning: 'All done',
        promptAnswers: ['1. COMMIT STATUS: done.\n2. TEST EVIDENCE: passed.'],
      }],
    });
    expect(result.passed).toBe(false);
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck?.evidence).toContain('report validation failed');
    expect(intentCheck?.evidence).toContain('missing');
  });

  it('fails when report has empty sections', async () => {
    const emptyAnswer = [
      '1. COMMIT STATUS: done.',
      '2. TEST EVIDENCE: passed.',
      '3. UNVALIDATED ASSUMPTIONS:',
      '4. FAILURE SURFACE: none.',
      '5. SCOPE DECISIONS: none.',
      '6. AUDIT TRAIL: logs.',
    ].join('\n');
    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Work is complete',
        confidence: 0.95,
        reasoning: 'All done',
        promptAnswers: [emptyAnswer],
      }],
    });
    expect(result.passed).toBe(false);
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck?.evidence).toContain('empty');
  });

  it('fails with freeform text (no section headers)', async () => {
    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Work is complete',
        confidence: 0.95,
        reasoning: 'All done',
        promptAnswers: ['Everything is done and works great.'],
      }],
    });
    expect(result.passed).toBe(false);
  });

  it('still rejects when promptAnswers count is insufficient', async () => {
    const result = await validateNode(dag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Work is complete',
        confidence: 0.95,
        reasoning: 'All done',
        promptAnswers: [],
      }],
    });
    expect(result.passed).toBe(false);
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck?.evidence).toContain('reflection prompts required');
  });

  it('passes non-report prompts with non-empty answer', async () => {
    const genericDag = buildDAG({
      init: { id: 'init', produces: ['init.marker'] },
      term: {
        id: 'term',
        deps: ['init'],
        validate: [{
          type: 'intent',
          statement: 'Approach is sound',
          confidence: 0.8,
          evaluator: 'self' as const,
          prompt: ['Why did you choose this approach?'],
        }],
      },
    });
    const result = await validateNode(genericDag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Approach is sound',
        confidence: 0.9,
        reasoning: 'Good approach',
        promptAnswers: ['I chose this because it minimizes coupling.'],
      }],
    });
    expect(result.passed).toBe(true);
  });

  it('rejects non-report prompts with empty answer', async () => {
    const genericDag = buildDAG({
      init: { id: 'init', produces: ['init.marker'] },
      term: {
        id: 'term',
        deps: ['init'],
        validate: [{
          type: 'intent',
          statement: 'Approach is sound',
          confidence: 0.8,
          evaluator: 'self' as const,
          prompt: ['Why did you choose this approach?'],
        }],
      },
    });
    const result = await validateNode(genericDag, 'term', () => true, {
      intentJudgments: [{
        statement: 'Approach is sound',
        confidence: 0.9,
        reasoning: 'Good approach',
        promptAnswers: ['   '],
      }],
    });
    expect(result.passed).toBe(false);
    const intentCheck = result.checks.find(c => c.rule.type === 'intent');
    expect(intentCheck?.evidence).toContain('empty');
  });
});
