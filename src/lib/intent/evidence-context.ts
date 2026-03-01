// @module intent
// @exports IntentEvidenceBinding, EvidenceContextualizer
// @types IntentEvidenceBinding
// @entry roadmap/intent

import type { EvidenceBundle } from '../evidence/schema.ts';

/**
 * IntentEvidenceBinding: terminal intent gate requirement
 * Every terminal intent decision must cite evidence: headSha, diffs, reads, checks
 */
export interface IntentEvidenceBinding {
  intentNodeId: string;
  timestamp: number;

  // Evidence anchor
  evidenceHeadSha: string;
  evidenceBaseSha?: string;
  diffstatCount: number; // how many files changed

  // Evidence summary
  hasReads: boolean;
  hasChecks: boolean;
  checksAllPassed: boolean;

  // Claims that back the intent
  claimsSupported: string[];

  // Decision audit trail
  decision: 'approved' | 'escalated' | 'rejected';
  reason?: string;
}

/**
 * EvidenceContextualizer: adds evidence context to terminal intent decisions
 * Ensures terminal gates cannot be reached without evidence backing
 */
export class EvidenceContextualizer {
  /**
   * contextualizeIntent: create evidence binding for a terminal intent decision
   */
  static contextualizeIntent(
    intentNodeId: string,
    evidence: EvidenceBundle
  ): IntentEvidenceBinding {
    const decision = this.makeDecision(evidence);

    return {
      intentNodeId,
      timestamp: Date.now(),
      evidenceHeadSha: evidence.headSha,
      evidenceBaseSha: evidence.baseSha,
      diffstatCount: evidence.gitDiffs.length,
      hasReads: evidence.reads.length > 0,
      hasChecks: evidence.checks.length > 0,
      checksAllPassed: evidence.checks.length > 0 && evidence.checks.every((c) => c.passed),
      claimsSupported: evidence.entries.map((e) => e.claim),
      decision,
      reason: this.getReason(evidence, decision),
    };
  }

  /**
   * makeDecision: determine if intent is approved, escalated, or rejected based on evidence
   */
  private static makeDecision(
    evidence: EvidenceBundle
  ): 'approved' | 'escalated' | 'rejected' {
    // Rejected: no evidence at all
    if (
      evidence.gitDiffs.length === 0 &&
      evidence.reads.length === 0 &&
      evidence.checks.length === 0
    ) {
      return 'rejected';
    }

    // Rejected: has diffs but no reads or checks (stub-only)
    if (
      evidence.gitDiffs.length > 0 &&
      evidence.reads.length === 0 &&
      evidence.checks.length === 0
    ) {
      return 'rejected';
    }

    // Escalated: has evidence but checks failed
    if (evidence.checks.length > 0 && !evidence.checks.every((c) => c.passed)) {
      return 'escalated';
    }

    // Escalated: has entries (claims) but they're unsupported
    const unsupportedClaims = evidence.entries.filter(
      (e) =>
        (!e.backingEvidence.gitDiffs || e.backingEvidence.gitDiffs.length === 0) &&
        (!e.backingEvidence.reads || e.backingEvidence.reads.length === 0) &&
        (!e.backingEvidence.checks || e.backingEvidence.checks.length === 0)
    );

    if (unsupportedClaims.length > 0) {
      return 'escalated';
    }

    // Approved: has evidence and all checks pass
    return 'approved';
  }

  /**
   * getReason: explain the decision
   */
  private static getReason(
    evidence: EvidenceBundle,
    decision: 'approved' | 'escalated' | 'rejected'
  ): string {
    switch (decision) {
      case 'approved':
        return `Evidence complete: ${evidence.gitDiffs.length} diffs, ${evidence.reads.length} reads, ${evidence.checks.length} checks all passed`;
      case 'rejected':
        if (
          evidence.gitDiffs.length === 0 &&
          evidence.reads.length === 0 &&
          evidence.checks.length === 0
        ) {
          return 'No evidence: empty changeset';
        }
        return 'Insufficient evidence: diffs without reads or checks (stubs only)';
      case 'escalated':
        if (evidence.checks.length > 0 && !evidence.checks.every((c) => c.passed)) {
          return `Check failures: ${evidence.checks.filter((c) => !c.passed).length} of ${evidence.checks.length} failed`;
        }
        return 'Unsupported claims detected';
    }
  }

  /**
   * verify: check if binding is valid and complete
   */
  static verify(binding: IntentEvidenceBinding): { ok: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!binding.intentNodeId) errors.push('Missing intentNodeId');
    if (!binding.evidenceHeadSha) errors.push('Missing evidenceHeadSha');
    if (binding.claimsSupported.length === 0 && binding.checksAllPassed) {
      errors.push('Has passing checks but no supporting claims');
    }

    return {
      ok: errors.length === 0,
      errors,
    };
  }
}
