// @module metaflow/audit
// @exports buildReport, renderReport

import type { AuditContract, AuditReport, DetectorResult } from './required-schema.ts';

export function buildReport(
  runId: string,
  treeSha: string,
  sessionIds: string[],
  results: DetectorResult[],
  _contract: AuditContract,
): AuditReport {
  return {
    schema_version: 1,
    runId,
    treeSha,
    sessionIds,
    computedAt: new Date().toISOString(),
    passed: results.every(r => r.passed),
    detectorResults: results,
  };
}

export interface RenderOpts {
  color?: boolean;
}

export function renderReport(report: AuditReport, _opts: RenderOpts = {}): string {
  const lines: string[] = [];

  // Header
  lines.push(`Audit Report: ${report.runId}`);
  lines.push(`Tree SHA: ${report.treeSha}`);
  lines.push(`Computed: ${report.computedAt}`);
  lines.push('');

  // Per-detector table
  lines.push('Code       | Status | Evidence                          | Fix');
  lines.push('---------- | ------ | --------------------------------- | ---');
  for (const r of report.detectorResults) {
    const status = r.passed ? '✅' : '❌';
    const evidence = r.evidence[0] ?? '-';
    const fix = r.fix[0] ?? '-';
    lines.push(`${r.code.padEnd(10)} | ${status}     | ${evidence.slice(0, 33).padEnd(33)} | ${fix}`);
  }

  lines.push('');

  // Summary
  const passCount = report.detectorResults.filter(r => r.passed).length;
  const total = report.detectorResults.length;
  lines.push(`${passCount}/${total} passed`);
  lines.push('');
  lines.push(report.passed ? 'PASSED' : 'FAILED');

  return lines.join('\n');
}
