// @module metaflow/active-run
// @exports ActiveRun, writeActiveRun, readActiveRun, clearActiveRun

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { RunId } from '../types.ts';

export interface ActiveRun {
  schema_version: 1;
  runId: RunId;
  stage: string;
  startedAt: string;
  sessionIds: string[];
}

const ACTIVE_RUN_PATH = '.roadmap/metaflow/active-run.json';

export function writeActiveRun(run: ActiveRun, base = process.cwd()): void {
  const p = join(base, ACTIVE_RUN_PATH);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(run, null, 2));
}

export function readActiveRun(base = process.cwd()): ActiveRun | null {
  const p = join(base, ACTIVE_RUN_PATH);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as ActiveRun;
  } catch {
    return null;
  }
}

export interface ClearOpts {
  requireMiningExists?: boolean;
  requireAuditReceipt?: boolean;
}

export function clearActiveRun(base = process.cwd(), opts: ClearOpts = {}): void {
  const p = join(base, ACTIVE_RUN_PATH);
  if (!existsSync(p)) return;

  const run = readActiveRun(base);
  if (!run) return;

  if (opts.requireMiningExists) {
    const miningPath = join(base, '.roadmap', 'metaflow', 'runs', run.runId, 'mining.json');
    if (!existsSync(miningPath)) {
      throw new Error(`ACTIVE_RUN_NOT_CLEARABLE: mining.json missing for run ${run.runId}`);
    }
  }

  if (opts.requireAuditReceipt) {
    const receiptsDir = join(base, '.roadmap', 'receipts');
    if (!existsSync(receiptsDir)) {
      throw new Error(`ACTIVE_RUN_NOT_CLEARABLE: no receipts directory for run ${run.runId}`);
    }
    // Check for audit receipt matching this runId
    const files = readdirSync(receiptsDir) as string[];
    const hasAuditReceipt = files.some((f: string) => f.startsWith('audit-') && f.endsWith('.json'));
    if (!hasAuditReceipt) {
      throw new Error(`ACTIVE_RUN_NOT_CLEARABLE: no audit receipt for run ${run.runId}`);
    }
  }

  unlinkSync(p);
}
