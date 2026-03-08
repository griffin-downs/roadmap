import { describe, it, expect } from 'vitest';
import { runAudit, evaluateResponses, validateTerminalAudit } from '../src/lib/terminal-audit/validator.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';
import type { CompletionRecordWithEvidence } from '../src/lib/evidence/completion-evidence.ts';

function buildDAG(specs: Record<string, Partial<NodeSpec<string, any>>>): Graph<string> {
  const nodes: Record<string, any> = {};
  for (const [id, spec] of Object.entries(specs)) {
    nodes[id] = {
      id, desc: 'test', produces: [], consumes: [], deps: [], validate: [], idempotent: true,
      ...spec,
    };
  }
  return { id: 'test', desc: 'test', init: 'init', term: 'term', nodes } as any;
}

function makeRecords(...entries: Array<{ nodeId: string; checks?: Array<{ rule: string; passed: boolean; evidence: string }> }>): Map<string, CompletionRecordWithEvidence> {
  const m = new Map<string, CompletionRecordWithEvidence>();
  for (const e of entries) {
    m.set(e.nodeId, {
      nodeId: e.nodeId,
      completedAt: '2026-03-06T00:00:00Z',
      validationChecks: e.checks ?? [],
    });
  }
  return m;
}

// DAG with a gap: 'b' consumes 'src/a.ts' but nothing validates that artifact
const gappyDAG = buildDAG({
  init: { produces: ['init.marker'] },
  a: { produces: ['src/a.ts'], deps: ['init'] },
  b: {
    consumes: ['src/a.ts'], deps: ['a'], produces: ['src/b.ts'],
    validate: [{ type: 'shell', command: 'echo ok' }],
  },
  term: { consumes: ['src/b.ts'], deps: ['b'] },
});

// Clean DAG: all consumes validated, all produces tested
const cleanDAG = buildDAG({
  init: { produces: ['init.marker'] },
  work: {
    consumes: ['init.marker'], deps: ['init'], produces: ['src/out.ts'],
    validate: [
      { type: 'artifact-exists', path: 'src/out.ts' },
      { type: 'shell', command: 'npx tsc --noEmit src/out.ts' },
    ],
  },
  term: {
    consumes: ['src/out.ts'], deps: ['work'],
    validate: [{ type: 'artifact-exists', path: 'src/out.ts' }],
  },
});

describe('runAudit', () => {
  it('detects gaps and generates prompts', () => {
    const ctx = runAudit(gappyDAG, new Map(), () => true);
    expect(ctx.detected.gaps.length).toBeGreaterThan(0);
    expect(ctx.prompts.length).toBeGreaterThan(0);
    // Each prompt has a question
    for (const p of ctx.prompts) {
      expect(p.question.length).toBeGreaterThan(0);
      expect(p.id).toMatch(/^gap-\d+-/);
    }
  });

  it('returns empty prompts for clean DAG', () => {
    const ctx = runAudit(cleanDAG, new Map(), () => true);
    expect(ctx.prompts).toHaveLength(0);
  });
});

describe('evaluateResponses', () => {
  it('passes when all prompts are addressed', () => {
    const ctx = runAudit(gappyDAG, new Map(), () => true);
    const responses = ctx.prompts.map(p => ({
      promptId: p.id,
      answer: 'This is validated by the upstream producer node which always creates the file.',
    }));
    const result = evaluateResponses(ctx, responses);
    expect(result.passed).toBe(true);
    expect(result.unaddressed).toHaveLength(0);
  });

  it('fails when a prompt has no response', () => {
    const ctx = runAudit(gappyDAG, new Map(), () => true);
    // Only answer the first prompt
    const responses = ctx.prompts.length > 0
      ? [{ promptId: ctx.prompts[0].id, answer: 'Addressed with a real explanation here.' }]
      : [];
    const result = evaluateResponses(ctx, responses);
    if (ctx.prompts.length > 1) {
      expect(result.passed).toBe(false);
      expect(result.unaddressed.length).toBeGreaterThan(0);
    }
  });

  it('fails when response is a placeholder', () => {
    const ctx = runAudit(gappyDAG, new Map(), () => true);
    if (ctx.prompts.length === 0) return;
    const responses = ctx.prompts.map(p => ({
      promptId: p.id,
      answer: '<YOUR ANSWER>',
    }));
    const result = evaluateResponses(ctx, responses);
    expect(result.passed).toBe(false);
  });

  it('fails when response is too short', () => {
    const ctx = runAudit(gappyDAG, new Map(), () => true);
    if (ctx.prompts.length === 0) return;
    const responses = ctx.prompts.map(p => ({
      promptId: p.id,
      answer: 'ok',
    }));
    const result = evaluateResponses(ctx, responses);
    expect(result.passed).toBe(false);
  });
});

describe('validateTerminalAudit', () => {
  it('auto-passes when no gaps detected', () => {
    const result = validateTerminalAudit(
      cleanDAG, new Map(), () => true,
    );
    expect(result.passed).toBe(true);
    expect(result.prompts).toHaveLength(0);
  });

  it('fails with prompts when gaps exist and no responses given', () => {
    const result = validateTerminalAudit(
      gappyDAG, new Map(), () => true,
    );
    expect(result.passed).toBe(false);
    expect(result.prompts.length).toBeGreaterThan(0);
    expect(result.reason).toContain('gap(s) detected');
  });

  it('passes when gaps exist and all responses address them', () => {
    // First get the prompts
    const ctx = runAudit(gappyDAG, new Map(), () => true);
    const responses = ctx.prompts.map(p => ({
      promptId: p.id,
      answer: 'This artifact is created by the predecessor and guaranteed by DAG ordering.',
    }));
    const result = validateTerminalAudit(
      gappyDAG, new Map(), () => true, responses,
    );
    expect(result.passed).toBe(true);
  });

  it('computed report is always populated', () => {
    const records = makeRecords(
      { nodeId: 'work', checks: [{ rule: 'shell:npm test', passed: true, evidence: 'ok' }] },
    );
    const result = validateTerminalAudit(cleanDAG, records, () => true);
    expect(result.computed.testEvidence.length).toBeGreaterThan(0);
    expect(result.computed.commitStatus.length).toBeGreaterThan(0);
  });
});
