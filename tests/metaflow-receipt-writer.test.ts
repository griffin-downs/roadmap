import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InteractionReceiptWriter } from '../src/lib/metaflow/execution/receipt-writer.ts';
import { readReceipts, plainPath, ansiPath } from '../src/lib/metaflow/fs.ts';
import type { RunId, StepId } from '../src/lib/metaflow/types.ts';
import { isReceiptRequired, COMMAND_REGISTRY } from '../src/lib/metaflow/command-registry.ts';

const TMP = join(__dirname, '__tmp_receipt_writer');
const RUN_ID = 'test-run-001' as RunId;
const STEP = 'step-orient' as StepId;

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('InteractionReceiptWriter', () => {
  it('constructor creates run directory', () => {
    new InteractionReceiptWriter(RUN_ID, { base: TMP });
    const renderDir = join(TMP, '.roadmap', 'metaflow', 'runs', RUN_ID, 'render');
    expect(existsSync(renderDir)).toBe(true);
  });

  it('writeSnapshot creates plain and ansi files', () => {
    const w = new InteractionReceiptWriter(RUN_ID, { base: TMP });
    w.writeSnapshot(STEP, 'plain text', 'ansi text');
    expect(readFileSync(plainPath(RUN_ID, STEP, TMP), 'utf8')).toBe('plain text');
    expect(readFileSync(ansiPath(RUN_ID, STEP, TMP), 'utf8')).toBe('ansi text');
  });

  it('writeSnapshot falls back to plain when ansi omitted', () => {
    const w = new InteractionReceiptWriter(RUN_ID, { base: TMP });
    w.writeSnapshot(STEP, 'plain only');
    expect(readFileSync(ansiPath(RUN_ID, STEP, TMP), 'utf8')).toBe('plain only');
  });

  it('commit writes receipt to interactions.ndjson', () => {
    const w = new InteractionReceiptWriter(RUN_ID, { base: TMP, headSha: 'abc123' });
    w.begin(STEP, 'orient', 'check position', 'agent');
    w.writeSnapshot(STEP, 'snapshot');
    const receipt = w.commit(STEP, 'orient', 'check position', 'agent', { toolCalls: 3 });

    expect(receipt.schema_version).toBe(1);
    expect(receipt.runId).toBe(RUN_ID);
    expect(receipt.stepId).toBe(STEP);
    expect(receipt.cmd).toBe('orient');
    expect(receipt.intent).toBe('check position');
    expect(receipt.audience).toBe('agent');
    expect(receipt.evidence.headSha).toBe('abc123');
    expect(receipt.evidence.toolCalls).toBe(3);
    expect(receipt.evidence.latencyMs).toBeGreaterThanOrEqual(0);
    expect(receipt.render.width).toBe(120);
    expect(receipt.render.emoji).toBe(true);
    expect(receipt.render.color).toBe(true);

    const receipts = readReceipts(RUN_ID, TMP);
    expect(receipts).toHaveLength(1);
    expect(receipts[0].stepId).toBe(STEP);
  });

  it('commit without begin uses current time', () => {
    const w = new InteractionReceiptWriter(RUN_ID, { base: TMP });
    const receipt = w.commit(STEP, 'chart', 'show progress', 'user', { toolCalls: 1 });
    expect(receipt.evidence.latencyMs).toBeGreaterThanOrEqual(0);
    expect(receipt.evidence.latencyMs).toBeLessThan(100);
  });

  it('multiple commits append to ndjson', () => {
    const w = new InteractionReceiptWriter(RUN_ID, { base: TMP });
    w.commit('s1' as StepId, 'cmd1', 'i1', 'a1', { toolCalls: 1 });
    w.commit('s2' as StepId, 'cmd2', 'i2', 'a2', { toolCalls: 2 });
    const receipts = readReceipts(RUN_ID, TMP);
    expect(receipts).toHaveLength(2);
    expect(receipts[0].stepId).toBe('s1');
    expect(receipts[1].stepId).toBe('s2');
  });
});

describe('command-registry', () => {
  it('isReceiptRequired returns true for receipt-required commands', () => {
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'ask'])).toBe(true);
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'step'])).toBe(true);
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'wrap'])).toBe(true);
  });

  it('isReceiptRequired returns false for non-receipt commands', () => {
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'init'])).toBe(false);
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'dispatch'])).toBe(false);
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'gantt'])).toBe(false);
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'mine'])).toBe(false);
  });

  it('isReceiptRequired returns false for unknown commands', () => {
    expect(isReceiptRequired(['node', 'roadmap', 'mf', 'unknown'])).toBe(false);
    expect(isReceiptRequired(['node', 'roadmap'])).toBe(false);
  });

  it('COMMAND_REGISTRY has expected keys', () => {
    expect(Object.keys(COMMAND_REGISTRY)).toContain('mf ask');
    expect(Object.keys(COMMAND_REGISTRY)).toContain('mf step');
    expect(Object.keys(COMMAND_REGISTRY)).toContain('mf init');
  });
});
