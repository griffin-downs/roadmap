/**
 * plan-selection tests: PlanSelectReceipt type guards, PlanSelectedPointer type guards, path helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  isPlanSelectReceipt,
  isPlanSelectedPointer,
  planSelectReceiptPath,
  PLAN_SELECT_RECEIPT_DIR,
  PLAN_SELECTED_POINTER,
} from '../src/lib/plan-selection';
import type { PlanSelectReceipt, PlanSelectedPointer } from '../src/lib/plan-selection';

// ── isPlanSelectReceipt ──────────────────────────────────────────────────────

describe('isPlanSelectReceipt', () => {
  const valid: PlanSelectReceipt = {
    schemaVersion: 1,
    type: 'plan-select',
    headSha: 'abc123def456',
    candidateId: 'plan-v1',
    timestamp: '2026-02-28T00:00:00.000Z',
    note: 'selected for clarity',
  };

  it('accepts a valid receipt', () => {
    expect(isPlanSelectReceipt(valid)).toBe(true);
  });

  it('accepts a receipt with optional selectedBy', () => {
    expect(isPlanSelectReceipt({ ...valid, selectedBy: 'agent-a' })).toBe(true);
  });

  it('rejects null', () => {
    expect(isPlanSelectReceipt(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isPlanSelectReceipt('string')).toBe(false);
    expect(isPlanSelectReceipt(42)).toBe(false);
  });

  it('rejects wrong schemaVersion', () => {
    expect(isPlanSelectReceipt({ ...valid, schemaVersion: 2 })).toBe(false);
  });

  it('rejects wrong type field', () => {
    expect(isPlanSelectReceipt({ ...valid, type: 'other' })).toBe(false);
  });

  it('rejects missing headSha', () => {
    const { headSha: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects missing candidateId', () => {
    const { candidateId: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects missing timestamp', () => {
    const { timestamp: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects missing note', () => {
    const { note: _, ...rest } = valid;
    expect(isPlanSelectReceipt(rest)).toBe(false);
  });

  it('rejects non-string selectedBy', () => {
    expect(isPlanSelectReceipt({ ...valid, selectedBy: 123 })).toBe(false);
  });
});

// ── isPlanSelectedPointer ────────────────────────────────────────────────────

describe('isPlanSelectedPointer', () => {
  const valid: PlanSelectedPointer = {
    receiptPath: '.roadmap/receipts/plan-select-abc123.json',
    headSha: 'abc123def456',
    candidateId: 'plan-v1',
    timestamp: '2026-02-28T00:00:00.000Z',
  };

  it('accepts a valid pointer', () => {
    expect(isPlanSelectedPointer(valid)).toBe(true);
  });

  it('rejects null', () => {
    expect(isPlanSelectedPointer(null)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(isPlanSelectedPointer('string')).toBe(false);
  });

  it('rejects missing receiptPath', () => {
    const { receiptPath: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });

  it('rejects missing headSha', () => {
    const { headSha: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });

  it('rejects missing candidateId', () => {
    const { candidateId: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });

  it('rejects missing timestamp', () => {
    const { timestamp: _, ...rest } = valid;
    expect(isPlanSelectedPointer(rest)).toBe(false);
  });
});

// ── planSelectReceiptPath ────────────────────────────────────────────────────

describe('planSelectReceiptPath', () => {
  it('uses first 12 chars of headSha', () => {
    const sha = 'abcdef123456789full';
    const path = planSelectReceiptPath(sha);
    expect(path).toBe('.roadmap/receipts/plan-select-abcdef123456.json');
  });

  it('prefixes with PLAN_SELECT_RECEIPT_DIR', () => {
    const path = planSelectReceiptPath('aabbccddeeff');
    expect(path.startsWith(PLAN_SELECT_RECEIPT_DIR)).toBe(true);
  });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('PLAN_SELECT_RECEIPT_DIR', () => {
    expect(PLAN_SELECT_RECEIPT_DIR).toBe('.roadmap/receipts');
  });

  it('PLAN_SELECTED_POINTER', () => {
    expect(PLAN_SELECTED_POINTER).toBe('.roadmap/PLAN_SELECTED.json');
  });
});
