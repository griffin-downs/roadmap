// @module cli/commands-tests
// @purpose Integration tests for pack discovery CLI (S3 scenarios)
// @spec fr-chatelet-001

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cmdPacksList, formatPacksText, formatPacksJson, PackMetadata } from '../packs-list';
import { execSync } from 'node:child_process';

vi.mock('node:child_process');

describe('cmdPacksList - S3: Pack Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('S3.1: Deterministic Sort Order (Alphabetic by Name)', () => {
    it('should return packs sorted alphabetically by name', async () => {
      const mockExecSync = vi.mocked(execSync);

      // Mock git for-each-ref to return unsorted pack names
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/zebra\npacks/alpha\npacks/bravo\npacks/charlie';
        }
        // Mock ls-tree for metadata
        if (cmd.includes('ls-tree')) {
          if (cmd.includes('grep')) {
            return '3'; // module count
          } else if (cmd.includes('--long')) {
            return '45000'; // size
          }
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'text');

      // Parse the output to verify order
      const lines = result.split('\n');
      expect(lines[0]).toMatch(/^alpha/);
      expect(lines[1]).toMatch(/^bravo/);
      expect(lines[2]).toMatch(/^charlie/);
      expect(lines[3]).toMatch(/^zebra/);
    });

    it('should maintain alphabetical order in JSON output', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/zebra\npacks/alpha\npacks/beta';
        }
        if (cmd.includes('ls-tree')) {
          if (cmd.includes('grep')) {
            return '2';
          } else if (cmd.includes('--long')) {
            return '20000';
          }
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      expect(parsed.packs[0].name).toBe('alpha');
      expect(parsed.packs[1].name).toBe('beta');
      expect(parsed.packs[2].name).toBe('zebra');
    });
  });

  describe('S3.2: Metadata Accuracy (Module Count, Size)', () => {
    it('should accurately report module count from git ls-tree', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/core';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '5'; // 5 source files
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '102400'; // 100KB
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      expect(parsed.packs[0].modules).toBe(5);
    });

    it('should accurately report size in bytes from git ls-tree', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/utils';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '3';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '51200'; // 50KB
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      expect(parsed.packs[0].size).toBe(51200);
    });

    it('should enforce minimum module count of 1', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/empty';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '0'; // No matches
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '';
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      expect(parsed.packs[0].modules).toBeGreaterThanOrEqual(1);
    });

    it('should handle size as zero when no files present', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/tiny';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '1';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return ''; // Empty output
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      expect(parsed.packs[0].size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('S3.3: Empty State Handling', () => {
    it('should return "(no packs discovered)" in text format when no packs exist', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return ''; // No pack branches
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'text');

      expect(result).toBe('(no packs discovered)');
    });

    it('should return empty packs array in JSON format when no packs exist', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return '';
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      expect(parsed.packs).toEqual([]);
    });

    it('should handle discovery failure gracefully', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          throw new Error('git command failed');
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'text');

      expect(result).toBe('(no packs discovered)');
    });
  });

  describe('S3.4: Format Selection (JSON vs Text)', () => {
    it('should default to text format', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/core';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '3';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '45000';
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo');

      // Text format should not be valid JSON at the root level
      expect(() => JSON.parse(result)).toThrow();
      expect(result).toContain('core');
      expect(result).toContain('modules');
      expect(result).toContain('KB');
    });

    it('should return valid JSON when format is json', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/core';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '3';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '45000';
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result); // Should not throw

      expect(parsed).toHaveProperty('packs');
      expect(Array.isArray(parsed.packs)).toBe(true);
    });

    it('should format text with human-readable sizes', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/core';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '3';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '45000'; // 44KB when rounded
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'text');

      expect(result).toMatch(/core\s+3 modules, \d+KB/);
    });

    it('should use singular "module" for single module', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/single';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '1';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '10000';
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'text');

      expect(result).toContain('1 module,');
    });

    it('should use plural "modules" for multiple modules', async () => {
      const mockExecSync = vi.mocked(execSync);

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/multi';
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          return '5';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '50000';
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'text');

      expect(result).toContain('5 modules,');
    });
  });

  describe('S3.5: S3 Acceptance Scenarios', () => {
    it('should handle multiple packs with varied sizes', async () => {
      const mockExecSync = vi.mocked(execSync);

      const packData = {
        'packs/core': { modules: 10, size: 102400 },
        'packs/utils': { modules: 5, size: 51200 },
        'packs/config': { modules: 2, size: 20480 },
      };

      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/core\npacks/utils\npacks/config';
        }

        // Find which pack this query is for
        for (const [ref, data] of Object.entries(packData)) {
          if (cmd.includes(ref)) {
            if (cmd.includes('grep')) {
              return String(data.modules);
            }
            if (cmd.includes('--long')) {
              return String(data.size);
            }
          }
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      expect(parsed.packs).toHaveLength(3);
      expect(parsed.packs[0].name).toBe('config');
      expect(parsed.packs[1].name).toBe('core');
      expect(parsed.packs[2].name).toBe('utils');
    });

    it('should handle pack with failed metadata retrieval', async () => {
      const mockExecSync = vi.mocked(execSync);

      let callCount = 0;
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.includes('for-each-ref')) {
          return 'packs/good\npacks/bad\npacks/good2';
        }
        if (cmd.includes('packs/bad')) {
          throw new Error('Failed to read pack');
        }
        if (cmd.includes('ls-tree') && cmd.includes('grep')) {
          callCount++;
          return '3';
        }
        if (cmd.includes('ls-tree') && cmd.includes('--long')) {
          return '30000';
        }
        return '';
      });

      const result = await cmdPacksList('/test/repo', 'json');
      const parsed = JSON.parse(result);

      // Should include only successfully read packs
      expect(parsed.packs.length).toBeGreaterThanOrEqual(0);
      expect(parsed.packs.every((p: PackMetadata) => p.name !== 'bad')).toBe(true);
    });
  });

  describe('Formatting Functions', () => {
    it('formatPacksText should handle empty array', () => {
      const result = formatPacksText([]);
      expect(result).toBe('(no packs discovered)');
    });

    it('formatPacksJson should produce valid JSON', () => {
      const packs: PackMetadata[] = [
        { name: 'core', modules: 3, size: 45000 },
        { name: 'utils', modules: 2, size: 20000 },
      ];

      const result = formatPacksJson(packs);
      const parsed = JSON.parse(result);

      expect(parsed.packs).toEqual(packs);
    });

    it('formatPacksText should render all packs', () => {
      const packs: PackMetadata[] = [
        { name: 'core', modules: 3, size: 45000 },
        { name: 'utils', modules: 1, size: 10240 },
      ];

      const result = formatPacksText(packs);

      expect(result).toContain('core');
      expect(result).toContain('utils');
      expect(result).toContain('3 modules');
      expect(result).toContain('1 module');
    });
  });
});
