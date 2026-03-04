// @module gitsafe-loader
// @exports createGitSafeLoader, createMultiRepoGitSafeLoader, GitSafeLoader, MultiRepoGitSafeLoader
// @types GitSafeLoader, MultiRepoGitSafeLoader, EnforcementConfig

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';

export interface EnforcementConfig {
  version: string;
  denylist: string[];
  maxBytes: number;
  auditTrail: boolean;
  branchRestrictions?: Record<string, any>;
  allowedFilePatterns: string[];
}

export interface GitSafeLoader {
  loadFile(path: string): Buffer;
  isAllowed(path: string): boolean;
  getDenylist(): string[];
}

export interface MultiRepoGitSafeLoader {
  /** Load file from a specific repo by root path or repo index */
  loadFile(repo: string, path: string): Buffer;
  /** Check if path is allowed in a specific repo */
  isAllowed(repo: string, path: string): boolean;
  /** Get merged denylist (global + per-repo) */
  getDenylist(): string[];
  /** Get denylist for a specific repo */
  getRepoDenylist(repo: string): string[];
  /** Get single-repo loader for a specific root */
  getLoader(repo: string): GitSafeLoader;
  /** All repo roots managed by this loader */
  repos: readonly string[];
}

// -- Shared glob matching

function globToRegex(pattern: string): RegExp {
  return new RegExp('^' + pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR__/g, '.*')
    + '$');
}

function matchesDenylist(path: string, denylist: string[]): boolean {
  for (const pattern of denylist) {
    if (globToRegex(pattern).test(path)) return true;
  }
  return false;
}

// -- Config loading

const PERMISSIVE_DEFAULT: EnforcementConfig = {
  version: '0',
  denylist: [],
  maxBytes: 10_485_760,
  auditTrail: false,
  allowedFilePatterns: ['**'],
};

function loadEnforcementConfig(repoRoot: string): EnforcementConfig {
  const enforcementPath = join(repoRoot, '.roadmap', 'enforcement.json');
  if (!existsSync(enforcementPath)) return PERMISSIVE_DEFAULT;
  try {
    return JSON.parse(readFileSync(enforcementPath, 'utf-8')) as EnforcementConfig;
  } catch (err) {
    throw new Error(`Failed to parse enforcement.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Create a gitsafe loader that enforces file access rules from enforcement.json.
 * Routes all file reads through denylist + size validation.
 */
export function createGitSafeLoader(repoRoot: string): GitSafeLoader {
  let config: EnforcementConfig | null = null;

  function getConfig(): EnforcementConfig {
    if (!config) config = loadEnforcementConfig(repoRoot);
    return config;
  }

  return {
    loadFile(path: string): Buffer {
      if (!this.isAllowed(path)) {
        throw new Error(`File access denied (denylist): ${path}`);
      }
      const fullPath = join(repoRoot, path);
      const buffer = readFileSync(fullPath);
      const cfg = getConfig();
      if (buffer.length > cfg.maxBytes) {
        throw new Error(`File exceeds maxBytes limit (${cfg.maxBytes}): ${path}`);
      }
      return buffer;
    },

    isAllowed(path: string): boolean {
      return !matchesDenylist(path, getConfig().denylist);
    },

    getDenylist(): string[] {
      return getConfig().denylist;
    },
  };
}

/**
 * Create a multi-repo gitsafe loader. Enforces per-repo denylist + global denylist,
 * validates cross-repo file access, and provides per-repo loaders.
 *
 * @param repoRoots - Array of absolute repo root paths
 * @param globalDenylist - Additional patterns applied to ALL repos (on top of per-repo enforcement.json)
 */
export function createMultiRepoGitSafeLoader(
  repoRoots: string[],
  globalDenylist: string[] = [],
): MultiRepoGitSafeLoader {
  if (repoRoots.length === 0) {
    throw new Error('At least one repo root required');
  }

  const resolved = repoRoots.map(r => resolve(r));
  const configs = new Map<string, EnforcementConfig>();
  const loaders = new Map<string, GitSafeLoader>();

  function resolveRepo(repo: string): string {
    const abs = resolve(repo);
    if (!resolved.includes(abs)) {
      throw new Error(`Unknown repo root: ${repo} (known: ${resolved.join(', ')})`);
    }
    return abs;
  }

  function getConfig(repo: string): EnforcementConfig {
    const abs = resolveRepo(repo);
    let cfg = configs.get(abs);
    if (!cfg) {
      cfg = loadEnforcementConfig(abs);
      configs.set(abs, cfg);
    }
    return cfg;
  }

  function mergedDenylist(repo: string): string[] {
    return [...getConfig(repo).denylist, ...globalDenylist];
  }

  return {
    repos: resolved,

    loadFile(repo: string, path: string): Buffer {
      if (!this.isAllowed(repo, path)) {
        throw new Error(`File access denied (denylist): ${repo}:${path}`);
      }
      const abs = resolveRepo(repo);
      const fullPath = join(abs, path);

      // Path traversal guard: resolved path must stay inside repo
      const resolvedFull = resolve(fullPath);
      if (!resolvedFull.startsWith(abs + '/') && resolvedFull !== abs) {
        throw new Error(`Path traversal denied: ${path} escapes repo root ${abs}`);
      }

      const buffer = readFileSync(fullPath);
      const cfg = getConfig(repo);
      if (buffer.length > cfg.maxBytes) {
        throw new Error(`File exceeds maxBytes limit (${cfg.maxBytes}): ${repo}:${path}`);
      }
      return buffer;
    },

    isAllowed(repo: string, path: string): boolean {
      return !matchesDenylist(path, mergedDenylist(repo));
    },

    getDenylist(): string[] {
      const all = new Set<string>(globalDenylist);
      for (const root of resolved) {
        for (const p of getConfig(root).denylist) all.add(p);
      }
      return Array.from(all);
    },

    getRepoDenylist(repo: string): string[] {
      return mergedDenylist(repo);
    },

    getLoader(repo: string): GitSafeLoader {
      const abs = resolveRepo(repo);
      let loader = loaders.get(abs);
      if (!loader) {
        loader = createGitSafeLoader(abs);
        loaders.set(abs, loader);
      }
      return loader;
    },
  };
}
