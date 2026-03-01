// @module metaflow/audit/detectors
// @exports detectStrategyCompliance, detectLatchWithoutStrategy, detectStrategyHeadShaMatch, detectMissingStrategyReceipt

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { DetectorResult } from '../required-schema.ts';

function gitHead(root: string): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf-8' }).trim();
  } catch { return null; }
}

function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function detectLatchWithoutStrategy(root: string): DetectorResult {
  const activePath = join(root, '.roadmap/strategy/active.json');
  const active = readJson(activePath) as { latch?: { latched: boolean }; strategy?: unknown } | null;

  if (!active?.latch?.latched) {
    return { code: 'STRAT-001', passed: true, evidence: ['no active latch — gate not triggered'], fix: [] };
  }

  if (active.strategy) {
    return { code: 'STRAT-001', passed: true, evidence: ['latch present with active strategy — compliant'], fix: [] };
  }

  return {
    code: 'STRAT-001',
    passed: false,
    evidence: ['latch file exists with latched=true but no active strategy selected'],
    fix: ['roadmap strategy auto --note "auto-select"', 'roadmap strategy select <id> --note "reason"'],
  };
}

export function detectStrategyHeadShaMatch(root: string): DetectorResult {
  const receiptsDir = join(root, '.roadmap/receipts');
  if (!existsSync(receiptsDir)) {
    return { code: 'STRAT-002', passed: true, evidence: ['no receipts directory — nothing to check'], fix: [] };
  }

  const head = gitHead(root);
  if (!head) {
    return { code: 'STRAT-002', passed: true, evidence: ['not a git repo — skipping head SHA check'], fix: [] };
  }

  const receiptFiles = readdirSync(receiptsDir).filter(f => f.startsWith('strategy-select-'));
  if (receiptFiles.length === 0) {
    return { code: 'STRAT-002', passed: true, evidence: ['no strategy receipts found — nothing to check'], fix: [] };
  }

  const latest = receiptFiles.sort().pop()!;
  const receipt = readJson(join(receiptsDir, latest)) as { headSha?: string } | null;
  if (!receipt?.headSha) {
    return { code: 'STRAT-002', passed: true, evidence: ['latest receipt has no headSha — skipping'], fix: [] };
  }

  if (receipt.headSha === head) {
    return { code: 'STRAT-002', passed: true, evidence: [`receipt headSha matches git HEAD (${head.slice(0, 8)})`], fix: [] };
  }

  return {
    code: 'STRAT-002',
    passed: false,
    evidence: [`receipt headSha ${receipt.headSha.slice(0, 8)} !== git HEAD ${head.slice(0, 8)}`],
    fix: ['Re-select strategy after recent commits: roadmap strategy auto --note "re-select after HEAD change"'],
  };
}

export function detectMissingStrategyReceipt(root: string): DetectorResult {
  const receiptsDir = join(root, '.roadmap/receipts');
  if (!existsSync(receiptsDir)) {
    return { code: 'STRAT-003', passed: true, evidence: ['no receipts directory'], fix: [] };
  }

  const allReceipts = readdirSync(receiptsDir);
  const hasDispatchOrComplete = allReceipts.some(f =>
    f.startsWith('dispatch-') || f.startsWith('complete-')
  );
  const hasStrategySelect = allReceipts.some(f => f.startsWith('strategy-select-'));

  if (!hasDispatchOrComplete) {
    return { code: 'STRAT-003', passed: true, evidence: ['no dispatch/complete receipts — nothing to match'], fix: [] };
  }

  if (hasStrategySelect) {
    return { code: 'STRAT-003', passed: true, evidence: ['strategy receipt exists alongside dispatch/complete receipts'], fix: [] };
  }

  return {
    code: 'STRAT-003',
    passed: false,
    evidence: ['dispatch/complete receipts exist but no matching strategy-select receipt'],
    fix: ['Select a strategy before dispatch/complete: roadmap strategy auto --note "reason"'],
  };
}

export function detectStrategyCompliance(root: string): DetectorResult[] {
  return [
    detectLatchWithoutStrategy(root),
    detectStrategyHeadShaMatch(root),
    detectMissingStrategyReceipt(root),
  ];
}
