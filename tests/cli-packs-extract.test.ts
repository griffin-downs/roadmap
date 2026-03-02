// @module cli/commands/packs-extract-tests
// @purpose CLI tests for bounded pack extraction (S4)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { cmdPacksExtract, ExtractError } from '../src/cli/commands/packs-extract';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('cmdPacksExtract (S4)', () => {
  let testRepoRoot: string;
  let chateletPath: string;

  beforeAll(() => {
    // Create a temporary test repository
    testRepoRoot = mkdtempSync(join(process.cwd(), 'test-repo-'));

    // Initialize git repo
    execSync('git init', { cwd: testRepoRoot });
    execSync('git config user.email "test@example.com"', { cwd: testRepoRoot });
    execSync('git config user.name "Test User"', { cwd: testRepoRoot });

    // Create CHATELET.json with standard bounds
    const securityDir = join(testRepoRoot, 'security');
    mkdirSync(securityDir, { recursive: true });
    chateletPath = join(securityDir, 'CHATELET.json');

    writeFileSync(
      chateletPath,
      JSON.stringify({
        gitsafe: {
          denylist: ['\\.env$', 'secrets/', 'id_rsa', 'private'],
          maxBytes: 1024 * 100, // 100KB for testing
        },
        packs: {
          branchPrefix: 'packs/',
        },
      }),
      'utf-8'
    );

    // Create a pack branch with test files
    const packDir = join(testRepoRoot, 'src', 'lib', 'core');
    mkdirSync(packDir, { recursive: true });

    // Small files
    writeFileSync(join(packDir, 'types.ts'), 'export interface Core {}', 'utf-8');
    writeFileSync(join(packDir, 'index.ts'), 'export { Core } from "./types"', 'utf-8');
    writeFileSync(join(packDir, 'protocol.ts'), 'export const protocol = "core"', 'utf-8');

    // Create and commit to packs/core branch
    execSync('git add security/ src/', { cwd: testRepoRoot });
    execSync('git commit -m "initial"', { cwd: testRepoRoot });
    execSync('git checkout -b packs/core', { cwd: testRepoRoot });
  });

  afterAll(() => {
    // Clean up test repo
    if (existsSync(testRepoRoot)) {
      rmSync(testRepoRoot, { recursive: true });
    }
  });

  describe('Configuration Loading', () => {
    it('throws CHATELET_NOT_FOUND when missing', async () => {
      const tmpDir = mkdtempSync(join(process.cwd(), 'test-empty-'));
      try {
        await expect(
          cmdPacksExtract(
            { name: 'core', paths: [] },
            tmpDir,
            'security/CHATELET.json'
          )
        ).rejects.toThrow('CHATELET_NOT_FOUND');
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });

    it('throws CHATELET_LOAD_FAILED on malformed JSON', async () => {
      const tmpDir = mkdtempSync(join(process.cwd(), 'test-bad-json-'));
      try {
        const securityDir = join(tmpDir, 'security');
        mkdirSync(securityDir, { recursive: true });
        writeFileSync(join(securityDir, 'CHATELET.json'), 'invalid {json');

        await expect(
          cmdPacksExtract({ name: 'core' }, tmpDir, 'security/CHATELET.json')
        ).rejects.toThrow('CHATELET_LOAD_FAILED');
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe('Pack Name Validation', () => {
    it('rejects empty pack name', async () => {
      await expect(
        cmdPacksExtract({ name: '', paths: [] }, testRepoRoot, 'security/CHATELET.json')
      ).rejects.toThrow('INVALID_PACK_NAME');
    });

    it('throws PACK_NOT_FOUND for nonexistent pack', async () => {
      await expect(
        cmdPacksExtract(
          { name: 'nonexistent', paths: [] },
          testRepoRoot,
          'security/CHATELET.json'
        )
      ).rejects.toThrow('PACK_NOT_FOUND');
    });
  });

  describe('Path Traversal Rejection', () => {
    it('rejects paths with ../', async () => {
      await expect(
        cmdPacksExtract(
          { name: 'core', paths: ['../../etc/passwd'] },
          testRepoRoot,
          'security/CHATELET.json'
        )
      ).rejects.toThrow('TRAVERSAL_REJECTED');
    });

    it('rejects absolute paths', async () => {
      await expect(
        cmdPacksExtract(
          { name: 'core', paths: ['/etc/passwd'] },
          testRepoRoot,
          'security/CHATELET.json'
        )
      ).rejects.toThrow('TRAVERSAL_REJECTED');
    });
  });

  describe('Denylist Enforcement', () => {
    it('rejects paths matching .env pattern', async () => {
      // Add .env file to pack
      const envPath = join(testRepoRoot, '.env');
      writeFileSync(envPath, 'SECRET=123', 'utf-8');
      execSync('git add .env', { cwd: testRepoRoot });
      execSync('git commit -m "add env"', { cwd: testRepoRoot });

      await expect(
        cmdPacksExtract(
          { name: 'core', paths: ['.env'] },
          testRepoRoot,
          'security/CHATELET.json'
        )
      ).rejects.toThrow('DENIED');
    });

    it('rejects paths matching denylist patterns', async () => {
      // Add secrets file to pack
      const secretsDir = join(testRepoRoot, 'secrets');
      mkdirSync(secretsDir, { recursive: true });
      writeFileSync(join(secretsDir, 'api.key'), 'secret-key', 'utf-8');
      execSync('git add secrets/', { cwd: testRepoRoot });
      execSync('git commit -m "add secrets"', { cwd: testRepoRoot });

      await expect(
        cmdPacksExtract(
          { name: 'core', paths: ['secrets/api.key'] },
          testRepoRoot,
          'security/CHATELET.json'
        )
      ).rejects.toThrow('DENIED');
    });
  });

  describe('Path Existence Validation', () => {
    it('rejects nonexistent paths', async () => {
      await expect(
        cmdPacksExtract(
          { name: 'core', paths: ['nonexistent/file.ts'] },
          testRepoRoot,
          'security/CHATELET.json'
        )
      ).rejects.toThrow('PATH_NOT_FOUND');
    });
  });

  describe('Single Path Extraction', () => {
    it('extracts single file successfully', async () => {
      const result = await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.extractedPaths).toContain('src/lib/core/types.ts');
      expect(result.extractedPaths).toHaveLength(1);
    });

    it('returns correct metadata for single extraction', async () => {
      const result = await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.cmd).toBe('packs.extract');
      expect(result.pack).toBe('core');
      expect(result.success).toBe(true);
      expect(result.totalSize).toBeGreaterThan(0);
    });
  });

  describe('Multiple Paths Extraction', () => {
    it('extracts multiple paths', async () => {
      const result = await cmdPacksExtract(
        {
          name: 'core',
          paths: ['src/lib/core/types.ts', 'src/lib/core/index.ts'],
        },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.extractedPaths).toContain('src/lib/core/types.ts');
      expect(result.extractedPaths).toContain('src/lib/core/index.ts');
      expect(result.extractedPaths).toHaveLength(2);
    });

    it('accumulates size for multiple paths', async () => {
      const result = await cmdPacksExtract(
        {
          name: 'core',
          paths: ['src/lib/core/types.ts', 'src/lib/core/index.ts', 'src/lib/core/protocol.ts'],
        },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.extractedPaths).toHaveLength(3);
    });
  });

  describe('Bounds Enforcement', () => {
    it('rejects file exceeding maxBytes', async () => {
      // Update CHATELET.json with very small maxBytes
      writeFileSync(
        chateletPath,
        JSON.stringify({
          gitsafe: {
            denylist: [],
            maxBytes: 1, // 1 byte max - files are much larger
          },
        }),
        'utf-8'
      );

      await expect(
        cmdPacksExtract(
          { name: 'core', paths: ['src/lib/core/types.ts'] },
          testRepoRoot,
          'security/CHATELET.json'
        )
      ).rejects.toThrow('OVERSIZED');

      // Restore normal maxBytes
      writeFileSync(
        chateletPath,
        JSON.stringify({
          gitsafe: {
            denylist: ['\\.env$', 'secrets/', 'id_rsa', 'private'],
            maxBytes: 1024 * 100,
          },
        }),
        'utf-8'
      );
    });

    it('accepts files within bounds', async () => {
      const result = await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.success).toBe(true);
      expect(result.totalSize).toBeLessThanOrEqual(1024 * 100);
    });
  });

  describe('Response Structure (S4)', () => {
    it('returns ExtractResult with all required fields', async () => {
      const result = await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result).toHaveProperty('cmd', 'packs.extract');
      expect(result).toHaveProperty('pack', 'core');
      expect(result).toHaveProperty('extractedPaths');
      expect(result).toHaveProperty('totalSize');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('outputFile');
    });

    it('includes file count and size in summary', async () => {
      const result = await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.summary).toContain('Extracted');
      expect(result.summary).toContain('files');
      expect(result.summary).toMatch(/\d+\s*(B|KB|MB)/);
    });

    it('creates tar.gz archive by default', async () => {
      const result = await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.outputFile).toBeDefined();
      expect(result.outputFile).toMatch(/\.tar\.gz$/);
    });
  });

  describe('Error Context', () => {
    it('includes path and denylist in DENIED error', async () => {
      const envPath = join(testRepoRoot, 'test.env');
      writeFileSync(envPath, 'TEST=val', 'utf-8');
      execSync('git add test.env', { cwd: testRepoRoot });
      execSync('git commit -m "add test env"', { cwd: testRepoRoot });

      try {
        await cmdPacksExtract(
          { name: 'core', paths: ['test.env'] },
          testRepoRoot,
          'security/CHATELET.json'
        );
        expect.fail('Should have thrown DENIED');
      } catch (err) {
        expect(err).toBeInstanceOf(ExtractError);
        const extractErr = err as ExtractError;
        expect(extractErr.code).toBe('DENIED');
        expect(extractErr.context).toHaveProperty('path');
        expect(extractErr.context).toHaveProperty('denylist');
      }
    });

    it('includes size info in OVERSIZED error', async () => {
      // Create a file in pack
      writeFileSync(
        chateletPath,
        JSON.stringify({
          gitsafe: {
            denylist: [],
            maxBytes: 1, // Very small limit
          },
        }),
        'utf-8'
      );

      try {
        await cmdPacksExtract(
          { name: 'core', paths: ['src/lib/core/types.ts'] },
          testRepoRoot,
          'security/CHATELET.json'
        );
        expect.fail('Should have thrown OVERSIZED');
      } catch (err) {
        expect(err).toBeInstanceOf(ExtractError);
        const extractErr = err as ExtractError;
        expect(extractErr.code).toBe('OVERSIZED');
        expect(extractErr.context).toHaveProperty('size');
        expect(extractErr.context).toHaveProperty('maxBytes');
      } finally {
        // Restore normal maxBytes
        writeFileSync(
          chateletPath,
          JSON.stringify({
            gitsafe: {
              denylist: ['\\.env$', 'secrets/', 'id_rsa', 'private'],
              maxBytes: 1024 * 100,
            },
          }),
          'utf-8'
        );
      }
    });
  });

  describe('Byte Formatting', () => {
    it('formats small sizes in bytes', async () => {
      const result = await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );

      expect(result.summary).toMatch(/\d+[B]/);
    });
  });
});
