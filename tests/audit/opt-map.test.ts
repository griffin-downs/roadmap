import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DETECTOR_TO_OPT, buildAuditOptNodes, emitAuditOptExpansion } from '../../src/lib/metaflow/audit/opt-map.ts';
import type { AuditReport } from '../../src/lib/metaflow/audit/required-schema.ts';

function makeReport(overrides: Partial<AuditReport> = {}): AuditReport {
  return {
    schema_version: 1,
    runId: 'test-run',
    treeSha: 'abc',
    sessionIds: [],
    computedAt: new Date().toISOString(),
    passed: false,
    detectorResults: [],
    ...overrides,
  };
}

describe('opt-map', () => {
  let base: string;
  beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'opt-map-')); });
  afterEach(() => { rmSync(base, { recursive: true, force: true }); });

  it('DETECTOR_TO_OPT has all 9 base codes', () => {
    const codes = ['RD-001', 'RD-002', 'RD-003', 'IR-001', 'IR-002', 'IR-003', 'IR-004', 'IR-005', 'PE-001'];
    for (const code of codes) {
      expect(DETECTOR_TO_OPT[code]).toBeDefined();
      expect(DETECTOR_TO_OPT[code].id).toBeTruthy();
    }
  });

  it('buildAuditOptNodes maps failing RD-001 to opt-add-tables node', () => {
    const report = makeReport({
      detectorResults: [
        { code: 'RD-001', passed: false, evidence: ['no table found'], fix: ['add table'] },
      ],
    });
    const nodes = buildAuditOptNodes(report);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe('opt-add-tables');
  });

  it('deduplicates nodes for same detector code', () => {
    const report = makeReport({
      detectorResults: [
        { code: 'RD-001', passed: false, evidence: ['a'], fix: [] },
        { code: 'RD-001', passed: false, evidence: ['b'], fix: [] },
        { code: 'IR-001', passed: false, evidence: ['c'], fix: [] },
      ],
    });
    const nodes = buildAuditOptNodes(report);
    expect(nodes).toHaveLength(2);
    expect(nodes.map(n => n.id)).toContain('opt-add-tables');
    expect(nodes.map(n => n.id)).toContain('opt-fix-plan-receipt');
  });

  it('emitAuditOptExpansion writes valid TS', () => {
    const nodes = buildAuditOptNodes(makeReport({
      detectorResults: [{ code: 'RD-001', passed: false, evidence: ['missing'], fix: [] }],
    }));
    const path = emitAuditOptExpansion('test-run', nodes, base);
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('opt-add-tables');
  });

  it('expansion file imports from protocol.ts', () => {
    const nodes = buildAuditOptNodes(makeReport({
      detectorResults: [{ code: 'IR-005', passed: false, evidence: ['hot'], fix: [] }],
    }));
    const path = emitAuditOptExpansion('run-x', nodes, base);
    const content = readFileSync(path, 'utf8');
    expect(content).toContain("from '../../src/protocol.ts'");
  });

  it('re-emit is idempotent', () => {
    const nodes = buildAuditOptNodes(makeReport({
      detectorResults: [{ code: 'RD-002', passed: false, evidence: ['no markers'], fix: [] }],
    }));
    const p1 = emitAuditOptExpansion('idem', nodes, base);
    const c1 = readFileSync(p1, 'utf8');
    const p2 = emitAuditOptExpansion('idem', nodes, base);
    const c2 = readFileSync(p2, 'utf8');
    expect(c1).toBe(c2);
  });
});
