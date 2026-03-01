// Intent convergence gap detection — identify unexpanded plans and missing gate runs

import fs from 'fs';
import path from 'path';
import { DAGMismatch } from './types.ts';

export class IntentConvergenceDetector {
  private root: string;
  private headPath: string;

  constructor(root: string, headPath?: string) {
    this.root = root;
    this.headPath = headPath || path.join(this.root, '.roadmap/head.json');
  }

  async detect(): Promise<DAGMismatch[]> {
    const issues: DAGMismatch[] = [];

    if (!fs.existsSync(this.headPath)) return issues;

    try {
      const head = JSON.parse(fs.readFileSync(this.headPath, 'utf8'));
      const nodes = head.nodes || {};

      // Find plan nodes that should have been expanded but aren't
      for (const [nodeId, node] of Object.entries(nodes)) {
        const n = node as any;

        // Check for unexpanded plan nodes
        if (n.mode === 'plan' && n.validate?.some((v: any) => v.type === 'expanded')) {
          const hasChildren = Object.values(nodes).some((other: any) =>
            other.expandedFrom === nodeId
          );

          if (!hasChildren) {
            issues.push({
              type: 'state-divergence',
              detail: `Plan node ${nodeId} has expansion requirement but no child nodes exist`,
              severity: 'warn',
            });
          }
        }

        // Check for unapplied intent gates
        if (n.validate?.some((v: any) => v.expandOnFail === true)) {
          issues.push({
            type: 'state-divergence',
            detail: `Intent gate on ${nodeId} may require re-run if expansion criteria not met`,
            severity: 'info',
          });
        }
      }
    } catch (e) {
      issues.push({
        type: 'state-divergence',
        detail: `Failed to analyze intent convergence: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'warn',
      });
    }

    return issues;
  }
}

export async function detectIntentConvergenceGaps(root: string): Promise<DAGMismatch[]> {
  const detector = new IntentConvergenceDetector(root);
  return detector.detect();
}
