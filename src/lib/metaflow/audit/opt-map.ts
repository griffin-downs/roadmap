// @module metaflow/audit/opt-map
// @exports DETECTOR_TO_OPT, buildAuditOptNodes, emitAuditOptExpansion

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { AuditReport } from './required-schema.ts';
import type { OptimizationNode } from '../types.ts';

export const DETECTOR_TO_OPT: Record<string, { id: string; desc: string }> = {
  'RD-001': { id: 'opt-add-tables', desc: 'Add table rendering to commands missing tabular output' },
  'RD-002': { id: 'opt-add-dag-markers', desc: 'Add batch level markers (L00, L01) to DAG render output' },
  'RD-003': { id: 'opt-add-progress-bar', desc: 'Add progress bar to complete/chart output' },
  'IR-001': { id: 'opt-fix-plan-receipt', desc: 'Ensure PLAN_SELECTED.json is written and headSha matches' },
  'IR-002': { id: 'opt-fix-authority-marker', desc: 'Ensure git-state.json activePlan is set correctly' },
  'IR-003': { id: 'opt-fix-receipt-chain', desc: 'Ensure all receipt-required commands emit InteractionReceipts' },
  'IR-004': { id: 'opt-autocommit-completed', desc: 'Auto-commit completed.json to prevent drift' },
  'IR-005': { id: 'opt-reduce-tool-calls', desc: 'Reduce tool call hotspots and latency below thresholds' },
  'PE-001': { id: 'opt-register-commands', desc: 'Register unregistered commands in COMMAND_REGISTRY' },
};

export function buildAuditOptNodes(report: AuditReport): OptimizationNode[] {
  const seen = new Set<string>();
  const nodes: OptimizationNode[] = [];

  for (const r of report.detectorResults) {
    if (r.passed) continue;
    const template = DETECTOR_TO_OPT[r.code];
    if (!template || seen.has(template.id)) continue;
    seen.add(template.id);
    nodes.push({
      id: template.id,
      desc: template.desc,
      produces: [`audit-patches/${template.id}.patch.json`],
      consumes: ['audit-report.json'],
      rationale: r.evidence[0] ?? r.code,
    });
  }

  return nodes;
}

export function emitAuditOptExpansion(runId: string, nodes: OptimizationNode[], base = process.cwd()): string {
  const expansionPath = join(base, '.roadmap', 'expansions', `expand-audit-opt-${runId}.ts`);
  mkdirSync(dirname(expansionPath), { recursive: true });

  const nodeEntries = nodes.map(n => `
  '${n.id}': {
    id: '${n.id}' as const,
    desc: ${JSON.stringify(n.desc)},
    produces: ${JSON.stringify(n.produces)},
    consumes: ${JSON.stringify(n.consumes)},
    deps: ['audit-opt-root'],
    validate: [{ type: 'artifact-exists' as const, path: ${JSON.stringify(n.produces[0])} }],
    idempotent: true,
    expandedFrom: 'audit-opt-expansion',
  }`).join(',');

  const script = `// Auto-generated audit optimization expansion for run ${runId}
import type { Graph } from '../../src/protocol.ts';

export default function expand(g: Graph<string>): Graph<string> {
  const nodes: Record<string, any> = {${nodeEntries}
  };
  return { ...g, nodes: { ...g.nodes, ...nodes } };
}
`;

  writeFileSync(expansionPath, script);
  return expansionPath;
}
