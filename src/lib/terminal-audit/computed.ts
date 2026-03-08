// @module terminal-audit/computed
// @description Completion evidence computation — reads completed.json, assembles per-node status
// @exports NodeCommitStatus, TestEvidence, AuditTrail, ComputedReport, computeReport

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadCompletionsWithEvidence } from '../../runtime/completion.ts';
import type { CompletionRecordWithEvidence, EvidenceRecord } from '../../runtime/completion.ts';
import type { Graph } from '../../protocol.ts';

export interface NodeCommitStatus {
  nodeId: string;
  produces: readonly string[];
  gitSha: string | undefined;
  completedAt: string | undefined;
  missingArtifacts: string[];
}

export interface TestEvidence {
  nodeId: string;
  shellResults: Array<{
    rule: string;
    passed: boolean;
    evidence: string;
  }>;
}

export interface AuditTrail {
  nodeId: string;
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
}

export interface ComputedReport {
  commitStatus: NodeCommitStatus[];
  testEvidence: TestEvidence[];
  auditTrail: AuditTrail[];
}

/**
 * Read .roadmap/completed.json and the DAG, return pure data assembly:
 * per-node commit status, test evidence (shell validator results),
 * audit trail (check counts). No gate logic, no pass/fail.
 */
export function computeReport(dag: Graph<string>, repoRoot: string): ComputedReport {
  const completions = loadCompletionsWithEvidence(repoRoot);

  const commitStatus: NodeCommitStatus[] = [];
  const testEvidence: TestEvidence[] = [];
  const auditTrail: AuditTrail[] = [];

  for (const node of Object.values(dag.nodes)) {
    const record = completions.get(node.id) as CompletionRecordWithEvidence | undefined;

    // Commit status
    const missing = node.produces.filter(p => !existsSync(join(repoRoot, p)));
    commitStatus.push({
      nodeId: node.id,
      produces: node.produces,
      gitSha: record?.gitSha,
      completedAt: record?.completedAt,
      missingArtifacts: missing,
    });

    // Test evidence — shell validator results from validationChecks
    const checks: EvidenceRecord[] = record?.validationChecks ?? [];
    const shellResults = checks.filter(c => c.rule.startsWith('shell'));
    testEvidence.push({
      nodeId: node.id,
      shellResults: shellResults.map(c => ({
        rule: c.rule,
        passed: c.passed,
        evidence: c.evidence,
      })),
    });

    // Audit trail
    const total = checks.length;
    const passed = checks.filter(c => c.passed).length;
    auditTrail.push({
      nodeId: node.id,
      checksTotal: total,
      checksPassed: passed,
      checksFailed: total - passed,
    });
  }

  return { commitStatus, testEvidence, auditTrail };
}
