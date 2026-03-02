import { describe, it, expect } from 'vitest';
import { cmdPacksShow, PackManifest, PackShowResponse } from '../packs-show';

describe('cmdPacksShow', () => {
  describe('S3 — Pack details rendered correctly', () => {
    it('returns pack metadata response with correct structure', () => {
      const result = cmdPacksShow('core', 'test show');

      expect(result).toHaveProperty('cmd', 'packs.show');
      expect(result).toHaveProperty('name', 'core');
      expect(result).toHaveProperty('manifest');
      expect(result.manifest).toHaveProperty('exports');
    });

    it('provides manifest with expected exports', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest.exports).toContain('define');
      expect(result.manifest.exports).toContain('verify');
      expect(result.manifest.exports).toContain('orient');
      expect(result.manifest.exports).toContain('merge');
      expect(result.manifest.exports).toContain('branch');
      expect(result.manifest.exports).toContain('reconcile');
      expect(result.manifest.exports).toContain('parallelOrder');
      expect(result.manifest.exports).toContain('advanceBatch');
    });

    it('includes pack version and description', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest).toHaveProperty('version');
      expect(result.manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(result.manifest).toHaveProperty('description');
      expect(result.manifest.description).toBeTruthy();
    });

    it('includes branch information', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest).toHaveProperty('branch');
      expect(result.manifest.branch).toBe('packs/core');
    });

    it('includes modules list', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest).toHaveProperty('modules');
      expect(Array.isArray(result.manifest.modules)).toBe(true);
      expect(result.manifest.modules!.length).toBeGreaterThan(0);
      expect(result.manifest.modules).toContain('src/lib/gitsafe/index.ts');
    });

    it('includes pack size information', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest).toHaveProperty('size');
      expect(typeof result.manifest.size).toBe('number');
      expect(result.manifest.size).toBeGreaterThan(0);
    });
  });

  describe('S3 — Nonexistent packs error gracefully', () => {
    it('throws error for nonexistent pack', () => {
      expect(() => {
        cmdPacksShow('nonexistent', 'test');
      }).toThrow('Pack not found: nonexistent');
    });

    it('error message includes pack name', () => {
      const invalidName = 'missing-pack-xyz';
      expect(() => {
        cmdPacksShow(invalidName, 'test');
      }).toThrow(new RegExp(invalidName));
    });

    it('throws error for empty pack name', () => {
      expect(() => {
        cmdPacksShow('', 'test');
      }).toThrow();
    });
  });

  describe('S3 — Test status included', () => {
    it('includes test status in manifest', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest).toHaveProperty('testStatus');
      expect(result.manifest.testStatus).toBeTruthy();
    });

    it('test status indicates passing tests', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest.testStatus).toContain('passing');
    });

    it('test status includes test count', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest.testStatus).toMatch(/\d+\/\d+/);
    });

    it('test status includes success indicator', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.manifest.testStatus).toContain('✅');
    });
  });

  describe('S3 — Discovery ready flag', () => {
    it('marks discovery as ready', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result).toHaveProperty('discoveryReady', true);
    });

    it('discovery ready is always true for valid packs', () => {
      const result = cmdPacksShow('core', 'test');

      expect(result.discoveryReady).toBe(true);
      expect(typeof result.discoveryReady).toBe('boolean');
    });
  });

  describe('S3 — Response structure validation', () => {
    it('response conforms to PackShowResponse type', () => {
      const result = cmdPacksShow('core', 'test') as PackShowResponse;

      expect(result.cmd).toBe('packs.show');
      expect(typeof result.name).toBe('string');
      expect(typeof result.manifest).toBe('object');
      expect(typeof result.discoveryReady).toBe('boolean');
    });

    it('manifest conforms to PackManifest type', () => {
      const result = cmdPacksShow('core', 'test');
      const manifest = result.manifest as PackManifest;

      expect(typeof manifest.name).toBe('string');
      expect(typeof manifest.version).toBe('string');
      expect(typeof manifest.description).toBe('string');
      expect(Array.isArray(manifest.exports)).toBe(true);
      expect(typeof manifest.size).toBe('number');
      expect(typeof manifest.branch).toBe('string');
      expect(typeof manifest.testStatus).toBe('string');
    });

    it('export list is non-empty array', () => {
      const result = cmdPacksShow('core', 'test');

      expect(Array.isArray(result.manifest.exports)).toBe(true);
      expect(result.manifest.exports.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases and robustness', () => {
    it('handles case-sensitive pack names', () => {
      expect(() => {
        cmdPacksShow('Core', 'test');
      }).toThrow();

      expect(() => {
        cmdPacksShow('CORE', 'test');
      }).toThrow();
    });

    it('consistent response across calls for same pack', () => {
      const result1 = cmdPacksShow('core', 'test');
      const result2 = cmdPacksShow('core', 'test');

      expect(result1.name).toBe(result2.name);
      expect(result1.manifest.version).toBe(result2.manifest.version);
      expect(result1.manifest.exports).toEqual(result2.manifest.exports);
    });
  });
});
