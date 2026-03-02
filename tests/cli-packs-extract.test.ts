import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cmdPacksExtract, ExtractError } from '../src/cli/commands/packs-extract';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

describe('cmdPacksExtract', () => {
  let testRepoRoot: string;
  let chateletPath: string;

  beforeAll(() => {
    // Create a temporary test repository
    testRepoRoot = mkdtempSync(join(process.cwd(), 'test-repo-'));

    // Initialize git repo
    execSync('git init', { cwd: testRepoRoot });
    execSync('git config user.email "test@example.com"', { cwd: testRepoRoot });
    execSync('git config user.name "Test User"', { cwd: testRepoRoot });

    // Create CHATELET.json
    const securityDir = join(testRepoRoot, 'security');
    mkdirSync(securityDir, { recursive: true });
    chateletPath = join(securityDir, 'CHATELET.json');

    writeFileSync(
      chateletPath,
      JSON.stringify({
        gitsafe: {
          denylist: ['^.env', 'secrets', 'private'],
          maxBytes: 1000000, // 1MB
        },
        packs: {
          branchPrefix: 'packs/',
        },
      }),
      'utf-8'
    );

    // Create a pack branch with some files
    const packDir = join(testRepoRoot, 'src', 'lib', 'core');
    mkdirSync(packDir, { recursive: true });

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

  it('rejects invalid pack name', async () => {
    expect(async () => {
      await cmdPacksExtract({ name: '', paths: [] }, testRepoRoot);
    }).rejects.toThrow(ExtractError);
  });

  it('throws error when pack branch does not exist', async () => {
    expect(async () => {
      await cmdPacksExtract({ name: 'nonexistent', paths: [] }, testRepoRoot);
    }).rejects.toThrow(ExtractError);
  });

  it('throws error when CHATELET.json not found', async () => {
    const tmpDir = mkdtempSync(join(process.cwd(), 'test-empty-'));
    try {
      expect(async () => {
        await cmdPacksExtract(
          { name: 'core', paths: [] },
          tmpDir,
          'security/CHATELET.json'
        );
      }).rejects.toThrow(ExtractError);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it('rejects paths with traversal attempts', async () => {
    expect(async () => {
      await cmdPacksExtract(
        { name: 'core', paths: ['../../etc/passwd'] },
        testRepoRoot,
        'security/CHATELET.json'
      );
    }).rejects.toThrow(ExtractError);
  });

  it('rejects paths matching denylist', async () => {
    // Create a .env file in the pack
    const envPath = join(testRepoRoot, '.env');
    writeFileSync(envPath, 'SECRET=123', 'utf-8');
    execSync('git add .env', { cwd: testRepoRoot });
    execSync('git commit -m "add env"', { cwd: testRepoRoot });

    expect(async () => {
      await cmdPacksExtract(
        { name: 'core', paths: ['.env'] },
        testRepoRoot,
        'security/CHATELET.json'
      );
    }).rejects.toThrow(ExtractError);
  });

  it('rejects nonexistent paths', async () => {
    expect(async () => {
      await cmdPacksExtract(
        { name: 'core', paths: ['nonexistent/file.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );
    }).rejects.toThrow(ExtractError);
  });

  it('returns ExtractResult with metadata', async () => {
    const result = await cmdPacksExtract(
      { name: 'core', paths: ['src/lib/core/types.ts'] },
      testRepoRoot,
      'security/CHATELET.json'
    );

    expect(result).toHaveProperty('cmd', 'packs.extract');
    expect(result).toHaveProperty('pack', 'core');
    expect(result).toHaveProperty('extractedPaths');
    expect(result).toHaveProperty('totalSize');
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('summary');
  });

  it('includes extracted path in result', async () => {
    const result = await cmdPacksExtract(
      { name: 'core', paths: ['src/lib/core/types.ts'] },
      testRepoRoot,
      'security/CHATELET.json'
    );

    expect(result.extractedPaths).toContain('src/lib/core/types.ts');
  });

  it('calculates total size correctly', async () => {
    const result = await cmdPacksExtract(
      { name: 'core', paths: ['src/lib/core/types.ts'] },
      testRepoRoot,
      'security/CHATELET.json'
    );

    expect(result.totalSize).toBeGreaterThan(0);
  });

  it('extracts multiple paths when provided', async () => {
    const result = await cmdPacksExtract(
      {
        name: 'core',
        paths: ['src/lib/core/types.ts', 'src/lib/core/index.ts'],
      },
      testRepoRoot,
      'security/CHATELET.json'
    );

    expect(result.extractedPaths).toHaveLength(2);
    expect(result.extractedPaths).toContain('src/lib/core/types.ts');
    expect(result.extractedPaths).toContain('src/lib/core/index.ts');
  });

  it('creates tar.gz output file by default', async () => {
    const result = await cmdPacksExtract(
      { name: 'core', paths: ['src/lib/core/types.ts'] },
      testRepoRoot,
      'security/CHATELET.json'
    );

    expect(result.outputFile).toBeDefined();
    expect(result.outputFile).toMatch(/\.tar\.gz$/);
  });

  it('provides helpful error message for oversized file', async () => {
    // Update CHATELET.json with very small maxBytes
    writeFileSync(
      chateletPath,
      JSON.stringify({
        gitsafe: {
          denylist: [],
          maxBytes: 1, // 1 byte max
        },
        packs: {
          branchPrefix: 'packs/',
        },
      }),
      'utf-8'
    );

    expect(async () => {
      await cmdPacksExtract(
        { name: 'core', paths: ['src/lib/core/types.ts'] },
        testRepoRoot,
        'security/CHATELET.json'
      );
    }).rejects.toThrow('OVERSIZED');
  });

  it('formats bytes correctly in summary', async () => {
    // Restore normal maxBytes
    writeFileSync(
      chateletPath,
      JSON.stringify({
        gitsafe: {
          denylist: [],
          maxBytes: 1000000,
        },
        packs: {
          branchPrefix: 'packs/',
        },
      }),
      'utf-8'
    );

    const result = await cmdPacksExtract(
      { name: 'core', paths: ['src/lib/core/types.ts'] },
      testRepoRoot,
      'security/CHATELET.json'
    );

    expect(result.summary).toMatch(/\d+\s*(B|KB|MB)/);
  });
});
