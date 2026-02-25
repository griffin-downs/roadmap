// Adversarial hardening phase — cycle 2 from bootstrap-complete state.
//
// Two lanes:
//   Adversarial (spec-first): test files specifying correct behavior, may expose known bugs.
//   Constructive (fix-driven): protocol.ts fixes + decision docs satisfying adversarial specs.
//
// Reconcile point: adv-property → consumer-integration (forward produces meets backward consumes).
//
// Validate: tsc --noEmit
// Run:      node --experimental-strip-types roadmap.ts

import { define, check, verify, reconcile, graph } from './src/protocol.ts';

const roadmap = define(graph({
  id: 'roadmap-adversarial',
  desc: 'DAG expansion protocol — adversarial hardening: spec-first bugs, property tests, consumer validation',
  init: 'init',
  term: 'term',
  nodes: {
    init: {
      id: 'init',
      desc: 'Library core + seed tests + self-referential roadmap + expansion skill',
      produces: ['src/protocol.ts', 'tests/protocol.test.ts', 'roadmap.ts', 'SKILL.md'],
      consumes: [],
      deps: [],
    },

    // --- ADVERSARIAL LANE (spec-first) ---

    'adv-reconcile': {
      id: 'adv-reconcile',
      desc: 'Adversarial spec: reconcile gap.missing = unmet consumes only, not surplus produces',
      produces: ['tests/adv-reconcile.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },
    'adv-orient': {
      id: 'adv-orient',
      desc: 'Adversarial spec: orient empty-produces stalls permanently — specify correct behavior',
      produces: ['tests/adv-orient.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },
    'adv-property': {
      id: 'adv-property',
      desc: 'Property-based: for all valid graphs, order()→orient() consistent, check()→verify() agree',
      produces: ['tests/adv-property.test.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },
    'adv-types': {
      id: 'adv-types',
      desc: 'Type-level: invalid dep refs, id/key mismatch, unknown nodes are tsc errors',
      produces: ['tests/adv-types.test-d.ts'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
    },

    // --- CONSTRUCTIVE LANE (fix-driven) ---

    'fix-reconcile': {
      id: 'fix-reconcile',
      desc: 'Fix reconcile gap: missing = bn.consumes.filter(c => !fn.produces.includes(c))',
      produces: ['docs/decisions/reconcile-gap.md'],
      consumes: ['src/protocol.ts', 'tests/adv-reconcile.test.ts'],
      deps: ['adv-reconcile'],
    },
    'fix-orient': {
      id: 'fix-orient',
      desc: 'Fix orient empty-produces: !node.produces.length || node.produces.every(exists)',
      produces: ['docs/decisions/orient-empty-produces.md'],
      consumes: ['src/protocol.ts', 'tests/adv-orient.test.ts'],
      deps: ['adv-orient'],
    },

    // --- CONSUMER VALIDATION ---

    'consumer-integration': {
      id: 'consumer-integration',
      desc: 'Consumer smoke test: install from path, write minimal roadmap.ts, orient() from real filesystem',
      produces: ['tests/consumer-integration.test.ts'],
      consumes: [
        'src/protocol.ts',
        'roadmap.ts',
        'SKILL.md',
        'tests/adv-property.test.ts',
        'docs/decisions/reconcile-gap.md',
        'docs/decisions/orient-empty-produces.md',
      ],
      deps: ['fix-reconcile', 'fix-orient', 'adv-property'],
    },

    term: {
      id: 'term',
      desc: 'Adversarially hardened: bugs fixed and proven, property tests pass, type safety verified, consumer integration validated',
      produces: [],
      consumes: [
        'tests/adv-reconcile.test.ts',
        'tests/adv-orient.test.ts',
        'tests/adv-property.test.ts',
        'tests/adv-types.test-d.ts',
        'tests/consumer-integration.test.ts',
      ],
      deps: ['consumer-integration', 'adv-types'],
    },
  },
}));

// --- Checks ---

const status = check(roadmap);
if (!status.done) {
  console.error('check: not reconciled', status.orphans);
  process.exit(1);
}

const errors = verify(roadmap);
if (errors.length) {
  console.error('verify:', errors);
  process.exit(1);
}

console.log('check: done');
console.log('verify: all contracts satisfied');

// --- Frontier reconciliation (show where adversarial meets constructive) ---

const { connections, gaps } = reconcile(
  roadmap,
  ['adv-reconcile', 'adv-orient', 'adv-property'],
  ['consumer-integration'],
);
console.log('reconcile: connections', connections.map(c => `${c.forward}→${c.backward} via ${c.artifact}`));
console.log('reconcile: gaps', gaps.map(g => `${g.between.join('↔')} missing ${g.missing.join(', ')}`));

export default roadmap;
export type NodeId = keyof typeof roadmap.nodes;
export type Artifact = (typeof roadmap.nodes)[NodeId]['produces'][number];
