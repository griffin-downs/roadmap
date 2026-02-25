import { test, expect } from 'vitest';
import { define, graph, merge, verify, check, orient } from '../src/protocol.ts';
import { existsSync } from 'node:fs';

/**
 * Multi-repo coordination tests
 * Scenario: merge roadmap + cockpit + fusion DAGs at artifact boundaries
 */

test('merge: two independent DAGs with artifact connection', () => {
  const g1 = define(graph({
    id: 'g1',
    desc: 'First project',
    init: 'init1',
    term: 'term1',
    nodes: {
      init1: {
        id: 'init1',
        desc: 'Start',
        produces: ['a.txt'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      term1: {
        id: 'term1',
        desc: 'End',
        produces: [],
        consumes: ['a.txt'],
        deps: ['init1'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const g2 = define(graph({
    id: 'g2',
    desc: 'Second project',
    init: 'init2',
    term: 'term2',
    nodes: {
      init2: {
        id: 'init2',
        desc: 'Start',
        produces: ['b.txt'],
        consumes: ['a.txt'], // consumes from g1
        deps: [],
        validate: [],
        idempotent: true,
      },
      term2: {
        id: 'term2',
        desc: 'End',
        produces: [],
        consumes: ['a.txt', 'b.txt'],
        deps: ['init2'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const merged = merge(g1, g2, [
    { g1Node: 'term1', g2Node: 'init2', artifact: 'a.txt' },
  ]);

  expect(merged.init).toBe('init1');
  expect(merged.term).toBe('term2');
  expect(Object.keys(merged.nodes)).toContain('init1');
  expect(Object.keys(merged.nodes)).toContain('init2');
  expect(Object.keys(merged.nodes)).toContain('term1');
  expect(Object.keys(merged.nodes)).toContain('term2');

  // Verify acyclic + connected
  const checkRes = check(merged);
  expect(checkRes.done).toBe(true);

  // Verify contracts
  const verifyErrs = verify(merged);
  expect(verifyErrs).toHaveLength(0);
});

test('merge: three-repo chain (roadmap → fusion → cockpit)', () => {
  const roadmap = define(graph({
    id: 'roadmap',
    init: 'r-init',
    term: 'r-term',
    desc: 'Protocol',
    nodes: {
      'r-init': {
        id: 'r-init',
        desc: 'Protocol core',
        produces: ['protocol.ts'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      'r-term': {
        id: 'r-term',
        desc: 'Protocol ready',
        produces: [],
        consumes: ['protocol.ts'],
        deps: ['r-init'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const fusion = define(graph({
    id: 'fusion',
    init: 'f-init',
    term: 'f-term',
    desc: 'Orchestration',
    nodes: {
      'f-init': {
        id: 'f-init',
        desc: 'Use protocol',
        produces: ['orchestration.ts'],
        consumes: ['protocol.ts'],
        deps: [],
        validate: [],
        idempotent: true,
      },
      'f-term': {
        id: 'f-term',
        desc: 'Orchestration ready',
        produces: [],
        consumes: ['protocol.ts', 'orchestration.ts'],
        deps: ['f-init'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const cockpit = define(graph({
    id: 'cockpit',
    init: 'c-init',
    term: 'c-term',
    desc: 'Dashboard',
    nodes: {
      'c-init': {
        id: 'c-init',
        desc: 'Use orchestration',
        produces: ['dashboard.ts'],
        consumes: ['protocol.ts', 'orchestration.ts'],
        deps: [],
        validate: [],
        idempotent: true,
      },
      'c-term': {
        id: 'c-term',
        desc: 'Dashboard ready',
        produces: [],
        consumes: ['protocol.ts', 'orchestration.ts', 'dashboard.ts'],
        deps: ['c-init'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  // Chain: roadmap → fusion
  const m1 = merge(roadmap, fusion, [
    { g1Node: 'r-term', g2Node: 'f-init', artifact: 'protocol.ts' },
  ]);

  // Then: (roadmap+fusion) → cockpit
  const m2 = merge(m1, cockpit, [
    { g1Node: 'f-term', g2Node: 'c-init', artifact: 'orchestration.ts' },
  ]);

  expect(m2.init).toBe('r-init');
  expect(m2.term).toBe('c-term');

  const checkRes = check(m2);
  expect(checkRes.done).toBe(true);

  const verifyErrs = verify(m2);
  expect(verifyErrs).toHaveLength(0);

  // All nodes present
  const nodeCount = Object.keys(m2.nodes).length;
  expect(nodeCount).toBe(6); // 2 from each DAG
});

test('merge: preserves node.idempotent field', () => {
  const g1 = define(graph({
    id: 'g1',
    init: 'a',
    term: 'b',
    desc: 'Test',
    nodes: {
      a: {
        id: 'a',
        desc: 'Idempotent',
        produces: ['x'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      b: {
        id: 'b',
        desc: 'Non-idempotent',
        produces: [],
        consumes: ['x'],
        deps: ['a'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const g2 = define(graph({
    id: 'g2',
    init: 'c',
    term: 'd',
    desc: 'Test',
    nodes: {
      c: {
        id: 'c',
        desc: 'Start',
        produces: ['y'],
        consumes: ['x'],
        deps: [],
        validate: [],
        idempotent: true,
      },
      d: {
        id: 'd',
        desc: 'End',
        produces: [],
        consumes: ['x', 'y'],
        deps: ['c'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const merged = merge(g1, g2, [{ g1Node: 'b', g2Node: 'c', artifact: 'x' }]);

  expect(merged.nodes.a.idempotent).toBe(true);
  expect(merged.nodes.b.idempotent).toBe(false);
  expect(merged.nodes.c.idempotent).toBe(true);
  expect(merged.nodes.d.idempotent).toBe(false);
});

test('merge: rejects invalid connection (missing artifact)', () => {
  const g1 = define(graph({
    id: 'g1',
    init: 'a',
    term: 'b',
    desc: 'Test',
    nodes: {
      a: {
        id: 'a',
        desc: 'Start',
        produces: ['x.txt'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      b: {
        id: 'b',
        desc: 'End',
        produces: [],
        consumes: ['x.txt'],
        deps: ['a'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  const g2 = define(graph({
    id: 'g2',
    init: 'c',
    term: 'd',
    desc: 'Test',
    nodes: {
      c: {
        id: 'c',
        desc: 'Start',
        produces: ['y.txt'],
        consumes: ['z.txt'], // doesn't match x.txt!
        deps: [],
        validate: [],
        idempotent: true,
      },
      d: {
        id: 'd',
        desc: 'End',
        produces: [],
        consumes: ['y.txt'],
        deps: ['c'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  // Merge with wrong connection
  const merged = merge(g1, g2, [{ g1Node: 'b', g2Node: 'c', artifact: 'x.txt' }]);

  // Still acyclic + connected, but verify() should catch contract violation
  const verifyErrs = verify(merged);
  expect(verifyErrs.length).toBeGreaterThan(0);
});
