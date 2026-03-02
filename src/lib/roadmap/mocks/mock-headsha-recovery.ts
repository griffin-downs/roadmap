// @module mock-headsha-recovery
// @exports MockHeadShaRecovery
// @types MismatchDetection, RecoveryResult, RecoveryState (from real API)
// @entry roadmap/mocks

import {
  MismatchDetection,
  RecoveryResult,
  RecoveryState,
} from '../headsha-recovery';

/**
 * Mock HeadShaRecovery for testing without real git operations.
 * Returns sample data that matches the real API signatures.
 */
export class MockHeadShaRecovery {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Mock: Detect if there's a headSha mismatch.
   * Returns sample mismatch detection with static test data.
   */
  detectMismatch(): MismatchDetection {
    return {
      hasMismatch: false,
      headShaInFile: 'ae92425b8c4f0d1e9f8a3b5c7d9e1f2a3b5c7d9e',
      actualGitSha: 'ae92425b8c4f0d1e9f8a3b5c7d9e1f2a3b5c7d9e',
      headJsonSha: 'f7e3d4c5b6a798765432109876543210fedcba98',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Mock: Auto-recover by syncing head.json pointer to current git state.
   * Returns sample recovery result with static test data.
   */
  autoRecover(): RecoveryResult {
    return {
      recovered: true,
      prevHeadSha: 'f7e3d4c5b6a798765432109876543210fedcba98',
      newHeadSha: 'f7e3d4c5b6a798765432109876543210fedcba99',
      prevGitState: 'ae92425b8c4f0d1e9f8a3b5c7d9e1f2a3b5c7d9d',
      newGitState: 'ae92425b8c4f0d1e9f8a3b5c7d9e1f2a3b5c7d9e',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Mock: Validate that DAG is still reachable and consistent after recovery.
   * Returns sample consistency check with all validations passing.
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
    return {
      consistent: true,
      headJsonExists: true,
      headJsonValid: true,
      gitStateExists: true,
      gitStateValid: true,
      recoveryStateExists: true,
      errors: [],
    };
  }
}

/**
 * Mock standalone utility: detect mismatch
 */
export function detectMismatch(repoRoot: string): MismatchDetection {
  return new MockHeadShaRecovery(repoRoot).detectMismatch();
}

/**
 * Mock standalone utility: auto-recover
 */
export function autoRecover(repoRoot: string): RecoveryResult {
  return new MockHeadShaRecovery(repoRoot).autoRecover();
}

/**
 * Mock standalone utility: validate consistency
 */
export function validateConsistency(repoRoot: string) {
  return new MockHeadShaRecovery(repoRoot).validateConsistency();
}
