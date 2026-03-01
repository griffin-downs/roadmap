// @module metaflow/self-insert
// @exports ELIGIBLE_COMMANDS, readActiveRun, isEligible, selfInsert

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RunId, StepId } from '../types.ts';
import { wrapSubcommand } from './wrap.ts';

// Commands that mutate DAG state, receipts, dispatch agents, complete nodes,
// perform plan selection, or emit interactive human output.
export const ELIGIBLE_COMMANDS = [
  'orient', 'advance', 'complete', 'chart', 'validate', 'verify',
  'import', 'expand', 'dispatch', 'plan', 'strategy',
  'mf audit', 'mf audit-tail', 'mf wrap', 'mf ask', 'mf step',
];

export interface ActiveRun {
  runId: RunId;
  startedAt: string;
  headSha: string;
}

export function readActiveRun(base = process.cwd()): ActiveRun | null {
  const p = join(base, '.roadmap', 'metaflow', 'active-run.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as ActiveRun;
  } catch {
    return null;
  }
}

export function isEligible(tokens: string[]): boolean {
  const cmd = tokens.join(' ');
  return ELIGIBLE_COMMANDS.some(e => cmd.startsWith(e) || cmd === e);
}

function generateStepId(): StepId {
  return `si-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` as StepId;
}

export function selfInsert(argv: string[], activeRunId: RunId, base = process.cwd()): void {
  const stepId = generateStepId();
  const cmd = argv.join(' ');

  const result = wrapSubcommand({
    runId: activeRunId,
    stepId,
    cmd,
    intent: 'auto-injected by self-insert layer',
    base,
  });

  // Write self-insert receipt
  const receiptsDir = join(base, '.roadmap', 'receipts');
  mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(
    join(receiptsDir, `metaflow-self-insert-${stepId}.json`),
    JSON.stringify({
      schema_version: 1,
      runId: activeRunId,
      stepId,
      cmd,
      exitCode: result.exitCode,
      receiptCommitted: result.receiptCommitted,
      emittedAt: new Date().toISOString(),
    }, null, 2),
  );
}
