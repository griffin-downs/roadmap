// @module chatelet-types-tests
// @purpose Type definition tests for KeepBudget, KeepBudgetViolation, ChateletError, ValidationResult

import { describe, it, expect } from 'vitest';
import type {
  KeepBudget,
  KeepBudgetViolation,
  ValidationResult,
} from '../types.js';
import { ChateletError } from '../types.js';

describe('Chatelet Type Definitions', () => {
  describe('KeepBudget', () => {
    it('should accept a well-formed KeepBudget object', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/core', 'keep/utils'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: ['\\.env$', 'credentials/'],
          maxBytes: 1024 * 1024,
        },
      };

      expect(budget.version).toBe('1.0');
      expect(budget.keep.maxFiles).toBe(100);
      expect(budget.keep.maxLineCount).toBe(5000);
      expect(budget.keep.allowedDirs).toHaveLength(2);
      expect(budget.packs.discoveryRoot).toBe('packs/');
      expect(budget.packs.maxSize).toBe(10 * 1024 * 1024);
      expect(budget.gitsafe.denylist).toHaveLength(2);
      expect(budget.gitsafe.maxBytes).toBe(1024 * 1024);
    });

    it('should enforce version as literal "1.0"', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: { maxFiles: 1, maxLineCount: 1, allowedDirs: [] },
        packs: { discoveryRoot: '.', maxSize: 1 },
        gitsafe: { denylist: [], maxBytes: 1 },
      };
      // Version is typed as literal "1.0", not arbitrary string
      expect(budget.version).toBe('1.0');
    });

    it('should support empty arrays in allowedDirs and denylist', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: { maxFiles: 10, maxLineCount: 100, allowedDirs: [] },
        packs: { discoveryRoot: 'packs/', maxSize: 1024 },
        gitsafe: { denylist: [], maxBytes: 512 },
      };

      expect(budget.keep.allowedDirs).toEqual([]);
      expect(budget.gitsafe.denylist).toEqual([]);
    });
  });

  describe('KeepBudgetViolation', () => {
    it('should represent file-count-exceeded violation', () => {
      const v: KeepBudgetViolation = {
        type: 'file-count-exceeded',
        severity: 'error',
        message: 'keep/ has 150 files, exceeds limit of 100',
        remediation: 'Remove 50 files',
        details: { current: 150, limit: 100, excess: 50 },
      };

      expect(v.type).toBe('file-count-exceeded');
      expect(v.severity).toBe('error');
      expect(v.remediation).toBeDefined();
      expect(v.details).toHaveProperty('current', 150);
    });

    it('should represent line-count-exceeded violation', () => {
      const v: KeepBudgetViolation = {
        type: 'line-count-exceeded',
        severity: 'error',
        message: 'keep/ has 10000 total lines, exceeds limit of 5000',
      };

      expect(v.type).toBe('line-count-exceeded');
      expect(v.remediation).toBeUndefined();
      expect(v.details).toBeUndefined();
    });

    it('should represent forbidden-directory violation', () => {
      const v: KeepBudgetViolation = {
        type: 'forbidden-directory',
        severity: 'error',
        message: 'File keep/secret/data.ts is in keep/ but not in allowedDirs',
        details: { file: 'keep/secret/data.ts', allowedDirs: ['keep/core'] },
      };

      expect(v.type).toBe('forbidden-directory');
      expect(v.details).toHaveProperty('file');
    });

    it('should represent oversized-file violation', () => {
      const v: KeepBudgetViolation = {
        type: 'oversized-file',
        severity: 'warn',
        message: 'File too large',
      };

      expect(v.type).toBe('oversized-file');
      expect(v.severity).toBe('warn');
    });

    it('should support both error and warn severity', () => {
      const err: KeepBudgetViolation = {
        type: 'file-count-exceeded',
        severity: 'error',
        message: 'error level',
      };
      const warn: KeepBudgetViolation = {
        type: 'file-count-exceeded',
        severity: 'warn',
        message: 'warn level',
      };

      expect(err.severity).toBe('error');
      expect(warn.severity).toBe('warn');
    });
  });

  describe('ValidationResult', () => {
    it('should represent a passing result', () => {
      const result: ValidationResult = {
        passed: true,
        errors: [],
        warnings: [],
      };

      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should represent a failing result with errors', () => {
      const result: ValidationResult = {
        passed: false,
        errors: ['version must be "1.0"', 'keep section is missing'],
        warnings: [],
      };

      expect(result.passed).toBe(false);
      expect(result.errors).toHaveLength(2);
    });

    it('should support optional details field', () => {
      const result: ValidationResult = {
        passed: true,
        errors: [],
        warnings: ['allowedDirs is empty'],
        details: { checkedAt: Date.now() },
      };

      expect(result.details).toHaveProperty('checkedAt');
    });

    it('should support result without details', () => {
      const result: ValidationResult = {
        passed: true,
        errors: [],
        warnings: [],
      };

      expect(result.details).toBeUndefined();
    });
  });

  describe('ChateletError', () => {
    it('should construct with code and context', () => {
      const err = new ChateletError('FILE_NOT_FOUND', { path: '/tmp/missing.json' });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ChateletError);
      expect(err.code).toBe('FILE_NOT_FOUND');
      expect(err.context).toEqual({ path: '/tmp/missing.json' });
      expect(err.name).toBe('ChateletError');
    });

    it('should format message with code and context', () => {
      const err = new ChateletError('INVALID_SCHEMA', { errors: ['bad field'] });

      expect(err.message).toContain('ChateletError');
      expect(err.message).toContain('INVALID_SCHEMA');
    });

    it('should be catchable as Error', () => {
      let caught = false;
      try {
        throw new ChateletError('TEST', { reason: 'test' });
      } catch (e) {
        caught = e instanceof Error;
      }
      expect(caught).toBe(true);
    });

    it('should preserve stack trace', () => {
      const err = new ChateletError('STACK_TEST', {});
      expect(err.stack).toBeDefined();
      expect(err.stack).toContain('ChateletError');
    });

    it('should support empty context', () => {
      const err = new ChateletError('EMPTY', {});
      expect(err.context).toEqual({});
    });
  });
});
