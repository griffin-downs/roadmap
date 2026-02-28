// @module hook-scope
// @exports StagedOnlyFlag, getHookScope, HookScope
// @entry roadmap

/** Contract: pre-commit hooks must scope to staged files only (git diff --cached). */
export type HookScope = 'staged' | 'working-tree';

export const StagedOnlyFlag = '--staged';

/**
 * Returns 'staged' — the required scope for pre-commit validators.
 * Hooks reading working-tree files risk false positives on in-progress worker changes.
 */
export function getHookScope(): HookScope {
  return 'staged';
}

/** Guard: assert command uses staged scope. Throws if working-tree scope detected. */
export function assertStagedScope(command: string): void {
  if (command.includes('git diff') && !command.includes('--cached') && !command.includes('--staged')) {
    throw new Error(`hook-scope: command uses working-tree diff — use 'git diff --cached' instead: ${command}`);
  }
}
