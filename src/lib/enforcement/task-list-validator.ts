// @module enforcement
// @exports TaskValidator, validateTaskList, detectStaleTask, ValidationIssue
// @types TaskFile, TaskValidationResult, ValidationIssue
// @entry roadmap/enforcement

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Types
export interface TaskFile {
  id?: string;
  subject?: string;
  description?: string;
  status?: string;
  owner?: string;
  createdAt?: string;
  updatedAt?: string;
  evidence?: string | string[];
  [key: string]: unknown;
}

export interface ValidationIssue {
  taskId: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface TaskValidationResult {
  tasksScanned: number;
  issues: ValidationIssue[];
  staleCount: number;
  invalidStatusCount: number;
  missingEvidenceCount: number;
  passed: boolean;
}

/**
 * TaskValidator — read-only inspection of task JSON files.
 * Used for pre-commit hook integration to enforce task list hygiene.
 */
export class TaskValidator {
  readonly repoRoot: string;
  readonly taskDir: string;
  readonly staleDurationMs: number; // 48 hours by default

  constructor(repoRoot: string, staleDurationMs: number = 48 * 60 * 60 * 1000) {
    this.repoRoot = repoRoot;
    this.taskDir = join(repoRoot, 'tasks');
    this.staleDurationMs = staleDurationMs;
  }

  /**
   * Scan tasks/ directory and return all task JSON files.
   * Returns empty array if directory doesn't exist.
   */
  private scanTaskFiles(): Array<{ path: string; id: string }> {
    try {
      const files = readdirSync(this.taskDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => ({
          path: join(this.taskDir, f),
          id: f.replace('.json', ''),
        }));
    } catch {
      // tasks/ directory doesn't exist or not readable
      return [];
    }
  }

  /**
   * Parse a single task JSON file. Returns null if invalid JSON.
   */
  private parseTaskFile(path: string): TaskFile | null {
    try {
      const content = readFileSync(path, 'utf-8');
      return JSON.parse(content) as TaskFile;
    } catch {
      return null;
    }
  }

  /**
   * Check if task status is valid.
   */
  private isValidStatus(status: unknown): status is 'pending' | 'in_progress' | 'completed' {
    return status === 'pending' || status === 'in_progress' || status === 'completed';
  }

  /**
   * Detect if a task is stale (in_progress > 48h without update).
   */
  detectStaleTask(
    task: TaskFile,
    taskId: string,
    now: number = Date.now()
  ): { isStale: boolean; hoursSinceUpdate?: number } {
    // Only in_progress tasks can be stale
    if (task.status !== 'in_progress') {
      return { isStale: false };
    }

    // Use updatedAt if available, fallback to createdAt
    const timestamp = task.updatedAt || task.createdAt;
    if (!timestamp) {
      // No timestamp = assume stale (should have one)
      return { isStale: true, hoursSinceUpdate: undefined };
    }

    try {
      const lastUpdateMs = new Date(timestamp).getTime();
      const ageMs = now - lastUpdateMs;
      const hoursSinceUpdate = ageMs / (60 * 60 * 1000);

      return {
        isStale: ageMs > this.staleDurationMs,
        hoursSinceUpdate,
      };
    } catch {
      // Invalid timestamp format = assume stale
      return { isStale: true, hoursSinceUpdate: undefined };
    }
  }

  /**
   * Validate a single task file.
   */
  private validateTask(task: TaskFile, taskId: string, now: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check invalid status
    if (!this.isValidStatus(task.status)) {
      issues.push({
        taskId,
        severity: 'error',
        code: 'INVALID_STATUS',
        message: `Task status must be one of: pending, in_progress, completed (got: ${task.status})`,
        details: { status: task.status },
      });
    }

    // Check stale in_progress tasks
    if (task.status === 'in_progress') {
      const stale = this.detectStaleTask(task, taskId, now);
      if (stale.isStale) {
        issues.push({
          taskId,
          severity: 'warning',
          code: 'STALE_IN_PROGRESS',
          message: `Task in_progress for > 48h without update${stale.hoursSinceUpdate ? ` (${stale.hoursSinceUpdate.toFixed(1)}h)` : ''}`,
          details: {
            status: task.status,
            lastUpdate: task.updatedAt || task.createdAt,
            hoursSinceUpdate: stale.hoursSinceUpdate,
          },
        });
      }
    }

    // Check completed tasks have evidence
    if (task.status === 'completed') {
      if (!task.evidence) {
        issues.push({
          taskId,
          severity: 'error',
          code: 'MISSING_EVIDENCE',
          message: 'Completed tasks must have an evidence field (string or array of strings)',
          details: { status: task.status },
        });
      }
    }

    return issues;
  }

  /**
   * Validate the entire task list.
   * @param now Optional current timestamp for testing
   */
  validate(now: number = Date.now()): TaskValidationResult {
    const files = this.scanTaskFiles();
    const issues: ValidationIssue[] = [];
    let staleCount = 0;
    let invalidStatusCount = 0;
    let missingEvidenceCount = 0;

    for (const file of files) {
      const task = this.parseTaskFile(file.path);
      if (!task) {
        // Skip unparseable files silently (malformed JSON)
        continue;
      }

      const taskId = task.id || file.id;
      const taskIssues = this.validateTask(task, taskId, now);

      for (const issue of taskIssues) {
        issues.push(issue);

        if (issue.code === 'STALE_IN_PROGRESS') staleCount++;
        if (issue.code === 'INVALID_STATUS') invalidStatusCount++;
        if (issue.code === 'MISSING_EVIDENCE') missingEvidenceCount++;
      }
    }

    return {
      tasksScanned: files.length,
      issues,
      staleCount,
      invalidStatusCount,
      missingEvidenceCount,
      passed: issues.length === 0,
    };
  }
}

/**
 * Convenience function for hook integration.
 * @returns true if all tasks pass validation, false otherwise
 */
export function validateTaskList(repoRoot: string, staleDurationMs?: number): boolean {
  const validator = new TaskValidator(repoRoot, staleDurationMs);
  const result = validator.validate();
  return result.passed;
}

/**
 * Generate a human-readable validation report.
 * Used for pre-commit hook output.
 */
export function formatValidationReport(result: TaskValidationResult): string {
  if (result.passed) {
    return `✓ Task list validation passed (${result.tasksScanned} tasks scanned)`;
  }

  const lines: string[] = [
    `✗ Task list validation failed (${result.tasksScanned} tasks scanned)`,
    '',
  ];

  if (result.issues.length > 0) {
    for (const issue of result.issues) {
      const severityIcon = issue.severity === 'error' ? '✗' : '⚠';
      lines.push(`  ${severityIcon} ${issue.taskId}: ${issue.code}`);
      lines.push(`    ${issue.message}`);
    }
  }

  lines.push('');
  lines.push(
    `Summary: ${result.staleCount} stale, ${result.invalidStatusCount} invalid status, ${result.missingEvidenceCount} missing evidence`
  );

  return lines.join('\n');
}
