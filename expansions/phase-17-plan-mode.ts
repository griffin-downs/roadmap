#!/usr/bin/env node
// Phase 17 expansion: Plan Node Execution Mode
// Adds mode field to NodeSpec, expandedFrom provenance, expanded validation rule,
// orient() plan completion, Brief mode surface, CLI plan display.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const headPath = join(import.meta.dirname, '..', '.roadmap', 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// New nodes for Phase 17
const newNodes: Record<string, any> = {
  'plan-mode-types': {
    id: 'plan-mode-types',
    desc: "Add mode?: 'execute' | 'plan' to NodeSpec, expandedFrom?: string for provenance, { type: 'expanded', minNodes?: number } to ValidationRule union. Optional fields — existing DAGs unchanged. Compile-time enforcement.",
    produces: ['src/protocol.ts'],
    consumes: [],
    deps: ['phase-16-term'],
    validate: [{ type: 'artifact-exists', target: 'src/protocol.ts' }],
    idempotent: true,
  },
  'plan-mode-orient': {
    id: 'plan-mode-orient',
    desc: "Update orient() plan node semantics: a node with mode='plan' is done when at least one node with expandedFrom pointing to it exists in the graph. If no expansion children exist, plan node is current position (needs expansion). Default mode='execute' preserves existing behavior.",
    produces: ['src/protocol.ts'],
    consumes: ['src/protocol.ts'],
    deps: ['plan-mode-types'],
    validate: [{ type: 'artifact-exists', target: 'src/protocol.ts' }],
    idempotent: true,
  },
  'plan-mode-validate': {
    id: 'plan-mode-validate',
    desc: "Implement 'expanded' validation rule in validateNode: check that nodes with expandedFrom === nodeId exist in graph, count >= minNodes (default 1). Returns evidence listing expansion children found.",
    produces: ['src/protocol.ts'],
    consumes: ['src/protocol.ts'],
    deps: ['plan-mode-types'],
    validate: [{ type: 'artifact-exists', target: 'src/protocol.ts' }],
    idempotent: true,
  },
  'plan-mode-brief': {
    id: 'plan-mode-brief',
    desc: "Add mode field to Brief type. getBrief reads node mode and returns it. inferPattern handles plan mode: 'Decompose into sub-tasks. Decide if human input needed. Output is DAG expansion.' Agents branch on brief.mode.",
    produces: ['src/lib/brief.ts'],
    consumes: ['src/protocol.ts'],
    deps: ['plan-mode-orient', 'plan-mode-validate'],
    validate: [{ type: 'artifact-exists', target: 'src/lib/brief.ts' }],
    idempotent: true,
  },
  'plan-mode-cli': {
    id: 'plan-mode-cli',
    desc: "CLI plan mode surface: orient output includes mode field per node, chart marks plan nodes with distinct emoji (📋), describe shows plan vs execute node counts. Help text documents plan mode.",
    produces: ['bin/roadmap.ts'],
    consumes: ['src/protocol.ts'],
    deps: ['plan-mode-orient'],
    validate: [{ type: 'artifact-exists', target: 'bin/roadmap.ts' }],
    idempotent: true,
  },
  'plan-mode-tests': {
    id: 'plan-mode-tests',
    desc: "Comprehensive tests: mode field type validation (optional, defaults execute), orient with plan nodes (done when expanded, current when not), expanded validation rule (count children, evidence), Brief.mode field, CLI mode output. Edge cases: plan node with no children, plan node expanded into more plan nodes (recursive).",
    produces: ['tests/plan-mode.test.ts'],
    consumes: ['src/protocol.ts', 'src/lib/brief.ts', 'bin/roadmap.ts'],
    deps: ['plan-mode-brief', 'plan-mode-cli'],
    validate: [{ type: 'function', target: 'vitest', fn: 'npx vitest run tests/plan-mode.test.ts --reporter=dot' }],
    idempotent: true,
  },
  'phase-17-term': {
    id: 'phase-17-term',
    desc: "Phase 17 complete: Plan node execution mode operational. Nodes declare mode ('execute' | 'plan'), orient() handles plan completion via expansion detection, validateNode checks 'expanded' rule, Brief surfaces mode to agents, CLI displays plan nodes distinctly. Backward compatible — mode defaults to 'execute'.",
    produces: [],
    consumes: ['tests/plan-mode.test.ts'],
    deps: ['plan-mode-tests'],
    validate: [],
    idempotent: false,
  },
};

// Add new nodes
for (const [id, node] of Object.entries(newNodes)) {
  dag.nodes[id] = node;
}

// Update term to depend on phase-17-term instead of phase-16-term
dag.nodes.term.deps = ['phase-17-term'];

// Update description
dag.desc = 'DAG expansion protocol — adversarial hardening: spec-first bugs, property tests, consumer validation, plan mode';

writeFileSync(headPath, JSON.stringify(dag, null, 2) + '\n');

const nodeCount = Object.keys(dag.nodes).length;
console.log(JSON.stringify({
  phase: 17,
  title: 'Plan Node Execution Mode',
  nodesAdded: Object.keys(newNodes).length,
  totalNodes: nodeCount,
}));
