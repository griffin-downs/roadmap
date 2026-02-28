import { describe, it, expect } from 'vitest';
import { define, verify, orient, CompletionStore } from '../src/protocol.ts';
import type { ConsumeSpec } from '../src/protocol.ts';

function makeDAG(consumes: ConsumeSpec[]) {
  return define({
    id: 'test', desc: 'test', init: 'init', term: 'term',
    nodes: {
      init: { id: 'init' as const, desc: 'start', produces: ['a.txt'], consumes: [], deps: [] as const, validate: [], idempotent: true },
      resolver: { id: 'resolver' as const, desc: 'produces the artifact', produces: ['b.txt'], consumes: ['a.txt'], deps: ['init'] as const, validate: [], idempotent: true },
      consumer: { id: 'consumer' as const, desc: 'needs b.txt', produces: ['c.txt'], consumes, deps: ['init'] as const, validate: [], idempotent: true },
      term: { id: 'term' as const, desc: 'end', produces: [], consumes: ['c.txt'], deps: ['consumer', 'resolver'] as const, validate: [], idempotent: false },
    },
  });
}

describe('pending contracts (resolvedBy)', () => {
  it('verify flags unresolved consumes without resolvedBy', () => {
    const g = makeDAG(['b.txt']);
    const errors = verify(g);
    // consumer depends on init, not resolver — b.txt is not in predecessor chain
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('b.txt');
  });

  it('verify suppresses warning when resolvedBy names a valid node', () => {
    const g = makeDAG([{ artifact: 'b.txt', resolvedBy: 'resolver' }]);
    const errors = verify(g);
    expect(errors).toEqual([]);
  });

  it('verify still flags if resolvedBy names a nonexistent node', () => {
    const g = makeDAG([{ artifact: 'b.txt', resolvedBy: 'nonexistent' }]);
    const errors = verify(g);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('b.txt');
  });

  it('mixed consumes: string and ConsumeSpec together', () => {
    const g = makeDAG(['a.txt', { artifact: 'b.txt', resolvedBy: 'resolver' }]);
    const errors = verify(g);
    // a.txt is produced by init (predecessor), b.txt acknowledged — no errors
    expect(errors).toEqual([]);
  });

  it('resolvedBy does not suppress when artifact actually available', () => {
    // resolver is a dep of term, and consumer depends on init
    // even with resolvedBy, a.txt is available from init — no error either way
    const g = makeDAG([{ artifact: 'a.txt', resolvedBy: 'resolver' }]);
    const errors = verify(g);
    expect(errors).toEqual([]);
  });

  it('orient still computes consumes as strings for batch', () => {
    const g = makeDAG([{ artifact: 'b.txt', resolvedBy: 'resolver' }]);
    const pos = orient(g, CompletionStore.empty());
    // consumes in orient output should be plain strings
    expect(pos.consumes.every((c: any) => typeof c === 'string')).toBe(true);
  });
});
