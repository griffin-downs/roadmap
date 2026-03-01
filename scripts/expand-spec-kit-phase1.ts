import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

// Expand the design-hints-rendering node (from spec-kit) into concrete batches
if (nodes['design-hints-rendering']) {
  const newNodes: Record<string, any> = {
    'hints-render-design': {
      id: 'hints-render-design',
      desc: 'Document hint rendering strategy (placement, format, A/B variants)',
      produces: ['.roadmap/cli-quality/hints-design.md'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/hints-design.md' }],
      expandedFrom: 'design-hints-rendering'
    },
    'hints-orient-implement': {
      id: 'hints-orient-implement',
      desc: 'Implement Next Step block + pattern detection in orient',
      produces: ['bin/roadmap.ts'],
      consumes: ['.roadmap/cli-quality/hints-design.md'],
      deps: ['hints-render-design'],
      validate: [{ type: 'shell', cmd: 'bin/roadmap orient --note test 2>/dev/null | grep -q "Next step"' }],
      expandedFrom: 'design-hints-rendering'
    }
  };
  
  Object.assign(nodes, newNodes);
  nodes['design-hints-rendering'].deps = ['hints-render-design'];
  console.log('✅ Expanded: design-hints-rendering → hints-render-design, hints-orient-implement');
}

// Expand design-error-classifier
if (nodes['design-error-classifier']) {
  const newNodes: Record<string, any> = {
    'error-classify-design': {
      id: 'error-classify-design',
      desc: 'Design error classifier (permission|args|logic|system)',
      produces: ['.roadmap/cli-quality/error-classification.md'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/error-classification.md' }],
      expandedFrom: 'design-error-classifier'
    },
    'error-handlers-implement': {
      id: 'error-handlers-implement',
      desc: 'Add recovery hints to claim/orient/validate/complete',
      produces: ['src/lib/cli.ts'],
      consumes: ['.roadmap/cli-quality/error-classification.md'],
      deps: ['error-classify-design'],
      validate: [{ type: 'shell', cmd: 'grep -q "recovery hint" src/lib/cli.ts' }],
      expandedFrom: 'design-error-classifier'
    }
  };
  
  Object.assign(nodes, newNodes);
  nodes['design-error-classifier'].deps = ['error-classify-design'];
  console.log('✅ Expanded: design-error-classifier → error-classify-design, error-handlers-implement');
}

// Expand update-help-assign-next-ready
if (nodes['update-help-assign-next-ready']) {
  const newNodes: Record<string, any> = {
    'help-parallel-design': {
      id: 'help-parallel-design',
      desc: 'Design help examples for --assign, --next, --ready',
      produces: ['.roadmap/cli-quality/parallel-help-design.md'],
      consumes: [],
      deps: ['init'],
      validate: [{ type: 'artifact-exists', target: '.roadmap/cli-quality/parallel-help-design.md' }],
      expandedFrom: 'update-help-assign-next-ready'
    },
    'help-swarm-implement': {
      id: 'help-swarm-implement',
      desc: 'Implement swarm dispatch examples in help text',
      produces: ['bin/roadmap.ts'],
      consumes: ['.roadmap/cli-quality/parallel-help-design.md'],
      deps: ['help-parallel-design'],
      validate: [{ type: 'shell', cmd: 'bin/roadmap help 2>&1 | grep -q "assign"' }],
      expandedFrom: 'update-help-assign-next-ready'
    }
  };
  
  Object.assign(nodes, newNodes);
  nodes['update-help-assign-next-ready'].deps = ['help-parallel-design'];
  console.log('✅ Expanded: update-help-assign-next-ready → help-parallel-design, help-swarm-implement');
}

writeFileSync(headPath, JSON.stringify(dag, null, 2));
