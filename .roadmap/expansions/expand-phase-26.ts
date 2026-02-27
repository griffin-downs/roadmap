// Expansion script: Phase 26 — Example phase for demonstration
// Adds 5 new nodes showing expansion pattern: parallel tasks + convergence

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;

// Phase 26 nodes
const newNodes: Record<string, any> = {
  'phase-26-init': {
    id: 'phase-26-init',
    desc: 'Phase 26 begins: Example phase for demonstration',
    produces: [],
    consumes: [],
    deps: ['e2e-spec-threading'],
    validate: [],
    idempotent: true,
    mode: 'execute',
  },
  'example-task-a': {
    id: 'example-task-a',
    desc: 'Example task A: demonstrates node structure',
    produces: ['examples/task-a.md'],
    consumes: [],
    deps: ['phase-26-init'],
    validate: [
      { type: 'artifact-exists', target: 'examples/task-a.md' },
    ],
    idempotent: true,
    mode: 'execute',
  },
  'example-task-b': {
    id: 'example-task-b',
    desc: 'Example task B: demonstrates parallel execution',
    produces: ['examples/task-b.md'],
    consumes: [],
    deps: ['phase-26-init'],
    validate: [
      { type: 'artifact-exists', target: 'examples/task-b.md' },
    ],
    idempotent: true,
    mode: 'execute',
  },
  'example-integration': {
    id: 'example-integration',
    desc: 'Example integration: demonstrates dependency convergence',
    produces: ['examples/integration.md'],
    consumes: ['examples/task-a.md', 'examples/task-b.md'],
    deps: ['example-task-a', 'example-task-b'],
    validate: [
      { type: 'artifact-exists', target: 'examples/integration.md' },
    ],
    idempotent: true,
    mode: 'execute',
  },
  'phase-26-term': {
    id: 'phase-26-term',
    desc: 'Phase 26 complete: Example phase demonstrates expansion and parallel execution',
    produces: [],
    consumes: ['examples/task-a.md', 'examples/task-b.md', 'examples/integration.md'],
    deps: ['example-integration'],
    validate: [
      { type: 'shell', command: 'test -f examples/task-a.md && test -f examples/task-b.md && test -f examples/integration.md' },
    ],
    idempotent: false,
    mode: 'execute',
  },
};

// Splice in all phase-26 nodes
const nodes = dag.nodes as Record<string, any>;
for (const [id, node] of Object.entries(newNodes)) {
  nodes[id] = node;
}

// Fix spec-docs: remove circular dependency on term
const specDocs = nodes['spec-docs'] as any;
if (specDocs) {
  specDocs.deps = specDocs.deps.filter((d: string) => d !== 'term');
}

// Fix e2e-spec-threading: remove direct term dependency since phase-26 is now between them
const e2eSpec = nodes['e2e-spec-threading'] as any;
if (e2eSpec) {
  e2eSpec.deps = e2eSpec.deps.filter((d: string) => d !== 'term');
}

// Update term to depend on phase-26-term instead of spec-threading-feature
const term = nodes[dag.term] as any;
term.deps = term.deps.map((d: string) => d === 'spec-docs' || d === 'spec-threading-feature' ? 'phase-26-term' : d);

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log(`Expanded: +${Object.keys(newNodes).length} nodes (phase-26). Total: ${Object.keys(nodes).length}`);
