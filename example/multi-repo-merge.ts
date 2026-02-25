#!/usr/bin/env node
/**
 * Multi-repo merge example: combine roadmap + cockpit DAGs
 *
 * Real scenario: roadmap protocol release (v0.2.0) + cockpit agent bootstrapping
 * Both repos depend on each other; merged DAG ensures coordinated execution.
 */

import { merge, orient, check, verify, define, graph } from '../src/protocol.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Simplified roadmap DAG (for example; real one has 47 nodes)
const roadmapDAG = define(graph({
  id: 'roadmap',
  desc: 'DAG expansion protocol',
  init: 'init',
  term: 'roadmap-term',
  nodes: {
    init: {
      id: 'init',
      desc: 'Core + tests',
      produces: ['src/protocol.ts', 'tests/protocol.test.ts'],
      consumes: [],
      deps: [],
      validate: [{ type: 'artifact-exists', target: 'src/protocol.ts' }],
      idempotent: true,
    },
    'bootstrap-gen-spec': {
      id: 'bootstrap-gen-spec',
      desc: 'Bootstrap template spec',
      produces: ['docs/decisions/bootstrap-gen-design.md'],
      consumes: ['src/protocol.ts'],
      deps: ['init'],
      validate: [{ type: 'artifact-exists', target: 'docs/decisions/bootstrap-gen-design.md' }],
      idempotent: true,
    },
    'roadmap-term': {
      id: 'roadmap-term',
      desc: 'v0.2.0 release ready',
      produces: [],
      consumes: ['src/protocol.ts', 'docs/decisions/bootstrap-gen-design.md'],
      deps: ['bootstrap-gen-spec'],
      validate: [],
      idempotent: false,
    },
  },
}));

// Simplified cockpit DAG (real one has different phase count)
const cockpitDAG = define(graph({
  id: 'cockpit',
  desc: 'Dashboard + agent runtime',
  init: 'cockpit-init',
  term: 'cockpit-term',
  nodes: {
    'cockpit-init': {
      id: 'cockpit-init',
      desc: 'Dashboard scaffold + bootstrap harness',
      produces: ['src/orchestration.ts', 'src/dashboard.ts'],
      consumes: ['src/protocol.ts'], // depends on roadmap release!
      deps: [],
      validate: [{ type: 'artifact-exists', target: 'src/orchestration.ts' }],
      idempotent: true,
    },
    'cockpit-bootstrap': {
      id: 'cockpit-bootstrap',
      desc: 'Agent bootstrap template + boot harness',
      produces: ['.cockpit/boot.ts', '.cockpit/manifest.json'],
      consumes: ['src/protocol.ts', 'src/orchestration.ts'],
      deps: ['cockpit-init'],
      validate: [{ type: 'artifact-exists', target: '.cockpit/boot.ts' }],
      idempotent: true,
    },
    'cockpit-term': {
      id: 'cockpit-term',
      desc: 'Agent-ready: bootstrap complete',
      produces: [],
      consumes: ['src/protocol.ts', '.cockpit/boot.ts', '.cockpit/manifest.json'],
      deps: ['cockpit-bootstrap'],
      validate: [],
      idempotent: false,
    },
  },
}));

/**
 * Merge logic: roadmap-term → cockpit-init
 * This connects the two roadmaps at the artifact boundary.
 */
const merged = merge(roadmapDAG, cockpitDAG, [
  {
    g1Node: 'roadmap-term',
    g2Node: 'cockpit-init',
    artifact: 'src/protocol.ts',
  },
]);

// Verify merge is sound
const checkResult = check(merged);
if (!checkResult.done) {
  console.error('ERROR: Merged DAG not connected');
  console.error('Orphans:', checkResult.orphans);
  process.exit(1);
}

const verifyErrors = verify(merged);
if (verifyErrors.length) {
  console.error('ERROR: Contract violations in merged DAG');
  console.error(verifyErrors);
  process.exit(1);
}

// Multi-repo existence check
const projectDirs = {
  roadmap: process.cwd(), // this repo
  cockpit: join(process.cwd(), '..', 'cockpit'),
};

const existsInMultiRepo = (artifact: string) => {
  for (const [repo, dir] of Object.entries(projectDirs)) {
    if (existsSync(join(dir, artifact))) {
      console.log(`  [${repo}] ✓ ${artifact}`);
      return true;
    }
  }
  console.log(`  [?] ✗ ${artifact}`);
  return false;
};

console.log('=== MULTI-REPO MERGE ===\n');
console.log(`Merged DAG: ${merged.id}`);
console.log(`  Total nodes: ${Object.keys(merged.nodes).length}`);
console.log(`  Init: ${merged.init}`);
console.log(`  Term: ${merged.term}`);
console.log(`\nValidation:`);
console.log(`  ✓ Acyclic`);
console.log(`  ✓ Connected`);
console.log(`  ✓ Contracts satisfied`);

console.log('\n=== CURRENT POSITION (multi-repo) ===\n');
const position = orient(merged, existsInMultiRepo);

console.log(`Position: ${position.position}`);
console.log(`Produces (in):`);
position.produces.forEach(p => existsInMultiRepo(p));
console.log(`\nConsumes (available):`);
position.consumes.forEach(c => existsInMultiRepo(c));
console.log(`\nRemaining: ${position.remaining.length} nodes`);

if (position.position === merged.term) {
  console.log('\n✓ ROADMAP COMPLETE');
} else {
  console.log(`\nNext: ${position.remaining[0]} → ${position.produces.map(p => `"${p}"`).join(', ')}`);
}

console.log('\n=== MULTI-REPO MERGE COMPLETE ===\n');
console.log('Join point: roadmap-term → cockpit-init via "src/protocol.ts"');
console.log('Rationale:');
console.log('  - Roadmap publishes protocol implementation');
console.log('  - Cockpit imports protocol into orchestration layer');
console.log('  - Merged DAG ensures cockpit waits for roadmap release');
console.log('  - All phases execute in order; single term covers both repos');

export { merged, roadmapDAG, cockpitDAG, existsInMultiRepo };
