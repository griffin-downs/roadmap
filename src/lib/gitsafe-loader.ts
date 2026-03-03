// @module gitsafe-loader
// @exports createGitSafeLoader, GitSafeLoader
// @types GitSafeLoader

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

/**
 * Create a gitsafe loader that enforces file access rules from enforcement.json.
 * Routes all file reads through denylist + size validation.
 */
export function createGitSafeLoader(repoRoot: string): GitSafeLoader {
  let config: EnforcementConfig | null = null;

  function loadConfig(): EnforcementConfig {
    if (config) return config;
    
    const enforcementPath = join(repoRoot, '.roadmap', 'enforcement.json');
    if (!existsSync(enforcementPath)) {
      throw new Error(`enforcement.json not found at ${enforcementPath}`);
    }

    try {
      config = JSON.parse(readFileSync(enforcementPath, 'utf-8')) as EnforcementConfig;
      return config!;
    } catch (err) {
      throw new Error(`Failed to parse enforcement.json: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function isInDenylist(path: string): boolean {
    const cfg = loadConfig();
    for (const pattern of cfg.denylist) {
      // Simple glob matching: * = any string, ** = any path
      const regex = new RegExp('^' + pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        + '$');
      if (regex.test(path)) return true;
    }
    return false;
  }

  return {
    loadFile(path: string): Buffer {
      if (!this.isAllowed(path)) {
        throw new Error(`File access denied (denylist): ${path}`);
      }
      const fullPath = join(repoRoot, path);
      const buffer = readFileSync(fullPath);
      const cfg = loadConfig();
      if (buffer.length > cfg.maxBytes) {
        throw new Error(`File exceeds maxBytes limit (${cfg.maxBytes}): ${path}`);
      }
      return buffer;
    },

    isAllowed(path: string): boolean {
      return !isInDenylist(path);
    },

    getDenylist(): string[] {
      return loadConfig().denylist;
    },
  };
}
