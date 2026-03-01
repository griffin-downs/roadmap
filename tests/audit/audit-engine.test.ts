import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAudit, loadRequired, type Detector } from '../../src/lib/metaflow/audit/audit.ts';
import { renderReport } from '../../src/lib/metaflow/audit/report.ts';
import { readAuditReceipt, auditReceiptExists } from '../../src/lib/metaflow/audit/receipt.ts';
import type { AuditContract, DetectorResult } from '../../src/lib/metaflow/audit/required-schema.ts';

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'audit-test-'));
  // Write REQUIRED.json
  const auditDir = join(base, '.roadmap', 'metaflow', 'audit');
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(join(auditDir, 'REQUIRED.json'), JSON.stringify({
    schema_version: 1,
    version: '1.0.0',
    thresholds: { latencyP95MaxMs: 5000, toolCallInflationMax: 10, orientChurnMax: 3 },
    requiredDetectors: ['RD-001'],
    requiredTerminalNodeId: 'intent-metaflow-audit-required',
    bindFields: ['treeSha', 'sessionIds', 'runId'],
  } satisfies AuditContract));
  // Write receipts dir
  mkdirSync(join(base, '.roadmap', 'receipts'), { recursive: true });
  return base;
}

const passingDetector: Detector = (runId, _contract, _base): DetectorResult => ({
  code: 'RD-001',
  passed: true,
  evidence: ['all nodes rendered correctly'],
  fix: [],
});

const failingDetector: Detector = (runId, _contract, _base): DetectorResult => ({
  code: 'RD-002',
  passed: false,
  evidence: ['node X missing from chart output'],
  fix: ['re-run chart after completing node X'],
});

describe('audit-engine', () => {
  let base: string;

  beforeEach(() => { base = makeBase(); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('all-passing detectors → passed:true receipt', () => {
    const report = runAudit('run-1', [passingDetector], { base, treeSha: 'abc123', sessionIds: ['s1'] });
    expect(report.passed).toBe(true);
    expect(report.detectorResults).toHaveLength(1);
    expect(report.detectorResults[0].passed).toBe(true);

    const receipt = readAuditReceipt('run-1', base);
    expect(receipt.passed).toBe(true);
    expect(receipt.reason).toBeUndefined();
  });

  it('one failing detector → passed:false receipt', () => {
    const report = runAudit('run-2', [passingDetector, failingDetector], { base, treeSha: 'def456', sessionIds: ['s2'] });
    expect(report.passed).toBe(false);

    const receipt = readAuditReceipt('run-2', base);
    expect(receipt.passed).toBe(false);
    expect(receipt.reason).toContain('1 detector(s) failed');
  });

  it('report render contains PASSED/FAILED banner', () => {
    const passing = runAudit('run-3', [passingDetector], { base, treeSha: 'abc', sessionIds: [] });
    expect(renderReport(passing)).toContain('PASSED');

    const failing = runAudit('run-4', [failingDetector], { base, treeSha: 'abc', sessionIds: [] });
    expect(renderReport(failing)).toContain('FAILED');
  });

  it('receipt written to correct path', () => {
    runAudit('run-5', [passingDetector], { base, treeSha: 'abc', sessionIds: [] });
    expect(auditReceiptExists('run-5', base)).toBe(true);
    const receiptPath = join(base, '.roadmap', 'receipts', 'audit-run-5.json');
    expect(existsSync(receiptPath)).toBe(true);
  });

  it('loadRequired reads thresholds', () => {
    const contract = loadRequired(base);
    expect(contract.thresholds.latencyP95MaxMs).toBe(5000);
    expect(contract.thresholds.toolCallInflationMax).toBe(10);
    expect(contract.thresholds.orientChurnMax).toBe(3);
    expect(contract.requiredDetectors).toContain('RD-001');
  });

  it('treeSha + sessionIds bound in output', () => {
    const report = runAudit('run-6', [passingDetector], { base, treeSha: 'sha-xyz', sessionIds: ['s1', 's2'] });
    expect(report.treeSha).toBe('sha-xyz');
    expect(report.sessionIds).toEqual(['s1', 's2']);

    const receipt = readAuditReceipt('run-6', base);
    expect(receipt.treeSha).toBe('sha-xyz');
    expect(receipt.sessionIds).toEqual(['s1', 's2']);
  });
});
