/**
 * Git operations library — consolidates all execSync git calls.
 * Provides typed, discoverable interface for git queries + mutations.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';

export interface RepoInfo {
  branch: string;
  head: string;
  clean: boolean;
  dirty: string[];
}

export interface FileHistory {
  hash: string;
  subject: string;
}

/**
 * Get current repo state (branch, HEAD, dirty files).
 */
export function repoInfo(cwd: string): RepoInfo {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf-8' }).trim();
  const head = execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
  const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' });
  const dirty = status.trim().split('\n').filter(Boolean);

  return { branch, head, clean: dirty.length === 0, dirty };
}

/**
 * Check if artifact exists at a specific git ref.
 */
export function artifactAtRef(cwd: string, ref: string, artifact: string): boolean {
  try {
    execSync(`git cat-file -e ${ref}:${artifact}`, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * List all files ever tracked (including deleted).
 */
export function archivedFiles(cwd: string): string[] {
  const output = execSync(
    'git log --all --pretty=format: --name-only --diff-filter=D | sort -u | grep -v "^$" | grep -v "^node_modules/"',
    { cwd, encoding: 'utf-8' },
  );
  return output.trim().split('\n').filter(Boolean);
}

/**
 * Get commit history for a file (including deletions).
 */
export function fileHistory(cwd: string, path: string): FileHistory[] {
  const output = execSync(`git log --all --oneline -- "${path}"`, { cwd, encoding: 'utf-8' });
  return output.trim().split('\n').filter(Boolean).map(line => {
    const [hash, ...subjectParts] = line.split(' ');
    return { hash, subject: subjectParts.join(' ') };
  });
}

/**
 * Restore a file from git history to working tree.
 */
export function restore(cwd: string, path: string, ref?: string): void {
  const source = ref || execSync(
    `git log --all -1 --pretty=format:%H -- "${path}"`,
    { cwd, encoding: 'utf-8' },
  ).trim();

  execSync(`git checkout ${source} -- "${path}"`, { cwd, stdio: 'pipe' });
}

/**
 * Stage files and commit atomically.
 */
export function stageAndCommit(cwd: string, files: string[], message: string): string {
  for (const f of files) {
    execSync(`git add "${f}"`, { cwd, stdio: 'pipe' });
  }
  execSync(`git commit -m "${message}"`, { cwd, stdio: 'pipe' });
  return execSync('git rev-parse HEAD', { cwd, encoding: 'utf-8' }).trim();
}

/**
 * Create a new branch.
 */
export function createBranch(cwd: string, name: string): void {
  execSync(`git checkout -b ${name}`, { cwd, stdio: 'pipe' });
}

/**
 * Get files tracked in git (git ls-files).
 */
export function trackedFiles(cwd: string): string[] {
  const output = execSync('git ls-files', { cwd, encoding: 'utf-8' });
  return output.trim().split('\n').filter(Boolean);
}

/**
 * Check if a file is tracked in git.
 */
export function isTracked(cwd: string, artifact: string): boolean {
  try {
    execSync(`git ls-files --error-unmatch "${artifact}"`, { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get short commit hash (for trail entries, etc).
 */
export function shortHash(cwd: string): string {
  return execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).trim();
}

/**
 * Check if working tree is clean.
 */
export function isClean(cwd: string): boolean {
  const status = execSync('git status --porcelain', { cwd, encoding: 'utf-8' });
  return status.trim() === '';
}
