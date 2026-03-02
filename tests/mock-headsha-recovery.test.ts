// @module mock-headsha-recovery
// @exports (test suite)
// @entry test

import { describe, it, expect } from 'vitest';
import {
  MockHeadShaRecovery,
  detectMismatch,
  autoRecover,
  validateConsistency,
} from '../src/lib/roadmap/mocks/mock-headsha-recovery';
import type { MismatchDetection, RecoveryResult } from '../src/lib/roadmap/headsha-recovery';

const testRepoRoot = '/tmp/test-repo';

describe('MockHeadShaRecovery', () => {
  describe('detectMismatch', () => {
    it('should return MismatchDetection with correct shape', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.detectMismatch();

      expect(result).toHaveProperty('hasMismatch');
      expect(result).toHaveProperty('headShaInFile');
      expect(result).toHaveProperty('actualGitSha');
      expect(result).toHaveProperty('headJsonSha');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.hasMismatch).toBe('boolean');
      expect(typeof result.actualGitSha).toBe('string');
      expect(typeof result.headJsonSha).toBe('string');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should return no mismatch by default', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.detectMismatch();

      expect(result.hasMismatch).toBe(false);
    });

    it('should have matching git shas', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.detectMismatch();

      expect(result.headShaInFile).toBe(result.actualGitSha);
    });
  });

  describe('autoRecover', () => {
    it('should return RecoveryResult with correct shape', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.autoRecover();

      expect(result).toHaveProperty('recovered');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.recovered).toBe('boolean');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should indicate recovery succeeded', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.autoRecover();

      expect(result.recovered).toBe(true);
    });

    it('should contain before/after state', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.autoRecover();

      expect(result.prevHeadSha).toBeDefined();
      expect(result.newHeadSha).toBeDefined();
      expect(result.prevGitState).toBeDefined();
      expect(result.newGitState).toBeDefined();
    });

    it('should not have error property on success', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.autoRecover();

      expect(result.error).toBeUndefined();
    });
  });

  describe('validateConsistency', () => {
    it('should return validation result with correct shape', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.validateConsistency();

      expect(result).toHaveProperty('consistent');
      expect(result).toHaveProperty('headJsonExists');
      expect(result).toHaveProperty('headJsonValid');
      expect(result).toHaveProperty('gitStateExists');
      expect(result).toHaveProperty('gitStateValid');
      expect(result).toHaveProperty('recoveryStateExists');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should report consistency valid', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.validateConsistency();

      expect(result.consistent).toBe(true);
      expect(result.headJsonValid).toBe(true);
      expect(result.gitStateValid).toBe(true);
    });

    it('should report all artifacts exist', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.validateConsistency();

      expect(result.headJsonExists).toBe(true);
      expect(result.gitStateExists).toBe(true);
    });

    it('should have no errors', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.validateConsistency();

      expect(result.errors).toHaveLength(0);
    });
  });

  describe('standalone functions', () => {
    it('should export detectMismatch function', () => {
      const result = detectMismatch(testRepoRoot);

      expect(result).toHaveProperty('hasMismatch');
      expect(result).toHaveProperty('actualGitSha');
    });

    it('should export autoRecover function', () => {
      const result = autoRecover(testRepoRoot);

      expect(result).toHaveProperty('recovered');
      expect(result.recovered).toBe(true);
    });

    it('should export validateConsistency function', () => {
      const result = validateConsistency(testRepoRoot);

      expect(result).toHaveProperty('consistent');
      expect(result.consistent).toBe(true);
    });
  });

  describe('API contract compliance', () => {
    it('should maintain stable SHA values across calls to same instance', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);

      const det1 = recovery.detectMismatch();
      const det2 = recovery.detectMismatch();

      expect(det1.actualGitSha).toBe(det2.actualGitSha);
      expect(det1.headJsonSha).toBe(det2.headJsonSha);
    });

    it('should return ISO 8601 timestamps', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.detectMismatch();

      // Verify ISO 8601 format
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(result.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should return valid SHA256 hashes', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.detectMismatch();

      // SHA256 hashes are 64 hex characters
      expect(result.actualGitSha).toMatch(/^[a-f0-9]{40}$/);
      expect(result.headJsonSha).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return valid git SHAs (40 chars for commit)', () => {
      const recovery = new MockHeadShaRecovery(testRepoRoot);
      const result = recovery.autoRecover();

      // Git SHAs are typically 40 hex chars (shortened to various lengths)
      expect(result.newGitState).toMatch(/^[a-f0-9]{40}$/);
      expect(result.prevGitState).toMatch(/^[a-f0-9]{40}$/);
    });
  });
});
