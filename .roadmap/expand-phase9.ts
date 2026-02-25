/**
 * Roadmap expansion: Phase 9 (regent integration layer)
 * Run: node --experimental-strip-types .roadmap/expand-phase9.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, verify } from '../src/protocol.ts';

const headPath = join(import.meta.dirname, 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// Phase 9 nodes: regent agent bootstrap + real project adoption
const phase9Nodes = {
  'agent-bootstrap-spec': {
    id: 'agent-bootstrap-spec',
    desc: 'Spec: regent agent template with sealed APIs — getBrief, checkpoint, advance',
    produces: [
      'docs/decisions/agent-bootstrap-design.md',
      '.claude/agents/roadmap-executor-template.md',
    ],
    consumes: ['src/protocol.ts', 'SPEC.md'],
    deps: ['phase-8-term'],
    validate: [
      { type: 'artifact-exists', target: 'docs/decisions/agent-bootstrap-design.md' },
      {
        type: 'artifact-exists',
        target: '.claude/agents/roadmap-executor-template.md',
      },
    ],
    idempotent: true,
  },

  'error-guidance-spec': {
    id: 'error-guidance-spec',
    desc: 'Spec: compilation error → guidance loop — agents learn from errors',
    produces: ['docs/decisions/error-guidance-design.md'],
    consumes: ['src/protocol.ts', 'README.md'],
    deps: ['agent-bootstrap-spec'],
    validate: [
      { type: 'artifact-exists', target: 'docs/decisions/error-guidance-design.md' },
    ],
    idempotent: true,
  },

  'agent-executor-impl': {
    id: 'agent-executor-impl',
    desc: 'Implement: regent executor agent skeleton — boots, calls getBrief, executes node',
    produces: [
      '.claude/agents/roadmap-executor.ts',
      'tests/agent-executor.test.ts',
    ],
    consumes: [
      'docs/decisions/agent-bootstrap-design.md',
      'src/protocol.ts',
    ],
    deps: ['error-guidance-spec'],
    validate: [
      { type: 'artifact-exists', target: '.claude/agents/roadmap-executor.ts' },
      { type: 'artifact-exists', target: 'tests/agent-executor.test.ts' },
    ],
    idempotent: true,
  },

  'fusion-integration': {
    id: 'fusion-integration',
    desc: 'Real project: fusion roadmap + executor agent — end-to-end test',
    produces: [
      'example/fusion-roadmap-integration.test.ts',
      'docs/real-project-adoption.md',
    ],
    consumes: [
      '.claude/agents/roadmap-executor.ts',
      'src/protocol.ts',
    ],
    deps: ['agent-executor-impl'],
    validate: [
      {
        type: 'artifact-exists',
        target: 'example/fusion-roadmap-integration.test.ts',
      },
      { type: 'artifact-exists', target: 'docs/real-project-adoption.md' },
    ],
    idempotent: false,
  },

  'cockpit-integration': {
    id: 'cockpit-integration',
    desc: 'Real project: cockpit roadmap + executor agent — validate multi-project pattern',
    produces: [
      'example/cockpit-roadmap-integration.test.ts',
      'docs/multi-project-patterns.md',
    ],
    consumes: [
      '.claude/agents/roadmap-executor.ts',
      'src/protocol.ts',
    ],
    deps: ['fusion-integration'],
    validate: [
      {
        type: 'artifact-exists',
        target: 'example/cockpit-roadmap-integration.test.ts',
      },
      { type: 'artifact-exists', target: 'docs/multi-project-patterns.md' },
    ],
    idempotent: false,
  },

  'phase-9-term': {
    id: 'phase-9-term',
    desc: 'Phase 9 complete: regent integration + real project adoption — agents autonomous',
    produces: [],
    consumes: [
      '.claude/agents/roadmap-executor.ts',
      'docs/decisions/agent-bootstrap-design.md',
      'example/fusion-roadmap-integration.test.ts',
      'example/cockpit-roadmap-integration.test.ts',
    ],
    deps: ['cockpit-integration'],
    validate: [],
    idempotent: false,
  },
};

// Add phase 9 nodes
Object.assign(dag.nodes, phase9Nodes);

// Update term to depend on phase-9-term
dag.nodes.term.deps = ['phase-9-term'];

// Validate expanded DAG
const checkResult = check(dag);
if (!checkResult.done) {
  console.error('❌ DAG validation failed');
  console.error('Orphans:', checkResult.orphans);
  process.exit(1);
}

const verifyErrors = verify(dag);
if (verifyErrors.length > 0) {
  console.error('❌ Contract violations:');
  verifyErrors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

// Write expanded DAG
writeFileSync(headPath, JSON.stringify(dag, null, 2));

console.log('✓ Phase 9 nodes added');
console.log(`✓ DAG: ${Object.keys(dag.nodes).length} nodes`);
console.log('✓ Acyclic + connected + contracts satisfied');
console.log('✓ Roadmap frontier: phase-8-term → phase-9-term');
