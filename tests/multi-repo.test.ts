/**
 * Multi-repo coordination tests: verify merge correctness across multiple repos.
 */

import { describe, it, expect } from 'vitest';
import { graph, define, merge, check, verify, order, orient, CompletionStore } from '../src/protocol';

describe('multi-repo patterns', () => {
  // Shared library: produces lib.js
  const shared = define(
    graph({
      id: 'shared',
      init: 'init',
      term: 'published',
      nodes: {
        init: { id: 'init', desc: '', produces: ['lib.ts'], consumes: [], deps: [], validate: [], idempotent: true },
        compile: { id: 'compile', desc: '', produces: ['lib.js'], consumes: ['lib.ts'], deps: ['init'], validate: [], idempotent: true },
        published: { id: 'published', desc: '', produces: [], consumes: ['lib.js'], deps: ['compile'], validate: [], idempotent: false },
      },
    }),
  );

  // Frontend: consumes lib.js, produces app.js
  const frontend = define(
    graph({
      id: 'frontend',
      init: 'fe-setup',
      term: 'fe-built',
      nodes: {
        'fe-setup': { id: 'fe-setup', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        'fe-build': { id: 'fe-build', desc: '', produces: ['app.js'], consumes: ['lib.js'], deps: ['fe-setup'], validate: [], idempotent: true },
        'fe-built': { id: 'fe-built', desc: '', produces: [], consumes: ['app.js'], deps: ['fe-build'], validate: [], idempotent: false },
      },
    }),
  );

  // Backend: consumes lib.js, produces api.js
  const backend = define(
    graph({
      id: 'backend',
      init: 'be-setup',
      term: 'be-deployed',
      nodes: {
        'be-setup': { id: 'be-setup', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
        'be-build': { id: 'be-build', desc: '', produces: ['api.js'], consumes: ['lib.js'], deps: ['be-setup'], validate: [], idempotent: true },
        'be-deployed': { id: 'be-deployed', desc: '', produces: [], consumes: ['api.js'], deps: ['be-build'], validate: [], idempotent: false },
      },
    }),
  );

  it('merges shared → frontend', () => {
    const merged = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'fe-setup', artifact: 'lib.js' }]);

    // Should have all nodes from both graphs
    expect(Object.keys(merged.nodes)).toContain('init');
    expect(Object.keys(merged.nodes)).toContain('compile');
    expect(Object.keys(merged.nodes)).toContain('published');
    expect(Object.keys(merged.nodes)).toContain('fe-setup');
    expect(Object.keys(merged.nodes)).toContain('fe-build');
    expect(Object.keys(merged.nodes)).toContain('fe-built');

    // shared.published → frontend.fe-setup should have edge
    expect(merged.nodes['fe-setup'].deps).toContain('published');

    // Should be valid
    expect(verify(merged)).toEqual([]);
    expect(check(merged).done).toBe(true);
  });

  it.skip('merges shared → frontend → backend (two-level merge)', () => {
    const step1 = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'fe-setup', artifact: 'lib.js' }]);
    const step2 = merge(step1, backend, [{ g1Node: 'published', g2Node: 'be-setup', artifact: 'lib.js' }]);

    // 3 graphs × ~3 nodes each = 9 nodes
    expect(Object.keys(step2.nodes).length).toBe(9);

    // Verify correctness
    expect(verify(step2)).toEqual([]);

    // Should reach terminal from init
    const ord = order(step2);
    expect(ord[0]).toBe('init');
    expect(ord[ord.length - 1]).toBe('be-deployed');
  });

  it('frontend and backend can execute in parallel after shared.published', () => {
    const step1 = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'fe-setup', artifact: 'lib.js' }]);
    const combined = merge(step1, backend, [{ g1Node: 'published', g2Node: 'be-setup', artifact: 'lib.js' }]);

    const ord = order(combined);

    // Position of 'shared' nodes, frontend.fe-setup, backend.be-setup
    const sharedPublished = ord.indexOf('published');
    const frontendSetup = ord.indexOf('fe-setup');
    const backendSetup = ord.indexOf('be-setup');

    // After shared.published, both fe-setup and be-setup should be available
    expect(sharedPublished).toBeLessThan(frontendSetup);
    expect(sharedPublished).toBeLessThan(backendSetup);

    // frontend.fe-build and backend.be-build both depend on lib.js (from shared.published)
    expect(combined.nodes['fe-build']).toBeDefined();
    expect(combined.nodes['be-build']).toBeDefined();
  });

  it('orientation works across merged repos', () => {
    const step1 = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'fe-setup', artifact: 'lib.js' }]);
    const combined = merge(step1, backend, [{ g1Node: 'published', g2Node: 'be-setup', artifact: 'lib.js' }]);

    // Simulate: shared phase + setup done, now at build batch
    const pos = orient(combined, CompletionStore.from(['init', 'compile', 'published', 'fe-setup', 'be-setup']));

    // Should be at fe-build/be-build batch with actual produces
    expect(pos.batchComplete).toBe(false);
    expect(pos.position).toEqual(expect.arrayContaining(['fe-build', 'be-build']));
    expect(pos.produces.length).toBeGreaterThan(0);
  });

  it('merge preserves init and term from both graphs', () => {
    const merged = merge(shared, frontend, [{ g1Node: 'published', g2Node: 'fe-setup', artifact: 'lib.js' }]);

    // init should be from shared (first graph)
    expect(merged.init).toBe('init');

    // term should be from frontend (second graph)
    expect(merged.term).toBe('fe-built');
  });

  it('merge fails on node ID conflict', () => {
    // Create backend with conflicting node ID
    const conflicting = define(
      graph({
        id: 'conflict',
        init: 'init', // Same as shared.init
        term: 'done',
        nodes: {
          init: { id: 'init', desc: '', produces: [], consumes: [], deps: [], validate: [], idempotent: true },
          done: { id: 'done', desc: '', produces: [], consumes: [], deps: ['init'], validate: [], idempotent: false },
        },
      }),
    );

    expect(() => {
      merge(shared, conflicting, [{ g1Node: 'published', g2Node: 'init', artifact: 'lib.js' }]);
    }).toThrow();
  });
});
