import { describe, it, expect } from 'vitest';
import { runAudit } from '../src/lib/terminal-audit/validator.ts';
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
  it('detects gaps in gappy DAG', () => {
    const ctx = runAudit(gappyDAG, new Map(), () => true);
    expect(ctx.detected.gaps.length).toBeGreaterThan(0);
    // No prompts field — just computed + detected
    expect(ctx).toHaveProperty('computed');
    expect(ctx).toHaveProperty('detected');
    expect(Object.keys(ctx)).toEqual(['computed', 'detected']);
  });

  it('returns clean detection for clean DAG', () => {
    const ctx = runAudit(cleanDAG, new Map(), () => true);
    expect(ctx).toHaveProperty('computed');
    expect(ctx).toHaveProperty('detected');
  });

  it('computed report populated from records', () => {
    const records = makeRecords(
      { nodeId: 'work', checks: [{ rule: 'shell:npm test', passed: true, evidence: 'ok' }] },
    );
    const ctx = runAudit(cleanDAG, records, () => true);
    expect(ctx.computed.testEvidence.length).toBeGreaterThan(0);
    expect(ctx.computed.commitStatus.length).toBeGreaterThan(0);
  });
});
