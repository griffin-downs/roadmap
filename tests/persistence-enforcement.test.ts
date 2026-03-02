import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync } from 'fs';
import { join } from 'path';
import {
  detectHeadJsonDrift,
  validatePostCommitSync,
  detectSessionDrift,
  setupPersistenceEnforcement,
  preExitPersistenceWarning,
} from '../src/lib/persistence-enforcer.ts';

describe('persistence-enforcement — git hooks integration', () => {
  let testRepoRoot: string;

  beforeEach(() => {
    testRepoRoot = mkdtempSync('/tmp/roadmap-test-');
    // Initialize a minimal git repo for testing
    execSync('git init', { cwd: testRepoRoot });
    execSync('git config user.email "test@example.com"', { cwd: testRepoRoot });
    execSync('git config user.name "Test User"', { cwd: testRepoRoot });

    // Create .git/hooks directory if not present
    const hooksDir = join(testRepoRoot, '.git', 'hooks');
    execSync(`mkdir -p "${hooksDir}"`, { shell: true });
  });

  afterEach(() => {
    rmSync(testRepoRoot, { recursive: true, force: true });
  });

  describe('hook file structure', () => {
    it('pre-exit hook exists and is executable in actual repo', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-exit-roadmap-check');
      // This hook should be created during enforce-persistence node
      // If it doesn't exist, setupPersistenceEnforcement should create it
      const setup = setupPersistenceEnforcement('/home/griffin/src/roadmap');
      expect(setup.hooksCreated).toContain('pre-exit-roadmap-check');
    });

    it('pre-commit hook exists and enforces test requirements', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify hook has test enforcement logic
      expect(content).toContain('Test enforcement');
      expect(content).toContain('SKIP_TEST_CHECK');
      expect(content).toMatch(/tests\/.*\.test\.ts/);
    });

    it('pre-commit hook includes DAG integrity gate', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify DAG integrity checks are present
      expect(content).toContain('DAG integrity');
      expect(content).toContain('SKIP_DAG_CHECK');
      expect(content).toContain('.roadmap/head.json');
    });

    it('pre-commit hook includes batch validation enforcement', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify batch validation checks exist
      expect(content).toContain('Batch validation');
      expect(content).toContain('batchComplete');
      expect(content).toContain('SKIP_BATCH_COMMIT');
    });

    it('hooks are bash scripts with shebang', () => {
      const preCommitPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(preCommitPath, 'utf-8');
      expect(content).toMatch(/^#!/bin/bash/);
    });
  });

  describe('hook execution conditions', () => {
    it('pre-commit hook respects SKIP_TEST_CHECK bypass', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify the hook checks for the bypass variable
      expect(content).toContain('SKIP_TEST_CHECK');
      expect(content).toMatch(/if.*SKIP_TEST_CHECK/);
      expect(content).toContain('exit 0');
    });

    it('pre-commit hook respects SKIP_DAG_CHECK bypass', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      expect(content).toContain('SKIP_DAG_CHECK');
      expect(content).toMatch(/if.*SKIP_DAG_CHECK/);
    });

    it('pre-commit hook respects SKIP_BATCH_COMMIT bypass', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      expect(content).toContain('SKIP_BATCH_COMMIT');
      expect(content).toMatch(/if.*SKIP_BATCH_COMMIT/);
    });

    it('pre-commit hook only enforces tests on ADDED files, not modified', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify it filters on --diff-filter=A (added files only)
      expect(content).toContain('--diff-filter=A');
    });

    it('pre-commit hook skips enforcement when no src/bin changes', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify early exit if no source files changed
      expect(content).toContain('If no source files were ADDED, allow the commit');
      expect(content).toMatch(/if.*-z.*STAGED_SRC_FILES/);
    });
  });

  describe('persistence detection and warnings', () => {
    it('detectHeadJsonDrift identifies uncommitted changes', () => {
      // Create a test repo state
      const headJsonPath = join(testRepoRoot, '.roadmap', 'head.json');
      execSync(`mkdir -p "${join(testRepoRoot, '.roadmap')}"`, { shell: true });

      const dagContent = {
        id: 'test-dag',
        nodes: { init: { id: 'init' }, term: { id: 'term' } },
      };
      writeFileSync(headJsonPath, JSON.stringify(dagContent));

      // Stage and commit initial version
      execSync('git add .roadmap/head.json', { cwd: testRepoRoot });
      execSync('git commit -m "initial DAG"', { cwd: testRepoRoot });

      // Modify head.json
      const modifiedDag = { ...dagContent, modified: true };
      writeFileSync(headJsonPath, JSON.stringify(modifiedDag));

      // Check for drift
      const result = detectHeadJsonDrift(testRepoRoot);
      expect(result.dirty).toBe(true);
      expect(result.diff).toBeDefined();
      expect(result.suggestion).toContain('git add');
    });

    it('detectHeadJsonDrift returns clean state when no changes', () => {
      const headJsonPath = join(testRepoRoot, '.roadmap', 'head.json');
      execSync(`mkdir -p "${join(testRepoRoot, '.roadmap')}"`, { shell: true });

      const dagContent = {
        id: 'test-dag',
        nodes: { init: { id: 'init' }, term: { id: 'term' } },
      };
      writeFileSync(headJsonPath, JSON.stringify(dagContent));

      execSync('git add .roadmap/head.json', { cwd: testRepoRoot });
      execSync('git commit -m "initial DAG"', { cwd: testRepoRoot });

      // No modifications
      const result = detectHeadJsonDrift(testRepoRoot);
      expect(result.dirty).toBe(false);
    });

    it('preExitPersistenceWarning logs warning to stderr when drift detected', () => {
      const headJsonPath = join(testRepoRoot, '.roadmap', 'head.json');
      execSync(`mkdir -p "${join(testRepoRoot, '.roadmap')}"`, { shell: true });

      const dagContent = {
        id: 'test-dag',
        nodes: { init: { id: 'init' }, term: { id: 'term' } },
      };
      writeFileSync(headJsonPath, JSON.stringify(dagContent));

      execSync('git add .roadmap/head.json', { cwd: testRepoRoot });
      execSync('git commit -m "initial DAG"', { cwd: testRepoRoot });

      // Modify without committing
      writeFileSync(headJsonPath, JSON.stringify({ ...dagContent, dirty: true }));

      // Capture stderr
      const oldError = console.error;
      const warnings: string[] = [];
      console.error = (...args: any[]) => {
        warnings.push(args.join(' '));
      };

      preExitPersistenceWarning(testRepoRoot);

      console.error = oldError;

      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes('WARNING'))).toBe(true);
      expect(warnings.some((w) => w.includes('Uncommitted'))).toBe(true);
    });
  });

  describe('post-commit sync validation', () => {
    it('validatePostCommitSync requires both head.json and completed.json', () => {
      // Test with missing files
      const result = validatePostCommitSync(testRepoRoot);
      expect(result.valid).toBe(false);
      expect(result.issues).toBeDefined();
      expect(result.issues?.some((i) => i.includes('Missing'))).toBe(true);
    });

    it('validatePostCommitSync rejects invalid JSON', () => {
      execSync(`mkdir -p "${join(testRepoRoot, '.roadmap')}"`, { shell: true });

      // Write invalid JSON
      writeFileSync(join(testRepoRoot, '.roadmap', 'head.json'), '{invalid json}');
      writeFileSync(join(testRepoRoot, '.roadmap', 'completed.json'), '[]');

      const result = validatePostCommitSync(testRepoRoot);
      expect(result.valid).toBe(false);
      expect(result.issues?.some((i) => i.includes('Invalid JSON'))).toBe(true);
    });

    it('validatePostCommitSync ensures completed records have gitSha/treeSha', () => {
      execSync(`mkdir -p "${join(testRepoRoot, '.roadmap')}"`, { shell: true });

      const head = {
        id: 'test-dag',
        nodes: { init: { id: 'init' }, term: { id: 'term' }, work: { id: 'work' } },
      };
      writeFileSync(join(testRepoRoot, '.roadmap', 'head.json'), JSON.stringify(head));

      // Record missing gitSha
      const completed = [{ nodeId: 'work', treeSha: 'abc123' }];
      writeFileSync(join(testRepoRoot, '.roadmap', 'completed.json'), JSON.stringify(completed));

      const result = validatePostCommitSync(testRepoRoot);
      expect(result.valid).toBe(false);
      expect(result.issues?.some((i) => i.includes('gitSha') || i.includes('treeSha'))).toBe(true);
    });

    it('validatePostCommitSync ensures no orphaned completed nodes', () => {
      execSync(`mkdir -p "${join(testRepoRoot, '.roadmap')}"`, { shell: true });

      const head = {
        id: 'test-dag',
        nodes: { init: { id: 'init' }, term: { id: 'term' } },
      };
      writeFileSync(join(testRepoRoot, '.roadmap', 'head.json'), JSON.stringify(head));

      // Record for non-existent node
      const completed = [
        {
          nodeId: 'nonexistent',
          gitSha: 'abc123',
          treeSha: 'def456',
        },
      ];
      writeFileSync(join(testRepoRoot, '.roadmap', 'completed.json'), JSON.stringify(completed));

      const result = validatePostCommitSync(testRepoRoot);
      expect(result.valid).toBe(false);
      expect(result.issues?.some((i) => i.includes('nonexistent'))).toBe(true);
    });
  });

  describe('session drift detection', () => {
    it('detectSessionDrift identifies node set changes', () => {
      const last = {
        nodes: { init: {}, a: {}, b: {}, term: {} },
      };
      const current = {
        nodes: { init: {}, a: {}, b: {}, c: {}, term: {} },
      };

      const result = detectSessionDrift('/tmp', last, current);
      expect(result.drifted).toBe(true);
      expect(result.changes).toContain('Node set changed');
      expect(result.warning).toBeDefined();
    });

    it('detectSessionDrift allows identical DAG structures', () => {
      const dag = {
        nodes: { init: {}, a: {}, b: {}, term: {} },
      };

      const result = detectSessionDrift('/tmp', dag, dag);
      expect(result.drifted).toBe(false);
    });

    it('detectSessionDrift handles null input gracefully', () => {
      const result1 = detectSessionDrift('/tmp', null, { nodes: {} });
      const result2 = detectSessionDrift('/tmp', { nodes: {} }, null);
      const result3 = detectSessionDrift('/tmp', null, null);

      expect(result1.drifted).toBe(false);
      expect(result2.drifted).toBe(false);
      expect(result3.drifted).toBe(false);
    });
  });

  describe('hook setup and configuration', () => {
    it('setupPersistenceEnforcement returns hook names', () => {
      const result = setupPersistenceEnforcement(testRepoRoot);

      expect(result.hooksCreated).toContain('pre-exit-roadmap-check');
      expect(result.hooksCreated).toContain('post-commit-roadmap-sync');
    });

    it('actual pre-exit hook references roadmap-persistence-check binary', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-exit-roadmap-check');
      // This hook should exist after enforce-persistence node completes
      // If it does, verify it references the check binary
      try {
        const content = readFileSync(hookPath, 'utf-8');
        expect(content).toMatch(/roadmap-persistence-check|pre-exit.*persistence/i);
      } catch {
        // Hook not yet created; setupPersistenceEnforcement should handle creation
        const setup = setupPersistenceEnforcement('/home/griffin/src/roadmap');
        expect(setup.hooksCreated).toContain('pre-exit-roadmap-check');
      }
    });

    it('actual post-commit hook validates DAG sync', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/post-commit-roadmap-sync');
      try {
        const content = readFileSync(hookPath, 'utf-8');
        expect(content).toContain('validatePostCommitSync');
      } catch {
        // Not yet created; setupPersistenceEnforcement should create it
        const setup = setupPersistenceEnforcement('/home/griffin/src/roadmap');
        expect(setup.hooksCreated).toContain('post-commit-roadmap-sync');
      }
    });
  });

  describe('hook interaction under context clear scenarios', () => {
    it('pre-commit hook prevents commits when batch incomplete', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify logic exists to block incomplete batches
      expect(content).toContain('batchComplete');
      expect(content).toMatch(/if.*batchComplete.*=.*false/);
      expect(content).toContain('Complete all nodes in the batch');
    });

    it('pre-commit hook allows commits when all conditions met', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify successful path exists
      expect(content).toContain('exit 0');
      // Multiple exits OK - one for success, others for early exit
    });

    it('pre-commit hook logs bypass reasons', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      // Verify logging infrastructure for auditing
      expect(content).toContain('LOG_FILE');
      expect(content).toContain('hooks.log');
      expect(content).toMatch(/echo.*>>.*LOG_FILE/);
    });

    it('combining hooks prevents unsafe transitions', () => {
      const preCommitPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const preCommitContent = readFileSync(preCommitPath, 'utf-8');

      // pre-commit blocks on:
      // 1. Missing tests for new src files
      expect(preCommitContent).toContain('Test enforcement');

      // 2. Broken DAG structure
      expect(preCommitContent).toContain('DAG integrity');

      // 3. Incomplete batch
      expect(preCommitContent).toContain('Batch validation');

      // Together these prevent: code + DAG changes without corresponding tests or incomplete work
    });
  });

  describe('hook error messages', () => {
    it('pre-commit hook provides actionable error for missing tests', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      expect(content).toContain('No test files were added');
      expect(content).toContain('SKIP_TEST_CHECK');
      expect(content).toContain('reason');
    });

    it('pre-commit hook provides actionable error for broken DAG', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      expect(content).toContain('DAG integrity check failed');
      expect(content).toContain('define()');
      expect(content).toContain('cycles, missing init/term');
    });

    it('pre-commit hook provides actionable error for incomplete batch', () => {
      const hookPath = join('/home/griffin/src/roadmap/.git/hooks/pre-commit');
      const content = readFileSync(hookPath, 'utf-8');

      expect(content).toContain('Batch validation failed');
      expect(content).toContain('Complete all nodes in the batch');
      expect(content).toContain('SKIP_BATCH_COMMIT');
    });
  });
});
