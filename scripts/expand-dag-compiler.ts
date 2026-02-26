// Expansion: Phase 24 — DAG-as-Compiler (scaffold, cluster, schedule, unblocked)
// scaffold-impl + cluster-impl run in parallel (different files)
// schedule-impl gates on cluster-impl (needs ClusterResult type)
// dag-compiler-cli gates on all three libs
// dag-compiler-tests gates on cli

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

const newNodes: Record<string, any> = {
  // L103 parallel: two independent lib modules
  'scaffold-impl': {
    id: 'scaffold-impl',
    desc: 'buildScaffold(): topologically generate typed stub files for all DAG produces, optional tsc type-check',
    produces: ['src/lib/scaffold.ts'],
    consumes: [],
    deps: ['phase-23-term'],
    validate: [
      { type: 'artifact-exists', target: 'src/lib/scaffold.ts' },
      { type: 'shell', command: 'grep -q "buildScaffold" src/lib/scaffold.ts' },
    ],
    idempotent: true,
  },
  'cluster-impl': {
    id: 'cluster-impl',
    desc: 'buildClusters(): bipartite produces/consumes graph → connected-component clusters with coupling + critical path annotation',
    produces: ['src/lib/cluster.ts'],
    consumes: [],
    deps: ['phase-23-term'],
    validate: [
      { type: 'artifact-exists', target: 'src/lib/cluster.ts' },
      { type: 'shell', command: 'grep -q "buildClusters" src/lib/cluster.ts' },
    ],
    idempotent: true,
  },

  // L104: schedule depends on cluster for ClusterResult type
  'schedule-impl': {
    id: 'schedule-impl',
    desc: 'buildSchedule(): inter-cluster dep graph → wave assignment with critical path ordering',
    produces: ['src/lib/schedule.ts'],
    consumes: ['src/lib/cluster.ts'],
    deps: ['cluster-impl'],
    validate: [
      { type: 'artifact-exists', target: 'src/lib/schedule.ts' },
      { type: 'shell', command: 'grep -q "buildSchedule" src/lib/schedule.ts' },
    ],
    idempotent: true,
  },

  // L105: CLI wires all three + surfaces unblocked on complete
  'dag-compiler-cli': {
    id: 'dag-compiler-cli',
    desc: 'Register scaffold/cluster/schedule CLI commands + surface unblocked nodes in cmdComplete response',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/scaffold.ts', 'src/lib/cluster.ts', 'src/lib/schedule.ts'],
    deps: ['scaffold-impl', 'cluster-impl', 'schedule-impl'],
    validate: [
      { type: 'shell', command: 'grep -q "cmdScaffold" bin/roadmap.ts' },
      { type: 'shell', command: 'grep -q "cmdCluster" bin/roadmap.ts' },
      { type: 'shell', command: 'grep -q "cmdSchedule" bin/roadmap.ts' },
      { type: 'shell', command: 'grep -q "unblocked" bin/roadmap.ts' },
    ],
    idempotent: true,
  },

  // L106: tests
  'dag-compiler-tests': {
    id: 'dag-compiler-tests',
    desc: 'Tests for scaffold, cluster, schedule: stub generation, connected components, wave assignment, unblocked surfacing',
    produces: ['tests/dag-compiler.test.ts'],
    consumes: ['src/lib/scaffold.ts', 'src/lib/cluster.ts', 'src/lib/schedule.ts'],
    deps: ['dag-compiler-cli'],
    validate: [
      { type: 'artifact-exists', target: 'tests/dag-compiler.test.ts' },
      { type: 'shell', command: 'npx vitest run tests/dag-compiler.test.ts --reporter=dot' },
    ],
    idempotent: true,
  },

  'phase-24-term': {
    id: 'phase-24-term',
    desc: 'Phase 24 complete: DAG-as-Compiler — scaffold, cluster, schedule, unblocked surfacing all ship',
    produces: [],
    consumes: ['tests/dag-compiler.test.ts'],
    deps: ['dag-compiler-tests'],
    validate: [{ type: 'shell', command: 'npx tsc --noEmit' }],
    idempotent: false,
  },
};

for (const [id, node] of Object.entries(newNodes)) {
  nodes[id] = node;
}

// Repoint term
const term = nodes[dag.term] as any;
term.deps = term.deps.map((d: string) => d === 'phase-23-term' ? 'phase-24-term' : d);

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log(`Expanded: +${Object.keys(newNodes).length} nodes (phase-24). Total: ${Object.keys(nodes).length}`);
