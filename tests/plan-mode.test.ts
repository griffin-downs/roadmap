// Plan mode tests: mode field, orient with plan nodes, expanded validation, Brief.mode
import { describe, it, expect } from 'vitest';
import { define, graph, orient, validateNode, parallelOrder, CompletionStore } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

// Artifact predicate for validateNode (which still checks filesystem, not receipts)
const makeExists = (artifacts: string[]) => {
  const s = new Set(artifacts);
  return (a: string) => s.has(a);
};

// --- Type: mode field on NodeSpec ---

describe('plan mode types', () => {
  it('accepts nodes without mode (defaults to execute)', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'end', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: false },
      },
    }));
    const nodeA = g.nodes['a' as keyof typeof g.nodes] as any;
    expect(nodeA.mode).toBeUndefined();
  });

  it('accepts nodes with mode: plan', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'c',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'plan phase', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: true, mode: 'plan' },
        c: { id: 'c', desc: 'end', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: false },
      },
    }));
    const nodeB = g.nodes['b' as keyof typeof g.nodes] as any;
    expect(nodeB.mode).toBe('plan');
  });

  it('accepts expandedFrom provenance field', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'plan', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: true, mode: 'plan' },
        c: { id: 'c', desc: 'expanded child', produces: ['y'], consumes: [], deps: ['b'], validate: [], idempotent: true, expandedFrom: 'b' },
        d: { id: 'd', desc: 'end', produces: [], consumes: ['y'], deps: ['c'], validate: [], idempotent: false },
      },
    }));
    const nodeC = g.nodes['c' as keyof typeof g.nodes] as any;
    expect(nodeC.expandedFrom).toBe('b');
  });
});

// --- orient: plan node completion ---

describe('orient with plan nodes', () => {
  it('plan node without expansion children is incomplete', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'c',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'plan', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: true, mode: 'plan' },
        c: { id: 'c', desc: 'end', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: false },
      },
    }));
    const pos = orient(g, CompletionStore.from(['a']));
    expect(pos.position).toContain('b');
    expect(pos.batchRemaining).toContain('b');
    expect(pos.batchComplete).toBe(false);
  });

  it('plan node with expansion children is complete', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'plan', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: true, mode: 'plan' },
        c: { id: 'c', desc: 'expanded', produces: ['y'], consumes: [], deps: ['b'], validate: [], idempotent: true, expandedFrom: 'b' },
        d: { id: 'd', desc: 'end', produces: [], consumes: ['y'], deps: ['c'], validate: [], idempotent: false },
      },
    }));
    const pos = orient(g, CompletionStore.from(['a', 'c']));
    // b is done (has expansion child c), c is done (receipt), position should be at term
    expect(pos.done).toContain('b');
    expect(pos.done).toContain('c');
  });

  it('plan node expanded into further plan nodes (recursive)', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'e',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'plan-1', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: true, mode: 'plan' },
        c: { id: 'c', desc: 'plan-2', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: true, mode: 'plan', expandedFrom: 'b' },
        d: { id: 'd', desc: 'execute', produces: ['z'], consumes: [], deps: ['c'], validate: [], idempotent: true, expandedFrom: 'c' },
        e: { id: 'e', desc: 'end', produces: [], consumes: ['z'], deps: ['d'], validate: [], idempotent: false },
      },
    }));
    // b expanded → c (plan), c expanded → d (execute)
    // All done when a and d have receipts (b and c auto-done via expansion children)
    const pos = orient(g, CompletionStore.from(['a', 'd']));
    expect(pos.done).toContain('b');
    expect(pos.done).toContain('c');
    expect(pos.done).toContain('d');
  });

  it('execute nodes ignore expandedFrom for completion', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'c',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'exec', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true, expandedFrom: 'some-plan' },
        c: { id: 'c', desc: 'end', produces: [], consumes: ['y'], deps: ['b'], validate: [], idempotent: false },
      },
    }));
    // b is execute mode (default), so it completes via receipt, not expansion
    const posIncomplete = orient(g, CompletionStore.from(['a']));
    expect(posIncomplete.batchRemaining).toContain('b');

    const posComplete = orient(g, CompletionStore.from(['a', 'b']));
    expect(posComplete.done).toContain('b');
  });
});

// --- validateNode: expanded rule ---

describe('expanded validation rule', () => {
  const makeDag = (withChildren: boolean): Graph<string> => {
    const nodes: Record<string, any> = {
      a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
      b: { id: 'b', desc: 'plan', produces: [], consumes: ['x'], deps: ['a'], validate: [{ type: 'expanded' }], idempotent: true, mode: 'plan' },
      d: { id: 'd', desc: 'end', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: false },
    };
    if (withChildren) {
      nodes.c = { id: 'c', desc: 'child', produces: ['y'], consumes: [], deps: ['b'], validate: [], idempotent: true, expandedFrom: 'b' };
      nodes.d.deps = ['c'];
    }
    return { id: 'test', desc: 'test', init: 'a', term: 'd', nodes } as Graph<string>;
  };

  it('fails when no expansion children exist', async () => {
    const g = makeDag(false);
    const result = await validateNode(g, 'b', makeExists(['x']));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toMatch(/found 0 child/);
  });

  it('passes when expansion children exist', async () => {
    const g = makeDag(true);
    const result = await validateNode(g, 'b', makeExists(['x']));
    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toMatch(/expanded into 1 node/);
  });

  it('respects minNodes parameter', async () => {
    const nodes: Record<string, any> = {
      a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
      b: { id: 'b', desc: 'plan', produces: [], consumes: ['x'], deps: ['a'], validate: [{ type: 'expanded', minNodes: 2 }], idempotent: true, mode: 'plan' },
      c: { id: 'c', desc: 'child1', produces: ['y'], consumes: [], deps: ['b'], validate: [], idempotent: true, expandedFrom: 'b' },
      d: { id: 'd', desc: 'end', produces: [], consumes: ['y'], deps: ['c'], validate: [], idempotent: false },
    };
    const g = { id: 'test', desc: 'test', init: 'a', term: 'd', nodes } as Graph<string>;

    // Only 1 child, but minNodes is 2
    const result = await validateNode(g, 'b', makeExists(['x']));
    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toMatch(/need >= 2/);
  });
});

// --- Pre-gate: plan nodes workable before deps close ---

describe('preGate', () => {
  it('surfaces plan nodes from future batches', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'e',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'execute', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'plan future', produces: [], consumes: ['y'], deps: ['b'], validate: [], idempotent: true, mode: 'plan' },
        d: { id: 'd', desc: 'after plan', produces: ['z'], consumes: [], deps: ['c'], validate: [], idempotent: true, expandedFrom: 'c' },
        e: { id: 'e', desc: 'end', produces: [], consumes: ['z'], deps: ['d'], validate: [], idempotent: false },
      },
    }));
    // Position at b (a done). c is a plan node in a future batch.
    const pos = orient(g, CompletionStore.from(['a']));
    expect(pos.position).toContain('b');
    expect(pos.preGate).toContain('c');
  });

  it('excludes execute nodes from preGate', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'd',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'execute', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'also execute', produces: ['z'], consumes: ['y'], deps: ['b'], validate: [], idempotent: true },
        d: { id: 'd', desc: 'end', produces: [], consumes: ['z'], deps: ['c'], validate: [], idempotent: false },
      },
    }));
    const pos = orient(g, CompletionStore.from(['a']));
    expect(pos.preGate).toEqual([]);
  });

  it('filters out plan nodes with uncompleted plan deps', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'f',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'execute', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'plan-1', produces: [], consumes: ['y'], deps: ['b'], validate: [], idempotent: true, mode: 'plan' },
        d: { id: 'd', desc: 'plan-2 depends on plan-1', produces: [], consumes: [], deps: ['c'], validate: [], idempotent: true, mode: 'plan' },
        e: { id: 'e', desc: 'exec', produces: ['z'], consumes: [], deps: ['d'], validate: [], idempotent: true, expandedFrom: 'd' },
        f: { id: 'f', desc: 'end', produces: [], consumes: ['z'], deps: ['e'], validate: [], idempotent: false },
      },
    }));
    // Position at b. c is plan (workable — only execute dep b is pending).
    // d is plan but depends on c (plan) which is uncompleted → NOT in preGate.
    const pos = orient(g, CompletionStore.from(['a']));
    expect(pos.preGate).toContain('c');
    expect(pos.preGate).not.toContain('d');
  });

  it('allows plan node when only execute deps are pending', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'e',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'exec-1', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        c: { id: 'c', desc: 'exec-2', produces: ['z'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
        d: { id: 'd', desc: 'plan after exec', produces: [], consumes: ['y', 'z'], deps: ['b', 'c'], validate: [], idempotent: true, mode: 'plan' },
        e: { id: 'e', desc: 'end', produces: [], consumes: [], deps: ['d'], validate: [], idempotent: false },
      },
    }));
    // b and c are execute deps of d (plan). Both pending but execute → d IS in preGate.
    const pos = orient(g, CompletionStore.from(['a']));
    expect(pos.position).toEqual(expect.arrayContaining(['b', 'c']));
    expect(pos.preGate).toContain('d');
  });

  it('preGate is empty when all batches complete', () => {
    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'end', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: false },
      },
    }));
    const pos = orient(g, CompletionStore.from(['a']));
    expect(pos.preGate).toEqual([]);
  });
});

// --- Brief.mode ---

describe('Brief mode field', () => {
  it('brief includes mode from node', async () => {
    // Use dynamic import to get getBrief
    const { getBrief } = await import('../src/lib/brief.ts');

    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: 'plan node', produces: [], consumes: [], deps: [], validate: [], idempotent: true, mode: 'plan' },
        b: { id: 'b', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: false },
      },
    }));

    const brief = await getBrief(g, 'a', process.cwd());
    expect(brief.mode).toBe('plan');
    expect(brief.pattern).toMatch(/Decompose/);
  });

  it('brief defaults to execute mode', async () => {
    const { getBrief } = await import('../src/lib/brief.ts');

    const g = define(graph({
      id: 'test', desc: 'test', init: 'a', term: 'b',
      nodes: {
        a: { id: 'a', desc: 'start', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
        b: { id: 'b', desc: 'end', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: false },
      },
    }));

    const brief = await getBrief(g, 'a', process.cwd());
    expect(brief.mode).toBe('execute');
  });
});
