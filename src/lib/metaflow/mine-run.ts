// @module metaflow/mine-run
// @exports mineRun, miningExists

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mine } from './miner.ts';
import { readReceipts, readSessions, runDir } from './fs.ts';
import type { RunId, MiningResult } from './types.ts';

export function mineRun(runId: RunId, base = process.cwd()): MiningResult {
  const receipts = readReceipts(runId, base);
  const sessions = readSessions(runId, base);

  // Optional: regent hooks.log
  const hooksLogPath = join(homedir(), '.claude', 'regent', 'hooks.log');
  const hooksLog = existsSync(hooksLogPath) ? hooksLogPath : undefined;

  const result = mine(receipts, sessions, hooksLog);

  // Write mining.json to run dir
  writeFileSync(
    join(runDir(runId, base), 'mining.json'),
    JSON.stringify(result, null, 2)
  );

  return result;
}

/** Check if mining.json exists for a run. Used by mf complete gate. */
export function miningExists(runId: RunId, base = process.cwd()): boolean {
  return existsSync(join(runDir(runId, base), 'mining.json'));
}
