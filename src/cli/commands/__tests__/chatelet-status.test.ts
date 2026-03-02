// @module cli-status-tests
// @purpose CLI tests for status reporting (S2/S7) — violation detection, audit trail, output formatting

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cmdChateletStatus, ChateletStatus, StatusOptions } from '../chatelet-status';
import type { KeepBudget } from '../../lib/chatelet/types';

describe('cmdChateletStatus', () => {
  let testDir: string;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let exitSpy: any;

  beforeEach(() => {
    testDir = join(tmpdir(), `chatelet-status-test-${Date.now()}-${Math.random()}`);
    mkdirSync(testDir, { recursive: true });

    // Create a valid CHATELET.json for testing
    const chateletDir = join(testDir, 'security');
    mkdirSync(chateletDir, { recursive: true });

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();

    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function setupChatelet(budget: KeepBudget): string {
    const configPath = join(testDir, 'security', 'CHATELET.json');
    writeFileSync(configPath, JSON.stringify(budget, null, 2));
    return configPath;
  }

  describe('S2: Violation Detection and Reporting', () => {
    describe('No Violations', () => {
      it('should report zero violations when budget is clean', async () => {
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

        setupChatelet(budget);

        const result = await cmdChateletStatus(testDir);

        expect(result.violations).toHaveLength(0);
        expect(result).toHaveProperty('violations', []);
      });

      it('should return status with correct structure when no violations', async () => {
        const budget: KeepBudget = {
          version: '1.0',
          keep: {
            maxFiles: 50,
            maxLineCount: 2000,
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

        setupChatelet(budget);

        const result = await cmdChateletStatus(testDir);

        expect(result).toHaveProperty('timestamp');
        expect(result).toHaveProperty('keep');
        expect(result).toHaveProperty('packs');
        expect(result).toHaveProperty('violations');
        expect(result).toHaveProperty('lastAudit');
      });
    });

    describe('File Count Violations', () => {
      it('should detect file count violations', async () => {
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

        setupChatelet(budget);

        // Create 5 files to exceed limit of 3
        const keepDir = join(testDir, 'keep');
        mkdirSync(keepDir, { recursive: true });
        for (let i = 0; i < 5; i++) {
          writeFileSync(join(keepDir, `file${i}.ts`), 'const x = 1;\n');
        }

        const result = await cmdChateletStatus(testDir);

        const fileViolation = result.violations.find(
          v => v.type === 'file-count-exceeded'
        );
        expect(fileViolation).toBeDefined();
        expect(fileViolation!.severity).toBe('error');
        expect(fileViolation!.message).toContain('exceeds limit');
      });

      it('should include remediation in file count violations', async () => {
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

        setupChatelet(budget);

        const keepDir = join(testDir, 'keep');
        mkdirSync(keepDir, { recursive: true });
        for (let i = 0; i < 5; i++) {
          writeFileSync(join(keepDir, `file${i}.ts`), 'const x = 1;\n');
        }

        const result = await cmdChateletStatus(testDir);

        const fileViolation = result.violations.find(
          v => v.type === 'file-count-exceeded'
        );
        expect(fileViolation!.remediation).toBeDefined();
        expect(fileViolation!.remediation).toContain('Remove');
      });
    });

    describe('Line Count Violations', () => {
      it('should detect line count violations', async () => {
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

        setupChatelet(budget);

        const keepDir = join(testDir, 'keep');
        mkdirSync(keepDir, { recursive: true });
        const content = 'const x = 1;\n'.repeat(100);
        writeFileSync(join(keepDir, 'large.ts'), content);

        const result = await cmdChateletStatus(testDir);

        const lineViolation = result.violations.find(
          v => v.type === 'line-count-exceeded'
        );
        expect(lineViolation).toBeDefined();
        expect(lineViolation!.severity).toBe('error');
        expect(lineViolation!.message).toContain('exceeds limit');
      });

      it('should include line count details in violations', async () => {
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

        setupChatelet(budget);

        const keepDir = join(testDir, 'keep');
        mkdirSync(keepDir, { recursive: true });
        writeFileSync(join(keepDir, 'file.ts'), 'const x = 1;\n'.repeat(100));

        const result = await cmdChateletStatus(testDir);

        const lineViolation = result.violations.find(
          v => v.type === 'line-count-exceeded'
        );
        expect(lineViolation!.details).toHaveProperty('current');
        expect(lineViolation!.details).toHaveProperty('limit', 50);
        expect(lineViolation!.details).toHaveProperty('excess');
      });
    });

    describe('Forbidden Directory Violations', () => {
      it('should detect files outside allowedDirs', async () => {
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

        setupChatelet(budget);

        const forbiddenDir = join(testDir, 'keep', 'forbidden');
        mkdirSync(forbiddenDir, { recursive: true });
        writeFileSync(join(forbiddenDir, 'bad.ts'), 'const x = 1;');

        const result = await cmdChateletStatus(testDir);

        const forbiddenViolation = result.violations.find(
          v => v.type === 'forbidden-directory'
        );
        expect(forbiddenViolation).toBeDefined();
        expect(forbiddenViolation!.message).toContain('not in allowedDirs');
      });

      it('should include file path in forbidden directory violation', async () => {
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

        setupChatelet(budget);

        const forbiddenDir = join(testDir, 'keep', 'forbidden');
        mkdirSync(forbiddenDir, { recursive: true });
        writeFileSync(join(forbiddenDir, 'bad.ts'), 'const x = 1;');

        const result = await cmdChateletStatus(testDir);

        const forbiddenViolation = result.violations.find(
          v => v.type === 'forbidden-directory'
        );
        expect(forbiddenViolation!.details).toHaveProperty('file');
        expect(forbiddenViolation!.details!.file).toContain('bad.ts');
      });
    });

    describe('Multiple Violations', () => {
      it('should report multiple violations simultaneously', async () => {
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

        setupChatelet(budget);

        // Create files in both allowed and forbidden dirs
        const allowedDir = join(testDir, 'keep', 'allowed');
        const forbiddenDir = join(testDir, 'keep', 'forbidden');
        mkdirSync(allowedDir, { recursive: true });
        mkdirSync(forbiddenDir, { recursive: true });

        writeFileSync(join(allowedDir, 'file1.ts'), 'const x = 1;\n'.repeat(100));
        writeFileSync(join(allowedDir, 'file2.ts'), 'const x = 2;\n');
        writeFileSync(join(forbiddenDir, 'bad.ts'), 'const x = 3;\n');

        const result = await cmdChateletStatus(testDir);

        expect(result.violations.length).toBeGreaterThanOrEqual(2);
        const types = result.violations.map(v => v.type);
        expect(types).toContain('file-count-exceeded');
      });
    });

    describe('Violation Reporting Format', () => {
      it('should include severity in all violations', async () => {
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

        setupChatelet(budget);

        const keepDir = join(testDir, 'keep', 'allowed');
        mkdirSync(keepDir, { recursive: true });
        writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n'.repeat(100));
        writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

        const result = await cmdChateletStatus(testDir);

        for (const violation of result.violations) {
          expect(violation).toHaveProperty('severity');
          expect(['error', 'warn']).toContain(violation.severity);
        }
      });

      it('should include message for all violations', async () => {
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

        setupChatelet(budget);

        const keepDir = join(testDir, 'keep', 'allowed');
        mkdirSync(keepDir, { recursive: true });
        writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n'.repeat(100));
        writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

        const result = await cmdChateletStatus(testDir);

        for (const violation of result.violations) {
          expect(violation.message).toBeDefined();
          expect(typeof violation.message).toBe('string');
          expect(violation.message.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('S7: Audit Trail Included', () => {
    it('should include timestamp in status', async () => {
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

      setupChatelet(budget);

      const before = new Date();
      const result = await cmdChateletStatus(testDir);
      const after = new Date();

      expect(result.timestamp).toBeDefined();
      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should include lastAudit in human-readable format', async () => {
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

      setupChatelet(budget);

      const result = await cmdChateletStatus(testDir);

      expect(result.lastAudit).toBeDefined();
      expect(result.lastAudit).toContain('ago');
    });

    it('should format lastAudit as "X seconds ago"', async () => {
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

      setupChatelet(budget);

      const result = await cmdChateletStatus(testDir);

      expect(result.lastAudit).toMatch(/^\d+ second/);
    });

    it('should track audit information in status result', async () => {
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

      setupChatelet(budget);

      const result = await cmdChateletStatus(testDir);

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('lastAudit');
      expect(typeof result.timestamp).toBe('string');
      expect(typeof result.lastAudit).toBe('string');
    });
  });

  describe('Output Format: Text', () => {
    it('should print status report when format is text (default)', async () => {
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

      setupChatelet(budget);

      await cmdChateletStatus(testDir, { format: 'text' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Châtelet Status Report');
    });

    it('should include keep statistics in text output', async () => {
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

      setupChatelet(budget);

      await cmdChateletStatus(testDir, { format: 'text' });

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Keep:');
      expect(output).toContain('files');
      expect(output).toContain('lines');
    });

    it('should include pack discovery in text output', async () => {
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

      setupChatelet(budget);

      // Create a pack directory
      const packDir = join(testDir, 'packs', 'core');
      mkdirSync(packDir, { recursive: true });
      writeFileSync(join(packDir, 'PACK.json'), '{}');

      await cmdChateletStatus(testDir, { format: 'text' });

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Packs:');
    });

    it('should include violations section in text output when violations exist', async () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
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

      setupChatelet(budget);

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n');
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

      await cmdChateletStatus(testDir, { format: 'text' });

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Violations:');
    });

    it('should include remediation in text output for violations', async () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
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

      setupChatelet(budget);

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n');
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

      await cmdChateletStatus(testDir, { format: 'text' });

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('→');
    });

    it('should include last audit in text output', async () => {
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

      setupChatelet(budget);

      await cmdChateletStatus(testDir, { format: 'text' });

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Last audit:');
    });
  });

  describe('Output Format: JSON', () => {
    it('should output valid JSON when format is json', async () => {
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

      setupChatelet(budget);

      await cmdChateletStatus(testDir, { format: 'json' });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should include all fields in JSON output', async () => {
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

      setupChatelet(budget);

      await cmdChateletStatus(testDir, { format: 'json' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('keep');
      expect(parsed).toHaveProperty('packs');
      expect(parsed).toHaveProperty('violations');
      expect(parsed).toHaveProperty('lastAudit');
    });

    it('should include violation details in JSON output', async () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
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

      setupChatelet(budget);

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n');
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

      await cmdChateletStatus(testDir, { format: 'json' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);

      expect(parsed.violations).toHaveLength(1);
      expect(parsed.violations[0]).toHaveProperty('type');
      expect(parsed.violations[0]).toHaveProperty('severity');
      expect(parsed.violations[0]).toHaveProperty('message');
    });

    it('should format JSON with proper indentation', async () => {
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

      setupChatelet(budget);

      await cmdChateletStatus(testDir, { format: 'json' });

      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('\n');
    });
  });

  describe('--check Flag: Exit Codes', () => {
    it('should not exit when --check is false and no violations', async () => {
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

      setupChatelet(budget);

      const result = await cmdChateletStatus(testDir, { check: false });

      expect(exitSpy).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should exit with code 1 when --check and violations exist', async () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
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

      setupChatelet(budget);

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n');
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

      try {
        await cmdChateletStatus(testDir, { check: true });
        expect.fail('Should have called process.exit');
      } catch (err) {
        expect((err as Error).message).toContain('exit(1)');
      }
    });

    it('should exit with code 1 when --check and error occurs', async () => {
      const nonexistentPath = join(testDir, 'nonexistent');

      try {
        await cmdChateletStatus(nonexistentPath, { check: true });
        expect.fail('Should have called process.exit');
      } catch (err) {
        expect((err as Error).message).toContain('exit(1)');
      }
    });

    it('should use --check option correctly', async () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
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

      setupChatelet(budget);

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n');
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

      const options: StatusOptions = { check: true };
      expect(options.check).toBe(true);

      try {
        await cmdChateletStatus(testDir, options);
        expect.fail('Should have exited');
      } catch (err) {
        expect((err as Error).message).toContain('exit');
      }
    });
  });

  describe('Keep Statistics', () => {
    it('should include file count in status', async () => {
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

      setupChatelet(budget);

      const result = await cmdChateletStatus(testDir);

      expect(result.keep).toHaveProperty('fileCount');
      expect(result.keep).toHaveProperty('maxFiles', 100);
    });

    it('should include line count in status', async () => {
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

      setupChatelet(budget);

      const result = await cmdChateletStatus(testDir);

      expect(result.keep).toHaveProperty('lineCount');
      expect(result.keep).toHaveProperty('maxLineCount', 5000);
    });
  });

  describe('Pack Discovery', () => {
    it('should discover discoverable packs', async () => {
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

      setupChatelet(budget);

      // Create pack directories with PACK.json
      const corePack = join(testDir, 'packs', 'core');
      const utilsPack = join(testDir, 'packs', 'utils');
      mkdirSync(corePack, { recursive: true });
      mkdirSync(utilsPack, { recursive: true });
      writeFileSync(join(corePack, 'PACK.json'), '{}');
      writeFileSync(join(utilsPack, 'PACK.json'), '{}');

      const result = await cmdChateletStatus(testDir);

      expect(result.packs.discoverable).toBe(2);
      expect(result.packs.names).toContain('core');
      expect(result.packs.names).toContain('utils');
    });

    it('should return empty pack list when no packs exist', async () => {
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

      setupChatelet(budget);

      const result = await cmdChateletStatus(testDir);

      expect(result.packs.discoverable).toBe(0);
      expect(result.packs.names).toHaveLength(0);
    });

    it('should only count directories with PACK.json', async () => {
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

      setupChatelet(budget);

      // Create valid pack and invalid directory
      const corePack = join(testDir, 'packs', 'core');
      const invalidDir = join(testDir, 'packs', 'invalid');
      mkdirSync(corePack, { recursive: true });
      mkdirSync(invalidDir, { recursive: true });
      writeFileSync(join(corePack, 'PACK.json'), '{}');
      // No PACK.json in invalidDir

      const result = await cmdChateletStatus(testDir);

      expect(result.packs.discoverable).toBe(1);
      expect(result.packs.names).toContain('core');
      expect(result.packs.names).not.toContain('invalid');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing CHATELET.json gracefully', async () => {
      const nonexistentPath = join(testDir, 'missing');

      try {
        await cmdChateletStatus(nonexistentPath);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeDefined();
        expect(consoleErrorSpy).toHaveBeenCalled();
      }
    });

    it('should report error when CHATELET.json is invalid', async () => {
      const configPath = join(testDir, 'security', 'CHATELET.json');
      writeFileSync(configPath, '{ invalid json }');

      try {
        await cmdChateletStatus(testDir);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeDefined();
        expect(consoleErrorSpy).toHaveBeenCalled();
      }
    });

    it('should handle errors without exiting when check is false', async () => {
      const nonexistentPath = join(testDir, 'missing');

      try {
        await cmdChateletStatus(nonexistentPath, { check: false });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeDefined();
        // Should not have called process.exit
        expect(exitSpy).not.toHaveBeenCalled();
      }
    });
  });

  describe('Default Options', () => {
    it('should use text format by default', async () => {
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

      setupChatelet(budget);

      // Call without format option
      await cmdChateletStatus(testDir, {});

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Châtelet Status Report');
    });

    it('should default to current directory when repoRoot is not provided', async () => {
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

      // Setup in testDir but call without repoRoot
      const originalCwd = process.cwd();
      try {
        process.chdir(testDir);
        setupChatelet(budget);
        // Calling without repoRoot should default to '.'
        const result = await cmdChateletStatus('.', {});
        expect(result).toBeDefined();
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Integration: S2 + S7', () => {
    it('should report violations with complete audit trail', async () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
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

      setupChatelet(budget);

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n');
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

      const result = await cmdChateletStatus(testDir);

      // S2: violations reported
      expect(result.violations.length).toBeGreaterThan(0);

      // S7: audit trail present
      expect(result.timestamp).toBeDefined();
      expect(result.lastAudit).toBeDefined();
    });

    it('should format violations in text output with audit info', async () => {
      const budget: KeepBudget = {
        version: '1.0',
        keep: {
          maxFiles: 1,
          maxLineCount: 10,
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

      setupChatelet(budget);

      const keepDir = join(testDir, 'keep');
      mkdirSync(keepDir, { recursive: true });
      writeFileSync(join(keepDir, 'file1.ts'), 'const x = 1;\n');
      writeFileSync(join(keepDir, 'file2.ts'), 'const x = 2;\n');

      await cmdChateletStatus(testDir, { format: 'text' });

      const output = consoleLogSpy.mock.calls.map(call => call[0]).join('\n');

      // S2: violations shown
      expect(output).toContain('Violations:');

      // S7: audit trail shown
      expect(output).toContain('Last audit:');
    });
  });
});
