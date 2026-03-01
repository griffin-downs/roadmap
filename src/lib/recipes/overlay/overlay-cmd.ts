// @module overlay-cmd
// @exports runOverlayFromIntake, OverlayFromIntakeOptions
// @entry roadmap

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { OverlayRecord, OverlayReceipt } from './overlay.ts';
import type { IntakeRecord, ProposedNodeSpec } from './intake.ts';
import type { CandidateNode } from './overlay.ts';
import { OVERLAY_DIR } from './overlay.ts';
import { INTAKE_DIR } from './intake.ts';

export interface OverlayFromIntakeOptions {
  intakeId: string;
  repoRoot: string;
  headSha: string;
  treeSha: string;
}

/** Build an OverlayRecord from an existing IntakeRecord, write to .roadmap/overlays/. */
export function runOverlayFromIntake(options: OverlayFromIntakeOptions): OverlayRecord {
  const { intakeId, repoRoot, headSha, treeSha } = options;

  // Read intake record
  const intakePath = join(repoRoot, INTAKE_DIR, `${intakeId}.json`);
  if (!existsSync(intakePath)) {
    throw new Error(`Intake record not found: ${intakePath}`);
  }
  const intake: IntakeRecord = JSON.parse(readFileSync(intakePath, 'utf-8'));

  // Map ProposedNodeSpec → CandidateNode
  const candidateNodes: CandidateNode[] = intake.proposedNodes.map(
    (pn: ProposedNodeSpec, idx: number): CandidateNode => ({
      id: pn.id,
      desc: pn.desc,
      produces: pn.produces,
      consumes: pn.consumes,
      deps: pn.deps,
      sourceIntakeId: intakeId,
      clusterIndex: idx,
    }),
  );

  // Overlay ID: deterministic from intake + head
  const overlayId = createHash('sha256')
    .update(`${intakeId}:${headSha}`)
    .digest('hex');

  const record: OverlayRecord = {
    overlayId,
    intakeId,
    headSha,
    treeSha,
    timestamp: new Date().toISOString(),
    candidateNodes,
    applied: false,
  };

  // Write overlay
  const overlayDir = join(repoRoot, OVERLAY_DIR);
  if (!existsSync(overlayDir)) mkdirSync(overlayDir, { recursive: true });
  const overlayPath = join(overlayDir, `intake-${intakeId}.json`);
  writeFileSync(overlayPath, JSON.stringify(record, null, 2) + '\n');

  // Write receipt
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  const sha6 = overlayId.slice(0, 6);
  const receipt: OverlayReceipt = {
    schemaVersion: 1,
    receiptType: 'plan-overlay',
    overlayId,
    intakeId,
    headSha,
    treeSha,
    candidateCount: candidateNodes.length,
    timestamp: record.timestamp,
  };
  writeFileSync(
    join(receiptsDir, `overlay-${sha6}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
  );

  return record;
}
