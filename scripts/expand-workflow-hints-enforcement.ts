import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

// Expand workflow-hints-enforcement into design/impl/test/mining batches
const parentNode = nodes['workflow-hints-enforcement'];
const newNodes: Record<string, any> = {
  'hints-design': {
    id: 'hints-design',
    desc: 'Design hint rendering strategy (placement, format, visibility)',
    produces: ['.roadmap/cli-quality/hints-design.md'],
    consumes: [],
    deps: [parentNode.deps[0]],
    validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/hints-design.md' }],
    expandedFrom: 'workflow-hints-enforcement'
  },
  'hints-impl': {
    id: 'hints-impl',
    desc: 'Implement Next Step block + re-orient pattern detection in orient output',
    produces: ['bin/roadmap.ts'],
    consumes: ['.roadmap/cli-quality/hints-design.md'],
    deps: ['hints-design'],
    validate: [{ type: 'artifact-exists', target: 'bin/roadmap.ts' }],
    expandedFrom: 'workflow-hints-enforcement'
  },
  'hints-test': {
    id: 'hints-test',
    desc: 'Test hint effectiveness, A/B test verbose vs minimal',
    produces: ['tests/cli/hints.test.ts'],
    consumes: [],
    deps: ['hints-impl'],
    validate: [{ type: 'shell', cmd: 'npm test -- hints.test.ts' }],
    expandedFrom: 'workflow-hints-enforcement'
  },
  'hints-mine': {
    id: 'hints-mine',
    desc: 'Mine 50+ workflows, measure abandon rate < 60% (down from 78.8%)',
    produces: ['.roadmap/cli-quality/mining-abandon-rate.json'],
    consumes: [],
    deps: ['hints-test'],
    validate: [{ type: 'shell', cmd: 'node -e "const d=JSON.parse(require(\'fs\').readFileSync(\'.roadmap/cli-quality/mining-abandon-rate.json\',\'utf-8\')); if(d.rate<0.6) process.exit(0); else process.exit(1);"' }],
    expandedFrom: 'workflow-hints-enforcement'
  }
};

Object.assign(nodes, newNodes);
parentNode.deps = ['hints-mine'];
parentNode.validate = [{ type: 'artifact-exists', target: '.roadmap/cli-quality/mining-abandon-rate.json' }];

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✅ Expanded: workflow-hints-enforcement → 4 nodes (design→impl→test→mine)');
