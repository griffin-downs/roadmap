// @module emit-gallery
// @exports CandidateResult, FileToIntents, ConvergenceConfig, GalleryFailure, GalleryRunResult, buildFileToIntents, runGallery, CandidateReceipt, GalleryFailureCode, GalleryResult
// @entry roadmap

// Gallery is diversity not retry.
// If all candidates fail the same intent → GalleryFailure with structured evidence.
// maxFixPasses is a per-gate budget after selection, not a generation retry count.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { EmitGalleryNodeSpec, ValidationRule } from '../protocol.ts';
import type { StrategySpec } from './strategies/index.ts';

export interface CandidateResult {
  id: string;
  strategy: string;
  files: Record<string, string>;   // path → content (empty for stub)
  deterministic: {
    tsc: { pass: boolean; errors?: string[] };
    vitest: { pass: boolean; passed: number; failed: number; coverage: number };
    build: { pass: boolean; outputs?: string[] };
  };
  intent: Array<{
    statement: string;
    pass: boolean;
    confidence: number;
    reasoning: string;
    evidence: string[];
  }>;
  summary: {
    loc: number;
    fileCount: number;
    deterministicPass: boolean;
    intentScore: string;        // e.g. "5/6"
    estimatedCost: number;
  };
}

export type FileToIntents = Record<string, string[]>;

export interface ConvergenceConfig {
  maxFixPasses: number;           // per gate budget after selection, default 3
  escalateAfter: 'all-candidates-fail' | 'fix-pass-stall';
  escalateTo: 'human' | 'opus-review';
}

export interface CandidateReceipt {
  candidateId: string;
  sourceNodeId: string;
  producedAt: string;
  pipelineSteps: string[];
}

export type GalleryFailureCode = 'insufficientCandidates' | 'guardRejection' | 'paretoEmpty';

export interface GalleryFailure {
  code: GalleryFailureCode;
  evidence: {
    guard?: string;        // for guardRejection
    check?: string;        // for guardRejection
    evaluated?: number;    // count of candidates evaluated
    reason: string;        // human-readable
  };
}

export type GalleryResult<T> = { ok: true; value: T } | { ok: false; failure: GalleryFailure };

export interface GalleryRunResult {
  candidates: CandidateResult[];
  survivors: CandidateResult[];        // passed deterministic gates
  intentSurvivors: CandidateResult[];  // also passed intent gates
  failures: GalleryFailure[];          // unreachable intents (no candidate satisfied)
  scorecard: string;                   // ASCII table for CLI rendering
}

// Invert intent rule context paths into a file → statements index.
// Only rules with non-empty context are indexed — unindexed files are not substitutable in blend.
export function buildFileToIntents(validateRules: ValidationRule[]): FileToIntents {
  const index: FileToIntents = {};
  for (const rule of validateRules) {
    if (rule.type !== 'intent') continue;
    if (!rule.context || rule.context.length === 0) continue;
    for (const path of rule.context) {
      if (!index[path]) index[path] = [];
      index[path].push(rule.statement);
    }
  }
  return index;
}

// Build ASCII scorecard table from candidates.
function buildScorecard(candidates: CandidateResult[]): string {
  const header = ['Candidate', 'Files', 'LOC', 'tsc', 'vitest', 'build', 'intent', 'cost'];
  const rows: string[][] = candidates.map(c => [
    c.id,
    String(c.summary.fileCount),
    String(c.summary.loc),
    c.deterministic.tsc.pass ? 'pass' : 'FAIL',
    c.deterministic.vitest.pass ? 'pass' : 'FAIL',
    c.deterministic.build.pass ? 'pass' : 'FAIL',
    c.summary.intentScore,
    c.summary.estimatedCost.toFixed(2),
  ]);

  const allRows = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...allRows.map(r => r[i].length)));

  const fmt = (row: string[]) => '| ' + row.map((cell, i) => cell.padEnd(widths[i])).join(' | ') + ' |';
  const sep = '+-' + widths.map(w => '-'.repeat(w)).join('-+-') + '-+';

  return [sep, fmt(header), sep, ...rows.map(fmt), sep].join('\n');
}

// Write CandidateReceipt to .roadmap/receipts/candidate-<candidateId>.json
function writeCandidateReceipt(receipt: CandidateReceipt, repoRoot: string): void {
  const receiptsDir = join(repoRoot, '.roadmap', 'receipts');
  if (!existsSync(receiptsDir)) mkdirSync(receiptsDir, { recursive: true });
  writeFileSync(
    join(receiptsDir, `candidate-${receipt.candidateId}.json`),
    JSON.stringify(receipt, null, 2) + '\n',
  );
}

export async function runGallery(opts: {
  nodeSpec: EmitGalleryNodeSpec;
  strategies: StrategySpec[];
  workDir: string;
  convergence?: ConvergenceConfig;
  _candidates?: CandidateResult[];  // test injection — bypasses stub generation
  repoRoot?: string;                // for writing candidate receipts
}): Promise<GalleryRunResult> {
  const limit = opts.nodeSpec.candidates;
  const selected = opts.strategies.slice(0, limit);

  // Use injected candidates if provided (test path), otherwise stub-generate.
  const candidates: CandidateResult[] = opts._candidates ?? selected.map(strategy => ({
    id: strategy.id,
    strategy: strategy.id,
    files: {},
    deterministic: {
      tsc: { pass: true },
      vitest: { pass: true, passed: 0, failed: 0, coverage: 0 },
      build: { pass: true },
    },
    intent: [],
    summary: {
      loc: 0,
      fileCount: 0,
      deterministicPass: true,
      intentScore: '0/0',
      estimatedCost: strategy.estimatedCostMultiplier,
    },
  }));

  // Write CandidateReceipt for each candidate when repoRoot is provided
  if (opts.repoRoot) {
    for (const candidate of candidates) {
      const receipt: CandidateReceipt = {
        candidateId: candidate.id,
        sourceNodeId: opts.nodeSpec.id,
        producedAt: new Date().toISOString(),
        pipelineSteps: ['strategy-select', 'emit', 'deterministic-gate', 'intent-gate'],
      };
      writeCandidateReceipt(receipt, opts.repoRoot);
    }
  }

  const survivors = candidates.filter(c => c.summary.deterministicPass);
  const intentSurvivors = survivors.filter(c => c.intent.every(i => i.pass));

  // Detect intent statements that failed across ALL candidates.
  // Build map of statement → threshold from nodeSpec.validate intent rules.
  const statementThresholds = new Map<string, number>();
  for (const rule of opts.nodeSpec.validate) {
    if (rule.type === 'intent') {
      statementThresholds.set(rule.statement, rule.confidence);
    }
  }

  const allStatements = new Set<string>();
  for (const candidate of candidates) {
    for (const intent of candidate.intent) {
      allStatements.add(intent.statement);
    }
  }

  const failures: GalleryFailure[] = [];

  for (const stmt of allStatements) {
    const entries = candidates
      .map(c => c.intent.find(i => i.statement === stmt))
      .filter(Boolean) as Array<{ statement: string; pass: boolean; confidence: number; reasoning: string; evidence: string[] }>;

    const allFailed = entries.length === candidates.length && entries.every(e => !e.pass);
    if (!allFailed) continue;

    const bestConfidence = Math.max(...entries.map(e => e.confidence));
    const threshold = statementThresholds.get(stmt) ?? 0.9;
    const reason = entries[0]?.reasoning
      ? `all ${candidates.length} candidates: ${entries[0].reasoning}`
      : `all ${candidates.length} candidates failed intent check`;

    failures.push({
      code: 'guardRejection',
      evidence: {
        guard: stmt,
        check: `confidence ${bestConfidence.toFixed(2)} < threshold ${threshold}`,
        evaluated: candidates.length,
        reason,
      },
    });
  }

  const scorecard = buildScorecard(candidates);

  return { candidates, survivors, intentSurvivors, failures, scorecard };
}
