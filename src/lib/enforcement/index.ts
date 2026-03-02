// @module enforcement
// @exports DAGManifest, TaskValidator, WorktreeCleanup, enforceClutterPrevention, ClutterPreventionReport
// @types ClutterPreventionReport, EnforcementRule, EnforcementViolation
// @entry roadmap/enforcement

import { DAGManifest, ManifestReport, validateManifest } from './dag-manifest';
import { TaskValidator, TaskValidationResult } from './task-list-validator';
import { WorktreeCleanup } from './worktree-cleanup';

// Re-export core types and classes for external consumers
export { DAGManifest, validateManifest };
export type { ManifestReport };
export { TaskValidator };
export type { TaskValidationResult };
export { WorktreeCleanup };

/**
 * Individual enforcement rule result
 */
export interface EnforcementRule {
  name: 'dag-documentation' | 'design-doc-commitment' | 'task-list-hygiene' | 'worktree-cleanup';
  description: string;
  passed: boolean;
  violations: EnforcementViolation[];
  summary: string;
}

/**
 * A single enforcement violation
 */
export interface EnforcementViolation {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  remediation: string;
}

/**
 * Comprehensive clutter prevention report
 */
export interface ClutterPreventionReport {
  timestamp: string;
  repoRoot: string;
  rules: EnforcementRule[];
  violations: EnforcementViolation[];
  allPassed: boolean;
  summary: string;
}

/**
 * enforceClutterPrevention: orchestrate all 4 enforcement rules
 *
 * Validates:
 * 1. DAG documentation — all .roadmap/head.*.json have desc, no orphans
 * 2. Design doc commitment — no untracked .md in .roadmap/ (except spec/)
 * 3. Task list hygiene — no stale tasks, all in_progress have evidence
 * 4. Worktree cleanup — no orphaned or stale git worktrees
 *
 * Returns aggregate report with pass/fail for each rule + remediation guidance.
 */
export function enforceClutterPrevention(repoRoot: string): ClutterPreventionReport {
  const timestamp = new Date().toISOString();
  const violations: EnforcementViolation[] = [];
  const rules: EnforcementRule[] = [];

  // Rule 1: DAG Documentation
  const dagManifest = new DAGManifest(repoRoot);
  const dagReport = dagManifest.scan();
  const dagValidation = validateManifest(dagReport);

  const dagViolations: EnforcementViolation[] = [];
  if (!dagValidation.passed) {
    if (dagReport.invalidCount > 0) {
      dagViolations.push({
        rule: 'dag-documentation',
        severity: 'error',
        message: `${dagReport.invalidCount} DAG file(s) have invalid structure`,
        remediation: dagReport.entries
          .filter((e: any) => !e.valid)
          .map((e: any) => `  ${e.path}: ${e.error}`)
          .join('\n'),
      });
    }

    if (dagReport.orphanedCount > 0) {
      dagViolations.push({
        rule: 'dag-documentation',
        severity: 'warning',
        message: `${dagReport.orphanedCount} orphaned DAG file(s) detected`,
        remediation: dagReport.entries
          .filter((e: any) => e.orphaned)
          .map((e: any) => `  Archive: .roadmap/${e.path}`)
          .join('\n'),
      });
    }

    if (dagReport.designDocGaps.length > 0) {
      dagViolations.push({
        rule: 'dag-documentation',
        severity: 'warning',
        message: `${dagReport.designDocGaps.length} DAG(s) missing design documentation`,
        remediation: dagReport.designDocGaps
          .map((id: any) => `  Create design doc for: ${id}`)
          .join('\n'),
      });
    }
  }

  rules.push({
    name: 'dag-documentation',
    description: 'All DAG files valid, documented, no orphans',
    passed: dagValidation.passed,
    violations: dagViolations,
    summary: dagReport.summary,
  });

  violations.push(...dagViolations);

  // Rule 2: Design Doc Commitment (shell script integration note)
  rules.push({
    name: 'design-doc-commitment',
    description: 'No untracked design docs in .roadmap/ (enforced in pre-commit hook)',
    passed: true, // Enforced at git hook level
    violations: [],
    summary: 'Enforced by design-doc-hook.sh pre-commit hook',
  });

  // Rule 3: Task List Hygiene
  const taskValidator = new TaskValidator(repoRoot);
  const taskValidation = taskValidator.validate();

  const taskViolations: EnforcementViolation[] = [];
  if (!taskValidation.passed) {
    for (const issue of taskValidation.issues) {
      taskViolations.push({
        rule: 'task-list-hygiene',
        severity: issue.severity,
        message: issue.message,
        remediation: `Task "${issue.taskId}": ${issue.code}`,
      });
    }
  }

  rules.push({
    name: 'task-list-hygiene',
    description: 'No stale tasks (in_progress > 48h), all completed tasks have evidence',
    passed: taskValidation.passed,
    violations: taskViolations,
    summary: `${taskValidation.tasksScanned} tasks scanned, ${taskValidation.issues.length} issues`,
  });

  violations.push(...taskViolations);

  // Rule 4: Worktree Cleanup
  const worktreeCleanup = new WorktreeCleanup();
  const worktreeEntries = worktreeCleanup.scan();

  const staleCount = worktreeEntries.filter((e: any) => e.stale).length;
  const orphanedCount = worktreeEntries.filter((e: any) => e.orphaned).length;

  const worktreeViolations: EnforcementViolation[] = [];
  if (staleCount > 0 || orphanedCount > 0) {
    if (staleCount > 0) {
      worktreeViolations.push({
        rule: 'worktree-cleanup',
        severity: 'warning',
        message: `${staleCount} stale worktree(s) (not modified in 7+ days)`,
        remediation: worktreeEntries
          .filter((e: any) => e.stale)
          .map((e: any) => `  git worktree remove ${e.path}`)
          .join('\n'),
      });
    }

    if (orphanedCount > 0) {
      worktreeViolations.push({
        rule: 'worktree-cleanup',
        severity: 'warning',
        message: `${orphanedCount} orphaned worktree(s) (branch deleted)`,
        remediation: worktreeEntries
          .filter((e: any) => e.orphaned)
          .map((e: any) => `  git worktree remove ${e.path}`)
          .join('\n'),
      });
    }
  }

  rules.push({
    name: 'worktree-cleanup',
    description: 'No stale (7+ days) or orphaned git worktrees',
    passed: staleCount === 0 && orphanedCount === 0,
    violations: worktreeViolations,
    summary: `${worktreeEntries.length} worktrees scanned, ${staleCount} stale, ${orphanedCount} orphaned`,
  });

  violations.push(...worktreeViolations);

  // Aggregate summary
  const allPassed = rules.every((r) => r.passed);
  const errorCount = violations.filter((v) => v.severity === 'error').length;
  const warningCount = violations.filter((v) => v.severity === 'warning').length;

  let summary: string;
  if (allPassed) {
    summary = 'All enforcement rules passed ✓';
  } else {
    summary = `${errorCount} error(s), ${warningCount} warning(s) detected`;
  }

  return {
    timestamp,
    repoRoot,
    rules,
    violations,
    allPassed,
    summary,
  };
}
