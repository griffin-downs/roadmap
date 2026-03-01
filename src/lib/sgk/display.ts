// @module sgk/display
// @exports writeDisplay, DisplayOpts
// @entry roadmap

import { writeDisplayReceipt } from './receipts/display.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DisplayOpts {
  runId: string;
  repoRoot: string;
  cmd: string;
  humanMode: boolean;
  blocks: Array<{ type: 'chart' | 'orient' | 'parallel' | 'json'; content: string }>;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Write a DisplayReceipt for a rendered command output.
 * Stamp = ISO timestamp truncated to seconds.
 */
export function writeDisplay(opts: DisplayOpts): string {
  const now = new Date();
  const displayedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const renderedBlocks = opts.blocks.map(b => ({
    type: b.type,
    content: b.content,
    byteLength: Buffer.byteLength(b.content, 'utf-8'),
  }));

  return writeDisplayReceipt(opts.repoRoot, {
    schema_version: 1,
    type: 'display',
    runId: opts.runId,
    cmd: opts.cmd,
    humanMode: opts.humanMode,
    renderedBlocks,
    displayedAt,
  });
}
