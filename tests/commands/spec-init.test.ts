import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { specKitInit } from '../../src/commands/spec-init.ts';

describe('specKitInit', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(process.cwd(), 'test-'));
  });

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('initializes a spec-kit workspace', () => {
    const result = specKitInit({
      dagId: 'test-dag-001',
      intent: 'Test intent for DAG',
      repoRoot: tempDir,
    });

    expect(result).toBeDefined();
    expect(result.dagId).toBe('test-dag-001');
    expect(result.brief).toBeDefined();
    expect(result.specDir).toContain('test-dag-001');
  });
});
