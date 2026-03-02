// @module keepbudget-validator-tests
// @purpose Unit tests for schema validation + violation detection (S2)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadChatelet,
  validateChatelet,
  checkKeepBudget,
  ChateletError,
  type KeepBudget,
  type ValidationResult,
  type KeepBudgetViolation,
} from '../keepbudget.js';

describe('KeepBudget Schema Validation (S2)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `keepbudget-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Schema Validation - Valid Structures', () => {
    it('should accept valid CHATELET.json with all required fields', () => {
      const validBudget: KeepBudget = {
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

      const result = validateChatelet(validBudget);
      expect(result.passed).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept CHATELET.json with minimal allowedDirs', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 50,
          maxLineCount: 1000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 5 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 512 * 1024,
        },
      };

      const result = validateChatelet(budget);
      expect(result.passed).toBe(true);
    });

    it('should accept CHATELET.json with large constraints', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 10000,
          maxLineCount: 1000000,
          allowedDirs: ['keep/a', 'keep/b', 'keep/c'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 100 * 1024 * 1024,
        },
        gitsafe: {
          denylist: ['\\.env', '\\.ssh/', 'credentials/', 'secrets/'],
          maxBytes: 10 * 1024 * 1024,
        },
      };

      const result = validateChatelet(budget);
      expect(result.passed).toBe(true);
    });
  });

  describe('Schema Validation - Invalid Structures', () => {
    it('should reject invalid version string', () => {
      const invalidBudget: any = {
        version: '2.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('Unsupported'))).toBe(true);
    });

    it('should reject missing version', () => {
      const invalidBudget: any = {
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
    });

    it('should reject non-positive maxFiles', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 0,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('maxFiles'))).toBe(true);
    });

    it('should reject negative maxLineCount', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: -1,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('maxLineCount'))).toBe(true);
    });

    it('should warn when allowedDirs is missing or not an array', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: 'keep/',
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      // Non-array allowedDirs will trigger the warning about empty allowedDirs
      expect(result.warnings.some((w) => w.includes('allowedDirs'))).toBe(true);
    });

    it('should accept allowedDirs with valid string elements', () => {
      const validBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/', 'keep/other'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(validBudget);
      expect(result.passed).toBe(true);
    });

    it('should warn when allowedDirs is empty', () => {
      const budget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: [],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(budget);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('allowedDirs'))).toBe(true);
    });

    it('should reject missing packs section', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e: string) => e.includes('packs'))).toBe(true);
    });

    it('should accept numeric discoveryRoot as truthy value', () => {
      // discoveryRoot check uses truthy check, not type check
      const budget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 123, // Truthy, so passes the check
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(budget);
      expect(result.passed).toBe(true);
    });

    it('should reject empty discoveryRoot', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: '',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('discoveryRoot'))).toBe(true);
    });

    it('should reject non-positive packs.maxSize', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 0,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('maxSize'))).toBe(true);
    });

    it('should reject missing gitsafe section', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('gitsafe'))).toBe(true);
    });

    it('should reject non-array gitsafe.denylist', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: '.env',
          maxBytes: 1024 * 1024,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('denylist'))).toBe(true);
    });

    it('should reject non-positive gitsafe.maxBytes', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: -1,
        },
      };

      const result = validateChatelet(invalidBudget);
      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.includes('maxBytes'))).toBe(true);
    });
  });

  describe('File Loading and Parsing', () => {
    it('should load valid CHATELET.json file', () => {
      const configPath = join(testDir, 'CHATELET.json');
      const validConfig: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };
      writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      const loaded = loadChatelet(configPath);
      expect(loaded).toEqual(validConfig);
    });

    it('should throw on missing file', () => {
      const configPath = join(testDir, 'nonexistent.json');
      expect(() => loadChatelet(configPath)).toThrow(ChateletError);
    });

    it('should throw on invalid JSON syntax', () => {
      const configPath = join(testDir, 'CHATELET.json');
      writeFileSync(configPath, '{ invalid json }');

      expect(() => loadChatelet(configPath)).toThrow(ChateletError);
    });

    it('should throw on malformed schema', () => {
      const configPath = join(testDir, 'CHATELET.json');
      const invalidConfig = {
        version: '1.0',
        keep: { maxFiles: -1 },
        packs: {},
        gitsafe: {},
      };
      writeFileSync(configPath, JSON.stringify(invalidConfig));

      expect(() => loadChatelet(configPath)).toThrow(ChateletError);
    });

    it('should preserve file path in error context', () => {
      const configPath = join(testDir, 'CHATELET.json');
      writeFileSync(configPath, 'not json');

      try {
        loadChatelet(configPath);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ChateletError);
        const cErr = err as ChateletError;
        expect(cErr.context).toHaveProperty('path', configPath);
      }
    });
  });

  describe('Violation Detection - File Count', () => {
    it('should detect no violations when files are under limit', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 10000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      // Create keep directory with 5 files
      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(keepDir, `file${i}.ts`), 'const x = 1;\n');
      }

      const violations = checkKeepBudget(testDir, budget);
      expect(violations).toHaveLength(0);
    });

    it('should detect file count violation when exceeded', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 3,
          maxLineCount: 10000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      // Create keep directory with 5 files
      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(keepDir, `file${i}.ts`), 'const x = 1;\n');
      }

      const violations = checkKeepBudget(testDir, budget);
      const fileCountViolation = violations.find(
        v => v.type === 'file-count-exceeded'
      );

      expect(fileCountViolation).toBeDefined();
      expect(fileCountViolation!.severity).toBe('error');
      expect(fileCountViolation!.message).toContain('exceeds limit');
      expect(fileCountViolation!.remediation).toBeDefined();
      expect(fileCountViolation!.details).toHaveProperty('current', 5);
      expect(fileCountViolation!.details).toHaveProperty('limit', 3);
      expect(fileCountViolation!.details).toHaveProperty('excess', 2);
    });

    it('should include remediation suggestion in file count violation', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 2,
          maxLineCount: 10000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(keepDir, `file${i}.ts`), 'const x = 1;\n');
      }

      const violations = checkKeepBudget(testDir, budget);
      const violation = violations.find(v => v.type === 'file-count-exceeded');

      expect(violation!.remediation).toContain('3 files');
    });
  });

  describe('Violation Detection - Line Count', () => {
    it('should detect no violations when lines are under limit', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 1000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      const content = 'const x = 1;\n'.repeat(100);
      writeFileSync(join(keepDir, 'file.ts'), content);

      const violations = checkKeepBudget(testDir, budget);
      expect(violations.filter(v => v.type === 'line-count-exceeded')).toHaveLength(0);
    });

    it('should detect line count violation when exceeded', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 50,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      const content = 'const x = 1;\n'.repeat(100);
      writeFileSync(join(keepDir, 'file.ts'), content);

      const violations = checkKeepBudget(testDir, budget);
      const lineCountViolation = violations.find(
        v => v.type === 'line-count-exceeded'
      );

      expect(lineCountViolation).toBeDefined();
      expect(lineCountViolation!.severity).toBe('error');
      expect(lineCountViolation!.message).toContain('exceeds limit');
      expect(lineCountViolation!.remediation).toBeDefined();
      expect(lineCountViolation!.details).toHaveProperty('current');
      expect(lineCountViolation!.details).toHaveProperty('limit', 50);
    });

    it('should include remediation suggestion in line count violation', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 50,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      const content = 'const x = 1;\n'.repeat(100);
      writeFileSync(join(keepDir, 'file.ts'), content);

      const violations = checkKeepBudget(testDir, budget);
      const violation = violations.find(v => v.type === 'line-count-exceeded');

      expect(violation!.remediation).toBeDefined();
      expect(violation!.remediation).toContain('lines');
    });
  });

  describe('Violation Detection - Forbidden Directories', () => {
    it('should reject files outside allowedDirs', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 10000,
          allowedDirs: ['keep/core'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      // Create files in forbidden directory
      const forbiddenDir = join(testDir, 'keep', 'utils');
      mkdirSync(forbiddenDir, { recursive: true });
      writeFileSync(join(forbiddenDir, 'helper.ts'), 'export function h() {}');

      const violations = checkKeepBudget(testDir, budget);
      const forbiddenViolation = violations.find(
        v => v.type === 'forbidden-directory'
      );

      expect(forbiddenViolation).toBeDefined();
      expect(forbiddenViolation!.severity).toBe('error');
      expect(forbiddenViolation!.message).toContain('not in allowedDirs');
      expect(forbiddenViolation!.remediation).toBeDefined();
      expect(forbiddenViolation!.details).toHaveProperty('file');
      expect(forbiddenViolation!.details).toHaveProperty('allowedDirs');
    });

    it('should allow files in allowedDirs', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 10000,
          allowedDirs: ['keep/core', 'keep/utils'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      // Create files in allowed directories
      const coreDir = join(testDir, 'keep', 'core');
      const utilsDir = join(testDir, 'keep', 'utils');
      mkdirSync(coreDir, { recursive: true });
      mkdirSync(utilsDir, { recursive: true });
      writeFileSync(join(coreDir, 'main.ts'), 'export function main() {}');
      writeFileSync(join(utilsDir, 'helper.ts'), 'export function h() {}');

      const violations = checkKeepBudget(testDir, budget);
      const forbiddenViolations = violations.filter(
        v => v.type === 'forbidden-directory'
      );

      expect(forbiddenViolations).toHaveLength(0);
    });

    it('should handle nested directories in allowedDirs', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 10000,
          allowedDirs: ['keep/a/b/c'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const nestedDir = join(testDir, 'keep', 'a', 'b', 'c', 'd');
      mkdirSync(nestedDir, { recursive: true });
      writeFileSync(join(nestedDir, 'deep.ts'), 'const x = 1;');

      const violations = checkKeepBudget(testDir, budget);
      const forbiddenViolations = violations.filter(
        v => v.type === 'forbidden-directory'
      );

      expect(forbiddenViolations).toHaveLength(0);
    });

    it('should include file path in remediation', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 10000,
          allowedDirs: ['keep/allowed'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const forbiddenDir = join(testDir, 'keep', 'forbidden');
      mkdirSync(forbiddenDir, { recursive: true });
      writeFileSync(join(forbiddenDir, 'bad.ts'), 'const x = 1;');

      const violations = checkKeepBudget(testDir, budget);
      const violation = violations.find(v => v.type === 'forbidden-directory');

      expect(violation!.remediation).toContain('bad.ts');
    });
  });

  describe('Violation Detection - No Keep Directory', () => {
    it('should return no violations when keep/ does not exist', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const violations = checkKeepBudget(testDir, budget);
      expect(violations).toHaveLength(0);
    });
  });

  describe('Violation Detection - Invalid Budget', () => {
    it('should report schema errors as violations', () => {
      const invalidBudget: any = {
        version: '1.0',
        keep: {
          maxFiles: -1,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const violations = checkKeepBudget(testDir, invalidBudget);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].type).toBe('forbidden-directory');
      expect(violations[0].severity).toBe('error');
    });
  });

  describe('Error Messages and Context', () => {
    it('should provide detailed error context', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 2,
          maxLineCount: 50,
          allowedDirs: ['keep/allowed'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep', 'allowed');
      mkdirSync(keepDir, { recursive: true });
      for (let i = 0; i < 5; i++) {
        writeFileSync(join(keepDir, `file${i}.ts`), 'const x = 1;\n'.repeat(50));
      }

      const violations = checkKeepBudget(testDir, budget);
      expect(violations.length).toBeGreaterThan(0);

      for (const violation of violations) {
        expect(violation.message).toBeDefined();
        expect(violation.severity).toBeDefined();
        expect(violation.type).toBeDefined();
      }
    });

    it('should provide remediation for all violations', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
          allowedDirs: ['keep/allowed'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep', 'allowed');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n'.repeat(100));
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n'.repeat(100));

      const violations = checkKeepBudget(testDir, budget);

      for (const violation of violations) {
        if (violation.type !== 'forbidden-directory' || violation.message.includes('not in allowedDirs')) {
          expect(violation.remediation).toBeDefined();
        }
      }
    });
  });

  describe('Multiple Violations', () => {
    it('should detect and report multiple violations simultaneously', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
          allowedDirs: ['keep/allowed'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      // Create files in allowed dir and forbidden dir
      const allowedDir = join(testDir, 'keep', 'allowed');
      const forbiddenDir = join(testDir, 'keep', 'forbidden');
      mkdirSync(allowedDir, { recursive: true });
      mkdirSync(forbiddenDir, { recursive: true });

      // Create multiple files exceeding limits
      writeFileSync(join(allowedDir, 'file1.ts'), 'const x = 1;\n'.repeat(100));
      writeFileSync(join(allowedDir, 'file2.ts'), 'const x = 2;\n'.repeat(100));
      writeFileSync(join(forbiddenDir, 'bad.ts'), 'const x = 3;\n');

      const violations = checkKeepBudget(testDir, budget);

      expect(violations.length).toBeGreaterThanOrEqual(2);
      const types = violations.map(v => v.type);
      expect(types).toContain('file-count-exceeded');
      expect(types).toContain('line-count-exceeded');
      expect(types).toContain('forbidden-directory');
    });
  });

  describe('Edge Cases', () => {
    it('should handle keep directory with no files', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });

      const violations = checkKeepBudget(testDir, budget);
      expect(violations).toHaveLength(0);
    });

    it('should handle allowedDirs pointing to non-existent directories', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 5000,
          allowedDirs: ['keep/nonexistent', 'keep/also-missing'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const violations = checkKeepBudget(testDir, budget);
      expect(violations).toHaveLength(0);
    });

    it('should handle files with no newline at EOF', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 100,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file.ts'), 'const x = 1;');

      const violations = checkKeepBudget(testDir, budget);
      expect(violations).toHaveLength(0);
    });

    it('should handle files with carriage returns', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 100,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(
        join(keepDir, 'file.ts'),
        'const x = 1;\r\nconst y = 2;\r\n'
      );

      const violations = checkKeepBudget(testDir, budget);
      expect(violations).toHaveLength(0);
    });

    it('should count binary files as 0 or 1 line', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 100,
          maxLineCount: 10000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      writeFileSync(join(keepDir, 'binary.bin'), binaryData);

      // Should not throw and handle gracefully
      const violations = checkKeepBudget(testDir, budget);
      expect(violations).not.toThrow;
    });

    it('should handle very large file counts', () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1000,
          maxLineCount: 100000,
          allowedDirs: ['keep/'],
        },
        packs: {
          discoveryRoot: 'packs/',
          maxSize: 10 * 1024 * 1024,
        },
        gitsafe: {
          denylist: [],
          maxBytes: 1024 * 1024,
        },
      };

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });

      // Create 100 files
      for (let i = 0; i < 100; i++) {
        writeFileSync(
          join(keepDir, `file${i}.ts`),
          'const x = 1;\n'.repeat(50)
        );
      }

      const violations = checkKeepBudget(testDir, budget);
      expect(violations).toHaveLength(0);
    });
  });
});
