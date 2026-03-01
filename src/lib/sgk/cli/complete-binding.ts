// @module sgk/cli/complete-binding
// @exports NodeBinding, bindNodeToRun
// @entry roadmap

import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { readStrategyReceipt } from '../receipts/strategy.js';

export interface NodeBinding {
  runId: string;
  nodeId: string;
  strategyId?: string;
  completedAt: string;
  headSha: string;
}

export function bindNodeToRun(repoRoot: string, runId: string, nodeId: string): string {
  const strategy = readStrategyReceipt(repoRoot, runId);

  let headSha: string;
  try {
    headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    headSha = 'unknown';
  }

  const binding: NodeBinding = {
    runId,
    nodeId,
    strategyId: strategy?.strategyId,
    completedAt: new Date().toISOString(),
    headSha,
  };

  const dir = join(repoRoot, '.roadmap', 'runs', runId, 'nodes');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${nodeId}.json`);
  writeFileSync(path, JSON.stringify(binding, null, 2) + '\n');
  return path;
}
