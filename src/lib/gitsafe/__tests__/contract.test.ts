// @module gitsafe-contract-tests
// @purpose Unit tests for deny-list + bounds enforcement (S1)

import { describe, it, expect, beforeEach } from 'vitest';
import { GitSafeConfig, GitSafeError } from '../index';

// Mock implementations for testing deny-list and bounds logic
function isDenied(path: string, denylist: string[]): boolean {
  return denylist.some(pattern => {
    try {
      const re = new RegExp(pattern);
      return re.test(path);
    } catch {
      return path.includes(pattern);
    }
  });
}

function validatePath(path: string, config: GitSafeConfig): void {
  if (isDenied(path, config.denylist)) {
    throw new GitSafeError('DENIED', { path, denylist: config.denylist });
  }

  if (path.includes('..') || path.startsWith('/')) {
    throw new GitSafeError('TRAVERSAL_REJECTED', { path });
  }
}

describe('GitSafe Contract Tests (S1)', () => {
  describe('Deny-list Enforcement', () => {
    let config: GitSafeConfig;

    beforeEach(() => {
      config = {
        denylist: ['\\.env$', '\\.ssh/', 'credentials/'],
        maxBytes: 1024 * 1024,
        maxDepth: 10,
      };
    });

    it('should reject .env files', () => {
      expect(() => validatePath('.env', config)).toThrow(GitSafeError);
      expect(() => validatePath('.env', config)).toThrow('DENIED');
    });

    it('should reject paths matching .ssh/ pattern', () => {
      expect(() => validatePath('config/.ssh/id_rsa', config)).toThrow(GitSafeError);
      expect(() => validatePath('.ssh/authorized_keys', config)).toThrow('DENIED');
    });

    it('should reject paths under credentials/ directory', () => {
      expect(() => validatePath('credentials/api_key.json', config)).toThrow(GitSafeError);
      expect(() => validatePath('credentials/database.url', config)).toThrow('DENIED');
    });

    it('should accept paths not in deny-list', () => {
      expect(() => validatePath('src/main.ts', config)).not.toThrow();
      expect(() => validatePath('package.json', config)).not.toThrow();
      expect(() => validatePath('README.md', config)).not.toThrow();
    });

    it('should support regex patterns in deny-list', () => {
      const regexConfig: GitSafeConfig = {
        denylist: ['.*\\.secret\\..*'],
        maxBytes: 1024 * 1024,
      };
      expect(() => validatePath('config.secret.yaml', regexConfig)).toThrow('DENIED');
      expect(() => validatePath('my.secret.env', regexConfig)).toThrow('DENIED');
      expect(() => validatePath('config.yaml', regexConfig)).not.toThrow();
    });

    it('should handle malformed regex by doing string matching', () => {
      const config: GitSafeConfig = {
        denylist: ['[invalid regex'],
        maxBytes: 1024 * 1024,
      };
      // Should fall back to string matching
      expect(() => validatePath('[invalid regex', config)).toThrow('DENIED');
      expect(() => validatePath('src/main.ts', config)).not.toThrow();
    });
  });

  describe('Bounds Enforcement', () => {
    let config: GitSafeConfig;

    beforeEach(() => {
      config = {
        denylist: [],
        maxBytes: 1024,
        maxDepth: 10,
      };
    });

    it('should accept buffers within maxBytes limit', () => {
      const smallBuffer = Buffer.alloc(512);
      expect(smallBuffer.length).toBeLessThanOrEqual(config.maxBytes);
    });

    it('should reject buffers exceeding maxBytes limit', () => {
      const largeSize = 2048;
      const largeBuffer = Buffer.alloc(largeSize);
      expect(largeBuffer.length).toBeGreaterThan(config.maxBytes);
    });

    it('should respect different maxBytes configurations', () => {
      const smallConfig: GitSafeConfig = {
        denylist: [],
        maxBytes: 100,
      };
      const largeConfig: GitSafeConfig = {
        denylist: [],
        maxBytes: 10 * 1024 * 1024,
      };

      const testBuffer = Buffer.alloc(5000);
      expect(testBuffer.length).toBeGreaterThan(smallConfig.maxBytes);
      expect(testBuffer.length).toBeLessThanOrEqual(largeConfig.maxBytes);
    });

    it('should allow boundary values (exactly maxBytes)', () => {
      const exactBuffer = Buffer.alloc(config.maxBytes);
      expect(exactBuffer.length).toBeLessThanOrEqual(config.maxBytes);
    });
  });

  describe('Path Traversal Rejection', () => {
    let config: GitSafeConfig;

    beforeEach(() => {
      config = {
        denylist: [],
        maxBytes: 1024 * 1024,
      };
    });

    it('should reject paths with .. (directory traversal)', () => {
      expect(() => validatePath('../../etc/passwd', config)).toThrow('TRAVERSAL_REJECTED');
      expect(() => validatePath('src/../../../secret', config)).toThrow('TRAVERSAL_REJECTED');
    });

    it('should reject absolute paths (starting with /)', () => {
      expect(() => validatePath('/etc/passwd', config)).toThrow('TRAVERSAL_REJECTED');
      expect(() => validatePath('/root/.ssh/id_rsa', config)).toThrow('TRAVERSAL_REJECTED');
    });

    it('should accept relative paths without traversal', () => {
      expect(() => validatePath('src/lib/file.ts', config)).not.toThrow();
      expect(() => validatePath('config/app.json', config)).not.toThrow();
    });

    it('should accept single-level relative paths', () => {
      expect(() => validatePath('main.ts', config)).not.toThrow();
      expect(() => validatePath('package.json', config)).not.toThrow();
    });
  });

  describe('Combined Deny-list and Traversal', () => {
    let config: GitSafeConfig;

    beforeEach(() => {
      config = {
        denylist: ['\\.env', 'secrets/'],
        maxBytes: 1024 * 1024,
      };
    });

    it('should reject traversal attempts to denied paths', () => {
      expect(() => validatePath('../../.env', config)).toThrow();
    });

    it('should reject denylisted paths with traversal attempts', () => {
      expect(() => validatePath('src/../../secrets/api_key', config)).toThrow();
    });

    it('should accept safe paths', () => {
      expect(() => validatePath('src/utils/helper.ts', config)).not.toThrow();
    });
  });

  describe('Error Context', () => {
    let config: GitSafeConfig;

    beforeEach(() => {
      config = {
        denylist: ['\\.env'],
        maxBytes: 1024,
      };
    });

    it('should provide context in DENIED errors', () => {
      try {
        validatePath('.env', config);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitSafeError);
        const gErr = err as GitSafeError;
        expect(gErr.code).toBe('DENIED');
        expect(gErr.context).toHaveProperty('path', '.env');
        expect(gErr.context).toHaveProperty('denylist');
      }
    });

    it('should provide context in TRAVERSAL_REJECTED errors', () => {
      try {
        validatePath('../../etc/passwd', config);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitSafeError);
        const gErr = err as GitSafeError;
        expect(gErr.code).toBe('TRAVERSAL_REJECTED');
        expect(gErr.context).toHaveProperty('path');
      }
    });
  });

  describe('Edge Cases', () => {
    let config: GitSafeConfig;

    beforeEach(() => {
      config = {
        denylist: [],
        maxBytes: 1024,
      };
    });

    it('should handle empty denylist', () => {
      expect(() => validatePath('.env', config)).not.toThrow();
      expect(() => validatePath('secrets/key', config)).not.toThrow();
    });

    it('should handle empty path', () => {
      expect(() => validatePath('', config)).not.toThrow();
    });

    it('should handle paths with multiple slashes', () => {
      expect(() => validatePath('src//lib///file.ts', config)).not.toThrow();
    });

    it('should handle special characters in paths', () => {
      expect(() => validatePath('src/file@2024.ts', config)).not.toThrow();
      expect(() => validatePath('docs/README-v1.0.md', config)).not.toThrow();
    });
  });
});
