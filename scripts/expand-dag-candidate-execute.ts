#!/usr/bin/env npx tsx
// Expansion: add dag-candidate execute nodes into rkg-governess DAG
// These are the implementation tasks from .specify/specs/dag-candidate/tasks.md
// Each node carries expandedFrom: 'dag-candidate-flow' provenance

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

const nodes: Record<string, any> = {
  'dc-candidate-writer': {
    id: 'dc-candidate-writer',
    desc: 'CandidateEnvelope type + writeCandidateDAG() + loadCandidate() + computeHeadSha() in src/lib/dag-candidate.ts',
    produces: ['src/lib/dag-candidate.ts'],
    consumes: [],
    deps: ['dag-candidate-flow'],
    validate: [
      { type: 'artifact-exists', path: 'src/lib/dag-candidate.ts' },
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'dag-candidate-flow',
  },
  'dc-import-candidate': {
    id: 'dc-import-candidate',
    desc: 'Modify cmdImport to write head.candidate.json via writeCandidateDAG() instead of direct head.json overwrite. Block if candidate exists.',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/dag-candidate.ts'],
    deps: ['dc-candidate-writer'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'dag-candidate-flow',
  },
  'dc-expand-candidate': {
    id: 'dc-expand-candidate',
    desc: 'Modify cmdExpand to write candidate via env var ROADMAP_CANDIDATE_PATH instead of direct head.json mutation.',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/dag-candidate.ts'],
    deps: ['dc-candidate-writer'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'dag-candidate-flow',
  },
  'dc-diff': {
    id: 'dc-diff',
    desc: 'Implement `roadmap dag diff` — structural diff between head.json and head.candidate.json.',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/dag-candidate.ts'],
    deps: ['dc-candidate-writer'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'dag-candidate-flow',
  },
  'dc-accept': {
    id: 'dc-accept',
    desc: 'Implement `roadmap dag accept --note "..."` — stale check, validate, promote candidate to head.json, write receipt, git commit.',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/dag-candidate.ts'],
    deps: ['dc-import-candidate', 'dc-expand-candidate', 'dc-diff'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'dag-candidate-flow',
  },
  'dc-reject': {
    id: 'dc-reject',
    desc: 'Implement `roadmap dag reject --note "..."` — delete candidate, write receipt, no head.json change.',
    produces: ['bin/roadmap.ts'],
    consumes: ['src/lib/dag-candidate.ts'],
    deps: ['dc-import-candidate', 'dc-expand-candidate'],
    validate: [
      { type: 'shell', command: 'npx tsc --noEmit', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'dag-candidate-flow',
  },
  'dc-tests': {
    id: 'dc-tests',
    desc: 'Test suite covering all 8 acceptance scenarios (S1-S8). Unit + integration tests.',
    produces: ['tests/dag-candidate.test.ts'],
    consumes: ['src/lib/dag-candidate.ts', 'bin/roadmap.ts'],
    deps: ['dc-accept', 'dc-reject', 'dc-diff'],
    validate: [
      { type: 'artifact-exists', path: 'tests/dag-candidate.test.ts' },
      { type: 'shell', command: 'npx vitest run tests/dag-candidate.test.ts', expectExitCode: 0 },
    ],
    idempotent: true,
    expandedFrom: 'dag-candidate-flow',
  },
};

// Add all nodes
for (const [id, node] of Object.entries(nodes)) {
  if (graph.nodes[id]) {
    console.log(`Node ${id} already exists, skipping`);
    continue;
  }
  graph.nodes[id] = node;
}

// Wire dc-tests into integration-terminal deps (if it exists)
if (graph.nodes['integration-terminal'] && !graph.nodes['integration-terminal'].deps.includes('dc-tests')) {
  graph.nodes['integration-terminal'].deps.push('dc-tests');
}

// Validate
define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log(`Expanded: ${Object.keys(nodes).length} dag-candidate execute nodes added`);
