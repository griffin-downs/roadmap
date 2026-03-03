import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createGitSafeLoader,
  createMultiRepoGitSafeLoader,
} from '../src/lib/gitsafe-loader.ts';

function makeRepo(name: string, opts?: { denylist?: string[]; maxBytes?: number }): string {
  const root = mkdtempSync(join(tmpdir(), `gitsafe-${name}-`));
  mkdirSync(join(root, '.roadmap'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, '.roadmap', 'enforcement.json'), JSON.stringify({
    version: '1.1',
    denylist: opts?.denylist ?? ['node_modules/**', '.env'],
    maxBytes: opts?.maxBytes ?? 1048576,
    auditTrail: false,
    allowedFilePatterns: ['src/**/*.ts'],
  }));
  writeFileSync(join(root, 'src', 'index.ts'), 'export const x = 1;');
  return root;
}

// -- Single-repo backward compat

describe('createGitSafeLoader (single repo)', () => {
  let repo: string;

  beforeEach(() => { repo = makeRepo('single'); });
  afterEach(() => { rmSync(repo, { recursive: true, force: true }); });

  it('loads allowed file', () => {
    const loader = createGitSafeLoader(repo);
    const buf = loader.loadFile('src/index.ts');
    expect(buf.toString()).toBe('export const x = 1;');
  });

  it('denies denylist file', () => {
    const loader = createGitSafeLoader(repo);
    expect(loader.isAllowed('.env')).toBe(false);
    expect(loader.isAllowed('node_modules/foo/bar.js')).toBe(false);
  });

  it('allows non-denied file', () => {
    const loader = createGitSafeLoader(repo);
    expect(loader.isAllowed('src/index.ts')).toBe(true);
  });

  it('throws on loadFile for denied path', () => {
    const loader = createGitSafeLoader(repo);
    expect(() => loader.loadFile('.env')).toThrow('File access denied (denylist)');
  });

  it('returns denylist', () => {
    const loader = createGitSafeLoader(repo);
    expect(loader.getDenylist()).toEqual(['node_modules/**', '.env']);
  });

  it('throws if enforcement.json missing', () => {
    const bare = mkdtempSync(join(tmpdir(), 'gitsafe-bare-'));
    expect(() => createGitSafeLoader(bare).getDenylist()).toThrow('enforcement.json not found');
    rmSync(bare, { recursive: true, force: true });
  });

  it('rejects file over maxBytes', () => {
    const small = makeRepo('small', { maxBytes: 5 });
    const loader = createGitSafeLoader(small);
    expect(() => loader.loadFile('src/index.ts')).toThrow('maxBytes');
    rmSync(small, { recursive: true, force: true });
  });
});

// -- Multi-repo

describe('createMultiRepoGitSafeLoader', () => {
  let repoA: string;
  let repoB: string;

  beforeEach(() => {
    repoA = makeRepo('alpha');
    repoB = makeRepo('beta', { denylist: ['dist/**', 'secrets/**'] });
  });

  afterEach(() => {
    rmSync(repoA, { recursive: true, force: true });
    rmSync(repoB, { recursive: true, force: true });
  });

  it('requires at least one repo', () => {
    expect(() => createMultiRepoGitSafeLoader([])).toThrow('At least one repo root required');
  });

  it('exposes repos list', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB]);
    expect(ml.repos).toHaveLength(2);
    expect(ml.repos).toContain(repoA);
    expect(ml.repos).toContain(repoB);
  });

  it('loads file from specific repo', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB]);
    const buf = ml.loadFile(repoA, 'src/index.ts');
    expect(buf.toString()).toBe('export const x = 1;');
  });

  it('rejects unknown repo root', () => {
    const ml = createMultiRepoGitSafeLoader([repoA]);
    expect(() => ml.isAllowed('/nonexistent', 'src/index.ts')).toThrow('Unknown repo root');
  });

  // -- Per-repo denylist isolation

  it('applies per-repo denylist independently', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB]);
    // repoA denies .env, allows dist/
    expect(ml.isAllowed(repoA, '.env')).toBe(false);
    expect(ml.isAllowed(repoA, 'dist/bundle.js')).toBe(true);
    // repoB denies dist/, allows .env
    expect(ml.isAllowed(repoB, 'dist/bundle.js')).toBe(false);
    expect(ml.isAllowed(repoB, '.env')).toBe(true);
  });

  it('getRepoDenylist returns repo-specific + global', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB], ['*.secret']);
    const dlA = ml.getRepoDenylist(repoA);
    expect(dlA).toContain('node_modules/**');
    expect(dlA).toContain('.env');
    expect(dlA).toContain('*.secret');

    const dlB = ml.getRepoDenylist(repoB);
    expect(dlB).toContain('dist/**');
    expect(dlB).toContain('secrets/**');
    expect(dlB).toContain('*.secret');
    expect(dlB).not.toContain('.env');
  });

  // -- Global denylist

  it('global denylist applies to all repos', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB], ['*.log']);
    expect(ml.isAllowed(repoA, 'debug.log')).toBe(false);
    expect(ml.isAllowed(repoB, 'debug.log')).toBe(false);
  });

  it('getDenylist merges all denylists', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB], ['*.log']);
    const all = ml.getDenylist();
    expect(all).toContain('node_modules/**');
    expect(all).toContain('.env');
    expect(all).toContain('dist/**');
    expect(all).toContain('secrets/**');
    expect(all).toContain('*.log');
  });

  // -- getLoader returns single-repo loader

  it('getLoader returns working single-repo loader', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB]);
    const loader = ml.getLoader(repoA);
    expect(loader.isAllowed('src/index.ts')).toBe(true);
    expect(loader.isAllowed('.env')).toBe(false);
    const buf = loader.loadFile('src/index.ts');
    expect(buf.toString()).toBe('export const x = 1;');
  });

  it('getLoader caches loader instance', () => {
    const ml = createMultiRepoGitSafeLoader([repoA]);
    const l1 = ml.getLoader(repoA);
    const l2 = ml.getLoader(repoA);
    expect(l1).toBe(l2);
  });

  // -- Path traversal

  it('blocks path traversal out of repo', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB]);
    expect(() => ml.loadFile(repoA, '../../../etc/passwd')).toThrow('Path traversal denied');
  });

  // -- Cross-repo validation (file denied in one, allowed in another)

  it('validates cross-repo access independently', () => {
    const ml = createMultiRepoGitSafeLoader([repoA, repoB]);
    // Same relative path, different enforcement per repo
    expect(ml.isAllowed(repoA, 'node_modules/pkg/index.js')).toBe(false);
    expect(ml.isAllowed(repoB, 'node_modules/pkg/index.js')).toBe(true);
  });

  // -- loadFile denied path

  it('loadFile throws for denied path', () => {
    const ml = createMultiRepoGitSafeLoader([repoA]);
    expect(() => ml.loadFile(repoA, '.env')).toThrow('File access denied (denylist)');
  });

  // -- maxBytes per repo

  it('enforces maxBytes per repo config', () => {
    const tiny = makeRepo('tiny', { maxBytes: 3 });
    const ml = createMultiRepoGitSafeLoader([tiny]);
    expect(() => ml.loadFile(tiny, 'src/index.ts')).toThrow('maxBytes');
    rmSync(tiny, { recursive: true, force: true });
  });
});
