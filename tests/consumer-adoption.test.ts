import { test, expect } from 'vitest';
import { loadDAG, orient, define, graph } from '../src/protocol.ts';
import { CheckpointManager } from '../src/checkpoint.ts';
import { AuditTrail } from '../src/audit.ts';

/**
 * Consumer adoption test: real project workflow
 * Scenario: cockpit dashboard adopts roadmap protocol
 */

test('consumer: adopt roadmap + load + orient + checkpoint', async () => {
  // Consumer's roadmap (real example: cockpit)
  const cockpitRoadmap = define(graph({
    id: 'cockpit',
    desc: 'Dashboard + agent runtime',
    version: '1.0.0',
    protocolVersion: '0.3.0',
    init: 'scaffold',
    term: 'deployed',
    nodes: {
      scaffold: {
        id: 'scaffold',
        desc: 'Initial project structure',
        produces: ['src/main.tsx', 'package.json', 'vite.config.ts'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists', target: 'src/main.tsx' }],
        idempotent: true,
      },
      build: {
        id: 'build',
        desc: 'Build production bundle',
        produces: ['dist/index.html', 'dist/index.js'],
        consumes: ['src/main.tsx', 'package.json'],
        deps: ['scaffold'],
        validate: [{ type: 'artifact-exists', target: 'dist/index.html' }],
        idempotent: true,
      },
      test: {
        id: 'test',
        desc: 'Run tests',
        produces: ['coverage/index.html'],
        consumes: ['src/main.tsx'],
        deps: ['scaffold'],
        validate: [{ type: 'artifact-exists', target: 'coverage/index.html' }],
        idempotent: true,
      },
      deployed: {
        id: 'deployed',
        desc: 'Ready for deployment',
        produces: [],
        consumes: ['dist/index.html', 'dist/index.js', 'coverage/index.html'],
        deps: ['build', 'test'],
        validate: [],
        idempotent: false,
      },
    },
  }));

  // Consumer workflow: load
  const dag = await loadDAG(cockpitRoadmap);
  expect(dag.id).toBe('cockpit');
  expect(dag.protocolVersion).toBe('0.3.0');

  // Orient: find first incomplete node
  const fsCheck = (path: string) => {
    // Simulate: only scaffold artifacts exist (exact match, not includes)
    const scaffoldArts = ['src/main.tsx', 'package.json', 'vite.config.ts'];
    return scaffoldArts.includes(path);
  };

  const position = orient(dag, fsCheck);
  // First incomplete: either build or test (parallel deps from scaffold)
  expect(['build', 'test']).toContain(position.position);
  expect(position.remaining.length).toBeGreaterThan(0);

  // Checkpoint manager
  const checkpoint = new CheckpointManager('.');
  expect(checkpoint).toBeDefined();

  // Audit trail
  const audit = new AuditTrail('.');
  audit.startSession('cockpit-agent');
  audit.record({
    nodeId: 'scaffold',
    status: 'complete',
    duration: 100,
  });
  expect(audit.getFailedPhases()).toHaveLength(0);
});

test('consumer: version compatibility for old DAG', async () => {
  // Old consumer DAG (0.2.0, no idempotent field)
  const oldDAG = {
    id: 'legacy-project',
    desc: 'Old project',
    version: '1.0.0',
    protocolVersion: '0.2.0',
    init: 'a',
    term: 'b',
    nodes: {
      a: {
        id: 'a',
        desc: 'Start',
        produces: ['x.txt'],
        consumes: [],
        deps: [],
        validate: [],
        // NO idempotent field (old schema)
      },
      b: {
        id: 'b',
        desc: 'End',
        produces: [],
        consumes: ['x.txt'],
        deps: ['a'],
        validate: [],
      },
    },
  };

  // Load with auto-migration
  const dag = await loadDAG(oldDAG, { autoMigrate: true, targetVersion: '0.3.0' });

  // Should have idempotent field now
  expect((dag.nodes.a as any).idempotent).toBe(true);
  expect((dag.nodes.b as any).idempotent).toBe(true);
});

test('consumer: checkpoint manager', () => {
  // Just test the checkpoint manager structure
  const checkpoint = new CheckpointManager('.');
  expect(checkpoint).toBeDefined();

  // The actual save/restore requires real filesystem
  // which is tested in checkpoint implementation tests
});

test('consumer: audit trail evidence', async () => {
  const audit = new AuditTrail('.');
  audit.startSession('consumer-agent');

  audit.record({
    nodeId: 'phase-1',
    status: 'complete',
    duration: 150,
    artifacts: [
      { path: 'src/index.ts', hash: 'sha256:abc123' },
      { path: 'dist/index.js', hash: 'sha256:def456' },
    ],
    validation: { type: 'artifact-exists', passed: true },
  });

  audit.record({
    nodeId: 'phase-2',
    status: 'complete',
    duration: 200,
  });

  audit.record({
    nodeId: 'phase-3',
    status: 'failed',
    duration: 50,
    error: 'Validation failed',
  });

  // Queries
  expect(audit.getFailedPhases()).toEqual(['phase-3']);
  expect(audit.getArtifacts()).toHaveLength(2);
  expect(audit.getTotalDuration()).toBe(400);
});
