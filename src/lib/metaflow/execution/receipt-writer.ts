// @module metaflow/receipt-writer
// @exports InteractionReceiptWriter

import { writeFileSync } from 'node:fs';
import type { RunId, StepId, InteractionReceipt } from '../types.ts';
import { ensureRunDir, appendReceipt, plainPath, ansiPath } from '../fs.ts';

export class InteractionReceiptWriter {
  private timers = new Map<string, number>();
  private runId: RunId;
  private base: string;
  private headSha: string;

  constructor(runId: RunId, opts: { base?: string; headSha?: string } = {}) {
    this.runId = runId;
    this.base = opts.base ?? process.cwd();
    this.headSha = opts.headSha ?? '';
    ensureRunDir(runId, this.base);
  }

  /** Start timing a step. Call before the operation. */
  begin(stepId: StepId, _cmd: string, _intent: string, _audience: string): void {
    this.timers.set(stepId, Date.now());
  }

  /** Write render snapshots for a step. */
  writeSnapshot(stepId: StepId, plain: string, ansi?: string): void {
    ensureRunDir(this.runId, this.base);
    writeFileSync(plainPath(this.runId, stepId, this.base), plain);
    writeFileSync(ansiPath(this.runId, stepId, this.base), ansi ?? plain);
  }

  /** Commit a receipt. Returns the written receipt. */
  commit(
    stepId: StepId,
    cmd: string,
    intent: string,
    audience: string,
    evidence: { toolCalls: number }
  ): InteractionReceipt {
    const start = this.timers.get(stepId) ?? Date.now();
    const latencyMs = Date.now() - start;
    const pPath = plainPath(this.runId, stepId, this.base);
    const aPath = ansiPath(this.runId, stepId, this.base);

    const receipt: InteractionReceipt = {
      schema_version: 1,
      runId: this.runId,
      stepId,
      cmd,
      intent,
      audience,
      render: {
        plainPath: pPath,
        ansiPath: aPath,
        width: 120,
        emoji: true,
        color: true,
      },
      evidence: {
        headSha: this.headSha,
        toolCalls: evidence.toolCalls,
        latencyMs,
      },
    };

    appendReceipt(this.runId, receipt, this.base);
    return receipt;
  }
}
