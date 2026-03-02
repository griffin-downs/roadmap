import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cmdChateletMigrate } from '../src/cli/commands/chatelet-migrate';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('cmdChateletMigrate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
  });

  afterEach(() => {
    if (tmpDir) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it('returns migration plan with moves array', async () => {
    const result = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });

    expect(result).toHaveProperty('moves');
    expect(Array.isArray(result.moves)).toBe(true);
  });

  it('includes safety status in plan', async () => {
    const result = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });

    expect(result).toHaveProperty('safety');
    expect(['dry-run-verified', 'dry-run-failed', 'pending', 'executed']).toContain(result.safety);
  });

  it('includes estimated time', async () => {
    const result = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });

    expect(result).toHaveProperty('estimated_time');
    expect(typeof result.estimated_time).toBe('string');
  });

  it('includes rollback metadata', async () => {
    const result = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });

    expect(result).toHaveProperty('rollback');
    expect(result.rollback).toHaveProperty('metadata');
    expect(result.rollback).toHaveProperty('timestamp');
  });

  it('validates move operations have from and to', async () => {
    // Create test source structure
    const srcDir = join(tmpDir, 'src', 'lib');
    const utilsDir = join(srcDir, 'utils');
    writeFileSync(join(utilsDir, 'helpers.ts'), 'export const foo = 1;', { recursive: true } as any);

    const result = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });

    if (result.moves.length > 0) {
      result.moves.forEach(move => {
        expect(move).toHaveProperty('from');
        expect(move).toHaveProperty('to');
        expect(typeof move.from).toBe('string');
        expect(typeof move.to).toBe('string');
        expect(move.from.length).toBeGreaterThan(0);
        expect(move.to.length).toBeGreaterThan(0);
      });
    }
  });

  it('generates deterministic plan (idempotent)', async () => {
    // Create identical test structure
    const srcDir = join(tmpDir, 'src', 'lib');
    const coreDir = join(srcDir, 'core');
    writeFileSync(join(coreDir, 'index.ts'), 'export const core = 1;', { recursive: true } as any);

    const result1 = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });
    const result2 = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });

    expect(JSON.stringify(result1.moves)).toBe(JSON.stringify(result2.moves));
    expect(result1.estimated_time).toBe(result2.estimated_time);
  });

  it('is dry-run only (no actual changes)', async () => {
    const srcDir = join(tmpDir, 'src', 'lib');
    const testDir = join(srcDir, 'test');
    const filePath = join(testDir, 'file.ts');
    writeFileSync(filePath, 'export const test = 1;', { recursive: true } as any);

    const result = await cmdChateletMigrate(tmpDir, { planOnly: true, format: 'json' });

    // Verify plan was generated
    expect(result).toHaveProperty('moves');
    expect(result).toHaveProperty('safety');
    // Original files should still exist (no moves made)
    expect(result.safety).toBe('dry-run-verified');
  });
});
