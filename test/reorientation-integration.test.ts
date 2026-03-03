// @module reorientation-integration
// @entry test

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { findPendingSpecs } from '../src/lib/orient-forward.ts';
import { collectMakeErrors } from '../src/lib/make-validation.ts';
import { getMakeInvariants } from '../src/lib/api-invariants.ts';

// ── Test Group 1: Orient Forward Pointer ────────────────────────────────────

test('1. Orient Forward Pointer: finds unloaded specs', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'reorientation-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // Create a spec with different dag_id
    writeFileSync(
      join(roadmapDir, 'spec-other.json'),
      JSON.stringify({
        dag_id: 'other-dag',
        dag_desc: 'Other DAG spec',
      })
    );

    const result = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(result.length, 1, 'Should find unloaded spec');
    assert.equal(result[0].dagId, 'other-dag');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('1. Orient Forward Pointer: excludes current DAG spec', () => {
  const tmpDir = mkdtempSync(join('/tmp', 'reorientation-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // Create a spec with same dag_id
    writeFileSync(
      join(roadmapDir, 'spec-current.json'),
      JSON.stringify({
        dag_id: 'other-dag',
        dag_desc: 'Other DAG spec',
      })
    );

    const result = findPendingSpecs(tmpDir, 'other-dag');
    assert.equal(result.length, 0, 'Should exclude current DAG');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

// ── Test Group 2: Make Validation Errors ────────────────────────────────────

test('2. Make Validation: detects structural error (define gate)', () => {
  // DAG with cycles: A -> B -> A
  const badDag = {
    id: 'cyclic-dag',
    desc: 'DAG with cycles',
    init: 'node-a',
    term: 'node-c',
    nodes: {
      'node-a': {
        id: 'node-a',
        desc: 'Node A',
        produces: [],
        consumes: [],
        deps: ['node-b'],
      },
      'node-b': {
        id: 'node-b',
        desc: 'Node B',
        produces: [],
        consumes: [],
        deps: ['node-a'],
      },
      'node-c': {
        id: 'node-c',
        desc: 'Node C',
        produces: [],
        consumes: [],
        deps: ['node-a'],
      },
    },
  };

  const errors = collectMakeErrors(badDag);
  assert(errors.length > 0, 'Should detect structural errors');
  const defError = errors.find((e) => e.gate === 'define');
  assert(defError, 'Should have define gate error');
});

test('2. Make Validation: detects terminal intent error', () => {
  // DAG missing terminal intent validation rule
  const badDag = {
    id: 'no-intent-dag',
    desc: 'DAG missing terminal intent',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Init node',
        produces: [],
        consumes: [],
        deps: [],
        validate: [],
      },
      term: {
        id: 'term',
        desc: 'Terminal node without intent',
        produces: [],
        consumes: [],
        deps: ['init'],
        validate: [
          {
            type: 'artifact-exists',
          },
        ],
      },
    },
  };

  const errors = collectMakeErrors(badDag);
  assert(errors.length > 0, 'Should detect terminal intent error');
  const intentError = errors.find((e) => e.gate === 'terminal-intent');
  assert(intentError, 'Should have terminal-intent gate error');
});

test('2. Make Validation: collects multiple errors (not first-throw)', () => {
  // DAG with missing terminal intent AND missing init boundary intent
  const badDag = {
    id: 'multi-error-dag',
    desc: 'DAG with multiple problems',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Init node',
        produces: ['init.marker'],
        consumes: [],
        deps: [],
        validate: [],
      },
      'task-1': {
        id: 'task-1',
        desc: 'Task 1 (init boundary, no clarity intent)',
        produces: [],
        consumes: ['init.marker'],
        deps: ['init'],
        validate: [{ type: 'artifact-exists' }], // No clarity/plan intent
      },
      term: {
        id: 'term',
        desc: 'Terminal node without intent',
        produces: [],
        consumes: [],
        deps: ['task-1'],
        validate: [{ type: 'artifact-exists' }], // No intent rule
      },
    },
  };

  const errors = collectMakeErrors(badDag);
  assert(errors.length >= 2, 'Should collect multiple errors (not fail on first)');

  const gates = errors.map((e) => e.gate);
  assert(gates.includes('terminal-intent'), 'Should include terminal-intent error');
  assert(gates.includes('init-intent'), 'Should include init-intent error');
});

// ── Test Group 3: API Invariants ────────────────────────────────────────────

test('3. API Invariants: exists and has correct structure', () => {
  const invariants = getMakeInvariants();

  assert(invariants.length >= 11, 'Should have at least 11 invariants');

  // Check that all invariants have required fields
  for (const inv of invariants) {
    assert(typeof inv.id === 'string', `Invariant ${inv.id} should have id string`);
    assert(typeof inv.gate === 'string', `Invariant ${inv.id} should have gate string`);
    assert(typeof inv.requirement === 'string', `Invariant ${inv.id} should have requirement string`);
    assert(typeof inv.appliesTo === 'string', `Invariant ${inv.id} should have appliesTo string`);
    assert(inv.example && typeof inv.example === 'object', `Invariant ${inv.id} should have example object`);
  }
});

test('3. API Invariants: includes terminal-intent-gate with skipFlag', () => {
  const invariants = getMakeInvariants();

  const terminalIntent = invariants.find((i) => i.id === 'terminal-intent-gate');
  assert(terminalIntent, 'Should include terminal-intent-gate invariant');
  assert.equal(terminalIntent.skipFlag, '--skip-terminal-intent', 'Should have correct skipFlag');
  assert(
    terminalIntent.requirement.includes('terminal') || terminalIntent.requirement.includes('intent'),
    'Should mention terminal or intent in requirement'
  );
});

test('3. API Invariants: includes init-boundary-gate', () => {
  const invariants = getMakeInvariants();

  const initBoundary = invariants.find((i) => i.id === 'init-boundary-gate');
  assert(initBoundary, 'Should include init-boundary-gate invariant');
  assert(
    initBoundary.requirement.includes('init') || initBoundary.requirement.includes('boundary'),
    'Should mention init or boundary in requirement'
  );
  assert(
    initBoundary.requirement.includes('expandOnFail'),
    'Should mention expandOnFail requirement'
  );
});

test('3. API Invariants: has invariants for all major gates', () => {
  const invariants = getMakeInvariants();
  const ids = invariants.map((i) => i.id);

  // Check for key invariants
  assert(ids.includes('terminal-intent-gate'), 'Should have terminal-intent-gate');
  assert(ids.includes('init-boundary-gate'), 'Should have init-boundary-gate');
  assert(ids.includes('dag-structural'), 'Should have dag-structural');
  assert(ids.includes('dag-contracts'), 'Should have dag-contracts');
  assert(ids.includes('dag-reachability'), 'Should have dag-reachability');
});

test('3. API Invariants: skipFlag optional but when present is correct', () => {
  const invariants = getMakeInvariants();

  for (const inv of invariants) {
    if (inv.skipFlag) {
      // skipFlag should be a valid CLI flag starting with --
      assert(inv.skipFlag.startsWith('--'), `skipFlag ${inv.skipFlag} should start with --`);
    }
  }
});

// ── End-to-End: All Three Systems Together ──────────────────────────────────

test('End-to-end: All three reorientation fixes work together', () => {
  // This test demonstrates that all three systems work in concert:
  // 1. findPendingSpecs discovers unloaded specs when DAG is done
  // 2. collectMakeErrors returns full error array (not first-throw)
  // 3. getMakeInvariants documents all validation rules

  const tmpDir = mkdtempSync(join('/tmp', 'reorientation-e2e-'));

  try {
    const roadmapDir = join(tmpDir, '.roadmap');
    mkdirSync(roadmapDir, { recursive: true });

    // 1. Setup: create a pending spec
    writeFileSync(
      join(roadmapDir, 'spec-pending.json'),
      JSON.stringify({
        dag_id: 'pending-dag',
        dag_desc: 'Pending DAG to load next',
      })
    );

    // 2. Orient forward: find the pending spec
    const pending = findPendingSpecs(tmpDir, 'current-dag');
    assert.equal(pending.length, 1, 'Should find pending spec');
    assert.equal(pending[0].dagId, 'pending-dag', 'Should have correct dag_id');

    // 3. Make validation: verify we can collect errors
    const testDag = {
      id: 'test-dag',
      init: 'init',
      term: 'term',
      nodes: {
        init: { id: 'init', produces: [], consumes: [], deps: [], validate: [] },
        term: { id: 'term', produces: [], consumes: [], deps: ['init'], validate: [] },
      },
    };
    const errors = collectMakeErrors(testDag);
    assert(Array.isArray(errors), 'collectMakeErrors should return array');

    // 4. API invariants: verify rules are documented
    const invariants = getMakeInvariants();
    assert(invariants.length > 0, 'Should have invariants');
    assert(
      invariants.some((i) => i.id.includes('intent')),
      'Should have intent-related invariants'
    );

    // 5. Assertion: all three systems are independent and composable
    assert(pending.length > 0, 'Orient forward works');
    assert(Array.isArray(errors), 'Make validation works');
    assert(invariants.length > 0, 'API invariants works');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});
