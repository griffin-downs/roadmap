/**
 * Example: Using Simple Project Roadmap
 *
 * Demonstrates orient(), merge(), branch() workflows
 */

import { orient, verify, check, merge, branch, order, parallelOrder, CompletionStore } from '../src/protocol.ts';
import { simpleProjectRoadmap } from './simple-project-roadmap.ts';

const g = simpleProjectRoadmap;

// --- Example 1: Validation ---

console.log('=== Validation ===');
console.log('Structure check:', check(g).done ? 'PASS' : 'FAIL');
console.log('Contracts check:', verify(g).length === 0 ? 'PASS' : 'FAIL');

// --- Example 2: Execution Order ---

console.log('\n=== Execution Order ===');
const seq = order(g);
console.log('Sequential order:', seq);

const batches = parallelOrder(g);
console.log('Parallel batches:');
batches.forEach((batch, i) => console.log(`  Batch ${i}: ${batch.join(', ')}`));
// Output:
//   Batch 0: scaffold
//   Batch 1: build, test
//   Batch 2: ready

// --- Example 3: Orientation (Starting Point) ---

console.log('\n=== Orientation: Initial State ===');
// No nodes completed yet
const initial = orient(g, CompletionStore.empty());
console.log(`Position: ${initial.position}`);
console.log(`Done: [${initial.done.join(', ')}]`);
console.log(`Produces: ${initial.produces.join(', ')}`);
console.log(`Remaining: ${initial.remaining.length} nodes`);
// Output:
//   Position: scaffold
//   Done: []
//   Produces: src/main.ts, src/utils.ts, tsconfig.json, package.json
//   Remaining: 4 nodes

// --- Example 4: Orientation (After Scaffold) ---

console.log('\n=== Orientation: After Scaffold ===');
// Scaffold complete (has receipt)
const afterScaffold = orient(g, CompletionStore.from(['scaffold']));
console.log(`Position: ${afterScaffold.position}`);
console.log(`Done: [${afterScaffold.done.join(', ')}]`);
console.log(`Next nodes: ${afterScaffold.remaining.slice(0, 2).join(', ')} (parallel)`);
// Output:
//   Position: build
//   Done: [scaffold]
//   Next nodes: build, test (parallel)

// --- Example 5: Orientation (Partial Progress) ---

console.log('\n=== Orientation: Partial Progress ===');
// Scaffold complete but build not yet receipted
const partial = orient(g, CompletionStore.from(['scaffold']));
console.log(`Position: ${partial.position}`);
console.log(`Produces: ${partial.produces.join(', ')}`);
// Position is still 'build' because no receipt yet

// --- Example 6: Full Completion ---

console.log('\n=== Orientation: Complete ===');
// All nodes have receipts
const complete = orient(g, CompletionStore.from(Object.keys(g.nodes)));
console.log(`Position: ${complete.position}`);
console.log(`Done count: ${complete.done.length} / ${Object.keys(g.nodes).length}`);
console.log(`Complete: ${complete.complete}`);
// Output:
//   Position: ready
//   Done count: 4 / 4
//   Complete: true

// --- Example 7: Merge Example (Two Phases) ---

console.log('\n=== Merge Example ===');

// Phase 1: build foundation
const phase1 = simpleProjectRoadmap;

// Phase 2: deploy (separate DAG)
const { define: def, graph: gf } = await import('../src/protocol.ts');
const phase2 = def(
  gf({
    id: 'deployment',
    desc: 'Deploy application',
    init: 'prep-deploy',
    term: 'deployed',
    nodes: {
      'prep-deploy': {
        id: 'prep-deploy',
        desc: 'Prepare for deployment',
        produces: [],
        consumes: ['dist/main.js'],
        deps: [],
        validate: [],
        idempotent: true,
      },
      deploy: {
        id: 'deploy',
        desc: 'Deploy to production',
        produces: ['deployment/version.txt'],
        consumes: ['dist/main.js'],
        deps: ['prep-deploy'],
        validate: [{ type: 'artifact-exists', target: 'deployment/version.txt' }],
        idempotent: false,
      },
      deployed: {
        id: 'deployed',
        desc: 'Deployment complete',
        produces: [],
        consumes: ['deployment/version.txt'],
        deps: ['deploy'],
        validate: [],
        idempotent: false,
      },
    },
  })
);

// Merge phase 1 → phase 2 at (ready → prep-deploy)
const combined = merge(phase1, phase2, [
  { g1Node: 'ready', g2Node: 'prep-deploy', artifact: 'dist/main.js' },
]);

console.log(`Merged DAG: ${combined.id}`);
console.log(`Init: ${combined.init}, Term: ${combined.term}`);
console.log(`Total nodes: ${Object.keys(combined.nodes).length}`);
// Output:
//   Merged DAG: simple-project+deployment
//   Init: scaffold, Term: deployed
//   Total nodes: 8

// --- Example 8: Branch Example (Recovery) ---

console.log('\n=== Branch Example ===');

// Scenario: Phase 1 complete, but phase 2 failed at deploy
// Resume from deploy without re-running build/test
const recoverPhase2 = branch(combined, 'deploy');

console.log(`Branch DAG: ${recoverPhase2.id}`);
console.log(`Branch init: ${recoverPhase2.init} (was: scaffold)`);
console.log(`Branch term: ${recoverPhase2.term} (unchanged: deployed)`);
console.log(`Branch nodes: ${Object.keys(recoverPhase2.nodes).length} (was: 8)`);
// Output:
//   Branch DAG: simple-project+deployment:deploy
//   Branch init: deploy (was: scaffold)
//   Branch term: deployed (unchanged: deployed)
//   Branch nodes: 2 (was: 8)

console.log('\nExample complete!');
