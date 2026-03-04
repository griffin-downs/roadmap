// Test suite for terminal shell validator strength
import { test } from 'node:test';
import * as assert from 'node:assert';
import { collectMakeErrors } from '../src/lib/make-validation.ts';
import type { Graph } from '../src/lib/protocol/types.ts';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeDagTerminalWithArtifactExistsOnly(): Graph<'init' | 'term'> {
  return {
    id: 'terminal-artifact-only',
    desc: 'Terminal node with only artifact-exists validator',
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
        desc: 'Terminal with artifact-exists only',
        produces: [],
        consumes: [],
        deps: ['init'],
        validate: [
          {
            type: 'artifact-exists',
            path: 'result.txt',
          },
        ],
      },
    },
  };
}

function makeDagTerminalWithShell(): Graph<'init' | 'term'> {
  return {
    id: 'terminal-with-shell',
    desc: 'Terminal node with shell validator',
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
        desc: 'Terminal with shell validator',
        produces: [],
        consumes: [],
        deps: ['init'],
        validate: [
          {
            type: 'shell',
            command: 'test -f result.txt',
          },
        ],
      },
    },
  };
}

function makeDagTerminalWithBothValidators(): Graph<'init' | 'term'> {
  return {
    id: 'terminal-both-validators',
    desc: 'Terminal node with both shell and artifact-exists validators',
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
        desc: 'Terminal with both validators',
        produces: [],
        consumes: [],
        deps: ['init'],
        validate: [
          {
            type: 'artifact-exists',
            path: 'result.txt',
          },
          {
            type: 'shell',
            command: 'test -f result.txt',
          },
        ],
      },
    },
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

test('terminal node with only artifact-exists validator returns terminal-shell error', () => {
  const dag = makeDagTerminalWithArtifactExistsOnly();
  const errors = collectMakeErrors(dag);

  const shellError = errors.find(e => e.gate === 'terminal-shell');
  assert.ok(
    shellError,
    `Expected terminal-shell error, got: ${JSON.stringify(errors.map(e => e.gate))}`
  );
  assert.strictEqual(
    shellError!.node,
    'term',
    'Expected error to reference term node'
  );
  assert.ok(
    shellError!.message.includes('requires at least one shell validator'),
    `Expected message about shell validator requirement, got: ${shellError!.message}`
  );
});

test('terminal node with shell validator returns no terminal-shell error', () => {
  const dag = makeDagTerminalWithShell();
  const errors = collectMakeErrors(dag);

  const shellError = errors.find(e => e.gate === 'terminal-shell');
  assert.strictEqual(
    shellError,
    undefined,
    `Expected no terminal-shell error, but found: ${JSON.stringify(shellError)}`
  );
});

test('terminal node with both shell and artifact-exists validators returns no terminal-shell error', () => {
  const dag = makeDagTerminalWithBothValidators();
  const errors = collectMakeErrors(dag);

  const shellError = errors.find(e => e.gate === 'terminal-shell');
  assert.strictEqual(
    shellError,
    undefined,
    `Expected no terminal-shell error, but found: ${JSON.stringify(shellError)}`
  );
});
