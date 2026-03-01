import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectMissingSelfInsert,
  detectMissingSurfaceHeader,
  detectActiveRunNotPrinted,
  detectStateMutationWithoutRunBinding,
  detectProcessEscapePostSelfInsert,
  detectMetaflowCompliance,
} from '../../src/lib/metaflow/audit/detectors/metaflow.ts';

describe('metaflow compliance detectors', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'mf-det-'));
    mkdirSync(join(tmp, '.roadmap/receipts'), { recursive: true });
    mkdirSync(join(tmp, '.roadmap/metaflow'), { recursive: true });
  });

  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  function writeActiveRun(runId = 'mf_test_001') {
    writeFileSync(join(tmp, '.roadmap/metaflow/active-run.json'), JSON.stringify({
      schema_version: 1, runId, stage: 'execute', startedAt: '2026-03-01T00:00:00Z', sessionIds: ['s1'],
    }));
  }

  function writeAuthority() {
    writeFileSync(join(tmp, '.roadmap/metaflow/authority.json'), JSON.stringify({ present: true }));
  }

  function writeReceipt(name: string, data: Record<string, unknown>) {
    writeFileSync(join(tmp, '.roadmap/receipts', name), JSON.stringify(data));
  }

  describe('MF-001: detectMissingSelfInsert', () => {
    it('fires on missing self-insert for eligible command', () => {
      writeActiveRun();
      writeReceipt('metaflow-wrap-si-001.json', { stepId: 'si-001', cmd: 'orient --note test' });
      const r = detectMissingSelfInsert({ base: tmp });
      expect(r.code).toBe('MF-001');
      expect(r.passed).toBe(false);
    });

    it('passes when no active run', () => {
      const r = detectMissingSelfInsert({ base: tmp });
      expect(r.passed).toBe(true);
    });
  });

  describe('MF-002: detectMissingSurfaceHeader', () => {
    it('fires on missing surface header receipt', () => {
      writeReceipt('metaflow-wrap-si-002.json', { stepId: 'si-002', cmd: 'chart' });
      const r = detectMissingSurfaceHeader({ base: tmp });
      expect(r.code).toBe('MF-002');
      expect(r.passed).toBe(false);
    });
  });

  describe('MF-003: detectActiveRunNotPrinted', () => {
    it('fires on missing runId in mf render', () => {
      writeActiveRun('mf_test_001');
      const plainPath = join(tmp, 'render-out.txt');
      writeFileSync(plainPath, 'some output without runid');
      writeReceipt('metaflow-wrap-si-003.json', {
        stepId: 'si-003', cmd: 'mf audit --run r1',
        render: { plainPath },
      });
      const r = detectActiveRunNotPrinted({ base: tmp });
      expect(r.code).toBe('MF-003');
      expect(r.passed).toBe(false);
    });
  });

  describe('MF-004: detectStateMutationWithoutRunBinding', () => {
    it('fires on dispatch without self-insert', () => {
      writeReceipt('metaflow-wrap-si-004.json', { stepId: 'si-004', cmd: 'dispatch --run r1' });
      const r = detectStateMutationWithoutRunBinding({ base: tmp });
      expect(r.code).toBe('MF-004');
      expect(r.passed).toBe(false);
    });
  });

  describe('PE-002: detectProcessEscapePostSelfInsert', () => {
    it('fires on unwrapped eligible command with authority', () => {
      writeActiveRun();
      writeAuthority();
      writeReceipt('metaflow-wrap-si-005.json', { stepId: 'si-005', cmd: 'orient --note x' });
      const r = detectProcessEscapePostSelfInsert({ base: tmp });
      expect(r.code).toBe('PE-002');
      expect(r.passed).toBe(false);
    });
  });

  describe('detectMetaflowCompliance', () => {
    it('returns 6 results on fixture', () => {
      writeActiveRun();
      const results = detectMetaflowCompliance({ base: tmp });
      expect(results).toHaveLength(6);
      expect(results.every(r => typeof r.code === 'string')).toBe(true);
    });

    it('all pass on properly wrapped fixture', () => {
      // No active run, no authority, no receipts — all detectors pass vacuously
      const results = detectMetaflowCompliance({ base: tmp });
      expect(results.every(r => r.passed)).toBe(true);
    });

    it('codes include all MF and PE codes', () => {
      const results = detectMetaflowCompliance({ base: tmp });
      const codes = results.map(r => r.code);
      expect(codes).toContain('MF-001');
      expect(codes).toContain('MF-002');
      expect(codes).toContain('MF-003');
      expect(codes).toContain('MF-004');
      expect(codes).toContain('MF-005');
      expect(codes).toContain('PE-002');
    });
  });
});
