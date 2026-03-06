// @module terminal-audit/computed
// @description Assemble computed report sections from completion receipts — no agent input
// @exports ComputedReport, CommitEntry, TestEntry, AuditEntry, computeReport

import type { Graph } from '../../protocol.ts';
import type { CompletionRecordWithEvidence, EvidenceRecord } from '../evidence/completion-evidence.ts';

// --- Types ---

export interface CommitEntry {
  nodeId: string;
  produces: string[];
  gitSha?: string;
  completedAt?: string;
  missing: string[];
}

export interface TestEntry {
  nodeId: string;
  rule: string;
  passed: boolean;
  evidence: string;
}

export interface AuditEntry {
  nodeId: string;
  completedAt: string;
  checksTotal: number;
  checksPassed: number;
  checksFailed: number;
  gitSha?: string;
  branch?: string;
}

export interface ComputedReport {
  commitStatus: CommitEntry[];
  testEvidence: TestEntry[];
  auditTrail: AuditEntry[];
}

// --- Implementation ---

/**
 * Build computed report from DAG + completion records.
 * Reads only mechanical data — no LLM input, no agent judgment.
 *
 * @param dag - The graph being audited
 * @param records - Completion records keyed by nodeId
 * @param exists - Predicate to check if a produce file exists on disk
 */
export function computeReport(
  dag: Graph<string>,
  records: Map<string, CompletionRecordWithEvidence>,
  exists: (artifact: string) => boolean,
): ComputedReport {
  const commitStatus: CommitEntry[] = [];
  const testEvidence: TestEntry[] = [];
  const auditTrail: AuditEntry[] = [];

  for (const nodeId of Object.keys(dag.nodes)) {
    const node = dag.nodes[nodeId as keyof typeof dag.nodes] as any;
    if (!node) continue;

    const record = records.get(nodeId);
    const produces = [...(node.produces ?? [])] as string[];

    // Commit status: which produces exist, which are missing
    const missing = produces.filter(p => !exists(p));
    commitStatus.push({
      nodeId,
      produces,
      gitSha: record?.gitSha,
      completedAt: record?.completedAt,
      missing,
    });

    // Test evidence: extract shell/function validator results from checks
    const checks = record?.validationChecks ?? [];
    for (const check of checks) {
      if (isTestRule(check.rule)) {
        testEvidence.push({
          nodeId,
          rule: check.rule,
          passed: check.passed,
          evidence: check.evidence,
        });
      }
    }

    // Audit trail: completion timeline
    if (record) {
      const total = checks.length;
      const passed = checks.filter(c => c.passed).length;
      auditTrail.push({
        nodeId,
        completedAt: record.completedAt,
        checksTotal: total,
        checksPassed: passed,
        checksFailed: total - passed,
        gitSha: record.gitSha,
        branch: record.branch,
      });
    }
  }

  return { commitStatus, testEvidence, auditTrail };
}

// Shell and function rules are test evidence
function isTestRule(rule: string): boolean {
  return rule.startsWith('shell:') || rule.startsWith('function:');
}
