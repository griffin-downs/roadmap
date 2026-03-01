// Completion state detector — scans for stale/invalid completion records

import fs from 'fs';
import path from 'path';
import { DAGMismatch } from './types.ts';

export interface CompletionSubsystemInput {
  roadmapRoot: string;
  completedPath?: string;
}

export class CompletionDetector {
  private root: string;
  private completedPath: string;

  constructor(input: CompletionSubsystemInput) {
    this.root = input.roadmapRoot;
    this.completedPath = input.completedPath || path.join(this.root, '.roadmap/completed.json');
  }

  async scan(): Promise<DAGMismatch[]> {
    const issues: DAGMismatch[] = [];

    if (!fs.existsSync(this.completedPath)) {
      return issues; // No completed records is OK
    }

    try {
      const completed = JSON.parse(fs.readFileSync(this.completedPath, 'utf8'));

      // Check for completions without corresponding produces
      if (completed.nodes) {
        for (const [nodeId, nodeCompletion] of Object.entries(completed.nodes)) {
          if (typeof nodeCompletion === 'object' && nodeCompletion !== null) {
            const completion = nodeCompletion as any;
            if (completion.produces && Array.isArray(completion.produces)) {
              for (const file of completion.produces) {
                if (!fs.existsSync(path.join(this.root, file))) {
                  issues.push({
                    type: 'completion-mismatch',
                    detail: `Completed node ${nodeId} missing produces artifact: ${file}`,
                    severity: 'error',
                  });
                }
              }
            }
          }
        }
      }

      // Check for stale completion records (> 30 days)
      if (completed.lastUpdated) {
        const staleDays = (Date.now() - completed.lastUpdated) / (1000 * 60 * 60 * 24);
        if (staleDays > 30) {
          issues.push({
            type: 'stale-head',
            detail: `Completion records not updated for ${staleDays.toFixed(1)} days`,
            severity: 'warn',
          });
        }
      }
    } catch (e) {
      issues.push({
        type: 'state-divergence',
        detail: `Failed to parse completed.json: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'warn',
      });
    }

    return issues;
  }
}

export async function detectCompletionIssues(input: CompletionSubsystemInput): Promise<DAGMismatch[]> {
  const detector = new CompletionDetector(input);
  return detector.scan();
}
