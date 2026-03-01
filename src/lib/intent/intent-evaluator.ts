// @module intent-evaluator
// @exports recordEvaluation, readEvaluations, loadContextFiles, judgment-receipt
// @types IntentEvaluationRecord
// @entry roadmap

// Intent evaluation is performed BY the calling LLM, not by roadmap.
// Workflow:
//   1. roadmap complete <node>  → runs deterministic validators; intent rules appear
//      in output as { intentStatus: 'unevaluated', statement, contextPaths, threshold }
//   2. LLM reads the listed context files, evaluates each intent statement
//   3. roadmap complete <node> --evaluate '[{"statement":"...","confidence":0.9,"reasoning":"..."}]'
//      → validateNode looks up each intent rule in the provided judgments,
//        validates confidence >= threshold, records to audit trail

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IntentJudgment } from '../protocol.ts';
export type { IntentJudgmentReceipt, DiagnosisBlock } from './judgment-receipt.ts';
export { writeJudgmentReceipt, readJudgmentReceipts } from './judgment-receipt.ts';

// Audit record appended on each successful --evaluate run.
export interface IntentEvaluationRecord {
  nodeId: string;
  statement: string;
  evaluator: 'self' | 'council';
  confidence: number;
  reasoning: string;
  evidence: string[];
  threshold: number;
  pass: boolean;
  evaluatedAt: string;
}

// ── Context file loading ──────────────────────────────────────────────────────
// Surfaces the files the LLM needs to read. Used in `roadmap intent <node>`
// output and in the unevaluated intent check entries.

export function loadContextFiles(
  paths: string[],
  repoRoot: string,
): Array<{ path: string; content: string }> {
  const result: Array<{ path: string; content: string }> = [];
  for (const p of paths) {
    const fullPath = join(repoRoot, p);
    if (!existsSync(fullPath)) continue;
    try {
      result.push({ path: p, content: readFileSync(fullPath, 'utf-8') });
    } catch {
      // skip unreadable files
    }
  }
  return result;
}

// ── Audit trail ───────────────────────────────────────────────────────────────
// Append-only JSONL at .roadmap/evaluations/<nodeId>.jsonl.
// Written after successful --evaluate runs as governance evidence.

export function recordEvaluation(
  nodeId: string,
  record: IntentEvaluationRecord,
  repoRoot: string,
): void {
  const dir = join(repoRoot, '.roadmap', 'evaluations');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, `${nodeId}.jsonl`), JSON.stringify(record) + '\n', 'utf-8');
}

export function readEvaluations(nodeId: string, repoRoot: string): IntentEvaluationRecord[] {
  const path = join(repoRoot, '.roadmap', 'evaluations', `${nodeId}.jsonl`);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trim().split('\n').filter(Boolean)
    .map(line => JSON.parse(line) as IntentEvaluationRecord);
}

// ── Judgment → record ─────────────────────────────────────────────────────────

export function judgmentToRecord(
  nodeId: string,
  judgment: IntentJudgment,
  evaluator: 'self' | 'council',
  threshold: number,
): IntentEvaluationRecord {
  return {
    nodeId,
    statement: judgment.statement,
    evaluator,
    confidence: judgment.confidence,
    reasoning: judgment.reasoning,
    evidence: judgment.evidence ?? [],
    threshold,
    pass: judgment.confidence >= threshold,
    evaluatedAt: new Date().toISOString(),
  };
}
