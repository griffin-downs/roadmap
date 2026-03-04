// @module git-helpers
// @description Git utilities for agent-friendly operations (dedup, branch-aware, etc)
// @exports deduplicatedCommit

import { execSync } from 'node:child_process';

/**
 * Commit only if the staged changes differ from HEAD's tree.
 * If HEAD already contains the exact same tree, skip the commit and return success.
 * Prevents duplicate commits when agents retry after hook failures.
 *
 * @param message Commit message
 * @param files Files to stage (must be already staged or will be staged by this function)
 * @param cwd Working directory (default: current process cwd)
 * @returns true if commit was created, false if skipped (no changes)
 */
export function deduplicatedCommit(
  message: string,
  files: string[],
  cwd?: string,
): boolean {
  const wd = cwd || process.cwd();

  try {
    // Get the tree SHA of HEAD
    const headTree = execSync('git rev-parse HEAD^{tree}', {
      cwd: wd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Stage the files
    if (files.length > 0) {
      execSync(`git add ${files.map(f => `"${f}"`).join(' ')}`, {
        cwd: wd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }

    // Get the tree SHA of the staged changes
    const indexTree = execSync('git write-tree', {
      cwd: wd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // If trees are identical, skip the commit
    if (headTree === indexTree) {
      // Reset the index to avoid leaving staged changes
      execSync('git reset', {
        cwd: wd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return false;
    }

    // Trees differ, proceed with commit
    execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, {
      cwd: wd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return true;
  } catch (error) {
    // If any git command fails, treat as failure
    throw new Error(`deduplicatedCommit failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
