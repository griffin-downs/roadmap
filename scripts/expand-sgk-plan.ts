#!/usr/bin/env npx tsx
// Expansion: SGK-1 — Strategy Governance Kernel plan node.
// Run cannot dispatch without strategy receipt. Run cannot close without
// mine+audit+term intent. Strategies always surfaced. Breakglass is the
// only escape hatch and it's auditable.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

graph.nodes['sgk-plan'] = {
  id: 'sgk-plan',
  desc: 'SGK-1 — Strategy Governance Kernel: spec-kit the full receipt chain enforcing strategy selection, init/term intent gates, mining, audit, display receipts, and run close obligations. Strategy usage becomes non-optional and self-propagating. Execute via parallel persisted agents (8 batches, ~28 nodes).',
  mode: 'plan',
  produces: [
    '.specify/pre-spec/sgk.md',
    '.specify/specs/sgk/spec.md',
    '.specify/specs/sgk/tasks.md',
  ],
  consumes: [],
  ambient: [
    'src/lib/strategy/registry.ts',
    'src/lib/strategy/select.ts',
    'src/lib/metaflow/receipt-writer.ts',
    'src/lib/metaflow/command-registry.ts',
    'src/lib/cli-envelope.ts',
    'bin/roadmap.ts',
  ],
  deps: ['init'],
  validate: [
    { type: 'artifact-exists', path: '.specify/pre-spec/sgk.md' },
    { type: 'artifact-exists', path: '.specify/specs/sgk/spec.md' },
    { type: 'artifact-exists', path: '.specify/specs/sgk/tasks.md' },
    { type: 'expanded', minNodes: 8 },
  ],
  idempotent: false,
};

if (!graph.nodes['integration-terminal'].deps.includes('sgk-plan')) {
  graph.nodes['integration-terminal'].deps.push('sgk-plan');
}

define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log('Expanded: sgk-plan added, wired into integration-terminal.deps');
