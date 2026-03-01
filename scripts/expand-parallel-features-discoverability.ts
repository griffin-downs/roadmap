import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

const parentNode = nodes['parallel-features-discoverability'];
const newNodes: Record<string, any> = {
  'parallel-design': {
    id: 'parallel-design',
    desc: 'Design help text strategy for --assign, --next, --ready swarm flags',
    produces: ['.roadmap/cli-quality/parallel-help-design.md'],
    consumes: [],
    deps: [parentNode.deps[0]],
    validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/parallel-help-design.md' }],
    expandedFrom: 'parallel-features-discoverability'
  },
  'parallel-impl': {
    id: 'parallel-impl',
    desc: 'Implement swarm dispatch examples in help (--assign, --next, --ready)',
    produces: ['bin/roadmap.ts'],
    consumes: ['.roadmap/cli-quality/parallel-help-design.md'],
    deps: ['parallel-design'],
    validate: [{ type: 'shell', cmd: 'bin/roadmap help 2>&1 | grep -q "assign\\|next\\|ready"' }],
    expandedFrom: 'parallel-features-discoverability'
  },
  'parallel-test': {
    id: 'parallel-test',
    desc: 'Test 3-agent swarm dispatch with --assign, --next, --ready',
    produces: ['tests/cli/swarm-dispatch.test.ts'],
    consumes: [],
    deps: ['parallel-impl'],
    validate: [{ type: 'shell', cmd: 'npm test -- swarm-dispatch.test.ts' }],
    expandedFrom: 'parallel-features-discoverability'
  },
  'parallel-mine': {
    id: 'parallel-mine',
    desc: 'Mine 20+ agent swarms, measure --assign adoption >= 20% (up from 0%)',
    produces: ['.roadmap/cli-quality/mining-parallel-adoption.json'],
    consumes: [],
    deps: ['parallel-test'],
    validate: [{ type: 'shell', cmd: 'node -e "const d=JSON.parse(require(\'fs\').readFileSync(\'.roadmap/cli-quality/mining-parallel-adoption.json\',\'utf-8\')); if(d.rate>=0.2) process.exit(0); else process.exit(1);"' }],
    expandedFrom: 'parallel-features-discoverability'
  }
};

Object.assign(nodes, newNodes);
parentNode.deps = ['parallel-mine'];
parentNode.validate = [{ type: 'artifact-exists', target: '.roadmap/cli-quality/mining-parallel-adoption.json' }];

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✅ Expanded: parallel-features-discoverability → 4 nodes (design→impl→test→mine)');
