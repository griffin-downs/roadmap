// @module agent-dispatch/integration-test
// End-to-end test: task-worktree lifecycle + brief gate + orchestrator

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { onTaskOwnerSet, onTaskCompleted } from '../../src/lib/agent-dispatch/task-worktree.ts';
import { BriefGate, validateBrief } from '../../src/lib/agent-dispatch/brief-gate.ts';
import { HandoffJournal } from '../../src/lib/agent-dispatch/handoff-journal.ts';
import { AgentExecutor } from '../../src/lib/agent-dispatch/agent-executor.ts';
import { validateBriefSchema } from '../../src/lib/agent-dispatch/brief-validator.ts';
import type { Brief } from '../../src/lib/brief.ts';

const TEST_ROOT = join(process.cwd(), '.test-agent-integration');

function setupTestRepo() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  execSync('git init', { cwd: TEST_ROOT, stdio: 'pipe' });
  execSync('git checkout -b main', { cwd: TEST_ROOT, stdio: 'pipe' });

  const roadmapDir = join(TEST_ROOT, '.roadmap');
  mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(join(roadmapDir, 'head.json'), JSON.stringify({
    id: 'test-dag',
    desc: 'test',
    init: 'start',
    term: 'end',
    nodes: {
      start: { id: 'start', desc: 'start', produces: [], consumes: [], deps: [], validate: [] },
      'impl-auth': { id: 'impl-auth', desc: 'Implement auth module', produces: ['src/auth.ts'], consumes: [], deps: ['start'], validate: [{ type: 'artifact-exists' }] },
      'test-auth': { id: 'test-auth', desc: 'Test auth module', produces: ['src/auth.test.ts'], consumes: ['src/auth.ts'], deps: ['impl-auth'], validate: [{ type: 'artifact-exists' }] },
      end: { id: 'end', desc: 'end', produces: [], consumes: [], deps: ['test-auth'], validate: [] },
    },
  }, null, 2));

  execSync('git add -A', { cwd: TEST_ROOT, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: TEST_ROOT, stdio: 'pipe' });
}

function teardownTestRepo() {
  try {
    const output = execSync('git worktree list --porcelain', { cwd: TEST_ROOT, stdio: 'pipe' }).toString();
    const worktrees = output.split('\n')
      .filter(l => l.startsWith('worktree '))
      .map(l => l.replace('worktree ', ''))
      .filter(p => p !== TEST_ROOT);
    for (const wt of worktrees) {
      execSync(`git worktree remove "${wt}" --force`, { cwd: TEST_ROOT, stdio: 'pipe' });
    }
  } catch {}
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
}

describe('agent-dispatch integration', () => {
  beforeEach(() => { setupTestRepo(); });
  afterEach(() => { teardownTestRepo(); });

  describe('task-worktree lifecycle', () => {
    it('onTaskOwnerSet creates worktree and loads brief', async () => {
      const result = await onTaskOwnerSet(TEST_ROOT, 'impl-auth', 'agent-1');

      expect(result.error).toBeNull();
      expect(result.worktree).not.toBeNull();
      expect(result.worktree!.taskId).toBe('impl-auth');
      expect(result.worktree!.produces).toEqual(['src/auth.ts']);
      expect(result.brief).not.toBeNull();
      expect(result.brief!.position).toBe('impl-auth');
      expect(result.brief!.produces).toEqual(['src/auth.ts']);
    });

    it('onTaskCompleted cleans up worktree', async () => {
      await onTaskOwnerSet(TEST_ROOT, 'impl-auth', 'agent-1');
      const worktreePath = join(TEST_ROOT, '.claude', 'worktrees', 'impl-auth');
      expect(existsSync(worktreePath)).toBe(true);

      const result = onTaskCompleted(TEST_ROOT, 'impl-auth');
      expect(result.cleaned).toBe(true);
    });

    it('reports missing artifacts on completion', async () => {
      await onTaskOwnerSet(TEST_ROOT, 'impl-auth', 'agent-1');

      // Complete without creating produces
      const result = onTaskCompleted(TEST_ROOT, 'impl-auth');
      expect(result.missingArtifacts).toContain('src/auth.ts');
    });

    it('reports no missing artifacts when produces exist', async () => {
      const setup = await onTaskOwnerSet(TEST_ROOT, 'impl-auth', 'agent-1');
      const worktreePath = setup.worktree!.worktreePath;

      // Create the produce artifact
      mkdirSync(join(worktreePath, 'src'), { recursive: true });
      writeFileSync(join(worktreePath, 'src/auth.ts'), 'export const auth = true;');

      const result = onTaskCompleted(TEST_ROOT, 'impl-auth');
      expect(result.missingArtifacts).toEqual([]);
    });
  });

  describe('brief-gate validation', () => {
    it('validates a correct sealed brief', () => {
      const brief: Brief = {
        position: 'impl-auth',
        mode: 'execute',
        produces: ['src/auth.ts'],
        consumes: [],
        description: 'Implement auth module',
        pattern: 'Build the artifacts listed in produces.',
        handoffJournal: [],
        remaining: 3,
      };

      const result = validateBrief(brief);
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects brief with DAG leakage', () => {
      const leaky = {
        position: 'impl-auth',
        mode: 'execute',
        produces: ['src/auth.ts'],
        consumes: [],
        description: 'Implement auth module',
        pattern: 'Build it.',
        handoffJournal: [],
        remaining: 3,
        nodes: { 'some-node': {} },
      };

      const result = validateBrief(leaky as any);
      expect(result.passed).toBe(false);
      expect(result.errors.some(e => e.code === 'DAG_LEAKAGE_NODES')).toBe(true);
    });

    it('isSealedBrief type guard works', () => {
      const { isSealedBrief } = require('../../src/lib/agent-dispatch/brief-gate.ts');
      expect(isSealedBrief({
        position: 'x', mode: 'execute', produces: [], consumes: [],
        description: 'y', pattern: 'z', handoffJournal: [], remaining: 0,
      })).toBe(true);
      expect(isSealedBrief({})).toBe(false);
      expect(isSealedBrief(null)).toBe(false);
    });
  });

  describe('brief-validator (strict schema)', () => {
    it('validates a strict sealed brief', () => {
      const result = validateBriefSchema({
        position: 'impl-auth',
        produces: ['src/auth.ts'],
        consumes: [],
        description: 'Implement auth module',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects brief with forbidden fields', () => {
      const result = validateBriefSchema({
        position: 'impl-auth',
        produces: ['src/auth.ts'],
        consumes: [],
        description: 'x',
        idempotent: true,
        validate: [{ type: 'artifact-exists' }],
        deps: ['start'],
        mode: 'execute',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BRIEF_LEAKS_DAG_STATE')).toBe(true);
    });
  });

  describe('handoff journal', () => {
    it('writes and reads interim handoffs', async () => {
      const journal = new HandoffJournal(TEST_ROOT);
      await journal.writeInterim('impl-auth', {
        timestamp: new Date().toISOString(),
        progress: 0.5,
        discovered: ['Found existing auth patterns'],
        blockers: [],
        currentFile: 'src/auth.ts',
      });

      const interims = journal.loadInterims('impl-auth');
      expect(interims).toHaveLength(1);
      expect(interims[0].progress).toBe(0.5);
    });

    it('writes and reads final handoff', async () => {
      const journal = new HandoffJournal(TEST_ROOT);
      await journal.writeFinal('impl-auth', {
        timestamp: new Date().toISOString(),
        progress: 1.0,
        discovered: ['Completed auth'],
        blockers: [],
        currentFile: 'src/auth.ts',
        summary: 'Auth module done',
        keyDecisions: ['Used JWT'],
        gotchas: [],
        nextNodeEntry: { consumes: ['src/auth.ts'], ready: true },
      });

      const final = journal.loadFinal('impl-auth');
      expect(final).not.toBeNull();
      expect(final!.summary).toBe('Auth module done');
    });

    it('loads full chain', async () => {
      const journal = new HandoffJournal(TEST_ROOT);
      await journal.writeInterim('impl-auth', {
        timestamp: '2026-01-01T00:00:00Z',
        progress: 0.3,
        discovered: [],
        blockers: [],
        currentFile: 'src/auth.ts',
      });
      await journal.writeFinal('impl-auth', {
        timestamp: '2026-01-01T01:00:00Z',
        progress: 1.0,
        discovered: [],
        blockers: [],
        currentFile: '',
        summary: 'Done',
        keyDecisions: [],
        gotchas: [],
        nextNodeEntry: { consumes: [], ready: true },
      });

      const chain = await journal.loadChain('impl-auth');
      expect(chain.interims).toHaveLength(1);
      expect(chain.final).not.toBeNull();
      expect(chain.totalCheckpoints).toBe(2);
    });
  });

  describe('agent executor', () => {
    it('enforces consumes/produces boundaries', () => {
      const brief: Brief = {
        position: 'impl-auth',
        mode: 'execute',
        produces: ['src/auth.ts'],
        consumes: ['src/types.ts'],
        description: 'Implement auth',
        pattern: 'Build it.',
        handoffJournal: [],
        remaining: 2,
      };

      const executor = new AgentExecutor({
        brief,
        repoRoot: TEST_ROOT,
        agentId: 'test-agent',
      });

      // Cannot read files not in consumes
      expect(() => executor.readConsumed('src/secret.ts')).toThrow('Access denied');

      // Cannot write files not in produces
      expect(() => executor.writeProduced('src/hack.ts', 'bad')).toThrow('Access denied');
    });

    it('allows writing to produces and reading consumes', () => {
      const brief: Brief = {
        position: 'impl-auth',
        mode: 'execute',
        produces: ['src/auth.ts'],
        consumes: [],
        description: 'Implement auth',
        pattern: 'Build it.',
        handoffJournal: [],
        remaining: 2,
      };

      const executor = new AgentExecutor({
        brief,
        repoRoot: TEST_ROOT,
        agentId: 'test-agent',
      });

      // Writing to produces should succeed
      executor.writeProduced('src/auth.ts', 'export const auth = true;');
      expect(existsSync(join(TEST_ROOT, 'src/auth.ts'))).toBe(true);
    });
  });
});
