// @module dispatch-receipt
// @exports DispatchReceipt, writeDispatchReceipt, loadDispatchReceipt, validateDispatchFreshness
// @types DispatchReceipt, AgentAssignment
// @entry roadmap

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface AgentAssignment {
  agentId: string;
  nodeId: string;
  produces: string[];
}

export interface DispatchReceipt {
  batchId: string;
  orientSha: string;
  timestamp: string;
  agentAssignments: AgentAssignment[];
}

export function writeDispatchReceipt(receipt: DispatchReceipt, repoRoot: string): string {
  const dir = join(repoRoot, '.roadmap', 'receipts');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `dispatch-${receipt.batchId}.json`);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n', 'utf-8');
  return path;
}

export function loadDispatchReceipt(batchId: string, repoRoot: string): DispatchReceipt | null {
  const path = join(repoRoot, '.roadmap', 'receipts', `dispatch-${batchId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as DispatchReceipt;
}

/** Returns error string if receipt is stale (orientSha mismatch), undefined if fresh. */
export function validateDispatchFreshness(receipt: DispatchReceipt, currentOrientSha: string): string | undefined {
  if (receipt.orientSha !== currentOrientSha) {
    return `dispatch receipt stale: receipt orientSha=${receipt.orientSha}, current=${currentOrientSha}`;
  }
}
