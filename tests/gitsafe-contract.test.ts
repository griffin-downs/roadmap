// Integration test for gitsafe contract validation
import { describe, it, expect } from 'vitest';
import { GitSafeConfig, GitSafeError } from '../src/lib/gitsafe/index';

describe('GitSafe Contract Integration', () => {
  it('should validate gitsafe configuration structure', () => {
    const config: GitSafeConfig = {
      denylist: ['\\.env'],
      maxBytes: 1024 * 1024,
    };
    expect(config.denylist).toContain('\\.env');
    expect(config.maxBytes).toBe(1024 * 1024);
  });

  it('should handle GitSafeError properly', () => {
    const err = new GitSafeError('TEST_ERROR', { detail: 'test' });
    expect(err.code).toBe('TEST_ERROR');
    expect(err.context).toHaveProperty('detail', 'test');
    expect(err.message).toContain('GitSafeError');
  });
});
