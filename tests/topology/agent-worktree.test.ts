// @module topology/agent-worktree.test
// Tests for agent worktree scaffolding and lifecycle

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createAgentWorktree, cleanupAgentWorktree, listAgentWorktrees } from '../../src/lib/topology/agent-worktree.ts';

// Use a temp git repo for isolation
const TEST_ROOT = join(process.cwd(), '.test-agent-worktree');

function setupTestRepo() {
  if (existsSync(TEST_ROOT)) rmSync(TEST_ROOT, { recursive: true });
  mkdirSync(TEST_ROOT, { recursive: true });
  execSync('git init', { cwd: TEST_ROOT, stdio: 'pipe' });
  execSync('git checkout -b main', { cwd: TEST_ROOT, stdio: 'pipe' });

  // Create minimal roadmap structure
  const roadmapDir = join(TEST_ROOT, '.roadmap');
  mkdirSync(roadmapDir, { recursive: true });
  writeFileSync(join(roadmapDir, 'head.json'), JSON.stringify({
    id: 'test-dag',
    desc: 'test',
    init: 'start',
    term: 'end',
    nodes: {
      start: { id: 'start', desc: 'start', produces: [], consumes: [], deps: [], validate: [] },
      'task-a': { id: 'task-a', desc: 'Task A', produces: ['src/a.ts'], consumes: [], deps: ['start'], validate: [] },
      'task-b': { id: 'task-b', desc: 'Task B', produces: ['src/b.ts'], consumes: ['src/a.ts'], deps: ['task-a'], validate: [] },
      end: { id: 'end', desc: 'end', produces: [], consumes: [], deps: ['task-b'], validate: [] },
    },
  }, null, 2));

  // Initial commit so worktrees work
  execSync('git add -A', { cwd: TEST_ROOT, stdio: 'pipe' });
  execSync('git commit -m "init"', { cwd: TEST_ROOT, stdio: 'pipe' });
}

function teardownTestRepo() {
  // Remove all worktrees first
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

describe('agent-worktree', () => {
  beforeEach(() => {
    setupTestRepo();
  });

  afterEach(() => {
    teardownTestRepo();
  });

  describe('createAgentWorktree', () => {
    it('creates worktree with correct structure', () => {
      const result = createAgentWorktree(TEST_ROOT, 'agent-1', 'task-a');

      expect(result.taskId).toBe('task-a');
      expect(result.agentId).toBe('agent-1');
      expect(result.branch).toMatch(/^feat\/agent-[a-f0-9]+\/task-a$/);
      expect(result.produces).toEqual(['src/a.ts']);
      expect(result.consumes).toEqual([]);
      expect(existsSync(result.worktreePath)).toBe(true);
    });

    it('writes brief JSON into worktree', () => {
      const result = createAgentWorktree(TEST_ROOT, 'agent-1', 'task-a');
      const briefPath = join(result.worktreePath, '.roadmap', 'brief-task-a.json');
      expect(existsSync(briefPath)).toBe(true);

      const brief = JSON.parse(readFileSync(briefPath, 'utf-8'));
      expect(brief.taskId).toBe('task-a');
      expect(brief.agentId).toBe('agent-1');
      expect(brief.produces).toEqual(['src/a.ts']);
    });

    it('returns existing brief on duplicate claim', () => {
      const first = createAgentWorktree(TEST_ROOT, 'agent-1', 'task-a');
      const second = createAgentWorktree(TEST_ROOT, 'agent-1', 'task-a');

      expect(second.taskId).toBe(first.taskId);
      expect(second.worktreePath).toBe(first.worktreePath);
    });

    it('resolves produces/consumes from DAG', () => {
      const result = createAgentWorktree(TEST_ROOT, 'agent-2', 'task-b');
      expect(result.produces).toEqual(['src/b.ts']);
      expect(result.consumes).toEqual(['src/a.ts']);
    });

    it('handles unknown task gracefully (empty produces)', () => {
      const result = createAgentWorktree(TEST_ROOT, 'agent-3', 'no-such-task');
      expect(result.produces).toEqual([]);
      expect(result.consumes).toEqual([]);
      expect(existsSync(result.worktreePath)).toBe(true);
    });
  });

  describe('cleanupAgentWorktree', () => {
    it('removes worktree and branch', () => {
      const result = createAgentWorktree(TEST_ROOT, 'agent-1', 'task-a');
      expect(existsSync(result.worktreePath)).toBe(true);

      const cleanup = cleanupAgentWorktree(TEST_ROOT, 'task-a');
      expect(cleanup.cleaned).toBe(true);
      expect(cleanup.branch).toMatch(/^feat\/agent-/);
    });

    it('returns false for non-existent worktree', () => {
      const cleanup = cleanupAgentWorktree(TEST_ROOT, 'nonexistent');
      expect(cleanup.cleaned).toBe(false);
      expect(cleanup.branch).toBeNull();
    });
  });

  describe('listAgentWorktrees', () => {
    it('lists active worktrees', () => {
      createAgentWorktree(TEST_ROOT, 'agent-1', 'task-a');
      createAgentWorktree(TEST_ROOT, 'agent-2', 'task-b');

      const list = listAgentWorktrees(TEST_ROOT);
      expect(list.length).toBe(2);
      expect(list.map(w => w.taskId).sort()).toEqual(['task-a', 'task-b']);
    });

    it('returns empty array when no worktrees', () => {
      const list = listAgentWorktrees(TEST_ROOT);
      expect(list.length).toBe(0);
    });
  });
});
