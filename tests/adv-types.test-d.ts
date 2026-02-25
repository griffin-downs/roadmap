// ADV-TYPES — type-level: invalid dep refs, id/key mismatch, unknown nodes are tsc errors
//
// Validated by: tsc --noEmit
// Not executed by vitest run (no runtime assertions — pure type-checking).
//
// The TypeScript type system enforces three structural invariants at compile time:
//
//   I1: node keys and node.id must match — NodeSpec<T, N> where id: N
//   I2: deps must reference valid node IDs — deps: readonly TAll[]
//   I3: graph<T>() infers T from the nodes map — unknown keys are not in T
//
// "Valid usage" tests: compile clean.
// "Invalid usage" tests: carry @ts-expect-error — tsc expects an error on that line.
//   If the @ts-expect-error is NOT followed by an error, tsc reports:
//   "Unused '@ts-expect-error' directive."
//   This catches regressions where a previously-invalid construct silently compiles.

import { graph, define } from '../src/protocol.ts';

// --- I1: node id must match its key ---

// Valid: id matches key.
define(graph({
  id: 'valid', desc: '', init: 'init', term: 'term',
  nodes: {
    init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
    term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
  },
}));

// Invalid: id does not match key 'init'.
// @ts-expect-error — id 'wrong' is not assignable to 'init'
define(graph({
  id: 'id-key-mismatch', desc: '', init: 'init', term: 'term',
  nodes: {
    init: { id: 'wrong', desc: '', produces: [], consumes: [], deps: [] },
    term: { id: 'term',  desc: '', produces: [], consumes: [], deps: ['init'] },
  },
}));

// --- I2: deps must reference valid node IDs in the graph ---

// Valid: dep 'init' is a known node.
define(graph({
  id: 'valid-dep', desc: '', init: 'init', term: 'term',
  nodes: {
    init: { id: 'init', desc: '', produces: [], consumes: [], deps: [] },
    term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
  },
}));

// Invalid: dep references a node not in the graph.
// @ts-expect-error — 'nonexistent' is not a key of the nodes map
define(graph({
  id: 'invalid-dep', desc: '', init: 'init', term: 'term',
  nodes: {
    init: { id: 'init', desc: '', produces: [], consumes: [], deps: ['nonexistent'] },
    term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
  },
}));

// Invalid: self-referential dep.
// @ts-expect-error — 'init' cannot appear in its own deps (caught by define() at runtime too)
define(graph({
  id: 'self-dep', desc: '', init: 'init', term: 'term',
  nodes: {
    init: { id: 'init', desc: '', produces: [], consumes: [], deps: ['init'] },
    term: { id: 'term', desc: '', produces: [], consumes: [], deps: ['init'] },
  },
}));

// --- I3: NodeId and Artifact type exports are correctly derived from the graph ---

const g = define(graph({
  id: 'typed', desc: '', init: 'init', term: 'term',
  nodes: {
    init: { id: 'init', desc: '', produces: ['init.out'], consumes: [], deps: [] },
    work: { id: 'work', desc: '', produces: ['work.out'], consumes: [],  deps: ['init'] },
    term: { id: 'term', desc: '', produces: [],           consumes: [], deps: ['work'] },
  },
}));

// NodeId is the union of all node keys.
type NodeId = keyof typeof g.nodes;
const _nodeId: NodeId = 'init'; // valid
// @ts-expect-error — 'unknown-node' is not a NodeId
const _badNodeId: NodeId = 'unknown-node';

// Artifact is the union of all produces strings.
type Artifact = (typeof g.nodes)[NodeId]['produces'][number];
const _artifact: Artifact = 'init.out'; // valid
// @ts-expect-error — 'nonexistent.out' is not a produced artifact
const _badArtifact: Artifact = 'nonexistent.out';
