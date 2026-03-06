import { describe, it, expect } from 'vitest';
import { computeReport } from '../src/lib/terminal-audit/computed.ts';
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

function makeRecord(nodeId: string, overrides?: Partial<CompletionRecordWithEvidence>): CompletionRecordWithEvidence {
  return {
    nodeId,
    completedAt: '2026-03-06T00:00:00.000Z',
    validationChecks: [],
    ...overrides,
  };
}

describe('computeReport', () => {
  it('returns empty sections for DAG with no completions', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      work: { produces: ['src/foo.ts'], consumes: ['init.marker'], deps: ['init'] },
      term: { consumes: ['src/foo.ts'], deps: ['work'] },
    });

    const result = computeReport(dag, new Map(), () => false);

    expect(result.commitStatus).toHaveLength(3);
    expect(result.testEvidence).toHaveLength(0);
    expect(result.auditTrail).toHaveLength(0);
  });

  it('commit status shows missing produces', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      work: { produces: ['src/a.ts', 'src/b.ts'], deps: ['init'] },
      term: { deps: ['work'] },
    });

    const exists = (f: string) => f === 'src/a.ts';
    const result = computeReport(dag, new Map(), exists);

    const workEntry = result.commitStatus.find(e => e.nodeId === 'work')!;
    expect(workEntry.produces).toEqual(['src/a.ts', 'src/b.ts']);
    expect(workEntry.missing).toEqual(['src/b.ts']);
  });

  it('commit status includes gitSha from completion record', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      work: { produces: ['src/a.ts'], deps: ['init'] },
      term: { deps: ['work'] },
    });

    const records = new Map<string, CompletionRecordWithEvidence>();
    records.set('work', makeRecord('work', { gitSha: 'abc123' }));

    const result = computeReport(dag, records, () => true);

    const workEntry = result.commitStatus.find(e => e.nodeId === 'work')!;
    expect(workEntry.gitSha).toBe('abc123');
  });

  it('extracts shell test evidence from completion checks', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      work: {
        produces: ['src/a.ts'], deps: ['init'],
        validate: [{ type: 'shell', command: 'npm test' }],
      },
      term: { deps: ['work'] },
    });

    const records = new Map<string, CompletionRecordWithEvidence>();
    records.set('work', makeRecord('work', {
      validationChecks: [
        { rule: 'shell:npm test', passed: true, evidence: 'exit 0' },
        { rule: 'artifact-exists:src/a.ts', passed: true, evidence: 'file exists' },
      ],
    }));

    const result = computeReport(dag, records, () => true);

    // Only shell rules appear in testEvidence
    expect(result.testEvidence).toHaveLength(1);
    expect(result.testEvidence[0].rule).toBe('shell:npm test');
    expect(result.testEvidence[0].passed).toBe(true);
  });

  it('builds audit trail with check counts', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      work: { produces: ['src/a.ts'], deps: ['init'] },
      term: { deps: ['work'] },
    });

    const records = new Map<string, CompletionRecordWithEvidence>();
    records.set('work', makeRecord('work', {
      gitSha: 'def456',
      branch: 'feat/x',
      validationChecks: [
        { rule: 'shell:npm test', passed: true, evidence: 'ok' },
        { rule: 'shell:npm run lint', passed: false, evidence: 'errors' },
        { rule: 'artifact-exists:src/a.ts', passed: true, evidence: 'file exists' },
      ],
    }));

    const result = computeReport(dag, records, () => true);

    expect(result.auditTrail).toHaveLength(1);
    const entry = result.auditTrail[0];
    expect(entry.nodeId).toBe('work');
    expect(entry.checksTotal).toBe(3);
    expect(entry.checksPassed).toBe(2);
    expect(entry.checksFailed).toBe(1);
    expect(entry.gitSha).toBe('def456');
    expect(entry.branch).toBe('feat/x');
  });

  it('handles nodes with no produces gracefully', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      plan: { mode: 'plan', produces: [], deps: ['init'] },
      term: { deps: ['plan'] },
    });

    const result = computeReport(dag, new Map(), () => false);

    const planEntry = result.commitStatus.find(e => e.nodeId === 'plan')!;
    expect(planEntry.produces).toEqual([]);
    expect(planEntry.missing).toEqual([]);
  });

  it('function: rule appears in testEvidence', () => {
    const dag = buildDAG({
      init: { produces: ['init.marker'] },
      work: { produces: ['out.ts'], deps: ['init'] },
      term: { deps: ['work'] },
    });

    const records = new Map<string, CompletionRecordWithEvidence>();
    records.set('work', makeRecord('work', {
      validationChecks: [
        { rule: 'function:validate', passed: true, evidence: 'ok' },
      ],
    }));

    const result = computeReport(dag, records, () => true);
    expect(result.testEvidence).toHaveLength(1);
    expect(result.testEvidence[0].rule).toBe('function:validate');
  });
});
