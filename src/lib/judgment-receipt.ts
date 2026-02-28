// @module judgment-receipt
// @exports IntentJudgmentReceipt, writeJudgmentReceipt, readJudgmentReceipts
// @types IntentJudgmentReceipt, DiagnosisBlock
// @entry roadmap

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface DiagnosisBlock {
  code: string;
  affectedNode: string;
  evidenceIds: string[];
  remediationSteps: string[];
}

export interface IntentJudgmentReceipt {
  evaluationId: string;
  timestamp: string;
  nodeId: string;
  judgment: 'pass' | 'fail';
  confidence: number;
  evidence: string[];
  diagnosisBlocks: DiagnosisBlock[];
}

const JUDGMENTS_PATH = (repoRoot: string) =>
  join(repoRoot, '.roadmap', 'intent-judgments.jsonl');

export function writeJudgmentReceipt(receipt: IntentJudgmentReceipt, repoRoot: string): void {
  const dir = join(repoRoot, '.roadmap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(JUDGMENTS_PATH(repoRoot), JSON.stringify(receipt) + '\n', 'utf-8');
}

export function readJudgmentReceipts(repoRoot: string): IntentJudgmentReceipt[] {
  const path = JUDGMENTS_PATH(repoRoot);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as IntentJudgmentReceipt);
}
