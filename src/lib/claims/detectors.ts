// @module claims
// @exports detectStubOnlyChangeset, detectInsufficientReadProofs, detectNoFakePerf, DetectionResult
// @types DetectionResult
// @entry roadmap/claims

import type { EvidenceBundle } from '../evidence/schema.js';

/**
 * DetectionResult: finding from a detection rule
 */
export interface DetectionResult {
  type:
    | 'stub-only-changeset'
    | 'insufficient-read-proofs'
    | 'no-fake-perf'
    | 'insufficient-evidence'
    | 'unsubstantiated-claims'
    | 'unsubstantiated-claim';
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * detectStubOnlyChangeset: rejects evidence where files are created as stubs without implementation
 *
 * Stub detection criteria:
 * - File added but < 50 bytes, OR
 * - File contains only placeholder comments, OR
 * - No corresponding reads or checks
 */
export function detectStubOnlyChangeset(evidence: EvidenceBundle): DetectionResult[] {
  const violations: DetectionResult[] = [];

  // Check for empty bundle (no actual work)
  if (
    evidence.gitDiffs.length === 0 &&
    evidence.reads.length === 0 &&
    evidence.checks.length === 0
  ) {
    violations.push({
      type: 'stub-only-changeset',
      message: 'Empty evidence: no diffs, reads, or checks',
      severity: 'error',
    });
    return violations;
  }

  // Check for suspicious patterns: added files with no corresponding work
  const addedFiles = evidence.gitDiffs.filter((d) => d.status === 'added');
  const readFiles = new Set(evidence.reads.map((r) => r.path));
  const testedCode = evidence.checks.length > 0;

  addedFiles.forEach((file) => {
    // Added files should either:
    // 1. Have corresponding reads (consulted/reviewed), OR
    // 2. Have test coverage, OR
    // 3. Have meaningful size (> 100 bytes net additions)
    const hasReads = readFiles.has(file.file);
    const hasTests = testedCode;
    const isLargeFile = file.additions > 100;

    if (!hasReads && !hasTests && !isLargeFile) {
      violations.push({
        type: 'stub-only-changeset',
        message: `Stub file detected: ${file.file} (${file.additions} additions, no reads, no tests)`,
        severity: 'warning',
      });
    }
  });

  return violations;
}

/**
 * detectInsufficientReadProofs: rejects claims citing "reviewed" without actual file reads
 *
 * Triggers when:
 * - Evidence entries claim review but no reads recorded, OR
 * - Claimed file not in reads list
 */
export function detectInsufficientReadProofs(evidence: EvidenceBundle): DetectionResult[] {
  const violations: DetectionResult[] = [];

  // Check entries that cite reads but have none
  evidence.entries.forEach((entry) => {
    if (entry.claim.toLowerCase().includes('review')) {
      const hasReads = entry.backingEvidence.reads && entry.backingEvidence.reads.length > 0;
      if (!hasReads) {
        violations.push({
          type: 'insufficient-read-proofs',
          message: `Review claim without read proofs: "${entry.claim}"`,
          severity: 'warning',
        });
      }
    }
  });

  // If reads exist but no entries, warn about unclaimed reads
  if (evidence.reads.length > 0 && evidence.entries.length === 0) {
    violations.push({
      type: 'insufficient-read-proofs',
      message: `Files read (${evidence.reads.length}) but no claims made about them`,
      severity: 'info',
    });
  }

  return violations;
}

/**
 * detectNoFakePerf: rejects performance claims without benchmark evidence
 *
 * Triggers when:
 * - Claim mentions performance, speed, or optimization
 * - No test/check results backing the claim
 */
export function detectNoFakePerf(evidence: EvidenceBundle): DetectionResult[] {
  const violations: DetectionResult[] = [];

  const perfKeywords = ['performance', 'speed', 'optimize', 'faster', 'efficiency', 'throughput'];

  evidence.entries.forEach((entry) => {
    const claimLower = entry.claim.toLowerCase();
    const hasPerfClaim = perfKeywords.some((kw) => claimLower.includes(kw));

    if (hasPerfClaim) {
      const hasChecks = entry.backingEvidence.checks && entry.backingEvidence.checks.length > 0;
      const allChecksPassed =
        hasChecks && entry.backingEvidence.checks!.every((c) => c.passed);

      if (!allChecksPassed) {
        violations.push({
          type: 'no-fake-perf',
          message: `Performance claim without proof: "${entry.claim}"`,
          severity: 'error',
        });
      }
    }
  });

  return violations;
}
