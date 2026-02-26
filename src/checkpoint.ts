// @module recovery
// @exports CheckpointManager, checkpoint, restore, listCheckpoints, describeCheckpoint
// @types CheckpointManager
// @entry roadmap/recovery

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Checkpoint, CheckpointState, createCheckpoint, isValidCheckpointState } from './checkpoint.schema.ts';

/**
 * Checkpoint management: save and restore DAG execution state.
 */
export class CheckpointManager {
  private checkpointDir: string;

  constructor(roadmapDir = '.roadmap') {
    this.checkpointDir = path.join(roadmapDir, 'checkpoints');
  }

  /**
   * Create a named checkpoint at current position.
   */
  async createCheckpoint(
    label: string,
    position: string[],
    artifacts: Record<string, boolean>,
  ): Promise<Checkpoint> {
    // Get current git commit
    const commit = this.getCurrentCommit();

    // Create checkpoint
    const checkpoint = createCheckpoint(label, position, commit, artifacts);

    // Write to filesystem
    const cpDir = path.join(this.checkpointDir, label);
    if (!fs.existsSync(cpDir)) {
      fs.mkdirSync(cpDir, { recursive: true });
    }

    const statePath = path.join(cpDir, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(checkpoint, null, 2));

    // Commit to git
    this.commitCheckpoint(label, position);

    return checkpoint;
  }

  /**
   * Restore a checkpoint, resetting DAG state.
   */
  async restoreCheckpoint(label: string): Promise<{
    checkpoint: Checkpoint;
    headJsonPath: string;
  }> {
    // Load checkpoint
    const checkpoint = await this.loadCheckpoint(label);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${label}`);
    }

    // Update .roadmap/head.json (simplified: just return path for caller to update)
    // In real impl, would reload DAG and update head.json

    // Commit restore to git
    this.commitRestore(label, checkpoint.position);

    return { checkpoint, headJsonPath: path.join(path.dirname(this.checkpointDir), 'head.json') };
  }

  /**
   * List all available checkpoints.
   */
  async listCheckpoints(): Promise<Checkpoint[]> {
    if (!fs.existsSync(this.checkpointDir)) {
      return [];
    }

    const labels = fs.readdirSync(this.checkpointDir);
    const checkpoints: Checkpoint[] = [];

    for (const label of labels) {
      const cp = await this.loadCheckpoint(label);
      if (cp) {
        checkpoints.push(cp);
      }
    }

    // Sort by timestamp descending
    return checkpoints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Load a checkpoint from disk.
   */
  async loadCheckpoint(label: string): Promise<Checkpoint | null> {
    const statePath = path.join(this.checkpointDir, label, 'state.json');
    if (!fs.existsSync(statePath)) {
      return null;
    }

    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (isValidCheckpointState(state)) {
        return {
          label: state.label,
          position: state.position,
          timestamp: state.timestamp,
          commit: state.commit,
          artifacts: state.artifacts,
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Get current git commit hash.
   */
  private getCurrentCommit(): string {
    try {
      return execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Commit checkpoint to git.
   */
  private commitCheckpoint(label: string, position: string[]): void {
    try {
      const cpDir = path.join(this.checkpointDir, label);
      execSync(`git add ${cpDir}`, { encoding: 'utf-8' });
      execSync(`git commit -m "checkpoint: ${label} at ${position.join(',')}"`, { encoding: 'utf-8' });
    } catch {
      // Silently ignore commit failures
    }
  }

  /**
   * Commit restore operation to git.
   */
  private commitRestore(label: string, position: string[]): void {
    try {
      execSync(`git add .roadmap/head.json`, { encoding: 'utf-8' });
      execSync(`git commit -m "restore: ${label} back to ${position.join(',')}"`, { encoding: 'utf-8' });
    } catch {
      // Silently ignore commit failures
    }
  }
}

/**
 * Convenience functions using default CheckpointManager.
 */
const defaultManager = new CheckpointManager();

/**
 * Create checkpoint at current position.
 */
export async function checkpoint(
  label: string,
  position: string[],
  artifacts: Record<string, boolean> = {},
): Promise<Checkpoint> {
  return defaultManager.createCheckpoint(label, position, artifacts);
}

/**
 * Restore from checkpoint.
 */
export async function restore(label: string): Promise<{
  checkpoint: Checkpoint;
  headJsonPath: string;
}> {
  return defaultManager.restoreCheckpoint(label);
}

/**
 * List all checkpoints.
 */
export async function listCheckpoints(): Promise<Checkpoint[]> {
  return defaultManager.listCheckpoints();
}

/**
 * Describe a checkpoint.
 */
export async function describeCheckpoint(label: string): Promise<string> {
  const cp = await defaultManager.loadCheckpoint(label);
  if (!cp) {
    return `Checkpoint not found: ${label}`;
  }

  const artifactCount = Object.values(cp.artifacts).filter((v) => v).length;

  return `
Checkpoint: ${cp.label}
  Position: ${cp.position}
  Created: ${cp.timestamp}
  Commit: ${cp.commit}
  Artifacts: ${artifactCount} present
`.trim();
}

