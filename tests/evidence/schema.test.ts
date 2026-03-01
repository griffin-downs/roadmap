import { describe, it, expect } from 'vitest';
import {
  isValidEvidenceBundle,
  hasAnyChanges,
  hasAnyReads,
  hasAnyChecks,
  allChecksPass,
  type EvidenceBundle,
  type GitDiffItem,
  type FileReadProof,
  type CheckResult,
} from '../../src/lib/evidence/schema.js';

describe('EvidenceBundle', () => {
  describe('isValidEvidenceBundle', () => {
    it('validates a well-formed bundle', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [],
        entries: [],
      };

      expect(isValidEvidenceBundle(bundle)).toBe(true);
    });

    it('rejects non-objects', () => {
      expect(isValidEvidenceBundle(null)).toBe(false);
      expect(isValidEvidenceBundle(undefined)).toBe(false);
      expect(isValidEvidenceBundle('string')).toBe(false);
      expect(isValidEvidenceBundle(42)).toBe(false);
    });

    it('rejects bundles with missing fields', () => {
      expect(isValidEvidenceBundle({ schema_version: 1 })).toBe(false);
      expect(isValidEvidenceBundle({ timestamp: Date.now() })).toBe(false);
      expect(isValidEvidenceBundle({ headSha: 'abc123' })).toBe(false);
    });

    it('rejects bundles with wrong schema_version', () => {
      expect(
        isValidEvidenceBundle({
          schema_version: 2,
          timestamp: Date.now(),
          headSha: 'abc123',
          gitDiffs: [],
          reads: [],
          checks: [],
          entries: [],
        })
      ).toBe(false);
    });

    it('rejects bundles with non-array evidence fields', () => {
      expect(
        isValidEvidenceBundle({
          schema_version: 1,
          timestamp: Date.now(),
          headSha: 'abc123',
          gitDiffs: 'not-an-array',
          reads: [],
          checks: [],
          entries: [],
        })
      ).toBe(false);
    });
  });

  describe('hasAnyChanges', () => {
    it('returns true when gitDiffs is non-empty', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [
          {
            file: 'test.ts',
            status: 'added',
            additions: 10,
            deletions: 0,
          },
        ],
        reads: [],
        checks: [],
        entries: [],
      };

      expect(hasAnyChanges(bundle)).toBe(true);
    });

    it('returns false when gitDiffs is empty', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [],
        entries: [],
      };

      expect(hasAnyChanges(bundle)).toBe(false);
    });
  });

  describe('hasAnyReads', () => {
    it('returns true when reads is non-empty', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [{ path: 'test.ts', timestamp: Date.now() }],
        checks: [],
        entries: [],
      };

      expect(hasAnyReads(bundle)).toBe(true);
    });

    it('returns false when reads is empty', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [],
        entries: [],
      };

      expect(hasAnyReads(bundle)).toBe(false);
    });
  });

  describe('hasAnyChecks', () => {
    it('returns true when checks is non-empty', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [
          {
            type: 'test',
            name: 'test-suite',
            passed: true,
          },
        ],
        entries: [],
      };

      expect(hasAnyChecks(bundle)).toBe(true);
    });

    it('returns false when checks is empty', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [],
        entries: [],
      };

      expect(hasAnyChecks(bundle)).toBe(false);
    });
  });

  describe('allChecksPass', () => {
    it('returns true when all checks pass', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [
          { type: 'test', name: 'test1', passed: true },
          { type: 'lint', name: 'lint1', passed: true },
        ],
        entries: [],
      };

      expect(allChecksPass(bundle)).toBe(true);
    });

    it('returns false when any check fails', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [
          { type: 'test', name: 'test1', passed: true },
          { type: 'lint', name: 'lint1', passed: false },
        ],
        entries: [],
      };

      expect(allChecksPass(bundle)).toBe(false);
    });

    it('returns false when checks array is empty', () => {
      const bundle: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [],
        entries: [],
      };

      expect(allChecksPass(bundle)).toBe(false);
    });
  });

  describe('GitDiffItem', () => {
    it('supports all status types', () => {
      const statuses: Array<'added' | 'deleted' | 'modified' | 'renamed'> = [
        'added',
        'deleted',
        'modified',
        'renamed',
      ];

      statuses.forEach((status) => {
        const diff: GitDiffItem = {
          file: 'test.ts',
          status,
          additions: 10,
          deletions: 0,
        };

        expect(diff.status).toBe(status);
      });
    });
  });

  describe('CheckResult', () => {
    it('supports all check types', () => {
      const types: Array<'test' | 'lint' | 'typecheck' | 'build' | 'custom'> = [
        'test',
        'lint',
        'typecheck',
        'build',
        'custom',
      ];

      types.forEach((type) => {
        const check: CheckResult = {
          type,
          name: 'check-name',
          passed: true,
        };

        expect(check.type).toBe(type);
      });
    });
  });
});
