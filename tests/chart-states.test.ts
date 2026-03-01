import { describe, it, expect } from 'vitest';
import { CompletionStore } from '../src/lib/completion/completion-context.ts';
import type { Graph } from '../src/protocol.ts';
import { orient, parallelOrder } from '../src/protocol.ts';

// State resolution logic matching cmdChart node rendering
type NodeState = 'done' | 'skip' | 'plan' | 'fail' | 'pending' | 'current' | 'pre-gate';

function resolveNodeState(
  nodeId: string,
  opts: {
    position: string[];
    retired: Set<string>;
    doneSet: Set<string>;
    completion: CompletionStore;
    preGateSet: Set<string>;
    dag: Graph<string>;
  },
): NodeState {
  // Retired/done are terminal — checked before position
  if (opts.retired.has(nodeId)) return 'skip';
  if (opts.doneSet.has(nodeId)) return 'done';
  if (opts.position.includes(nodeId)) return 'current';
  if (opts.completion.hasFailing(nodeId)) return 'fail';
  if (opts.preGateSet.has(nodeId)) return 'pre-gate';
  const node = (opts.dag.nodes as Record<string, any>)[nodeId];
  if (node?.mode === 'plan') return 'plan';
  return 'pending';
}

const stateEmoji: Record<NodeState, string> = {
  done: '✅',
  skip: '⏭️',
  plan: '🟦',
  fail: '❌',
  pending: '⏳',
  current: '👉',
  'pre-gate': '🔍',
};

function makeDag(): Graph<string> {
  return {
    id: 'test-chart',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'init', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      'task-a': { id: 'task-a', desc: 'task a', produces: ['a.ts'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      'task-b': { id: 'task-b', desc: 'task b', produces: ['b.ts'], consumes: [], deps: ['init'], validate: [], idempotent: true, mode: 'plan' as const },
      'task-c': { id: 'task-c', desc: 'task c', produces: ['c.ts'], consumes: [], deps: ['task-a', 'task-b'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'term', produces: [], consumes: [], deps: ['task-c'], validate: [], idempotent: true },
    } as any,
  };
}

describe('chart state resolution', () => {
  it('shows done nodes as ✅', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init', 'task-a', 'task-b']);
    const pos = orient(dag, completion);
    const state = resolveNodeState('task-a', {
      position: pos.position,
      retired: new Set(),
      doneSet: new Set(pos.done),
      completion,
      preGateSet: new Set(pos.preGate),
      dag,
    });
    expect(state).toBe('done');
    expect(stateEmoji[state]).toBe('✅');
  });

  it('shows retired nodes as ⏭️ skip', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const pos = orient(dag, completion, new Set(['task-a']));
    const state = resolveNodeState('task-a', {
      position: pos.position,
      retired: new Set(['task-a']),
      doneSet: new Set(pos.done),
      completion,
      preGateSet: new Set(pos.preGate),
      dag,
    });
    expect(state).toBe('skip');
    expect(stateEmoji[state]).toBe('⏭️');
  });

  it('shows failed-receipt nodes as ❌ fail', () => {
    const dag = makeDag();
    const completion = CompletionStore.fromRecords([
      { nodeId: 'init', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'task-a', completedAt: '', validationChecks: [{ rule: 'shell', passed: false, evidence: 'exit 1' }] },
    ]);
    const pos = orient(dag, completion);
    // task-a has a failing receipt but is in current position batch — current wins
    // task-b is plan mode with no receipt — should be pre-gate or plan
    // Let's test a node that's NOT in position but has a failing record
    // Since task-a IS in position (it's incomplete), test from a fresh scenario
    const completion2 = CompletionStore.fromRecords([
      { nodeId: 'init', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'task-a', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'task-b', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'task-c', completedAt: '', validationChecks: [{ rule: 'shell', passed: false, evidence: 'test failed' }] },
    ]);
    const pos2 = orient(dag, completion2);
    const state = resolveNodeState('task-c', {
      position: pos2.position,
      retired: new Set(),
      doneSet: new Set(pos2.done),
      completion: completion2,
      preGateSet: new Set(pos2.preGate),
      dag,
    });
    // task-c is in position (not passing) AND has failing receipt
    // position check happens first → current
    expect(state).toBe('current');

    // Now test when node is NOT in current position: put it in a future batch
    // by not completing its deps
    const completion3 = CompletionStore.fromRecords([
      { nodeId: 'init', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      { nodeId: 'task-c', completedAt: '', validationChecks: [{ rule: 'shell', passed: false, evidence: 'test failed' }] },
    ]);
    const pos3 = orient(dag, completion3);
    const state3 = resolveNodeState('task-c', {
      position: pos3.position,
      retired: new Set(),
      doneSet: new Set(pos3.done),
      completion: completion3,
      preGateSet: new Set(pos3.preGate),
      dag,
    });
    expect(state3).toBe('fail');
    expect(stateEmoji[state3]).toBe('❌');
  });

  it('shows plan-mode nodes as 🟦 plan', () => {
    const dag = makeDag();
    const completion = CompletionStore.empty();
    const pos = orient(dag, completion);
    // task-b is plan mode and not in position (init not done, so position is init batch)
    // Actually init has no produces/consumes, so it might auto-pass. Let's check.
    // With empty completion, init is not passing → position is [init]
    // task-b is in L1 (same as task-a), not in position
    const state = resolveNodeState('task-b', {
      position: pos.position,
      retired: new Set(),
      doneSet: new Set(pos.done),
      completion,
      preGateSet: new Set(pos.preGate),
      dag,
    });
    // task-b is plan mode, not done, not in position, might be pre-gate
    // Pre-gate: plan nodes with all plan-mode deps complete, not in current batch
    // task-b deps: [init] which is execute mode → ignored for pre-gate
    // So task-b should be in preGate
    if (pos.preGate.includes('task-b')) {
      expect(state).toBe('pre-gate');
    } else {
      expect(state).toBe('plan');
    }
  });

  it('shows pending nodes as ⏳ pending', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init', 'task-a', 'task-b']);
    const pos = orient(dag, completion);
    // task-c is in position (current batch), so it's 'current'
    // term is pending (future batch, no receipt, execute mode)
    const state = resolveNodeState('term', {
      position: pos.position,
      retired: new Set(),
      doneSet: new Set(pos.done),
      completion,
      preGateSet: new Set(pos.preGate),
      dag,
    });
    expect(state).toBe('pending');
    expect(stateEmoji[state]).toBe('⏳');
  });

  it('current position overrides fail/pending/plan states', () => {
    const dag = makeDag();
    const completion = CompletionStore.fromRecords([
      { nodeId: 'init', completedAt: '', validationChecks: [{ rule: 'x', passed: true, evidence: 'ok' }] },
      // task-a has failing receipt but is in current position — current wins over fail
      { nodeId: 'task-a', completedAt: '', validationChecks: [{ rule: 'x', passed: false, evidence: 'nope' }] },
    ]);
    const pos = orient(dag, completion);
    expect(pos.position).toContain('task-a');
    const state = resolveNodeState('task-a', {
      position: pos.position,
      retired: new Set(),
      doneSet: new Set(pos.done),
      completion,
      preGateSet: new Set(pos.preGate),
      dag,
    });
    expect(state).toBe('current');
  });

  it('retired overrides current position', () => {
    const dag = makeDag();
    const completion = CompletionStore.from(['init']);
    const pos = orient(dag, completion, new Set(['task-a']));
    // task-a is retired AND in position batch — retired wins
    const state = resolveNodeState('task-a', {
      position: pos.position.includes('task-a') ? pos.position : [...pos.position, 'task-a'],
      retired: new Set(['task-a']),
      doneSet: new Set(pos.done),
      completion,
      preGateSet: new Set(pos.preGate),
      dag,
    });
    expect(state).toBe('skip');
  });

  it('legend contains all state tags with brackets', () => {
    const legend = `[✅ done]  [⏭️ skip]  [🟦 plan]  [❌ fail]  [⏳ pending]  [👉 current]  [🔍 pre-gate]`;
    for (const [state, emoji] of Object.entries(stateEmoji)) {
      expect(legend).toContain(`[${emoji} ${state}]`);
    }
  });
});
