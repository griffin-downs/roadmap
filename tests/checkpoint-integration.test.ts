// @module checkpoint-integration-tests
// @purpose Integration tests: CheckpointRuntime wired into complete() flow

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { CheckpointRuntime, completeWithCheckpoint } from '../src/checkpoint-runtime.ts';
import type { Graph } from '../src/protocol.ts';

// Minimal graph fixture
function makeGraph(nodes: Record<string, { produces: string[]; deps: string[] }>): Graph<string> {
  const nodeSpecs: Record<string, any> = {};
  const ids = Object.keys(nodes);

  for (const id of ids) {
    nodeSpecs[id] = {
      id,
      desc: `Node ${id}`,
      produces: nodes[id].produces,
      consumes: [],
      deps: nodes[id].deps,
      validate: [],
    };
  }

  return {
    id: 'test-graph',
    desc: 'Test graph',
    init: ids[0],
    term: ids[ids.length - 1],
    nodes: nodeSpecs,
  } as Graph<string>;
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, '.gitkeep'), '');
  execSync('git add .gitkeep && git commit -m "init"', { cwd: dir, stdio: 'pipe' });
}

describe('CheckpointRuntime', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cp-runtime-'));
    initGitRepo(tmpDir);
    mkdirSync(join(tmpDir, '.roadmap'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('completeNode', () => {
    it('creates checkpoint and completion record on success', async () => {
      // Create the artifact file the node produces
      const artifactPath = 'src/output.ts';
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, artifactPath), 'export const x = 1;');

      const graph = makeGraph({
        init: { produces: [], deps: [] },
        'build-thing': { produces: [artifactPath], deps: ['init'] },
        term: { produces: [], deps: ['build-thing'] },
      });

      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      runtime.startSession();

      const result = await runtime.completeNode(graph, 'build-thing', [
        { rule: 'artifact-exists', passed: true, evidence: 'src/output.ts exists' },
      ]);

      expect(result.success).toBe(true);
      expect(result.nodeId).toBe('build-thing');
      expect(result.checkpointId).toMatch(/^cp-/);
      expect(result.artifacts).toEqual([artifactPath]);

      // Checkpoint file written
      const cpDir = join(tmpDir, '.roadmap', 'checkpoints');
      expect(existsSync(cpDir)).toBe(true);

      // Completion record written with checkpoint ID
      const completed = JSON.parse(readFileSync(join(tmpDir, '.roadmap', 'completed.json'), 'utf-8'));
      expect(completed).toHaveLength(1);
      expect(completed[0].nodeId).toBe('build-thing');
      expect(completed[0].checkpointId).toMatch(/^cp-/);
      expect(completed[0].validationChecks).toHaveLength(1);
      expect(completed[0].validationChecks[0].passed).toBe(true);

      await runtime.endSession();
    });

    it('records failure when artifact is missing', async () => {
      const graph = makeGraph({
        init: { produces: [], deps: [] },
        'missing-art': { produces: ['does/not/exist.ts'], deps: ['init'] },
        term: { produces: [], deps: ['missing-art'] },
      });

      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      runtime.startSession();

      const result = await runtime.completeNode(graph, 'missing-art');

      expect(result.success).toBe(false);

      // Audit trail captures failure
      const trail = runtime.getTrail();
      expect(trail.getFailedPhases()).toEqual(['missing-art']);

      await runtime.endSession();
    });

    it('records failure when validation checks fail', async () => {
      const graph = makeGraph({
        init: { produces: [], deps: [] },
        'bad-check': { produces: [], deps: ['init'] },
        term: { produces: [], deps: ['bad-check'] },
      });

      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      runtime.startSession();

      const result = await runtime.completeNode(graph, 'bad-check', [
        { rule: 'tsc-check', passed: false, evidence: 'Type errors found' },
      ]);

      expect(result.success).toBe(false);

      await runtime.endSession();
    });

    it('throws on unknown node', async () => {
      const graph = makeGraph({
        init: { produces: [], deps: [] },
        term: { produces: [], deps: ['init'] },
      });

      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      runtime.startSession();

      await expect(
        runtime.completeNode(graph, 'nonexistent' as any)
      ).rejects.toThrow('Node not found');

      await runtime.endSession();
    });
  });

  describe('session lifecycle', () => {
    it('auto-starts session if not explicitly started', async () => {
      const graph = makeGraph({
        init: { produces: [], deps: [] },
        term: { produces: [], deps: ['init'] },
      });

      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      // No explicit startSession()

      const result = await runtime.completeNode(graph, 'init');
      expect(result.success).toBe(true);

      await runtime.endSession();
    });

    it('writes audit trail on endSession', async () => {
      const graph = makeGraph({
        init: { produces: [], deps: [] },
        term: { produces: [], deps: ['init'] },
      });

      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      runtime.startSession();
      await runtime.completeNode(graph, 'init');
      await runtime.endSession();

      // Audit session JSON written
      const auditDir = join(tmpDir, '.roadmap', 'audit');
      expect(existsSync(auditDir)).toBe(true);
    });

    it('endSession is idempotent when no session started', async () => {
      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      // Should not throw
      await runtime.endSession();
    });
  });

  describe('restoreLatest', () => {
    it('returns null when no checkpoints exist', async () => {
      const runtime = new CheckpointRuntime(tmpDir, 'test-agent');
      const result = await runtime.restoreLatest();
      expect(result).toBeNull();
    });

    it('restores from previous checkpoint', async () => {
      // Create artifact and complete a node to produce a checkpoint
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'src/thing.ts'), 'export const y = 2;');

      const graph = makeGraph({
        init: { produces: [], deps: [] },
        'do-thing': { produces: ['src/thing.ts'], deps: ['init'] },
        term: { produces: [], deps: ['do-thing'] },
      });

      const runtime1 = new CheckpointRuntime(tmpDir, 'agent-1');
      runtime1.startSession();
      const completed = await runtime1.completeNode(graph, 'do-thing');
      await runtime1.endSession();

      // New runtime restores
      const runtime2 = new CheckpointRuntime(tmpDir, 'agent-2');
      const restored = await runtime2.restoreLatest();

      expect(restored).not.toBeNull();
      expect(restored!.checkpointId).toBe(completed.checkpointId);

      await runtime2.endSession();
    });
  });

  describe('completeWithCheckpoint (one-shot)', () => {
    it('completes node in single call', async () => {
      mkdirSync(join(tmpDir, 'out'), { recursive: true });
      writeFileSync(join(tmpDir, 'out/result.json'), '{}');

      const graph = makeGraph({
        init: { produces: [], deps: [] },
        'one-shot': { produces: ['out/result.json'], deps: ['init'] },
        term: { produces: [], deps: ['one-shot'] },
      });

      const result = await completeWithCheckpoint(graph, {
        repoRoot: tmpDir,
        nodeId: 'one-shot',
        agent: 'ci-agent',
        checks: [{ rule: 'artifact-exists', passed: true, evidence: 'out/result.json present' }],
      });

      expect(result.success).toBe(true);
      expect(result.checkpointId).toMatch(/^cp-/);

      // Completion persisted
      const completed = JSON.parse(readFileSync(join(tmpDir, '.roadmap', 'completed.json'), 'utf-8'));
      expect(completed.find((r: any) => r.nodeId === 'one-shot')).toBeTruthy();
    });
  });
});
