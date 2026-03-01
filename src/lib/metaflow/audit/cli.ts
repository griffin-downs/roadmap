// @module metaflow/audit/cli
// @exports cmdMfAudit, cmdAuditTailEmit

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditContract, AuditReport, DetectorResult } from './required-schema.ts';
import { loadRequired } from './audit.ts';
import { buildReport, renderReport } from './report.ts';
import { detectDisplayRegression } from './detectors/display.ts';
import { detectIntegrationRoughPoints } from './detectors/integration.ts';
import { readMining } from '../phases/opt-dag.ts';
import type { InteractionReceipt, MiningResult } from '../types.ts';

// Run all detectors directly and collect results
function runAllDetectors(runId: string, contract: AuditContract, base: string): DetectorResult[] {
  const receipts = loadReceipts(base);
  const mining = loadMiningResult(runId, base);
  const displayResults = detectDisplayRegression(receipts);
  const integrationResults = detectIntegrationRoughPoints(receipts, [], mining, { base, contract });
  return [...displayResults, ...integrationResults];
}

function loadReceipts(base: string): InteractionReceipt[] {
  const dir = join(base, '.roadmap', 'metaflow', 'runs');
  if (!existsSync(dir)) return [];
  // Scan for receipt files
  const receipts: InteractionReceipt[] = [];
  try {
    for (const f of readdirSync(dir)) {
      const runDir = join(dir, f);
      const receiptFile = join(runDir, 'receipts.json');
      if (existsSync(receiptFile)) {
        const data = JSON.parse(readFileSync(receiptFile, 'utf8'));
        if (Array.isArray(data)) receipts.push(...data);
      }
    }
  } catch { /* best effort */ }
  return receipts;
}

function loadMiningResult(runId: string, base: string): MiningResult {
  try {
    return readMining(runId as any, base);
  } catch {
    // Return minimal mining result if not available
    return {
      schema_version: 1,
      runId: runId as any,
      computedAt: new Date().toISOString(),
      latencyP50Ms: 0,
      latencyP95Ms: 0,
      toolCallTotal: 0,
      hotspots: [],
      friction: [],
      teamReuseMissed: false,
    };
  }
}

export interface MfAuditOpts {
  required?: boolean;
  base?: string;
}

export function cmdMfAudit(runId: string, opts: MfAuditOpts = {}): { data: any; render: string } {
  const base = opts.base ?? process.cwd();
  const contract = loadRequired(base);

  if (opts.required) {
    // Render REQUIRED.json as table
    const lines: string[] = [];
    lines.push('Audit Contract: REQUIRED.json');
    lines.push(`Version: ${contract.version}`);
    lines.push('');
    lines.push('Detector          | Threshold');
    lines.push('----------------- | ---------');
    for (const d of contract.requiredDetectors) {
      lines.push(`${d.padEnd(17)} | required`);
    }
    lines.push('');
    lines.push(`Terminal Node: ${contract.requiredTerminalNodeId}`);
    lines.push(`Latency P95 Max: ${contract.thresholds.latencyP95MaxMs}ms`);
    lines.push(`Tool Call Inflation Max: ${contract.thresholds.toolCallInflationMax}`);
    lines.push(`Orient Churn Max: ${contract.thresholds.orientChurnMax}`);

    return {
      data: contract,
      render: lines.join('\n'),
    };
  }

  // Run full audit
  const results = runAllDetectors(runId, contract, base);
  const report: AuditReport = buildReport(runId, 'unknown', [], results, contract);
  const rendered = renderReport(report);

  // Write report + receipt via runAudit would duplicate, so just return
  return {
    data: report,
    render: rendered,
  };
}

export function cmdAuditTailEmit(dagId: string, base = process.cwd()): { data: any; render: string } {
  const contract = loadRequired(base);
  const terminalId = contract.requiredTerminalNodeId;

  // Generate tasks.md IR fragment for audit tail
  const fragment = `## Audit Tail — ${dagId}

### ${terminalId}
Terminal gate for audit compliance.
- **deps**: [last-executing-node]
- **produces**: []
- **validate**:
  - type: intent
    statement: "All required detectors pass with evidence"
    evaluator: self
    confidence: 0.9
    expandOnFail: true
  - type: shell
    command: "bin/roadmap mf audit --run \${RUN_ID} --note audit-gate"

### Required Detectors
${contract.requiredDetectors.map(d => `- ${d}`).join('\n')}

### Thresholds
- latencyP95MaxMs: ${contract.thresholds.latencyP95MaxMs}
- toolCallInflationMax: ${contract.thresholds.toolCallInflationMax}
- orientChurnMax: ${contract.thresholds.orientChurnMax}
`;

  return {
    data: {
      dagId,
      terminalNodeId: terminalId,
      requiredDetectors: contract.requiredDetectors,
      fragment,
    },
    render: fragment,
  };
}
