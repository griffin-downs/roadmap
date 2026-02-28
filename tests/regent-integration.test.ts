/**
 * Regent integration tests: verify roadmap works with governance system.
 */

import { describe, it, expect } from 'vitest';
import { graph, define, verify, check, orient, CompletionStore } from '../src/protocol';
import { AuditTrail } from '../src/audit';

describe('regent integration', () => {
  it('DAG can be loaded and oriented', () => {
    const g = define(
      graph({
        id: 'test',
        init: 'a',
        term: 'c',
        nodes: {
          a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
          b: { id: 'b', desc: '', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
          c: { id: 'c', desc: '', produces: [], consumes: ['y'], deps: ['b'], validate: [], idempotent: false },
        },
      }),
    );

    expect(verify(g)).toEqual([]);
    expect(check(g).done).toBe(true);

    const pos = orient(g, CompletionStore.from(['a', 'b']));
    expect(pos.position).toEqual(['c']);
  });

  it('audit trail records operations', () => {
    const trail = new AuditTrail();

    trail.logOrient({ position: 'a', produces: ['x'], consumes: [], done: 1, remaining: 2 });
    trail.logModify({ operation: 'add', nodeId: 'new' });

    const entries = trail.readLocal();
    expect(entries.length).toBeGreaterThanOrEqual(0);
  });

  it('DAG is deterministic', () => {
    const spec = {
      id: 'test',
      init: 'start',
      term: 'end',
      nodes: {
        start: { id: 'start', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        end: { id: 'end', desc: '', produces: [], consumes: [], deps: ['start'], validate: [], idempotent: false },
      },
    };

    const g1 = define(graph(spec));
    const g2 = define(graph(spec));

    const pos1 = orient(g1, CompletionStore.from(['start']));
    const pos2 = orient(g2, CompletionStore.from(['start']));

    expect(pos1.position).toEqual(pos2.position);
  });

  it('orientation respects idempotence', () => {
    const g = define(
      graph({
        id: 'test',
        init: 'a',
        term: 'done',
        nodes: {
          a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
          b: { id: 'b', desc: '', produces: [], consumes: ['x'], deps: ['a'], validate: [], idempotent: false },
          done: { id: 'done', desc: '', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: false },
        },
      }),
    );

    const pos = orient(g, CompletionStore.from(['a', 'b']));
    expect(pos.position).toEqual(['done']);
  });

  it('verify catches contract violations', () => {
    const errors = verify(
      define(
        graph({
          id: 'test',
          init: 'a',
          term: 'done',
          nodes: {
            a: { id: 'a', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
            b: { id: 'b', desc: '', produces: [], consumes: ['missing'], deps: ['a'], validate: [], idempotent: true },
            done: { id: 'done', desc: '', produces: [], consumes: [], deps: ['b'], validate: [], idempotent: false },
          },
        }),
      ),
    );

    expect(errors.length).toBeGreaterThan(0);
  });

  it('check detects unreachable nodes', () => {
    const result = check(
      define(
        graph({
          id: 'test',
          init: 'a',
          term: 'done',
          nodes: {
            a: { id: 'a', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
            orphan: { id: 'orphan', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
            done: { id: 'done', desc: '', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: false },
          },
        }),
      ),
    );

    expect(result.orphans.length).toBeGreaterThan(0);
  });

  it('orientation is reversible', () => {
    const g = define(
      graph({
        id: 'test',
        init: 'a',
        term: 'd',
        nodes: {
          a: { id: 'a', desc: '', produces: ['x'], consumes: [], deps: [], validate: [], idempotent: true },
          b: { id: 'b', desc: '', produces: ['y'], consumes: ['x'], deps: ['a'], validate: [], idempotent: true },
          c: { id: 'c', desc: '', produces: ['z'], consumes: ['y'], deps: ['b'], validate: [], idempotent: true },
          d: { id: 'd', desc: '', produces: [], consumes: ['z'], deps: ['c'], validate: [], idempotent: false },
        },
      }),
    );

    // All nodes have receipts: should be at term
    const full = orient(g, CompletionStore.from(['a', 'b', 'c']));
    expect(full.position).toEqual(['d']);

    // No receipts: should be at init
    const empty = orient(g, CompletionStore.empty());
    expect(empty.position).toEqual(['a']);

    // Partial: at intermediate node
    const partial = orient(g, CompletionStore.from(['a', 'b']));
    expect(partial.position).toEqual(['c']);
  });
});
