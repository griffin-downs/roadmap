// @module enforcement
// @exports DagManifest, TaskValidator, WorktreeCleanup, DesignDocHook, EnforcementSuite
// @types EnforcementReport, EnforcementResult, ValidationIssue
// @entry roadmap/enforcement

export { DagManifest } from './dag-manifest';
export type { DagEntry, ManifestEntry, DagValidationResult } from './dag-manifest';

export { TaskValidator, validateTaskList, formatValidationReport } from './task-list-validator';
export type { TaskFile, TaskValidationResult, ValidationIssue } from './task-list-validator';

export { WorktreeCleanup } from './worktree-cleanup';
export type { WorktreeEntry, CleanupResult, CleanupReport } from './worktree-cleanup';

/**
 * EnforcementSuite — integrated enforcement across all four clutter-prevention gates:
 * 1. DAG documentation (dag-manifest.ts)
 * 2. Design doc commitment (design-doc-hook.sh)
 * 3. Task list hygiene (task-list-validator.ts)
 * 4. Worktree cleanup (worktree-cleanup.ts)
 */
export class EnforcementSuite {
  private dagManifest: DagManifest;
  private taskValidator: TaskValidator;
  private worktreeCleanup: WorktreeCleanup;

  constructor(repoRoot: string) {
    this.dagManifest = new DagManifest(repoRoot);
    this.taskValidator = new TaskValidator(repoRoot);
    this.worktreeCleanup = new WorktreeCleanup();
  }

  /**
   * Run all enforcement checks
   */
  validate(): EnforcementReport {
    const dagResult = this.dagManifest.validate();
    const taskResult = this.taskValidator.validate();
    const worktreeReport = this.worktreeCleanup.report(false);

    const allPassed =
      dagResult.passed &&
      taskResult.passed &&
      worktreeReport.failedCount === 0 &&
      worktreeReport.orphanedCount === 0;

    return {
      timestamp: new Date().toISOString(),
      passed: allPassed,
      dagValidation: {
        passed: dagResult.passed,
        undocumentedCount: dagResult.undocumentedCount,
        issues: dagResult.issues,
      },
      taskValidation: {
        passed: taskResult.passed,
        staleCount: taskResult.staleCount,
        invalidStatusCount: taskResult.invalidStatusCount,
        missingEvidenceCount: taskResult.missingEvidenceCount,
        issues: taskResult.issues,
      },
      worktreeValidation: {
        passed: worktreeReport.failedCount === 0 && worktreeReport.orphanedCount === 0,
        staleCount: worktreeReport.staleCount,
        orphanedCount: worktreeReport.orphanedCount,
        failedCount: worktreeReport.failedCount,
      },
    };
  }

  /**
   * Generate human-readable enforcement report
   */
  report(): string {
    const result = this.validate();
    const lines: string[] = [];

    lines.push('╔════════════════════════════════════════╗');
    lines.push('║   Clutter Prevention Enforcement Report║');
    lines.push('╚════════════════════════════════════════╝');
    lines.push('');
    lines.push(`Timestamp: ${result.timestamp}`);
    lines.push(`Status: ${result.passed ? '✅ PASS' : '❌ FAIL'}`);
    lines.push('');

    // DAG validation
    lines.push('┌─ DAG Documentation');
    if (result.dagValidation.passed) {
      lines.push('│  ✅ All DAGs documented');
    } else {
      lines.push(`│  ❌ ${result.dagValidation.undocumentedCount} undocumented DAGs`);
      for (const issue of result.dagValidation.issues.slice(0, 3)) {
        lines.push(`│    - ${issue.message}`);
      }
    }
    lines.push('│');

    // Task validation
    lines.push('├─ Task List Hygiene');
    if (result.taskValidation.passed) {
      lines.push('│  ✅ Task list valid');
    } else {
      lines.push('│  ❌ Task list issues:');
      if (result.taskValidation.staleCount > 0) {
        lines.push(`│    - ${result.taskValidation.staleCount} stale tasks (in_progress > 48h)`);
      }
      if (result.taskValidation.invalidStatusCount > 0) {
        lines.push(`│    - ${result.taskValidation.invalidStatusCount} invalid task statuses`);
      }
      if (result.taskValidation.missingEvidenceCount > 0) {
        lines.push(`│    - ${result.taskValidation.missingEvidenceCount} completed tasks missing evidence`);
      }
    }
    lines.push('│');

    // Worktree validation
    lines.push('└─ Worktree Cleanup');
    if (result.worktreeValidation.passed) {
      lines.push('   ✅ No stale or orphaned worktrees');
    } else {
      if (result.worktreeValidation.staleCount > 0) {
        lines.push(`   ⚠️  ${result.worktreeValidation.staleCount} stale worktrees (not modified 7+ days)`);
      }
      if (result.worktreeValidation.orphanedCount > 0) {
        lines.push(`   ❌ ${result.worktreeValidation.orphanedCount} orphaned worktrees (branch missing)`);
      }
      if (result.worktreeValidation.failedCount > 0) {
        lines.push(`   ❌ ${result.worktreeValidation.failedCount} cleanup failures`);
      }
    }
    lines.push('');

    return lines.join('\n');
  }
}

/**
 * EnforcementReport - aggregated results from all four enforcement gates
 */
export interface EnforcementReport {
  timestamp: string;
  passed: boolean;
  dagValidation: {
    passed: boolean;
    undocumentedCount: number;
    issues: Array<{ code: string; message: string }>;
  };
  taskValidation: {
    passed: boolean;
    staleCount: number;
    invalidStatusCount: number;
    missingEvidenceCount: number;
    issues: Array<{ taskId: string; code: string; message: string }>;
  };
  worktreeValidation: {
    passed: boolean;
    staleCount: number;
    orphanedCount: number;
    failedCount: number;
  };
}

/**
 * EnforcementResult - success/failure status
 */
export interface EnforcementResult {
  success: boolean;
  timestamp: string;
  report: EnforcementReport;
}
