// SPEC-ORIGIN — tests for spec-origin gate: SpecOrigin type guard,
// writeSpecOrigin/writeSpecImportReceipt, hasSpecOriginSync,
// requireSpecOriginForEdit (blocks direct edits), verify integration.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isSpecOrigin,
  SPEC_ORIGIN_PATH,
  hasSpecOriginSync,
  writeSpecOrigin,
  writeSpecImportReceipt,
  requireSpecOriginForEdit,
} from '../src/lib/spec-origin.ts';
import type { SpecOrigin, SpecImportReceipt } from '../src/lib/spec-origin.ts';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'spec-origin-test-'));
  mkdirSync(join(tmp, '.roadmap'), { recursive: true });
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function validOrigin(): SpecOrigin {
  return {
    schemaVersion: 1,
    engine: 'spec-kit',
    version: '0.1.0',
    compile_hash: 'abc123',
    spec_sha: 'def456',
    importedAt: '2026-02-28T00:00:00.000Z',
    dagId: 'test-dag',
  };
}

describe('spec-origin', () => {
  // --- isSpecOrigin type guard ---

  it('isSpecOrigin accepts valid SpecOrigin', () => {
    expect(isSpecOrigin(validOrigin())).toBe(true);
  });

  it('isSpecOrigin rejects null and non-objects', () => {
    expect(isSpecOrigin(null)).toBe(false);
    expect(isSpecOrigin('string')).toBe(false);
    expect(isSpecOrigin(42)).toBe(false);
  });

  it('isSpecOrigin rejects missing fields', () => {
    const { compile_hash: _, ...rest } = validOrigin();
    expect(isSpecOrigin(rest)).toBe(false);
  });

  it('isSpecOrigin rejects wrong schemaVersion', () => {
    expect(isSpecOrigin({ ...validOrigin(), schemaVersion: 2 })).toBe(false);
  });

  // --- writeSpecOrigin ---

  it('writeSpecOrigin creates spec-origin.json', () => {
    const p = writeSpecOrigin(tmp, validOrigin());
    expect(existsSync(p)).toBe(true);
    const content = JSON.parse(readFileSync(p, 'utf-8'));
    expect(isSpecOrigin(content)).toBe(true);
    expect(content.dagId).toBe('test-dag');
  });

  // --- hasSpecOriginSync ---

  it('hasSpecOriginSync returns false when file missing', () => {
    expect(hasSpecOriginSync(tmp)).toBe(false);
  });

  it('hasSpecOriginSync returns true after writeSpecOrigin', () => {
    writeSpecOrigin(tmp, validOrigin());
    expect(hasSpecOriginSync(tmp)).toBe(true);
  });

  it('hasSpecOriginSync returns false for malformed JSON', () => {
    writeFileSync(join(tmp, SPEC_ORIGIN_PATH), '{ invalid json');
    expect(hasSpecOriginSync(tmp)).toBe(false);
  });

  // --- writeSpecImportReceipt ---

  it('writeSpecImportReceipt creates receipt file in receipts dir', () => {
    const receipt: SpecImportReceipt = {
      schemaVersion: 1,
      type: 'spec-import',
      specOrigin: validOrigin(),
      dagHash: 'daghash123',
      inputHash: 'inputhash456',
      timestamp: '2026-02-28T00:00:00.000Z',
    };
    const p = writeSpecImportReceipt(tmp, receipt);
    expect(existsSync(p)).toBe(true);
    const content = JSON.parse(readFileSync(p, 'utf-8'));
    expect(content.type).toBe('spec-import');
    expect(content.specOrigin.dagId).toBe('test-dag');
  });

  // --- requireSpecOriginForEdit ---

  it('requireSpecOriginForEdit returns ok:true when no spec-origin.json', () => {
    const result = requireSpecOriginForEdit(tmp);
    expect(result.ok).toBe(true);
  });

  it('requireSpecOriginForEdit blocks when spec-origin.json exists', () => {
    writeSpecOrigin(tmp, validOrigin());
    const result = requireSpecOriginForEdit(tmp);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/imported from a spec-compiled source/i);
      expect(result.fix).toMatch(/import --spec-compiled/i);
    }
  });

  // --- SPEC_ORIGIN_PATH constant ---

  it('SPEC_ORIGIN_PATH is .roadmap/spec-origin.json', () => {
    expect(SPEC_ORIGIN_PATH).toBe('.roadmap/spec-origin.json');
  });
});
