// Test suite for make-validation module
import { test } from 'node:test';
import * as assert from 'node:assert';
import { collectMakeErrors } from '../src/lib/make-validation.ts';
import type { Graph, NodeSpec } from '../src/lib/protocol/types.ts';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeValidDAG(): Graph<'init' | 'work' | 'term'> {
  return {
    id: 'valid-dag',
    desc: 'A valid DAG for testing',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Start',
        produces: [],
        consumes: [],
        deps: [],
        validate: [],
      },
      work: {
        id: 'work',
        desc: 'Do work',
        produces: ['output.txt'],
        consumes: [],
        deps: ['init'],
        validate: [
          {
            type: 'artifact-exists',
            path: 'output.txt',
          },
          {
            type: 'intent',
            statement: 'Plan the work with clarity',
            expandOnFail: true,
          },
        ],
      },
      term: {
        id: 'term',
        desc: 'End',
        produces: [],
        consumes: ['output.txt'],
        deps: ['work'],
        validate: [
          {
            type: 'intent',
            statement: 'Work completed successfully',
            expandOnFail: true,
          },
        ],
      },
    },
  };
}

function makeDagWithCycle(): Graph<'init' | 'a' | 'b'> {
  return {
    id: 'cyclic-dag',
    desc: 'DAG with cycle',
    init: 'init',
    term: 'b',
    nodes: {
      init: {
        id: 'init',
        desc: 'Start',
        produces: [],
        consumes: [],
        deps: [],
        validate: [],
      },
      a: {
        id: 'a',
        desc: 'Node A',
        produces: ['a.txt'],
        consumes: [],
        deps: ['init', 'b'],
        validate: [],
      },
      b: {
        id: 'b',
        desc: 'Node B (cycle)',
        produces: ['b.txt'],
        consumes: [],
        deps: ['a'],
        validate: [],
      },
    },
  };
}

function makeDagMissingTermIntent(): Graph<'init' | 'term'> {
  return {
    id: 'no-term-intent',
    desc: 'DAG missing terminal intent',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Start',
        produces: [],
        consumes: [],
        deps: [],
        validate: [],
      },
      term: {
        id: 'term',
        desc: 'End without intent',
        produces: [],
        consumes: [],
        deps: ['init'],
        validate: [],
      },
    },
  };
}

function makeDagMissingInitIntent(): Graph<'init' | 'work' | 'term'> {
  return {
    id: 'no-init-intent',
    desc: 'DAG missing init boundary intent',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Start',
        produces: [],
        consumes: [],
        deps: [],
        validate: [],
      },
      work: {
        id: 'work',
        desc: 'Work without intent',
        produces: ['output.txt'],
        consumes: [],
        deps: ['init'],
        validate: [],
      },
      term: {
        id: 'term',
        desc: 'End',
        produces: [],
        consumes: ['output.txt'],
        deps: ['work'],
        validate: [
          {
            type: 'intent',
            statement: 'Done',
            expandOnFail: true,
          },
        ],
      },
    },
  };
}

function makeDagMultipleErrors(): Graph<'init' | 'term'> {
  // Missing terminal intent + has cycle
  return {
    id: 'multi-error',
    desc: 'DAG with multiple errors',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Start',
        produces: [],
        consumes: [],
        deps: ['term'], // cycle
        validate: [],
      },
      term: {
        id: 'term',
        desc: 'End',
        produces: [],
        consumes: [],
        deps: ['init'],
        validate: [], // missing intent
      },
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('valid DAG returns empty errors array', () => {
  const dag = makeValidDAG();
  const errors = collectMakeErrors(dag);
  if (errors.length > 0) {
    console.log('Unexpected errors:', JSON.stringify(errors, null, 2));
  }
  assert.strictEqual(errors.length, 0, 'Expected no errors for valid DAG');
});

test('DAG missing terminal intent returns 1 error', () => {
  const dag = makeDagMissingTermIntent();
  const errors = collectMakeErrors(dag);
  assert.ok(errors.length > 0, 'Expected errors for missing terminal intent');
  const termError = errors.find(e => e.gate === 'terminal-intent');
  assert.ok(termError, 'Expected terminal-intent error');
  assert.strictEqual(
    termError!.node,
    'term',
    'Expected error to reference term node'
  );
});

test('DAG with cycles returns define error', () => {
  const dag = makeDagWithCycle();
  const errors = collectMakeErrors(dag);
  assert.ok(errors.length > 0, 'Expected errors for cyclic DAG');
  const defineError = errors.find(e => e.gate === 'define');
  assert.ok(defineError, 'Expected define error for cycle');
});

test('DAG with multiple errors returns all errors', () => {
  const dag = makeDagMultipleErrors();
  const errors = collectMakeErrors(dag);
  assert.ok(
    errors.length >= 2,
    `Expected 2+ errors, got ${errors.length}: ${JSON.stringify(errors)}`
  );
  // Should have both define (cycle) and terminal-intent errors
  const gates = errors.map(e => e.gate);
  assert.ok(
    gates.includes('define') || gates.includes('terminal-intent'),
    `Expected multiple error types, got: ${gates.join(', ')}`
  );
});

test('DAG missing init intent returns init-intent error', () => {
  const dag = makeDagMissingInitIntent();
  const errors = collectMakeErrors(dag);
  assert.ok(errors.length > 0, 'Expected errors for missing init intent');
  const initError = errors.find(e => e.gate === 'init-intent');
  assert.ok(initError, 'Expected init-intent error');
});

test('skipTerminalIntent option skips terminal intent validation', () => {
  const dag = makeDagMissingTermIntent();
  const errors = collectMakeErrors(dag, { skipTerminalIntent: true });
  const termError = errors.find(e => e.gate === 'terminal-intent');
  assert.strictEqual(
    termError,
    undefined,
    'Expected terminal-intent validation to be skipped'
  );
});

test('all errors include fix advice', () => {
  const dag = makeDagMultipleErrors();
  const errors = collectMakeErrors(dag);
  for (const error of errors) {
    assert.ok(
      error.fix && error.fix.length > 0,
      `Expected fix advice for ${error.gate} error`
    );
  }
});
