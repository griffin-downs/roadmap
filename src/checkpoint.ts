// @module checkpoint
// @exports CheckpointManager
// @types (uses checkpoint.schema types)
// @entry roadmap/recovery

import { readCheckpoint, readLatestCheckpoint, writeCheckpoint, generateCheckpointId, type Checkpoint, type Artifact, type GitState } from './checkpoint.schema.ts';
import { execSync } from 'node:child_process';
import { createHash, type BinaryLike } from 'node:crypto';
import { readFileSync } from 'node:fs';

export class CheckpointManager {
  constructor(private repoRoot: string) {}

  /**
   * Create and save checkpoint at current position
   */
  async saveCheckpoint(options: {
    position: string;
    phase: string;
    artifacts: string[];
    agent: string;
    duration: number;
    success: boolean;
    error?: string;
  }): Promise<Checkpoint> {
    // Compute artifact hashes
    const artifactList: Artifact[] = [];
    for (const path of options.artifacts) {
      try {
        const hash = createHash('sha256').update(readFileSync(path) as BinaryLike).digest('hex');
        artifactList.push({ path, hash });
      } catch {
        // Skip unhashable files
      }
    }

    // Get git state
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: this.repoRoot,
      encoding: 'utf-8',
    }).trim();

    const headHash = execSync('git rev-parse HEAD', {
      cwd: this.repoRoot,
      encoding: 'utf-8',
    }).trim();

    const statusOutput = execSync('git status --porcelain', {
      cwd: this.repoRoot,
      encoding: 'utf-8',
    });

    const clean = statusOutput.trim() === '';

    const gitState: GitState = { branch, headHash, clean };

    // Create checkpoint
    const checkpoint: Checkpoint = {
      id: generateCheckpointId(),
      timestamp: Date.now(),
      roadmapPosition: options.position,
      phase: options.phase,
      artifacts: artifactList,
      gitState,
      metadata: {
        agent: options.agent,
        phase: options.phase,
        duration: options.duration,
        success: options.success,
        error: options.error,
      },
    };

    // Write to disk
    await writeCheckpoint(this.repoRoot, checkpoint);
    return checkpoint;
  }

  /**
   * Restore from latest checkpoint if available and valid
   */
  async restore(): Promise<{ position: string; checkpoint: Checkpoint } | null> {
    const checkpoint = await readLatestCheckpoint(this.repoRoot);
    if (!checkpoint) return null;

    // Validate artifacts still exist
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');

    for (const artifact of checkpoint.artifacts) {
      if (!existsSync(join(this.repoRoot, artifact.path))) {
        // Artifact missing, can't restore
        return null;
      }
    }

    return {
      position: checkpoint.roadmapPosition,
      checkpoint,
    };
  }

  /**
   * Get checkpoint by ID
   */
  async get(cpId: string): Promise<Checkpoint | null> {
    return readCheckpoint(this.repoRoot, cpId);
  }

  /**
   * Get latest checkpoint
   */
  async getLatest(): Promise<Checkpoint | null> {
    return readLatestCheckpoint(this.repoRoot);
  }
}

export async function createCheckpointManager(repoRoot: string): Promise<CheckpointManager> {
  return new CheckpointManager(repoRoot);
}

export default createCheckpointManager;
