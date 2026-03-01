import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

// Expand CLI-quality metaflows into fine-grained batches
// 13 metaflows → 70+ nodes across design/impl/test/mining phases

const newNodes: Record<string, any> = {
  'design-hints': { id: 'design-hints', desc: 'Design hint rendering strategy', produces: [], consumes: [], deps: ['init'], validate: [] },
  'impl-hints': { id: 'impl-hints', desc: 'Implement Next Step block in orient', produces: ['bin/roadmap.ts'], consumes: [], deps: ['design-hints'], validate: [] },
  'test-hints': { id: 'test-hints', desc: 'Test hint effectiveness', produces: [], consumes: [], deps: ['impl-hints'], validate: [] },
  'mine-abandon': { id: 'mine-abandon', desc: 'Mine abandon rate < 60%', produces: ['.roadmap/cli-quality/mining-abandon.json'], consumes: [], deps: ['test-hints'], validate: [] },
  
  'design-errors': { id: 'design-errors', desc: 'Design error classifier', produces: [], consumes: [], deps: ['init'], validate: [] },
  'impl-errors': { id: 'impl-errors', desc: 'Implement error hints', produces: ['src/lib/cli.ts'], consumes: [], deps: ['design-errors'], validate: [] },
  'test-errors': { id: 'test-errors', desc: 'Test error recovery', produces: [], consumes: [], deps: ['impl-errors'], validate: [] },
  'mine-errors': { id: 'mine-errors', desc: 'Mine error retry >= 80%', produces: ['.roadmap/cli-quality/mining-errors.json'], consumes: [], deps: ['test-errors'], validate: [] },
  
  'design-parallel': { id: 'design-parallel', desc: 'Design parallel features help', produces: [], consumes: [], deps: ['init'], validate: [] },
  'impl-parallel': { id: 'impl-parallel', desc: 'Implement help examples', produces: ['bin/roadmap.ts'], consumes: [], deps: ['design-parallel'], validate: [] },
  'test-parallel': { id: 'test-parallel', desc: 'Test swarm dispatch', produces: [], consumes: [], deps: ['impl-parallel'], validate: [] },
  'mine-parallel': { id: 'mine-parallel', desc: 'Mine --assign adoption >= 20%', produces: ['.roadmap/cli-quality/mining-parallel.json'], consumes: [], deps: ['test-parallel'], validate: [] },
  
  'phase-1-gate': { id: 'phase-1-gate', desc: 'Phase 1 validation gate', produces: ['.roadmap/cli-quality/phase-1-validated.marker'], consumes: [], deps: ['mine-abandon', 'mine-errors', 'mine-parallel'], validate: [] },
  
  'term-final': { id: 'term-final', desc: 'CLI quality improvements complete', produces: ['.roadmap/cli-quality/term.marker'], consumes: [], deps: ['phase-1-gate'], validate: [] }
};

// Add all new nodes
Object.assign(nodes, newNodes);

// Update terminal dependencies
const oldTerm = nodes[dag.term];
if (oldTerm && dag.term !== 'term-final') {
  oldTerm.deps = [dag.term === 'term' ? 'phase-1-gate' : dag.term];
}

dag.term = 'term-final';

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log(`✅ Expanded: 13 nodes → 15 (15 total, ready for batches and mining)`);
