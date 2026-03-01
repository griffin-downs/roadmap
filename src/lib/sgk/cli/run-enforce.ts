// @module sgk/cli/run-enforce
// @exports RunEnforceResult, requireRunId
// @entry roadmap

import { loadKernel } from '../../kernel-config.js';

export interface RunEnforceResult {
  ok: boolean;
  runId?: string;
  error?: string;
  fix?: string;
}

export function requireRunId(repoRoot: string, args: string[]): RunEnforceResult {
  const kernel = loadKernel(repoRoot);

  // Extract --run <runId> from args
  const idx = args.indexOf('--run');
  const argRunId = idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
  const envRunId = process.env.ROADMAP_RUN_ID;
  const runId = argRunId ?? envRunId;

  if (!kernel.requireRunId) {
    return { ok: true, runId };
  }

  if (!runId) {
    return {
      ok: false,
      error: 'kernel.requireRunId=true but no runId provided',
      fix: 'Pass --run <runId> or set ROADMAP_RUN_ID env var',
    };
  }

  return { ok: true, runId };
}
