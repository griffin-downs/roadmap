import { describe, it, expect } from 'vitest';
import { graph, define, orient } from '../src/protocol.ts';

const has = (artifacts: Set<string>) => (a: string) => artifacts.has(a);

describe('loopTarget: loop vs terminal distinction', () => {
  it('orient returns no loop field for normal terminal nodes', () => {
    const g = define(graph({
      id: 'simple',
      desc: 'simple',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
      },
    }));

    const pos = orient(g, has(new Set(['a.txt'])));
    expect(pos.loop).toBeUndefined();
  });

  it('orient returns loop signal when term node has loopTarget', () => {
    const g = define(graph({
      id: 'loop',
      desc: 'loop dag',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        term: {
          id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'] as const,
          validate: [], idempotent: true,
          loopTarget: 'a',
          convergenceCheck: { maxCoverageDelta: 0.02 },
        },
      },
    }));

    // All done — term position
    const pos = orient(g, has(new Set(['a.txt'])));
    expect(pos.loop).toBeDefined();
    expect(pos.loop!.target).toBe('a');
    expect(pos.loop!.convergenceCheck).toEqual({ maxCoverageDelta: 0.02 });
  });

  it('orient returns loop signal when a non-term batch node has loopTarget', () => {
    const g = define(graph({
      id: 'mid-loop',
      desc: 'mid loop',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        check: {
          id: 'check', desc: 'convergence check', produces: ['check.txt'], consumes: [], deps: ['a'] as const,
          validate: [], idempotent: true,
          loopTarget: 'a',
          convergenceCheck: { requireEmptyProposals: true },
        },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['check'] as const, validate: [], idempotent: true },
      },
    }));

    // a done, check not done — check is in current batch
    const pos = orient(g, has(new Set(['a.txt'])));
    expect(pos.position).toContain('check');
    expect(pos.loop).toBeDefined();
    expect(pos.loop!.target).toBe('a');
    expect(pos.loop!.convergenceCheck).toEqual({ requireEmptyProposals: true });
  });

  it('loop signal absent from completed non-loop batch', () => {
    const g = define(graph({
      id: 'no-loop',
      desc: 'no loop',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        a: { id: 'a', desc: 'a', produces: ['a.txt'], consumes: [], deps: ['init'] as const, validate: [], idempotent: true },
        b: { id: 'b', desc: 'b', produces: ['b.txt'], consumes: [], deps: ['a'] as const, validate: [], idempotent: true },
        term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['b'] as const, validate: [], idempotent: true },
      },
    }));

    // a done, b is current batch — no loop
    const pos = orient(g, has(new Set(['a.txt'])));
    expect(pos.loop).toBeUndefined();
  });

  it('loopTarget field preserved in NodeSpec', () => {
    const g = define(graph({
      id: 'field-check',
      desc: 'check field exists',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [] as const, validate: [], idempotent: true },
        term: {
          id: 'term', desc: 'end', produces: [], consumes: [], deps: ['init'] as const,
          validate: [], idempotent: true,
          loopTarget: 'init',
        },
      },
    }));

    const termNode = g.nodes['term' as keyof typeof g.nodes] as any;
    expect(termNode.loopTarget).toBe('init');
  });
});
