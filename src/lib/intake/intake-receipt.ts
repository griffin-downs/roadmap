// @module intake-receipt
// @exports isIntakeReceiptValid, writeIntakeReceipt, readIntakeReceipt, verifyIntakeReceiptDeterminism, intakeReceiptPath
// @entry roadmap

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { IntakeRecord, IntakeReceipt } from './intake.ts';
import { INTAKE_RECEIPT_PREFIX, isIntakeReceipt } from './intake.ts';

/** Canonical receipt file path for a given inputHash. */
export function intakeReceiptPath(receiptsDir: string, inputHash: string): string {
  return join(receiptsDir, `${INTAKE_RECEIPT_PREFIX}-${inputHash.slice(0, 6)}.json`);
}

/** Validate receipt matches record: intakeId, fromSha, treeShaSet (sorted), inputHash. */
export function isIntakeReceiptValid(receipt: IntakeReceipt, record: IntakeRecord): boolean {
  if (receipt.intakeId !== record.intakeId) return false;
  if (receipt.fromSha !== record.fromSha) return false;
  if (receipt.inputHash !== record.inputHash) return false;

  const rSorted = [...receipt.treeShaSet].sort();
  const dSorted = [...record.treeShaSet].sort();
  if (rSorted.length !== dSorted.length) return false;
  for (let i = 0; i < rSorted.length; i++) {
    if (rSorted[i] !== dSorted[i]) return false;
  }

  return true;
}

/** Build and write IntakeReceipt from IntakeRecord. Returns written file path. */
export function writeIntakeReceipt(record: IntakeRecord, receiptsDir: string): string {
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });

  const receipt: IntakeReceipt = {
    schemaVersion: 1,
    receiptType: 'intake-absorb',
    intakeId: record.intakeId,
    fromSha: record.fromSha,
    toSha: record.toSha,
    treeShaSet: record.treeShaSet,
    clusterCount: record.detectedClusters.length,
    proposedNodeCount: record.proposedNodes.length,
    inputHash: record.inputHash,
    timestamp: new Date().toISOString(),
  };

  const outPath = intakeReceiptPath(receiptsDir, record.inputHash);
  writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n');
  return outPath;
}

/** Read and parse a receipt file. Returns null if not found or invalid. */
export function readIntakeReceipt(receiptPath: string): IntakeReceipt | null {
  if (!existsSync(receiptPath)) return null;
  try {
    const data = JSON.parse(readFileSync(receiptPath, 'utf-8'));
    return isIntakeReceipt(data) ? data : null;
  } catch {
    return null;
  }
}

/** Recompute inputHash from record.fromSha + record.toSha and verify it matches record.inputHash. */
export function verifyIntakeReceiptDeterminism(record: IntakeRecord): boolean {
  const recomputed = createHash('sha256')
    .update(`${record.fromSha}:${record.toSha ?? 'HEAD'}`)
    .digest('hex');
  return recomputed === record.inputHash;
}
