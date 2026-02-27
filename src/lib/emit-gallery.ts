// @module emit-gallery
// @exports CandidateResult, FileToIntents, ConvergenceConfig, GalleryFailure, GalleryRunResult, buildFileToIntents, runGallery
// @entry roadmap

// Gallery is diversity not retry.
// If all candidates fail the same intent → GalleryFailure with structured evidence.
// maxFixPasses is a per-gate budget after selection, not a generation retry count.

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

export interface GalleryFailure {
  unreachable: string;            // intent statement no candidate satisfied
  bestConfidence: number;
  threshold: number;
  candidates: number;
  diagnosis: string;              // e.g. "all candidates used @media prefers-color-scheme"
}

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

export async function runGallery(opts: {
  nodeSpec: EmitGalleryNodeSpec;
  strategies: StrategySpec[];
  workDir: string;
  convergence?: ConvergenceConfig;
}): Promise<GalleryRunResult> {
  const limit = opts.nodeSpec.candidates;
  const selected = opts.strategies.slice(0, limit);

  // Stub: generate one CandidateResult per strategy — no real LLM dispatch yet.
  const candidates: CandidateResult[] = selected.map(strategy => ({
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

  const survivors = candidates.filter(c => c.summary.deterministicPass);

  // In stub all intent arrays are empty so no survivor fails an intent check.
  const intentSurvivors = survivors.filter(c => c.intent.every(i => i.pass));

  // No intent statements evaluated → no failures.
  const failures: GalleryFailure[] = [];

  const scorecard = buildScorecard(candidates);

  return { candidates, survivors, intentSurvivors, failures, scorecard };
}
