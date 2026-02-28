import { describe, it, expect } from 'vitest';
import { CompletionStore } from '../src/lib/completion-context.ts';
import type { Graph } from '../src/protocol.ts';

function makeDag(): Graph<string> {
  return {
    id: 'test-doctor',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      'task-a': { id: 'task-a', desc: 'a', produces: ['a.ts'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      'plan-b': { id: 'plan-b', desc: 'b', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: true, mode: 'plan' as const },
      term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['task-a', 'plan-b'], validate: [], idempotent: true },
    } as any,
  };
}

// Mirror cmdDoctor logic
function doctorCompletion(
  dag: Graph<string>,
  completion: CompletionStore,
  retired: Set<string>,
) {
  const dagNodeIds = new Set(Object.keys(dag.nodes));
  const storeIds = completion.allIds();
  const passingIds = completion.passingIds();
  const failingIds = completion.failingIds();

  const stale = [...storeIds].filter(id => !dagNodeIds.has(id));
  const skippedNodes = [...retired].filter(id => dagNodeIds.has(id));
  const staleRetired = [...retired].filter(id => !dagNodeIds.has(id));

  const pending: string[] = [];
  const planNodes: string[] = [];

  for (const id of dagNodeIds) {
    const node = (dag.nodes as Record<string, any>)[id];
    if (retired.has(id)) continue;
    if (node?.mode === 'plan') {
      planNodes.push(id);
      if (!completion.hasRecord(id)) pending.push(id);
      continue;
    }
    if (!completion.hasRecord(id)) pending.push(id);
  }

  const issues: string[] = [];
  if (stale.length > 0) issues.push(`stale completions: ${stale.join(', ')}`);
  if (staleRetired.length > 0) issues.push(`stale retired: ${staleRetired.join(', ')}`);
  if (failingIds.size > 0) issues.push(`failing: ${[...failingIds].join(', ')}`);

  return {
    nodeCount: dagNodeIds.size,
    completedCount: passingIds.size,
    failedCount: failingIds.size,
    pendingCount: pending.length,
    staleCount: stale.length,
    planCount: planNodes.length,
    skippedCount: skippedNodes.length,
    stale,
    pending,
    failed: [...failingIds],
    plan: planNodes,
    skipped: skippedNodes,
    staleRetired,
    issues,
    ok: issues.length === 0,
  };
}

describe('doctor completion', () => {
  it('reports clean state when everything is consistent', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init', 'task-a', 'plan-b', 'term']);
    const result = doctorCompletion(dag, completion, new Set());
    expect(result.ok).toBe(true);
    expect(result.completedCount).toBe(4);
    expect(result.pendingCount).toBe(0);
    expect(result.staleCount).toBe(0);
    expect(result.issues).toHaveLength(0);
  });

  it('detects pending nodes', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const result = doctorCompletion(dag, completion, new Set());
    expect(result.pendingCount).toBe(3); // task-a, plan-b, term
    expect(result.pending).toContain('task-a');
    expect(result.pending).toContain('plan-b');
    expect(result.pending).toContain('term');
  });

  it('detects stale completions (IDs not in DAG)', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init', 'task-a', 'plan-b', 'term', 'ghost-node']);
    const result = doctorCompletion(dag, completion, new Set());
    expect(result.staleCount).toBe(1);
    expect(result.stale).toEqual(['ghost-node']);
    expect(result.ok).toBe(false);
  });

  it('detects failing receipts', () => {
    const dag = makeDag();
    const completion = CompletionStore.fromRecords([
      { nodeId: 'init', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'task-a', completedAt: '', validationChecks: [{ rule: 'shell', passed: false, evidence: 'exit 1' }] },
    ]);
    const result = doctorCompletion(dag, completion, new Set());
    expect(result.failedCount).toBe(1);
    expect(result.failed).toEqual(['task-a']);
    expect(result.ok).toBe(false);
  });

  it('correctly labels plan nodes', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const result = doctorCompletion(dag, completion, new Set());
    expect(result.planCount).toBe(1);
    expect(result.plan).toContain('plan-b');
  });

  it('correctly labels skipped (retired) nodes', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const result = doctorCompletion(dag, completion, new Set(['task-a']));
    expect(result.skippedCount).toBe(1);
    expect(result.skipped).toEqual(['task-a']);
    // Retired nodes excluded from pending
    expect(result.pending).not.toContain('task-a');
  });

  it('detects stale retired entries (not in DAG)', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const result = doctorCompletion(dag, completion, new Set(['task-a', 'old-node']));
    expect(result.skippedCount).toBe(1); // only task-a is in DAG
    expect(result.staleRetired).toEqual(['old-node']);
  });

  it('empty completion store reports all nodes as pending', () => {
    const dag = makeDag();
    const completion = CompletionStore.empty();
    const result = doctorCompletion(dag, completion, new Set());
    expect(result.completedCount).toBe(0);
    expect(result.pendingCount).toBe(4);
  });
});
