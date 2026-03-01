// @module evidence
// @exports EvidenceBundle, GitDiffItem, FileReadProof, CheckResult, EvidenceEntry
// @types EvidenceBundle, GitDiffItem, FileReadProof, CheckResult, EvidenceEntry
// @entry roadmap/evidence

/**
 * Git diff item: represents a single file change in git history
 */
export interface GitDiffItem {
  file: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
}

/**
 * File read proof: evidence that a file was consulted during work
 */
export interface FileReadProof {
  path: string;
  timestamp: number;
  lineCount?: number;
}

/**
 * Check result: evidence of tests, lint, typecheck, or build
 */
export interface CheckResult {
  type: 'test' | 'lint' | 'typecheck' | 'build' | 'custom';
  name: string;
  passed: boolean;
  duration?: number;
  timestamp?: number;
}

/**
 * Evidence entry: a claim and the evidence that backs it
 */
export interface EvidenceEntry {
  claim: string;
  backingEvidence: {
    gitDiffs?: GitDiffItem[];
    reads?: FileReadProof[];
    checks?: CheckResult[];
  };
}

/**
 * EvidenceBundle: complete record of work done with evidence backing
 *
 * Prevents hallucination-style transcripts by requiring:
 * - Git diffs showing what was actually changed
 * - File reads showing what was consulted
 * - Check results showing what was verified
 * - Claims explicitly backed by evidence
 */
export interface EvidenceBundle {
  schema_version: 1;
  timestamp: number;
  headSha: string; // git commit hash at time of evidence collection
  baseSha?: string; // optional: commit to diff against

  // Raw evidence
  gitDiffs: GitDiffItem[];
  reads: FileReadProof[];
  checks: CheckResult[];

  // Explicit claim-to-evidence mapping
  entries: EvidenceEntry[];

  // Metadata for tracking
  metadata?: {
    agent?: string;
    session?: string;
    intent?: string;
  };
}

/**
 * Validation helpers for evidence bundle
 */
export function isValidEvidenceBundle(bundle: unknown): bundle is EvidenceBundle {
  if (typeof bundle !== 'object' || bundle === null) return false;
  const b = bundle as Record<string, unknown>;

  return (
    typeof b.schema_version === 'number' &&
    b.schema_version === 1 &&
    typeof b.timestamp === 'number' &&
    typeof b.headSha === 'string' &&
    Array.isArray(b.gitDiffs) &&
    Array.isArray(b.reads) &&
    Array.isArray(b.checks) &&
    Array.isArray(b.entries)
  );
}

/**
 * Detectors for evidence adequacy
 */
export function hasAnyChanges(bundle: EvidenceBundle): boolean {
  return bundle.gitDiffs.length > 0;
}

export function hasAnyReads(bundle: EvidenceBundle): boolean {
  return bundle.reads.length > 0;
}

export function hasAnyChecks(bundle: EvidenceBundle): boolean {
  return bundle.checks.length > 0;
}

export function allChecksPass(bundle: EvidenceBundle): boolean {
  return bundle.checks.length > 0 && bundle.checks.every((c) => c.passed);
}
