// Expansion: Phase 23 — validation enforcement on roadmap complete
// Two parallel workstreams: protocol types + CLI wiring/report
// Both depend on phase-22-term; validate-tests gates on both.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../src/protocol.ts';

const root = process.cwd();
const headPath = join(root, '.roadmap/head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8')) as Graph<string>;
const nodes = dag.nodes as Record<string, any>;

const newNodes: Record<string, any> = {
  // Workstream A: new validation rule types in src/protocol.ts
  'validate-protocol': {
    id: 'validate-protocol',
    desc: 'Add build-produces, launch-check, spec-conformance rule types to validateNode in src/protocol.ts',
    produces: ['src/protocol.ts'],
    consumes: [],
    deps: ['phase-22-term'],
    validate: [
      { type: 'shell', command: 'grep -q "build-produces" src/protocol.ts' },
      { type: 'shell', command: 'grep -q "launch-check" src/protocol.ts' },
      { type: 'shell', command: 'grep -q "spec-conformance" src/protocol.ts' },
    ],
    idempotent: true,
  },

  // Workstream B: CLI wiring + skip-validate flag + report command in bin/roadmap.ts
  'validate-cli': {
    id: 'validate-cli',
    desc: 'Wire validateNode into cmdComplete + --skip-validate flag + roadmap report command in bin/roadmap.ts',
    produces: ['bin/roadmap.ts'],
    consumes: [],
    deps: ['phase-22-term'],
    validate: [
      { type: 'shell', command: 'grep -q "skip-validate" bin/roadmap.ts' },
      { type: 'shell', command: 'grep -q "cmdReport" bin/roadmap.ts' },
    ],
    idempotent: true,
  },

  // Gates on both workstreams
  'validate-tests': {
    id: 'validate-tests',
    desc: 'Tests for validation enforcement: build-produces, launch-check, spec-conformance, cmdComplete rejection, --skip-validate, report',
    produces: ['tests/validate-enforcement.test.ts'],
    consumes: ['src/protocol.ts', 'bin/roadmap.ts'],
    deps: ['validate-protocol', 'validate-cli'],
    validate: [
      { type: 'artifact-exists', target: 'tests/validate-enforcement.test.ts' },
      { type: 'shell', command: 'npx vitest run tests/validate-enforcement.test.ts --reporter=dot' },
    ],
    idempotent: true,
  },

  'phase-23-term': {
    id: 'phase-23-term',
    desc: 'Phase 23 complete: validateNode enforced on complete, 3 new rule types, gap report command',
    produces: [],
    consumes: ['tests/validate-enforcement.test.ts'],
    deps: ['validate-tests'],
    validate: [{ type: 'shell', command: 'npx tsc --noEmit' }],
    idempotent: false,
  },
};

for (const [id, node] of Object.entries(newNodes)) {
  nodes[id] = node;
}

// Repoint term to phase-23-term
const term = nodes[dag.term] as any;
term.deps = term.deps.map((d: string) => d === 'phase-22-term' ? 'phase-23-term' : d);

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');
console.log(`Expanded: +${Object.keys(newNodes).length} nodes (phase-23). Total: ${Object.keys(nodes).length}`);
