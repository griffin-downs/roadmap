import { describe, it, expect } from 'vitest';
import { CompletionStore } from '../src/lib/completion-context.ts';
import { orient, parallelOrder } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

function makeDag(): Graph<string> {
  return {
    id: 'test-remaining',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      'task-a': { id: 'task-a', desc: 'exec task', produces: ['a.ts'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      'plan-b': { id: 'plan-b', desc: 'plan task', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: true, mode: 'plan' as const },
      'task-c': { id: 'task-c', desc: 'depends on a+b', produces: ['c.ts'], consumes: [], deps: ['task-a', 'plan-b'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['task-c'], validate: [], idempotent: true },
    } as any,
  };
}

// Mirrors cmdRemaining logic
function computeRemaining(
  dag: Graph<string>,
  completion: CompletionStore,
  retired: Set<string>,
  includeNonExec: boolean,
) {
  const pos = orient(dag, completion, retired);
  const doneSet = new Set(pos.done);
  const remaining = [...pos.batchRemaining, ...pos.remaining];

  return remaining
    .filter(id => !retired.has(id))
    .filter(id => {
      const node = (dag.nodes as Record<string, any>)[id];
      if (!node) return false;
      const mode = node.mode ?? 'execute';
      return includeNonExec || mode !== 'plan';
    })
    .map(id => {
      const node = (dag.nodes as Record<string, any>)[id];
      const deps: string[] = node.deps ?? [];
      const blockers = deps.filter((d: string) => !doneSet.has(d) && !retired.has(d));
      return {
        id,
        mode: node.mode ?? 'execute',
        blockedBy: blockers.length > 0 ? blockers.join(', ') : 'unblocked',
        state: completion.hasFailing(id) ? 'failed' : 'pending',
      };
    });
}

describe('remaining command logic', () => {
  it('lists only execute nodes by default', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const results = computeRemaining(dag, completion, new Set(), false);
    const ids = results.map(r => r.id);
    expect(ids).toContain('task-a');
    expect(ids).not.toContain('plan-b');
  });

  it('includes plan nodes with --include-nonexec', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const results = computeRemaining(dag, completion, new Set(), true);
    const ids = results.map(r => r.id);
    expect(ids).toContain('task-a');
    expect(ids).toContain('plan-b');
  });

  it('shows blocking deps', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const results = computeRemaining(dag, completion, new Set(), false);
    const taskC = results.find(r => r.id === 'task-c');
    expect(taskC).toBeDefined();
    expect(taskC!.blockedBy).toContain('task-a');
  });

  it('shows unblocked for nodes with all deps done', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const results = computeRemaining(dag, completion, new Set(), false);
    const taskA = results.find(r => r.id === 'task-a');
    expect(taskA).toBeDefined();
    expect(taskA!.blockedBy).toBe('unblocked');
  });

  it('excludes retired nodes', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const results = computeRemaining(dag, completion, new Set(['task-a']), false);
    const ids = results.map(r => r.id);
    expect(ids).not.toContain('task-a');
  });

  it('marks failed-receipt nodes as failed', () => {
    const dag = makeDag();
    const completion = CompletionStore.fromRecords([
      { nodeId: 'init', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'task-a', completedAt: '', validationChecks: [{ rule: 'shell', passed: false, evidence: 'exit 1' }] },
    ]);
    const results = computeRemaining(dag, completion, new Set(), false);
    const taskA = results.find(r => r.id === 'task-a');
    expect(taskA).toBeDefined();
    expect(taskA!.state).toBe('failed');
  });

  it('returns empty when all done', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init', 'task-a', 'plan-b', 'task-c', 'term']);
    const results = computeRemaining(dag, completion, new Set(), false);
    expect(results).toHaveLength(0);
  });
});
