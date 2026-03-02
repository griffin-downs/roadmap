// @module gitsafe
// @exports listRefs, readBlob, readJson, lsTree, diffPaths
// @entry roadmap/gitsafe

import { execSync } from 'node:child_process';

interface GitSafeOpts {
  maxBytesPerObject?: number;
  maxObjectsPerCommand?: number;
  denyPatterns?: string[];
  timeout?: number;
}

const DEFAULT_OPTS: Required<GitSafeOpts> = {
  maxBytesPerObject: 2000000,
  maxObjectsPerCommand: 2000,
  denyPatterns: ['.env', 'id_rsa', 'secrets', 'token', 'private'],
  timeout: 5000,
};

function isDenied(path: string, patterns: string[]): boolean {
  return patterns.some(p => path.includes(p));
}

export function listRefs(prefix: string): string[] {
  const cmd = `git for-each-ref --format='%(refname:short)' refs/heads/${prefix}`;
  try {
    const output = execSync(cmd, { encoding: 'utf-8', timeout: DEFAULT_OPTS.timeout });
    return output.trim().split('\n').filter(Boolean).sort();
  } catch {
    return [];
  }
}

export function readBlob(ref: string, path: string, opts: GitSafeOpts = {}): string | null {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (isDenied(path, o.denyPatterns)) {
    throw new Error(`GITSAFE_DENIED: ${path}`);
  }
  try {
    const cmd = `git show ${ref}:${path}`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: o.timeout });
    if (output.length > o.maxBytesPerObject) {
      throw new Error(`GITSAFE_OVERSIZED: ${path} (${output.length} bytes)`);
    }
    return output;
  } catch {
    return null;
  }
}

export function readJson(ref: string, path: string, opts: GitSafeOpts = {}): unknown {
  const blob = readBlob(ref, path, opts);
  return blob ? JSON.parse(blob) : null;
}

export function lsTree(ref: string, prefix: string, opts: GitSafeOpts = {}): string[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  try {
    const cmd = `git ls-tree -r --name-only ${ref} ${prefix}`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: o.timeout });
    return output.trim().split('\n').filter(p => !isDenied(p, o.denyPatterns)).slice(0, o.maxObjectsPerCommand);
  } catch {
    return [];
  }
}

export function diffPaths(refA: string, refB: string, prefix: string, opts: GitSafeOpts = {}): string[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  try {
    const cmd = `git diff --name-only ${refA}..${refB} -- ${prefix}`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: o.timeout });
    return output.trim().split('\n').filter(p => p && !isDenied(p, o.denyPatterns));
  } catch {
    return [];
  }
}
