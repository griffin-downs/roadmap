// DAG state detector — scans head.json vs execution context vs completed.json

import fs from 'fs';
import path from 'path';
import { DAGMismatch, DAGSubsystemReport } from './types.ts';

export interface DAGSubsystemInput {
  roadmapRoot: string;
  headPath?: string;
  completedPath?: string;
}

export class DAGDetector {
  private root: string;
  private headPath: string;
  private completedPath: string;

  constructor(input: DAGSubsystemInput) {
    this.root = input.roadmapRoot;
    this.headPath = input.headPath || path.join(this.root, '.roadmap/head.json');
    this.completedPath = input.completedPath || path.join(this.root, '.roadmap/completed.json');
  }

  async scan(): Promise<DAGSubsystemReport> {
    const mismatches: DAGMismatch[] = [];
    const headSha = this.readHeadSha();
    const dagId = this.readDAGId();

    // Check 1: head.json exists and is valid
    if (!fs.existsSync(this.headPath)) {
      mismatches.push({
        type: 'stale-head',
        dagId,
        detail: `head.json not found at ${this.headPath}`,
        severity: 'error',
      });
    }

    // Check 2: completed.json consistency
    const completedIssues = this.checkCompletedState(dagId);
    mismatches.push(...completedIssues);

    // Check 3: orphaned DAG detection
    const orphanedDAGs = this.scanOrphanedDAGs();
    mismatches.push(...orphanedDAGs);

    return {
      timestamp: Date.now(),
      dagId,
      headSha,
      mismatches,
      healthy: mismatches.every(m => m.severity !== 'error'),
    };
  }

  private readHeadSha(): string {
    if (!fs.existsSync(this.headPath)) return 'unknown';
    const head = JSON.parse(fs.readFileSync(this.headPath, 'utf8'));
    return head.headSha || head.baseSha || 'unknown';
  }

  private readDAGId(): string {
    if (!fs.existsSync(this.headPath)) return 'unknown';
    const head = JSON.parse(fs.readFileSync(this.headPath, 'utf8'));
    return head.dag?.id || 'unknown';
  }

  private checkCompletedState(dagId: string): DAGMismatch[] {
    const issues: DAGMismatch[] = [];

    if (!fs.existsSync(this.completedPath)) {
      // No completed.json is OK for fresh DAG
      return issues;
    }

    try {
      const completed = JSON.parse(fs.readFileSync(this.completedPath, 'utf8'));

      // Check if completed DAG ID matches head
      if (completed.dagId && completed.dagId !== dagId) {
        issues.push({
          type: 'completion-mismatch',
          dagId,
          detail: `completed.json references ${completed.dagId}, head.json is ${dagId}`,
          severity: 'warn',
        });
      }

      // Check for stale checkpoints (last update > 24h ago)
      if (completed.lastUpdated) {
        const staleDays = (Date.now() - completed.lastUpdated) / (1000 * 60 * 60 * 24);
        if (staleDays > 1) {
          issues.push({
            type: 'stale-head',
            dagId,
            detail: `completed.json not updated for ${staleDays.toFixed(1)} days`,
            severity: 'info',
          });
        }
      }
    } catch (e) {
      issues.push({
        type: 'state-divergence',
        dagId,
        detail: `Failed to parse completed.json: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'error',
      });
    }

    return issues;
  }

  private scanOrphanedDAGs(): DAGMismatch[] {
    const issues: DAGMismatch[] = [];
    const roadmapDir = path.join(this.root, '.roadmap');

    if (!fs.existsSync(roadmapDir)) return issues;

    try {
      const entries = fs.readdirSync(roadmapDir);
      const dagFiles = entries.filter(e => e.startsWith('head.') && e.endsWith('.json'));

      if (dagFiles.length > 1) {
        issues.push({
          type: 'orphaned-dag',
          detail: `Found ${dagFiles.length} head.*.json files (expected 1 active + candidates)`,
          severity: 'warn',
        });
      }

      // Check for ancient candidate files
      for (const file of dagFiles) {
        if (file.startsWith('head.candidate')) {
          const filePath = path.join(roadmapDir, file);
          const stat = fs.statSync(filePath);
          const ageDays = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > 7) {
            issues.push({
              type: 'orphaned-dag',
              detail: `Stale candidate file: ${file} (${ageDays.toFixed(1)} days old)`,
              severity: 'info',
            });
          }
        }
      }
    } catch (e) {
      issues.push({
        type: 'state-divergence',
        detail: `Failed to scan roadmap directory: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'warn',
      });
    }

    return issues;
  }
}

export async function detectDAGMismatches(input: DAGSubsystemInput): Promise<DAGSubsystemReport> {
  const detector = new DAGDetector(input);
  return detector.scan();
}
