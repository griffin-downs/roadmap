// Expansion script: Phase 22 — spawn plan output for roadmap import
// Inserts 4 new nodes between phase-21-term and term

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;

// Phase 22 nodes
const newNodes: Record<string, any> = {
  'spawn-plan-impl': {
    id: 'spawn-plan-impl',
    desc: 'SpawnPlan types + buildSpawnPlan(dag) function in src/lib/spawn-plan.ts',
    produces: ['src/lib/spawn-plan.ts'],
    consumes: [],
    deps: ['phase-21-term'],
    validate: [{ type: 'artifact-exists', target: 'src/lib/spawn-plan.ts' }],
    idempotent: true,
  },
  'spawn-plan-cli': {
    id: 'spawn-plan-cli',
    desc: 'Integrate spawn plan into cmdImport output in bin/roadmap.ts',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/spawn-plan.ts'],
    deps: ['spawn-plan-impl'],
    validate: [{ type: 'shell', command: 'grep -q "spawnPlan" bin/roadmap.ts' }],
    idempotent: true,
  },
  'spawn-plan-tests': {
    id: 'spawn-plan-tests',
    desc: 'Unit tests for buildSpawnPlan — single-node batches, multi-worker teams, recombination, conflicts',
    produces: ['tests/spawn-plan.test.ts'],
    consumes: ['src/lib/spawn-plan.ts'],
    deps: ['spawn-plan-impl'],
    validate: [{ type: 'artifact-exists', target: 'tests/spawn-plan.test.ts' }],
    idempotent: true,
  },
  'phase-22-term': {
    id: 'phase-22-term',
    desc: 'Phase 22 complete: spawn plan output ships with roadmap import',
    produces: [],
    consumes: ['src/lib/spawn-plan.ts', 'bin/roadmap.ts', 'tests/spawn-plan.test.ts'],
    deps: ['spawn-plan-cli', 'spawn-plan-tests'],
    validate: [{ type: 'shell', command: 'npx vitest run tests/spawn-plan.test.ts --reporter=dot' }],
    idempotent: false,
  },
};

// Splice in before term
const nodes = dag.nodes as Record<string, any>;
for (const [id, node] of Object.entries(newNodes)) {
  nodes[id] = node;
}

// Update term to depend on phase-22-term instead of phase-21-term
const term = nodes[dag.term] as any;
term.deps = term.deps.map((d: string) => d === 'phase-21-term' ? 'phase-22-term' : d);

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log(`Expanded: +${Object.keys(newNodes).length} nodes (phase-22). Total: ${Object.keys(nodes).length}`);
