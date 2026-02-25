// git-state.json schema
// Pre-computed at post-commit, read by orient() in O(1).
// Fields annotated with roadmap position so agents know work context immediately.

export interface GitState {
  /** Timestamp when state was computed */
  readonly timestamp: number;

  /** Current branch name */
  readonly branch: string;

  /** Current HEAD commit */
  readonly head: {
    /** Commit hash (40 chars) */
    readonly hash: string;
    /** Commit subject line */
    readonly subject: string;
    /** Phase this commit belongs to (from roadmap.ts node ID, or null if unknown) */
    readonly phase: string | null;
    /** Checkpoint ID if this is a checkpoint commit, else null */
    readonly checkpoint: string | null;
  };

  /** True if working tree is clean (no staged/unstaged changes) */
  readonly clean: boolean;

  /** Dirty files (only if !clean). Maps file path to {status, phase}. */
  readonly dirty?: Array<{
    /** Git status: M, A, D, ?, etc. */
    readonly status: string;
    /** File path relative to repo root */
    readonly path: string;
    /** Phase this file belongs to (from roadmap.ts deps/produces analysis, or null) */
    readonly phase: string | null;
    /** Human note: what is this work for? */
    readonly note?: string;
  }>;

  /** Most recent checkpoint commit hash (if any), else null */
  readonly lastCheckpoint: string | null;

  /** Current position in roadmap.ts (from orient() or explicit set) */
  readonly roadmapPosition: string | null;

  /** Count of dirty commits (commits since last checkpoint or tag) */
  readonly dirtyCommits: number;
}

/** Validate git-state.json at deserialization. */
export function validateGitState(s: unknown): s is GitState {
  if (!s || typeof s !== 'object') return false;
  const g = s as Record<string, unknown>;
  return (
    typeof g.timestamp === 'number' &&
    typeof g.branch === 'string' &&
    g.head &&
    typeof (g.head as any).hash === 'string' &&
    typeof (g.head as any).subject === 'string' &&
    typeof g.clean === 'boolean' &&
    (!g.dirty || Array.isArray(g.dirty))
  );
}

/** Read git-state.json from .regent/git-state.json. */
export async function readGitState(repoRoot: string): Promise<GitState | null> {
  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  try {
    const content = await readFile(join(repoRoot, '.regent', 'git-state.json'), 'utf-8');
    const parsed = JSON.parse(content);
    return validateGitState(parsed) ? parsed : null;
  } catch {
    return null; // File doesn't exist or is invalid
  }
}

/** Check if cached git-state is fresh (within 10s). */
export function isFresh(state: GitState, maxAgeMs: number = 10000): boolean {
  return Date.now() - state.timestamp < maxAgeMs;
}
