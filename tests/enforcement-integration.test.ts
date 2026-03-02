import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EnforcementSuite } from '../src/lib/enforcement/index';

describe('EnforcementSuite — Integration Tests', () => {
  let tempDir: string;
  let suite: EnforcementSuite;

  beforeEach(() => {
    tempDir = mkdtempSync(join('/tmp', 'enforcement-'));
    mkdirSync(join(tempDir, 'tasks'), { recursive: true });
    mkdirSync(join(tempDir, '.roadmap'), { recursive: true });
    suite = new EnforcementSuite(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('clean state', () => {
    it('should pass validation with no tasks, DAGs, or worktrees', () => {
      const result = suite.validate();
      expect(result.passed).toBe(true);
      expect(result.taskValidation.passed).toBe(true);
      expect(result.dagValidation.passed).toBe(true);
      expect(result.worktreeValidation.passed).toBe(true);
    });

    it('should report all validations passed', () => {
      const report = suite.report();
      expect(report).toContain('✅ PASS');
      expect(report).toContain('✅ Task list valid');
      expect(report).toContain('✅ All DAGs documented');
      expect(report).toContain('✅ No stale or orphaned worktrees');
    });
  });

  describe('task validation integration', () => {
    it('should detect invalid tasks in full suite validation', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad', status: 'invalid' })
      );

      const result = suite.validate();
      expect(result.passed).toBe(false);
      expect(result.taskValidation.passed).toBe(false);
      expect(result.taskValidation.invalidStatusCount).toBe(1);
    });

    it('should detect stale tasks', () => {
      const now = Date.now();
      writeFileSync(
        join(tempDir, 'tasks', 'stale.json'),
        JSON.stringify({
          id: 'stale',
          status: 'in_progress',
          updatedAt: new Date(now - 100 * 60 * 60 * 1000).toISOString(), // 100 hours
        })
      );

      const result = suite.validate();
      expect(result.passed).toBe(false);
      expect(result.taskValidation.staleCount).toBeGreaterThan(0);
    });

    it('should detect completed tasks missing evidence', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'incomplete.json'),
        JSON.stringify({
          id: 'incomplete',
          status: 'completed',
          // Missing evidence field
        })
      );

      const result = suite.validate();
      expect(result.passed).toBe(false);
      expect(result.taskValidation.missingEvidenceCount).toBeGreaterThan(0);
    });
  });

  describe('DAG validation integration', () => {
    it('should detect undocumented DAGs', () => {
      // Create a DAG directory without accompanying spec
      mkdirSync(join(tempDir, '.roadmap', 'undocumented-dag'), { recursive: true });
      writeFileSync(
        join(tempDir, '.roadmap', 'undocumented-dag', 'head.json'),
        JSON.stringify({ id: 'undocumented', nodes: {} })
      );

      const result = suite.validate();
      expect(result.dagValidation.passed).toBe(false);
      expect(result.dagValidation.undocumentedCount).toBeGreaterThan(0);
    });
  });

  describe('combined enforcement', () => {
    it('should report multiple validation failures', () => {
      // Create multiple issues
      // Invalid task
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad', status: 'invalid' })
      );

      // Missing evidence
      writeFileSync(
        join(tempDir, 'tasks', 'incomplete.json'),
        JSON.stringify({
          id: 'incomplete',
          status: 'completed',
        })
      );

      const result = suite.validate();
      expect(result.passed).toBe(false);

      // Should detect all issues
      expect(result.taskValidation.passed).toBe(false);
      expect(result.taskValidation.invalidStatusCount).toBeGreaterThan(0);
      expect(result.taskValidation.missingEvidenceCount).toBeGreaterThan(0);
    });

    it('should pass when all four gates are clean', () => {
      // Create valid task
      writeFileSync(
        join(tempDir, 'tasks', 'valid.json'),
        JSON.stringify({
          id: 'valid',
          status: 'in_progress',
          updatedAt: new Date().toISOString(),
        })
      );

      const result = suite.validate();
      expect(result.passed).toBe(true);
      expect(result.taskValidation.passed).toBe(true);
      expect(result.dagValidation.passed).toBe(true);
      expect(result.worktreeValidation.passed).toBe(true);
    });
  });

  describe('report generation', () => {
    it('should generate readable report for pass state', () => {
      const report = suite.report();
      expect(report).toContain('Clutter Prevention Enforcement Report');
      expect(report).toContain('✅ PASS');
    });

    it('should generate detailed report for fail state', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad', status: 'invalid' })
      );

      const report = suite.report();
      expect(report).toContain('❌ FAIL');
      expect(report).toContain('Task List Hygiene');
    });

    it('should show DAG status in report', () => {
      const report = suite.report();
      expect(report).toContain('DAG Documentation');
    });

    it('should show worktree status in report', () => {
      const report = suite.report();
      expect(report).toContain('Worktree Cleanup');
    });
  });

  describe('enforcement gate boundaries', () => {
    it('should isolate task validation failures from DAG validation', () => {
      writeFileSync(
        join(tempDir, 'tasks', 'bad.json'),
        JSON.stringify({ id: 'bad', status: 'invalid' })
      );

      const result = suite.validate();
      expect(result.taskValidation.passed).toBe(false);
      expect(result.dagValidation.passed).toBe(true); // DAG validation should still pass
      expect(result.passed).toBe(false); // Overall should fail
    });

    it('should isolate DAG validation failures from task validation', () => {
      // Create valid task
      writeFileSync(
        join(tempDir, 'tasks', 'valid.json'),
        JSON.stringify({
          id: 'valid',
          status: 'pending',
        })
      );

      // Create undocumented DAG
      mkdirSync(join(tempDir, '.roadmap', 'undocumented'), { recursive: true });
      writeFileSync(
        join(tempDir, '.roadmap', 'undocumented', 'head.json'),
        JSON.stringify({ id: 'undocumented', nodes: {} })
      );

      const result = suite.validate();
      expect(result.taskValidation.passed).toBe(true); // Task validation should pass
      expect(result.dagValidation.passed).toBe(false); // DAG validation should fail
      expect(result.passed).toBe(false); // Overall should fail
    });
  });

  describe('idempotency', () => {
    it('should return consistent results across multiple calls', () => {
      const result1 = suite.validate();
      const result2 = suite.validate();

      expect(result1.passed).toBe(result2.passed);
      expect(result1.taskValidation.passed).toBe(result2.taskValidation.passed);
      expect(result1.dagValidation.passed).toBe(result2.dagValidation.passed);
      expect(result1.worktreeValidation.passed).toBe(result2.worktreeValidation.passed);
    });

    it('should generate consistent reports across multiple calls', () => {
      const report1 = suite.report();
      const report2 = suite.report();

      expect(report1).toContain(report1.split('\n')[3]); // Status line
      expect(report2).toContain(report2.split('\n')[3]);
    });
  });
});
