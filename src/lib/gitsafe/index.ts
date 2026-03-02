// @module gitsafe
// @exports listRefs, readBlob, readJson, lsTree, diffPaths, GitSafeConfig, TreeEntry, GitSafeError
// @types GitSafeConfig, TreeEntry, GitSafeError
// @entry roadmap/gitsafe

import { execSync } from 'node:child_process';

export interface GitSafeConfig {
  denylist: string[];
  maxBytes: number;
  maxDepth?: number;
}

export interface TreeEntry {
  mode: string;
  type: string;
  hash: string;
  path: string;
}

export class GitSafeError extends Error {
  constructor(
    public code: string,
    public context: Record<string, unknown>
  ) {
    super(`GitSafeError[${code}]: ${JSON.stringify(context)}`);
    this.name = 'GitSafeError';
  }
}

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

export async function listRefs(repo: string, config: GitSafeConfig): Promise<string[]> {
  try {
    const cmd = `cd "${repo}" && git for-each-ref --format='%(refname:short)' refs/heads/`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    return output.trim().split('\n').filter(Boolean).sort();
  } catch (err) {
    throw new GitSafeError('LIST_REFS_FAILED', {
      repo,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function readBlob(
  repo: string,
  ref: string,
  path: string,
  config: GitSafeConfig
): Promise<Buffer> {
  validatePath(path, config);

  try {
    const cmd = `cd "${repo}" && git show ${ref}:${path}`;
    const result = execSync(cmd, { encoding: null, timeout: 5000 }) as unknown as Buffer;

    if (result.length > config.maxBytes) {
      throw new GitSafeError('OVERSIZED', {
        path,
        size: result.length,
        maxBytes: config.maxBytes,
      });
    }

    return result;
  } catch (err) {
    if (err instanceof GitSafeError) throw err;
    throw new GitSafeError('READ_BLOB_FAILED', {
      repo,
      ref,
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function readJson<T>(
  repo: string,
  ref: string,
  path: string,
  config: GitSafeConfig
): Promise<T> {
  validatePath(path, config);

  try {
    const buffer = await readBlob(repo, ref, path, config);
    const content = buffer.toString('utf-8');
    return JSON.parse(content) as T;
  } catch (err) {
    if (err instanceof GitSafeError) throw err;
    throw new GitSafeError('READ_JSON_FAILED', {
      repo,
      ref,
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function lsTree(
  repo: string,
  ref: string,
  config: GitSafeConfig
): Promise<TreeEntry[]> {
  try {
    const cmd = `cd "${repo}" && git ls-tree -r ${ref}`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

    const entries: TreeEntry[] = [];
    for (const line of output.trim().split('\n')) {
      if (!line) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      const [mode, type, hash, ...pathParts] = parts;
      const path = pathParts.join(' ');

      if (isDenied(path, config.denylist)) {
        continue;
      }

      if (config.maxDepth) {
        const depth = path.split('/').length;
        if (depth > config.maxDepth) continue;
      }

      entries.push({ mode, type, hash, path });

      if (entries.length > 10000) {
        break;
      }
    }

    return entries;
  } catch (err) {
    throw new GitSafeError('LS_TREE_FAILED', {
      repo,
      ref,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function diffPaths(
  repo: string,
  refA: string,
  refB: string,
  config: GitSafeConfig
): Promise<string[]> {
  try {
    const cmd = `cd "${repo}" && git diff --name-only ${refA}..${refB}`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

    const paths = output
      .trim()
      .split('\n')
      .filter(p => p && !isDenied(p, config.denylist));

    return paths;
  } catch (err) {
    throw new GitSafeError('DIFF_PATHS_FAILED', {
      repo,
      refA,
      refB,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
