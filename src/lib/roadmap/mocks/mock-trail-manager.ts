// @module roadmap/mocks
// @exports MockTrailManager
// @description Mock adapter for TrailManager — aligned to real API signatures

/**
 * MockTrailManager — test double for TrailManager
 *
 * Real API: TrailManager(config: TrailWatcherConfig) with start/stop/commit methods
 * Mock implementation returns sample data without actual file I/O or git operations.
 */

export interface TrailEntry {
  timestamp: string;
  cmd: string;
  note?: string;
  batch?: string[];
  level?: number;
}

export interface TrailCommitResult {
  committed: boolean;
  reason?: string;
  entriesAdded?: number;
  trailSha?: string;
  headSha?: string;
  message?: string;
}

export class MockTrailManager {
  private repoRoot: string;
  private entries: TrailEntry[] = [];
  private isWatching: boolean = false;
  private isDirty: boolean = false;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Append a trail entry (idempotent).
   * Mock: stores in memory, does not write to disk.
   */
  appendEntry(entry: TrailEntry): void {
    this.entries.push({
      timestamp: entry.timestamp || new Date().toISOString(),
      cmd: entry.cmd,
      note: entry.note,
      batch: entry.batch,
      level: entry.level,
    });
    this.isDirty = true;
  }

  /**
   * Auto-commit trail + head atomically.
   * Mock: returns success without actual git operations.
   */
  autoCommit(message?: string): boolean {
    if (!this.isDirty) {
      return false;
    }

    // Mock: pretend to commit
    this.isDirty = false;
    return true;
  }

  /**
   * Synchronize trail state.
   * Mock: no-op, returns immediately.
   */
  syncTrail(): void {
    // Mock: no actual sync
    this.isDirty = false;
  }

  /**
   * Start watching trail.jsonl for changes (mock: no-op).
   */
  start(): void {
    this.isWatching = true;
  }

  /**
   * Stop watching trail.jsonl (mock: no-op).
   */
  stop(): void {
    this.isWatching = false;
  }

  /**
   * Commit trail + head atomically.
   * Mock: returns sample result.
   */
  commit(): TrailCommitResult {
    if (!this.isDirty) {
      return { committed: false, reason: 'nothing-dirty' };
    }

    const entriesAdded = this.entries.length;
    const message = `trail: ${entriesAdded} entries, head sync`;

    this.isDirty = false;

    return {
      committed: true,
      entriesAdded,
      trailSha: 'abc123def456',
      headSha: 'xyz789uvw012',
      message,
    };
  }

  /**
   * Get current entry count (mock).
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Check if trail is dirty (mock).
   */
  istrailDirty(): boolean {
    return this.isDirty;
  }
}

/**
 * Create and optionally start a MockTrailManager.
 */
export function createMockTrailManager(repoRoot: string, autoStart: boolean = true): MockTrailManager {
  const manager = new MockTrailManager(repoRoot);
  if (autoStart) {
    manager.start();
  }
  return manager;
}

export default MockTrailManager;
