// Plan mode tests: mode field, orient with plan nodes, expanded validation, Brief.mode
import { describe, it, expect } from 'vitest';
import { define, graph, orient, validateNode, parallelOrder } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

// --- Helpers ---

function makeExists(artifacts: string[]): (a: string) => boolean {
  const s = new Set(artifacts);
  return (a: string) => s.has(a);
}

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
    const pos = orient(g, makeExists(['x']));
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
    const pos = orient(g, makeExists(['x', 'y']));
    // b is done (has expansion child c), c is done (artifact y exists), position should be at term
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
    // All done when z exists
    const pos = orient(g, makeExists(['x', 'z']));
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
    // b is execute mode (default), so it completes via artifact check, not expansion
    const posIncomplete = orient(g, makeExists(['x']));
    expect(posIncomplete.batchRemaining).toContain('b');

    const posComplete = orient(g, makeExists(['x', 'y']));
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
