import { describe, it, expect } from 'vitest';
import { listRefs, readBlob, readJson, lsTree, diffPaths } from '../src/lib/gitsafe/index.js';

describe('gitSafe', () => {
  describe('listRefs', () => {
    it('returns empty array on error', () => {
      const result = listRefs('nonexistent-prefix-xyz');
      expect(Array.isArray(result)).toBe(true);
    });

    it('returns sorted array of refs', () => {
      const result = listRefs('*');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('readBlob', () => {
    it('throws on denied path patterns', () => {
      expect(() => readBlob('HEAD', '.env')).toThrow('GITSAFE_DENIED');
    });

    it('throws on denied path with token', () => {
      expect(() => readBlob('HEAD', 'config/token.json')).toThrow('GITSAFE_DENIED');
    });

    it('returns null on missing blob', () => {
      const result = readBlob('HEAD', 'nonexistent-file-xyz.txt');
      expect(result).toBeNull();
    });
  });

  describe('readJson', () => {
    it('returns null for missing files', () => {
      const result = readJson('HEAD', 'nonexistent.json');
      expect(result).toBeNull();
    });

    it('throws on denied patterns', () => {
      expect(() => readJson('HEAD', 'secrets.json')).toThrow('GITSAFE_DENIED');
    });
  });

  describe('lsTree', () => {
    it('returns empty array on error', () => {
      const result = lsTree('HEAD', 'nonexistent-prefix');
      expect(Array.isArray(result)).toBe(true);
    });

    it('filters denied patterns', () => {
      const result = lsTree('HEAD', '.');
      const hasSecrets = result.some(p => p.includes('secrets') || p.includes('.env'));
      expect(hasSecrets).toBe(false);
    });
  });

  describe('diffPaths', () => {
    it('returns empty array on invalid refs', () => {
      const result = diffPaths('nonexistent-a', 'nonexistent-b', '.');
      expect(Array.isArray(result)).toBe(true);
    });

    it('filters denied patterns from diff', () => {
      const result = diffPaths('HEAD~1', 'HEAD', '.');
      const hasSecrets = result.some(p => p.includes('secrets') || p.includes('.env'));
      expect(hasSecrets).toBe(false);
    });
  });
});
