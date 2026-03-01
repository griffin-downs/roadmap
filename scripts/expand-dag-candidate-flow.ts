#!/usr/bin/env npx tsx
// Expansion script: add dag-candidate-flow plan node to rkg-governess DAG
// Tracks: non-destructive import/expand — candidate DAG written alongside head.json,
// diff/compare command, explicit accept/reject before head.json is mutated.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { define } from '../src/protocol.ts';

const headPath = join(process.cwd(), '.roadmap', 'head.json');
const graph = JSON.parse(readFileSync(headPath, 'utf-8'));

// Add plan node
graph.nodes['dag-candidate-flow'] = {
  id: 'dag-candidate-flow',
  desc: 'Non-destructive import/expand: write candidate DAG to head.candidate.json, provide diff + accept/reject before head.json is mutated. Spec-kit → parallel agents.',
  mode: 'plan',
  produces: [
    '.specify/pre-spec/dag-candidate.md',
    '.specify/specs/dag-candidate/spec.md',
    '.specify/specs/dag-candidate/tasks.md',
  ],
  consumes: [],
  ambient: [
    'src/lib/speckit-import.ts',
    'src/lib/plan-overlay.ts',
    'src/lib/intake.ts',
    'src/lib/spec-origin.ts',
    'bin/roadmap.ts',
  ],
  deps: ['init'],
  validate: [
    { type: 'artifact-exists', path: '.specify/pre-spec/dag-candidate.md' },
    { type: 'artifact-exists', path: '.specify/specs/dag-candidate/spec.md' },
    { type: 'artifact-exists', path: '.specify/specs/dag-candidate/tasks.md' },
    { type: 'expanded', minNodes: 3 },
  ],
  idempotent: false,
};

// Wire into term
if (!graph.nodes['term'].deps.includes('dag-candidate-flow')) {
  graph.nodes['term'].deps.push('dag-candidate-flow');
}

// Validate
define(graph);

writeFileSync(headPath, JSON.stringify(graph, null, 2));
console.log('Expanded: dag-candidate-flow added, wired into term.deps');
