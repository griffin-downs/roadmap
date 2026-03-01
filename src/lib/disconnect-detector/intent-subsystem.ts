// Intent gate detector — scans for unapplied expansions, pending gates, low confidence

import fs from 'fs';
import path from 'path';
import { DAGMismatch } from './types.ts';

export interface IntentSubsystemInput {
  roadmapRoot: string;
  headPath?: string;
}

export class IntentDetector {
  private root: string;
  private headPath: string;

  constructor(input: IntentSubsystemInput) {
    this.root = input.roadmapRoot;
    this.headPath = input.headPath || path.join(this.root, '.roadmap/head.json');
  }

  async scan(): Promise<DAGMismatch[]> {
    const issues: DAGMismatch[] = [];

    if (!fs.existsSync(this.headPath)) {
      return issues;
    }

    try {
      const head = JSON.parse(fs.readFileSync(this.headPath, 'utf8'));
      const nodes = head.nodes || head.dag?.nodes || {};

      // Check for plan nodes without expansions
      for (const [nodeId, node] of Object.entries(nodes)) {
        const n = node as any;
        if (n.mode === 'plan') {
          const hasExpansion = Object.values(nodes).some((other: any) =>
            other.expandedFrom === nodeId
          );
          if (!hasExpansion && n.validate?.some((v: any) => v.type === 'expanded')) {
            issues.push({
              type: 'state-divergence',
              detail: `Plan node ${nodeId} requires expansion but has no children`,
              severity: 'warn',
            });
          }
        }
      }

      // Check for intent validation rules
      for (const [nodeId, node] of Object.entries(nodes)) {
        const n = node as any;
        if (n.validate && Array.isArray(n.validate)) {
          for (const rule of n.validate) {
            if (rule.type === 'spec-conformance' && rule.expandOnFail) {
              // Check if scenario is marked as pending/unclear
              if (rule.scenario && rule.scenario.includes('Clarity')) {
                issues.push({
                  type: 'state-divergence',
                  detail: `Plan clarity gate on ${nodeId}: may require expansion if vague`,
                  severity: 'info',
                });
              }
            }
          }
        }
      }
    } catch (e) {
      issues.push({
        type: 'state-divergence',
        detail: `Failed to parse intent gates: ${e instanceof Error ? e.message : String(e)}`,
        severity: 'warn',
      });
    }

    return issues;
  }
}

export async function detectIntentIssues(input: IntentSubsystemInput): Promise<DAGMismatch[]> {
  const detector = new IntentDetector(input);
  return detector.scan();
}
