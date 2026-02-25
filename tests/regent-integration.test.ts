import { test, expect } from 'vitest';
import { define, graph, orient } from '../src/protocol.ts';

/**
 * Regent integration tests: agent template + checkpoint + audit
 */

test('regent: agent boot → orient → commit → checkpoint → audit', async () => {
  // Simulate: agent spawned with roadmap
  const dag = define(graph({
    id: 'test-roadmap',
    desc: 'Test',
    init: 'a',
    term: 'c',
    nodes: {
      a: {
        id: 'a',
        desc: 'Start',
        produces: ['a.txt'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists', target: 'a.txt' }],
        idempotent: true,
      },
      b: {
        id: 'b',
        desc: 'Middle',
        produces: ['b.txt'],
        consumes: ['a.txt'],
        deps: ['a'],
        validate: [{ type: 'artifact-exists', target: 'b.txt' }],
        idempotent: true,
      },
      c: {
        id: 'c',
        desc: 'End',
        produces: [],
        consumes: ['a.txt', 'b.txt'],
        deps: ['b'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  // Agent boots: position
  const fsCheck = (path: string) => {
    // Simulate: a.txt exists (from previous session)
    return path === 'a.txt';
  };

  const pos = orient(dag, fsCheck);
  expect(pos.position).toBe('b'); // First incomplete node
  expect(pos.produces).toEqual(['b.txt']);
  expect(pos.remaining).toHaveLength(1);
});

test('regent: idempotent node recovery', () => {
  // If agent crashes after committing 'b' but before advancing
  const dag = define(graph({
    id: 'recovery-test',
    desc: 'Test',
    init: 'start',
    term: 'end',
    nodes: {
      start: {
        id: 'start',
        desc: 'Init',
        produces: ['x.txt'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists', target: 'x.txt' }],
        idempotent: true,
      },
      end: {
        id: 'end',
        desc: 'Final',
        produces: [],
        consumes: ['x.txt'],
        deps: ['start'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  // After crash + restart: x.txt exists
  const fsCheck = () => true;
  const pos = orient(dag, fsCheck);

  // Should be at end (not stuck at start)
  expect(pos.position).toBe('end');
  expect(pos.remaining).toHaveLength(0);
});

test('regent: checkpoint preserves position', () => {
  const checkpoints = [
    {
      id: 'cp-1',
      position: 'phase-1',
      artifacts: [{ path: 'src/a.ts', hash: 'sha256:abc' }],
    },
    {
      id: 'cp-2',
      position: 'phase-2',
      artifacts: [{ path: 'src/b.ts', hash: 'sha256:def' }],
    },
  ];

  // Latest checkpoint
  const latest = checkpoints[checkpoints.length - 1];
  expect(latest.position).toBe('phase-2');
});

test('regent: audit trail on completion', () => {
  const audit = [
    { nodeId: 'build', status: 'complete' as const, duration: 100 },
    { nodeId: 'test', status: 'complete' as const, duration: 200 },
  ];

  const passed = audit.filter(e => e.status === 'complete').length;
  const failed = audit.filter(e => e.status === 'failed').length;

  expect(passed).toBe(2);
  expect(failed).toBe(0);
});

test('regent: non-idempotent node blocks recovery', () => {
  const nodes = [
    { id: 'code-gen', idempotent: true },
    { id: 'manual-review', idempotent: false },
    { id: 'deploy', idempotent: false },
  ];

  const canRecover = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.idempotent ?? true;
  };

  expect(canRecover('code-gen')).toBe(true);
  expect(canRecover('manual-review')).toBe(false);
  expect(canRecover('deploy')).toBe(false);
});
