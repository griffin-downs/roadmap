// @module sgk/render
// @exports shouldRenderHuman, captureRenderedBlock, RenderCapture
// @entry roadmap

// ── Types ────────────────────────────────────────────────────────────────────

export interface RenderCapture {
  type: 'chart' | 'orient' | 'parallel' | 'json';
  content: string;
  byteLength: number;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * True if the current process should emit human-readable output
 * (stdout is a TTY or ROADMAP_HUMAN_MODE=1).
 */
export function shouldRenderHuman(): boolean {
  if (process.env.ROADMAP_HUMAN_MODE === '1') return true;
  return process.stdout.isTTY === true;
}

/**
 * Capture a rendered block for inclusion in a DisplayReceipt.
 * Call after emitting output; content = the rendered string.
 */
export function captureRenderedBlock(type: RenderCapture['type'], content: string): RenderCapture {
  return {
    type,
    content,
    byteLength: Buffer.byteLength(content, 'utf-8'),
  };
}
