// @module roadmap/trail-manager
// @exports TrailManager, createTrailManager, trailDirty, autoCommitTrail
// @types TrailWatcherConfig, TrailCommitResult
// @entry roadmap/recovery

/**
 * Trail manager — watches .roadmap/trail.jsonl for changes and auto-commits atomically with head.json.
 *
 * Problem: trail.jsonl appends are frequent (every orient, complete, advance call).
 * Manual commit friction: users forget to commit trail entries, creating drift between
 * trail state and git state.
 *
 * Solution: Watch for trail changes in background. When trail.jsonl is updated,
 * atomically stage + commit trail.jsonl + head.json together.
 *
 * Uses fs.watch for low-overhead monitoring. Commits include context (event type, entry count).
 * No forced verification — trusts upstream validation gates.
 */

import { watch, readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

export interface TrailWatcherConfig {
  repoRoot: string;
  enabled?: boolean;           // default: true
  debounceMs?: number;         // default: 500ms (batch multiple rapid changes)
  autoCommit?: boolean;        // default: true (commit immediately on change)
  dryRun?: boolean;            // if true, log but don't commit
}

export interface TrailCommitResult {
  committed: boolean;
  reason?: string;            // 'nothing-dirty' | 'dryrun' | 'commit-failed' | 'watch-enabled'
  entriesAdded?: number;      // count of new entries since last commit
  trailSha?: string;          // git hash of committed trail.jsonl
  headSha?: string;           // git hash of committed head.json
  message?: string;           // commit message used
}

export class TrailManager {
  private repoRoot: string;
  private enabled: boolean;
  private debounceMs: number;
  private autoCommit: boolean;
  private dryRun: boolean;
  private watcher: ReturnType<typeof watch> | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private lastCommittedEntryCount: number = 0;
  private lastTrailSha: string = '';

  constructor(config: TrailWatcherConfig) {
    this.repoRoot = config.repoRoot;
    this.enabled = config.enabled ?? true;
    this.debounceMs = config.debounceMs ?? 500;
    this.autoCommit = config.autoCommit ?? true;
    this.dryRun = config.dryRun ?? false;
  }

  /**
   * Start watching trail.jsonl for changes.
   * Debounces rapid changes to avoid excessive commits.
   */
  start(): void {
    if (!this.enabled || this.watcher) return;

    const trailPath = join(this.repoRoot, '.roadmap', 'trail.jsonl');

    // Initialize baseline state
    this.lastCommittedEntryCount = countTrailEntries(this.repoRoot);

    this.watcher = watch(trailPath, (eventType, filename) => {
      if (filename !== 'trail.jsonl') return;

      // Debounce: multiple rapid changes → single commit
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        if (this.autoCommit) {
          void this.commit();
        }
      }, this.debounceMs);
    });

    this.watcher.on('error', err => {
      // Silent — don't break on watch errors (e.g., file deleted before watch ready)
      console.error('Trail watcher error:', err.message);
    });
  }

  /**
   * Stop watching trail.jsonl.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Commit trail + head atomically (idempotent: no-op if nothing dirty).
   * Synchronous — returns immediately without async overhead.
   */
  commit(): TrailCommitResult {
    if (this.dryRun) {
      return { committed: false, reason: 'dryrun' };
    }

    const trailPath = join(this.repoRoot, '.roadmap', 'trail.jsonl');
    const headPath = join(this.repoRoot, '.roadmap', 'head.json');

    // Check if either file is dirty
    const isDirty = isTrailOrHeadDirty(this.repoRoot);
    if (!isDirty) {
      return { committed: false, reason: 'nothing-dirty' };
    }

    try {
      const currentEntryCount = countTrailEntries(this.repoRoot);
      const entriesAdded = currentEntryCount - this.lastCommittedEntryCount;

      // Stage both files atomically
      execSync(`git add "${trailPath}" "${headPath}"`, {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });

      const message = `trail: ${entriesAdded} entries, head sync`;
      execSync(`git commit --no-verify -m "${message}"`, {
        cwd: this.repoRoot,
        stdio: 'pipe',
      });

      // Update baseline for next invocation
      this.lastCommittedEntryCount = currentEntryCount;

      const trailSha = getFileCommitSha(this.repoRoot, trailPath);
      const headSha = getFileCommitSha(this.repoRoot, headPath);

      return {
        committed: true,
        entriesAdded,
        trailSha,
        headSha,
        message,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown-error';
      return { committed: false, reason: `commit-failed: ${reason}` };
    }
  }
}

/**
 * Create and start a trail manager in one call.
 */
export function createTrailManager(config: TrailWatcherConfig): TrailManager {
  const manager = new TrailManager(config);
  if (config.enabled !== false) {
    manager.start();
  }
  return manager;
}

/**
 * Check if trail.jsonl or head.json is dirty (staged or unstaged).
 */
export function trailDirty(repoRoot: string): boolean {
  return isTrailOrHeadDirty(repoRoot);
}

/**
 * Auto-commit trail + head atomically (one-shot, no watching).
 * Returns commit result with metadata.
 */
export function autoCommitTrail(repoRoot: string, dryRun?: boolean): TrailCommitResult {
  const manager = new TrailManager({
    repoRoot,
    enabled: false,  // no watcher
    autoCommit: false,  // manual trigger
    dryRun: dryRun ?? false,
  });

  // Synchronously commit
  return manager.commit() as TrailCommitResult;
}

// --- Private helpers ---

function isTrailOrHeadDirty(repoRoot: string): boolean {
  try {
    const status = execSync(
      'git status --porcelain .roadmap/trail.jsonl .roadmap/head.json',
      { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

function countTrailEntries(repoRoot: string): number {
  const trailPath = join(repoRoot, '.roadmap', 'trail.jsonl');
  if (!existsSync(trailPath)) return 0;

  try {
    const content = readFileSync(trailPath, 'utf-8');
    return content.trim().split('\n').filter(line => line.trim()).length;
  } catch {
    return 0;
  }
}

function getFileCommitSha(repoRoot: string, filePath: string): string {
  try {
    return execSync(
      `git log -1 --pretty=format:%H -- "${filePath}"`,
      { cwd: repoRoot, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
  } catch {
    return 'unknown';
  }
}

export default TrailManager;
