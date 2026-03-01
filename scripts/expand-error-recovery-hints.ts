import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

const parentNode = nodes['error-recovery-hints'];
const newNodes: Record<string, any> = {
  'error-design': {
    id: 'error-design',
    desc: 'Design error classification scheme (permission|args|logic|system)',
    produces: ['.roadmap/cli-quality/error-classification.md'],
    consumes: [],
    deps: [parentNode.deps[0]],
    validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/error-classification.md' }],
    expandedFrom: 'error-recovery-hints'
  },
  'error-impl': {
    id: 'error-impl',
    desc: 'Implement error hints for claim/orient/validate/complete commands',
    produces: ['src/lib/cli.ts', 'src/lib/error-recovery.ts'],
    consumes: ['.roadmap/cli-quality/error-classification.md'],
    deps: ['error-design'],
    validate: [{ type: 'artifact-exists', target: 'src/lib/error-recovery.ts' }],
    expandedFrom: 'error-recovery-hints'
  },
  'error-test': {
    id: 'error-test',
    desc: 'Test error classification and recovery hints across 50 scenarios',
    produces: ['tests/cli/error-recovery.test.ts'],
    consumes: [],
    deps: ['error-impl'],
    validate: [{ type: 'shell', cmd: 'npm test -- error-recovery.test.ts' }],
    expandedFrom: 'error-recovery-hints'
  },
  'error-mine': {
    id: 'error-mine',
    desc: 'Mine error scenarios, measure retry rate >= 80% (up from 50%)',
    produces: ['.roadmap/cli-quality/mining-error-recovery.json'],
    consumes: [],
    deps: ['error-test'],
    validate: [{ type: 'shell', cmd: 'node -e "const d=JSON.parse(require(\'fs\').readFileSync(\'.roadmap/cli-quality/mining-error-recovery.json\',\'utf-8\')); if(d.rate>=0.8) process.exit(0); else process.exit(1);"' }],
    expandedFrom: 'error-recovery-hints'
  }
};

Object.assign(nodes, newNodes);
parentNode.deps = ['error-mine'];
parentNode.validate = [{ type: 'artifact-exists', target: '.roadmap/cli-quality/mining-error-recovery.json' }];

writeFileSync(headPath, JSON.stringify(dag, null, 2));
console.log('✅ Expanded: error-recovery-hints → 4 nodes (design→impl→test→mine)');
