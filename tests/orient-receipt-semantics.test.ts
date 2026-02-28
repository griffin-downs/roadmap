import { describe, it, expect } from 'vitest';
import { orient, define } from '../src/protocol.ts';
import type { Graph } from '../src/protocol.ts';

function makeDAG(): Graph<'init' | 'a' | 'term'> {
  return define({
    id: 'test-receipt',
    desc: 'receipt semantics test',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
      a: { id: 'a', desc: 'node a', produces: ['out.txt'], consumes: [], deps: ['init'], validate: [], idempotent: true },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['a'], validate: [], idempotent: true },
    },
  });
}

describe('orient receipt semantics', () => {
  it('artifact exists + no receipt = NOT done (Bypass #2 eliminated)', () => {
    const g = makeDAG();
    const exists = (p: string) => p === 'out.txt';
    const completed = new Set(['init']); // init has receipt, 'a' does not
    const pos = orient(g, exists, undefined, completed);
    expect(pos.position).toContain('a');
  });

  it('artifact exists + receipt = done', () => {
    const g = makeDAG();
    const exists = (p: string) => p === 'out.txt';
    const completed = new Set(['init', 'a']);
    const pos = orient(g, exists, undefined, completed);
    expect(pos.position).not.toContain('a');
    expect(pos.position).toContain('term');
  });

  it('artifact missing + receipt = NOT done (artifacts still required)', () => {
    const g = makeDAG();
    const exists = () => false;
    const completed = new Set(['init', 'a']);
    const pos = orient(g, exists, undefined, completed);
    expect(pos.position).toContain('a');
  });

  it('produce-less node requires receipt', () => {
    const g = makeDAG();
    const exists = () => true;
    const completed = new Set<string>(); // no receipts
    const pos = orient(g, exists, undefined, completed);
    // init has no produces, no receipt → incomplete
    expect(pos.position).toContain('init');
  });

  it('produce-less node with receipt is done', () => {
    const g = makeDAG();
    const exists = (p: string) => p === 'out.txt';
    const completed = new Set(['init', 'a']);
    const pos = orient(g, exists, undefined, completed);
    expect(pos.position).toContain('term');
  });

  it('no completed set = legacy mode (artifact-only)', () => {
    const g = makeDAG();
    const exists = (p: string) => p === 'out.txt';
    const pos = orient(g, exists);
    // Without completed set, legacy mode: produce-less init is done, 'a' artifacts exist → done
    expect(pos.position).toContain('term');
  });

  it('retired nodes still bypass receipt requirement', () => {
    const g = makeDAG();
    const exists = () => false;
    const retired = new Set(['init', 'a']);
    const completed = new Set<string>();
    const pos = orient(g, exists, retired, completed);
    // Both init and a are retired → position at term
    expect(pos.position).toContain('term');
  });
});
