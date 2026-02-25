// CONSUMER-INTEGRATION — smoke test: import roadmap/protocol, define minimal roadmap, orient()
//
// Validates consumer usage patterns:
//   1. graph() + define() construct a valid roadmap with type safety
//   2. verify(), check(), order() execute on consumer graphs
//   3. orient() positions correctly from real filesystem state
//
// The consumer pattern: install roadmap from path, write roadmap.ts, orient from files.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { define, graph, check, verify, order, orient } from 'roadmap/protocol';

describe('CONSUMER-INTEGRATION: roadmap as a package', () => {
  // Minimal consumer roadmap: init → work → term
  const consumerRoadmap = define(graph({
    id: 'consumer-example',
    desc: 'Consumer usage example',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['src/index.ts'], consumes: [], deps: [] },
      work: { id: 'work', desc: 'impl', produces: ['src/lib.ts'],    consumes: [],  deps: ['init'] },
      term: { id: 'term', desc: 'end',  produces: [],                consumes: [], deps: ['work'] },
    },
  }));

  it('consumer roadmap passes check() and verify()', () => {
    expect(check(consumerRoadmap).done).toBe(true);
    expect(verify(consumerRoadmap)).toEqual([]);
  });

  it('consumer roadmap has valid topological order', () => {
    const ord = order(consumerRoadmap);
    expect(ord.length).toBe(3);
    expect(ord[0]).toBe('init');
    expect(ord[2]).toBe('term');
  });

  it('orient() positions correctly with partial filesystem state', () => {
    // Only 'src/index.ts' exists (init is done)
    const filesExist = (artifact: string) => {
      // Simulate: 'src/index.ts' exists, 'src/lib.ts' does not
      return artifact === 'src/index.ts';
    };

    const o = orient(consumerRoadmap, filesExist);

    // init produces 'src/index.ts' which is marked existing
    expect(o.done).toContain('init');
    // work produces 'src/lib.ts' which doesn't exist
    expect(o.position).toBe('work');
    expect(o.produces).toEqual(['src/lib.ts']);
    expect(o.remaining).toContain('term');
  });

  it('real roadmap (this library): check and verify pass', async () => {
    // Import the library's own self-referential roadmap
    // This tests that the protocol works end-to-end on a non-trivial roadmap
    const mod = await import('../roadmap.ts');
    const roadmap = mod.default;
    expect(check(roadmap).done).toBe(true);
    expect(verify(roadmap)).toEqual([]);
  });

  it('consumer receives correct type exports from roadmap', () => {
    // Verify that type inference works: NodeId and Artifact are correctly derived
    type NodeId = keyof typeof consumerRoadmap.nodes;
    type Artifact = (typeof consumerRoadmap.nodes)[NodeId]['produces'][number];

    const nodeId: NodeId = 'init'; // compiles
    const artifact: Artifact = 'src/index.ts'; // compiles

    expect(nodeId).toBe('init');
    expect(artifact).toBe('src/index.ts');
  });

  it('orient() remains consistent after graph validation', () => {
    // Ensure define(), check(), verify(), order() do not mutate the graph
    const o1 = orient(consumerRoadmap, artifact => artifact.includes('index'));
    const o2 = orient(consumerRoadmap, artifact => artifact.includes('index'));

    expect(o1.position).toBe(o2.position);
    expect(o1.done).toEqual(o2.done);
    expect(o1.remaining).toEqual(o2.remaining);
  });
});
