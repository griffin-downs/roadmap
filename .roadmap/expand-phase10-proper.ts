/**
 * Expand phase 10 (API optimization) and reorder so it comes BEFORE phase 9
 * Dependency chain: phase-8-term → phase-10-term → agent-bootstrap-spec → ... → phase-9-term → term
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { check, verify } from '../src/protocol.ts';

const headPath = join(import.meta.dirname, 'head.json');
const dag = JSON.parse(readFileSync(headPath, 'utf-8'));

// Phase 10 nodes
const phase10Nodes = {
  'api-audit': {
    id: 'api-audit',
    desc: 'Audit: measure API surface, identify unused exports, tree-shaking opportunities',
    produces: ['docs/decisions/api-audit.md', 'docs/api-usage-metrics.md'],
    consumes: ['src/protocol.ts'],
    deps: ['phase-8-term'],
    validate: [
      { type: 'artifact-exists', target: 'docs/decisions/api-audit.md' },
      { type: 'artifact-exists', target: 'docs/api-usage-metrics.md' },
    ],
    idempotent: true,
  },
  'sub-entry-points-spec': {
    id: 'sub-entry-points-spec',
    desc: 'Spec: split index.ts into sub-entry-points (recovery, validation, versioning)',
    produces: ['docs/decisions/entry-points-design.md'],
    consumes: ['docs/decisions/api-audit.md'],
    deps: ['api-audit'],
    validate: [
      { type: 'artifact-exists', target: 'docs/decisions/entry-points-design.md' },
    ],
    idempotent: true,
  },
  'api-refactor': {
    id: 'api-refactor',
    desc: 'Refactor: move optional modules to sub-entry-points',
    produces: [
      'src/index.recovery.ts',
      'src/index.validation.ts',
      'src/index.versioning.ts',
      'src/index.agent.ts',
    ],
    consumes: ['docs/decisions/entry-points-design.md', 'src/protocol.ts'],
    deps: ['sub-entry-points-spec'],
    validate: [
      { type: 'artifact-exists', target: 'src/index.recovery.ts' },
      { type: 'artifact-exists', target: 'src/index.validation.ts' },
      { type: 'artifact-exists', target: 'src/index.versioning.ts' },
    ],
    idempotent: true,
  },
  'package-exports-update': {
    id: 'package-exports-update',
    desc: 'Update: package.json exports field with new entry points',
    produces: [],
    consumes: [
      'src/index.recovery.ts',
      'src/index.validation.ts',
      'src/index.versioning.ts',
    ],
    deps: ['api-refactor'],
    validate: [],
    idempotent: true,
  },
  'api-test-migration': {
    id: 'api-test-migration',
    desc: 'Test: update imports to use correct sub-entry-points, verify tree-shaking',
    produces: ['tests/api-tree-shaking.test.ts'],
    consumes: [
      'src/index.recovery.ts',
      'src/index.validation.ts',
      'src/index.versioning.ts',
    ],
    deps: ['package-exports-update'],
    validate: [
      { type: 'artifact-exists', target: 'tests/api-tree-shaking.test.ts' },
    ],
    idempotent: true,
  },
  'phase-10-term': {
    id: 'phase-10-term',
    desc: 'Phase 10 complete: API optimized, sub-entry-points, tree-shaking ready',
    produces: [],
    consumes: [
      'src/index.recovery.ts',
      'src/index.validation.ts',
      'src/index.versioning.ts',
      'src/index.agent.ts',
      'tests/api-tree-shaking.test.ts',
    ],
    deps: ['api-test-migration'],
    validate: [],
    idempotent: false,
  },
};

// Add phase 10 nodes
Object.assign(dag.nodes, phase10Nodes);

// Reorder: phase-10 comes BEFORE phase-9
// Change agent-bootstrap-spec (first node of phase 9) to depend on phase-10-term instead of phase-8-term
dag.nodes['agent-bootstrap-spec'].deps = ['phase-10-term'];

// term still depends on phase-9-term (unchanged)
// This creates: phase-8-term → phase-10-term → agent-bootstrap-spec → ... → phase-9-term → term

// Validate
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

writeFileSync(headPath, JSON.stringify(dag, null, 2));

console.log('✓ Phase 10 added + reordered before phase 9');
console.log(`✓ DAG: ${Object.keys(dag.nodes).length} nodes`);
console.log('✓ Chain: phase-8-term → phase-10-term → agent-bootstrap-spec → ... → phase-9-term → term');
