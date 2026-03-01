// @module metaflow/wrap
// @exports wrapSubcommand

import { spawnSync } from 'node:child_process';
import { SessionStore } from '../state/session-store.ts';
import { InteractionReceiptWriter } from './receipt-writer.ts';
import type { RunId, StepId } from '../types.ts';

export interface WrapResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  receiptCommitted: boolean;
}

export function wrapSubcommand(opts: {
  runId: RunId;
  stepId: StepId;
  cmd: string;
  intent?: string;
  base?: string;
  headSha?: string;
}): WrapResult {
  const { runId, stepId, cmd, intent = 'Wrapped subcommand', base, headSha = '' } = opts;

  // 1. Validate session binding
  const store = new SessionStore(runId, { base });
  store.validate(); // throws SESSION_BINDING_MISSING if no sessions

  // 2. Begin receipt
  const writer = new InteractionReceiptWriter(runId, { base, headSha });
  writer.begin(stepId, cmd, intent, 'system');

  // 3. Spawn subprocess — inject --mf-run for roadmap subcommands
  const argv = cmd.split(' ');
  const isRoadmapCmd = argv[0] === 'roadmap' || argv[0]?.endsWith('roadmap');
  const finalCmd = isRoadmapCmd ? `${cmd} --mf-run ${runId}` : cmd;

  const result = spawnSync(finalCmd, { shell: true, encoding: 'utf8' });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';

  // 4. Write snapshot + commit receipt
  writer.writeSnapshot(stepId, stderr || stdout, undefined);
  const receipt = writer.commit(stepId, cmd, intent, 'system', { toolCalls: 0 });

  return {
    exitCode: result.status ?? 0,
    stdout,
    stderr,
    receiptCommitted: !!receipt,
  };
}
