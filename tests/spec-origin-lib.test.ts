import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  writeSpecOrigin, writeSpecImportReceipt, requireSpecOriginForEdit,
  hasSpecOriginSync, SPEC_ORIGIN_PATH,
} from '../src/lib/intake/spec-origin.js';
import type { SpecOrigin, SpecImportReceipt } from '../src/lib/intake/spec-origin.js';

const sampleOrigin: SpecOrigin = {
  schemaVersion: 1,
  engine: 'spec-kit',
  version: '1.0.0',
  compile_hash: 'abc123def456',
  spec_sha: 'sha256aabbcc',
  importedAt: '2026-01-01T00:00:00.000Z',
  dagId: 'test-dag',
};

describe('spec-origin library functions', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'so-lib-test-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  describe('writeSpecOrigin', () => {
    it('writes valid spec-origin.json', () => {
      const p = writeSpecOrigin(tmp, sampleOrigin);
      expect(existsSync(p)).toBe(true);
      const parsed = JSON.parse(readFileSync(p, 'utf-8'));
      expect(parsed.schemaVersion).toBe(1);
      expect(parsed.engine).toBe('spec-kit');
      expect(parsed.dagId).toBe('test-dag');
    });

    it('creates .roadmap directory if missing', () => {
      expect(existsSync(join(tmp, '.roadmap'))).toBe(false);
      writeSpecOrigin(tmp, sampleOrigin);
      expect(existsSync(join(tmp, '.roadmap'))).toBe(true);
    });

    it('hasSpecOriginSync returns true after write', () => {
      expect(hasSpecOriginSync(tmp)).toBe(false);
      writeSpecOrigin(tmp, sampleOrigin);
      expect(hasSpecOriginSync(tmp)).toBe(true);
    });
  });

  describe('writeSpecImportReceipt', () => {
    it('writes receipt to .roadmap/receipts/', () => {
      const receipt: SpecImportReceipt = {
        schemaVersion: 1,
        type: 'spec-import',
        specOrigin: sampleOrigin,
        dagHash: 'dag-hash-123',
        inputHash: 'input-hash-456',
        timestamp: '2026-01-01T00:00:00.000Z',
      };
      const p = writeSpecImportReceipt(tmp, receipt);
      expect(existsSync(p)).toBe(true);
      const parsed = JSON.parse(readFileSync(p, 'utf-8'));
      expect(parsed.type).toBe('spec-import');
      expect(parsed.specOrigin.dagId).toBe('test-dag');
      expect(parsed.dagHash).toBe('dag-hash-123');
    });
  });

  describe('requireSpecOriginForEdit', () => {
    it('allows edit when no spec-origin.json exists', () => {
      const result = requireSpecOriginForEdit(tmp);
      expect(result.ok).toBe(true);
    });

    it('blocks edit when spec-origin.json exists', () => {
      writeSpecOrigin(tmp, sampleOrigin);
      const result = requireSpecOriginForEdit(tmp);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('spec-compiled');
        expect(result.fix).toContain('import');
      }
    });

    it('allows edit when spec-origin.json is invalid JSON', () => {
      const dir = join(tmp, '.roadmap');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(tmp, SPEC_ORIGIN_PATH), 'not json');
      const result = requireSpecOriginForEdit(tmp);
      expect(result.ok).toBe(true);
    });
  });
});
