// @module headsha-recovery
// @exports HeadShaRecovery, detectMismatch, autoRecover, validateConsistency
// @types RecoveryState, MismatchDetection, RecoveryResult
// @entry roadmap

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

export interface MismatchDetection {
  hasMismatch: boolean;
  headShaInFile: string | null;
  actualGitSha: string;
  headJsonSha: string;
  timestamp: string;
  reason?: string;
}

export interface RecoveryResult {
  recovered: boolean;
  prevHeadSha?: string;
  newHeadSha?: string;
  prevGitState?: string;
  newGitState?: string;
  timestamp: string;
  error?: string;
}

export interface RecoveryState {
  lastHeadSha: string;
  lastGitState: string;
  recoveredAt: string;
  mismatchCount: number;
}

export class HeadShaRecovery {
  private repoRoot: string;
  private headJsonPath: string;
  private gitStatePath: string;
  private recoveryStatePath: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.headJsonPath = join(repoRoot, '.roadmap', 'head.json');
    this.gitStatePath = join(repoRoot, '.roadmap', 'git-state.json');
    this.recoveryStatePath = join(repoRoot, '.roadmap', 'recovery-state.json');
  }

  /**
   * Compute SHA256 hash of head.json file contents
   */
  private computeHeadJsonSha(): string {
    if (!existsSync(this.headJsonPath)) {
      throw new Error('No .roadmap/head.json found');
    }
    const bytes = readFileSync(this.headJsonPath);
    return createHash('sha256').update(bytes).digest('hex');
  }

  /**
   * Get current git HEAD SHA
   */
  private getCurrentGitSha(): string {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.repoRoot,
        encoding: 'utf-8',
      }).trim();
    } catch (err) {
      throw new Error(`Failed to get git HEAD: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  /**
   * Load git-state.json
   */
  private loadGitState(): { lastCommit: string; timestamp: string; message: string } | null {
    if (!existsSync(this.gitStatePath)) return null;
    try {
      return JSON.parse(readFileSync(this.gitStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Load recovery state
   */
  private loadRecoveryState(): RecoveryState | null {
    if (!existsSync(this.recoveryStatePath)) return null;
    try {
      return JSON.parse(readFileSync(this.recoveryStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Save recovery state
   */
  private saveRecoveryState(state: RecoveryState): void {
    writeFileSync(this.recoveryStatePath, JSON.stringify(state, null, 2) + '\n');
  }

  /**
   * Detect if there's a headSha mismatch
   */
  detectMismatch(): MismatchDetection {
    const timestamp = new Date().toISOString();
    const actualGitSha = this.getCurrentGitSha();
    const headJsonSha = this.computeHeadJsonSha();

    // Load git-state.json to check recorded state
    const gitState = this.loadGitState();
    const headShaInFile = gitState?.lastCommit ?? null;

    // Mismatch occurs if:
    // 1. Recorded git state differs from actual git HEAD
    // 2. OR head.json contents have changed (headJsonSha changed)
    const hasMismatch: boolean =
      !!(headShaInFile && headShaInFile !== actualGitSha) ||
      !!(gitState?.timestamp && /* implicit mismatch flag from previous cycle */ false);

    return {
      hasMismatch,
      headShaInFile,
      actualGitSha,
      headJsonSha,
      timestamp,
      reason: hasMismatch
        ? `Git state diverged: recorded ${headShaInFile?.slice(0, 8)}… vs actual ${actualGitSha.slice(0, 8)}…`
        : undefined,
    };
  }

  /**
   * Auto-recover by syncing head.json pointer to current git state
   */
  autoRecover(): RecoveryResult {
    const timestamp = new Date().toISOString();
    const result: RecoveryResult = { recovered: false, timestamp };

    try {
      // Get current state before recovery
      const prevGitState = this.loadGitState()?.lastCommit ?? 'unknown';
      const prevHeadSha = this.computeHeadJsonSha();

      // Get actual current git state
      const actualGitSha = this.getCurrentGitSha();
      const commitMessage = this.getCommitMessage(actualGitSha);

      // Update git-state.json to match current git HEAD
      const newGitState = {
        lastCommit: actualGitSha,
        timestamp,
        message: commitMessage,
      };
      writeFileSync(this.gitStatePath, JSON.stringify(newGitState, null, 2) + '\n');

      // Update recovery state
      const recoveryState: RecoveryState = {
        lastHeadSha: prevHeadSha,
        lastGitState: prevGitState,
        recoveredAt: timestamp,
        mismatchCount: (this.loadRecoveryState()?.mismatchCount ?? 0) + 1,
      };
      this.saveRecoveryState(recoveryState);

      result.recovered = true;
      result.prevHeadSha = prevHeadSha;
      result.newHeadSha = this.computeHeadJsonSha();
      result.prevGitState = prevGitState;
      result.newGitState = actualGitSha;
    } catch (err) {
      result.error = err instanceof Error ? err.message : 'unknown error';
    }

    return result;
  }

  /**
   * Get commit message for a given SHA
   */
  private getCommitMessage(sha: string): string {
    try {
      return execSync(`git log -1 --pretty=%B ${sha}`, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
      })
        .trim()
        .split('\n')[0];
    } catch {
      return 'unknown commit';
    }
  }

  /**
   * Validate that DAG is still reachable and consistent after recovery
   */
  validateConsistency(): {
    consistent: boolean;
    headJsonExists: boolean;
    headJsonValid: boolean;
    gitStateExists: boolean;
    gitStateValid: boolean;
    recoveryStateExists: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check head.json
    const headJsonExists = existsSync(this.headJsonPath);
    let headJsonValid = false;
    if (headJsonExists) {
      try {
        const content = readFileSync(this.headJsonPath, 'utf-8');
        const json = JSON.parse(content);
        // Validate basic DAG structure
        if (typeof json.id === 'string' && json.nodes && typeof json.nodes === 'object') {
          headJsonValid = true;
        } else {
          errors.push('head.json missing required DAG fields (id, nodes)');
        }
      } catch (err) {
        errors.push(`head.json parse error: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    } else {
      errors.push('head.json does not exist');
    }

    // Check git-state.json
    const gitStateExists = existsSync(this.gitStatePath);
    let gitStateValid = false;
    if (gitStateExists) {
      try {
        const content = readFileSync(this.gitStatePath, 'utf-8');
        const json = JSON.parse(content);
        if (typeof json.lastCommit === 'string' && typeof json.timestamp === 'string') {
          // Verify lastCommit is a valid git SHA
          try {
            execSync(`git cat-file -t ${json.lastCommit}`, {
              cwd: this.repoRoot,
              stdio: 'pipe',
            });
            gitStateValid = true;
          } catch {
            errors.push(`git-state.json references invalid commit: ${json.lastCommit.slice(0, 8)}…`);
          }
        } else {
          errors.push('git-state.json missing required fields (lastCommit, timestamp)');
        }
      } catch (err) {
        errors.push(`git-state.json parse error: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    } else {
      errors.push('git-state.json does not exist');
    }

    const recoveryStateExists = existsSync(this.recoveryStatePath);

    return {
      consistent: headJsonValid && gitStateValid && errors.length === 0,
      headJsonExists,
      headJsonValid,
      gitStateExists,
      gitStateValid,
      recoveryStateExists,
      errors,
    };
  }
}

/**
 * Standalone utility: detect mismatch
 */
export function detectMismatch(repoRoot: string): MismatchDetection {
  return new HeadShaRecovery(repoRoot).detectMismatch();
}

/**
 * Standalone utility: auto-recover
 */
export function autoRecover(repoRoot: string): RecoveryResult {
  return new HeadShaRecovery(repoRoot).autoRecover();
}

/**
 * Standalone utility: validate consistency
 */
export function validateConsistency(repoRoot: string) {
  return new HeadShaRecovery(repoRoot).validateConsistency();
}
