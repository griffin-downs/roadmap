#!/usr/bin/env npx tsx
// Expansion script: add cli-output-plan execute children to rkg-governess DAG
// Phase 2: child nodes from spec-kit tasks.md with expandedFrom provenance

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

// Ensure plan node exists (idempotent — may already be in DAG)
if (!graph.nodes['cli-output-plan']) {
  graph.nodes['cli-output-plan'] = {
    id: 'cli-output-plan',
    desc: 'Spec-kit the CLI stdout/stderr audit + receipt system redesign. Produce pre-spec.md, spec.md, tasks.md. Execute via massively parallel persisted background agents.',
    mode: 'plan',
    produces: [
      '.specify/pre-spec/cli-output.md',
      '.specify/specs/cli-output/spec.md',
      '.specify/specs/cli-output/tasks.md',
    ],
    consumes: [],
    ambient: [
      'src/lib/cli-envelope.ts',
      'bin/roadmap.ts',
      'src/lib/metaflow/receipt-writer.ts',
      'src/lib/metaflow/wrap.ts',
    ],
    deps: ['init'],
    validate: [
      { type: 'artifact-exists', path: '.specify/pre-spec/cli-output.md' },
      { type: 'artifact-exists', path: '.specify/specs/cli-output/spec.md' },
      { type: 'artifact-exists', path: '.specify/specs/cli-output/tasks.md' },
      { type: 'expanded', minNodes: 3 },
    ],
    idempotent: false,
  };
}

// Add execute children (idempotent)
const children: Record<string, any> = {
  'co-audit-console-log': {
    id: 'co-audit-console-log',
    desc: 'Replace all console.log in bin/roadmap.ts command functions with json() — human text to stderr, JSON envelope to stdout',
    mode: 'execute',
    produces: ['bin/roadmap.ts'],
    consumes: [],
    ambient: ['src/lib/cli-envelope.ts', 'src/lib/cli-human.ts', 'src/lib/render/index.ts'],
    deps: ['cli-output-plan'],
    validate: [
      { type: 'shell', command: "grep -c 'console\\.log' bin/roadmap.ts | awk '{exit ($1 > 5 ? 1 : 0)}'", expectExitCode: 0 },
      { type: 'shell', command: 'npx tsx bin/roadmap.ts chart --note "validate" 2>/dev/null | jq -e ".ok" >/dev/null', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'cli-output-plan',
  },
  'co-render-models': {
    id: 'co-render-models',
    desc: 'Build RenderModel for every stateful command missing one — advance, complete, validate, doctor, remaining, status, plan-gallery, plan-select, plan-status, certify',
    mode: 'execute',
    produces: ['bin/roadmap.ts'],
    consumes: [],
    ambient: ['src/lib/cli-human.ts', 'src/lib/render/index.ts'],
    deps: ['co-audit-console-log'],
    validate: [
      { type: 'shell', command: 'npx tsx bin/roadmap.ts doctor completion 2>/dev/null | jq -e ".render.body" >/dev/null', expectExitCode: 0 },
      { type: 'shell', command: 'npx tsx bin/roadmap.ts remaining 2>/dev/null | jq -e ".render.body" >/dev/null', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'cli-output-plan',
  },
  'co-stdout-tests': {
    id: 'co-stdout-tests',
    desc: 'Tests verifying stdout is clean JSON for chart, doctor, remaining and render.body populated for stateful commands',
    mode: 'execute',
    produces: ['tests/cli-output.test.ts'],
    consumes: [],
    ambient: ['bin/roadmap.ts', 'src/lib/cli-envelope.ts'],
    deps: ['co-render-models'],
    validate: [
      { type: 'artifact-exists', path: 'tests/cli-output.test.ts' },
    ],
    idempotent: true,
    expandedFrom: 'cli-output-plan',
  },
  'co-integration-jq': {
    id: 'co-integration-jq',
    desc: 'Integration test — pipe orient, chart, doctor, remaining through jq, verify exit 0 and render.body non-empty',
    mode: 'execute',
    produces: ['tests/cli-output-integration.test.ts'],
    consumes: [],
    ambient: ['bin/roadmap.ts'],
    deps: ['co-render-models'],
    validate: [
      { type: 'artifact-exists', path: 'tests/cli-output-integration.test.ts' },
    ],
    idempotent: true,
    expandedFrom: 'cli-output-plan',
  },
};

for (const [id, node] of Object.entries(children)) {
  if (!graph.nodes[id]) graph.nodes[id] = node;
}

// Wire integration-terminal to depend on test nodes (replacing cli-output-plan dep)
const intTerm = graph.nodes['integration-terminal'];
if (intTerm) {
  const deps: string[] = intTerm.deps;
  // Remove cli-output-plan — children supersede it
  const planIdx = deps.indexOf('cli-output-plan');
  if (planIdx !== -1) deps.splice(planIdx, 1);
  if (!deps.includes('co-stdout-tests')) deps.push('co-stdout-tests');
  if (!deps.includes('co-integration-jq')) deps.push('co-integration-jq');
}

// Wire term if not already
if (!graph.nodes['term'].deps.includes('cli-output-plan')) {
  graph.nodes['term'].deps.push('cli-output-plan');
}

// Terminal intent gate — required invariant
const termNode = graph.nodes['term'];
const hasIntentGate = (termNode.validate ?? []).some((r: any) => r.type === 'intent' && r.expandOnFail === true);
if (!hasIntentGate) {
  termNode.validate = [
    ...(termNode.validate ?? []),
    {
      type: 'intent',
      statement: 'All RKG-3/4/5/6 governance hardening complete and CLI output audit executed: stdout is clean JSON, render.body populated for all stateful commands, test suite green, TypeScript clean',
      confidence: 0.95,
      evaluator: 'self',
      expandOnFail: true,
    },
  ];
}

// Validate structure
define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log(`Expanded: ${Object.keys(children).length} cli-output-plan children added`);
