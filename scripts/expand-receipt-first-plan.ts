#!/usr/bin/env npx tsx
// Expansion script: add receipt-first-plan node to rkg-governess DAG.
// Tracks: receipt-first scenarios + breakglass escalation system.
// Wired into integration-terminal (convergence gate), not term directly.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

graph.nodes['receipt-first-plan'] = {
  id: 'receipt-first-plan',
  desc: 'Spec-kit receipt-first scenarios + breakglass escalation: every CLI command writes a receipt, scenarios gate on receipt chains, breakglass is a bounded auditable receipt (not a flag). Execute via parallel persisted agents.',
  mode: 'plan',
  produces: [
    '.specify/pre-spec/receipt-first.md',
    '.specify/specs/receipt-first/spec.md',
    '.specify/specs/receipt-first/tasks.md',
  ],
  consumes: [],
  ambient: [
    'src/lib/metaflow/receipt-writer.ts',
    'src/lib/metaflow/wrap.ts',
    'src/lib/metaflow/command-registry.ts',
    'bin/roadmap.ts',
    'src/lib/cli-envelope.ts',
  ],
  deps: ['init'],
  validate: [
    { type: 'artifact-exists', path: '.specify/pre-spec/receipt-first.md' },
    { type: 'artifact-exists', path: '.specify/specs/receipt-first/spec.md' },
    { type: 'artifact-exists', path: '.specify/specs/receipt-first/tasks.md' },
    { type: 'expanded', minNodes: 5 },
  ],
  idempotent: false,
};

// Wire into integration-terminal (convergence gate before term), not term directly
if (!graph.nodes['integration-terminal'].deps.includes('receipt-first-plan')) {
  graph.nodes['integration-terminal'].deps.push('receipt-first-plan');
}

define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log('Expanded: receipt-first-plan added, wired into integration-terminal.deps');
