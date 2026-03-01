// @module claims
// @exports ClaimRenderer, RenderResult
// @types RenderResult
// @entry roadmap/claims

import type { EvidenceBundle, EvidenceEntry } from '../evidence/schema.ts';
import { hasAnyChanges, hasAnyReads, hasAnyChecks, allChecksPass } from '../evidence/schema.ts';
import {
  detectStubOnlyChangeset,
  detectInsufficientReadProofs,
  detectNoFakePerf,
  type DetectionResult,
} from './detectors.ts';

/**
 * RenderResult: outcome of claim rendering with evidence backing
 */
export interface RenderResult {
  ok: boolean;
  claims: string[];
  evidence: EvidenceBundle;
  violations: DetectionResult[];
  summary?: string;
}

/**
 * ClaimRenderer: enforces evidence requirements before emitting claims
 * Refuses to render claims without backing, applies detection rules
 */
export class ClaimRenderer {
  constructor(private evidence: EvidenceBundle) {}

  /**
   * render: convert evidence entries to renderable claims
   * Returns empty if evidence is insufficient or violations detected
   */
  render(): RenderResult {
    // Check for evidence adequacy
    const hasEvidence = hasAnyChanges(this.evidence) || hasAnyReads(this.evidence);
    if (!hasEvidence) {
      return {
        ok: false,
        claims: [],
        evidence: this.evidence,
        violations: [
          {
            type: 'insufficient-evidence',
            message: 'No evidence: empty changeset, no reads, no checks',
            severity: 'error',
          },
        ],
        summary: 'Evidence required: no changes, reads, or checks recorded',
      };
    }

    // Apply detectors
    const violations: DetectionResult[] = [];

    violations.push(...detectStubOnlyChangeset(this.evidence));
    violations.push(...detectInsufficientReadProofs(this.evidence));
    violations.push(...detectNoFakePerf(this.evidence));

    // If critical violations, refuse rendering
    const criticalViolations = violations.filter((v) => v.severity === 'error');
    if (criticalViolations.length > 0) {
      return {
        ok: false,
        claims: [],
        evidence: this.evidence,
        violations,
        summary: `Claims blocked: ${criticalViolations.map((v) => v.type).join(', ')}`,
      };
    }

    // Extract claims from entries
    const claims = this.evidence.entries.map((e) => e.claim);

    // Warn if entries have no backing evidence
    const entriesWithoutEvidence = this.evidence.entries.filter(
      (e) =>
        (!e.backingEvidence.gitDiffs || e.backingEvidence.gitDiffs.length === 0) &&
        (!e.backingEvidence.reads || e.backingEvidence.reads.length === 0) &&
        (!e.backingEvidence.checks || e.backingEvidence.checks.length === 0)
    );

    if (entriesWithoutEvidence.length > 0) {
      violations.push({
        type: 'unsubstantiated-claims',
        message: `${entriesWithoutEvidence.length} claim(s) have no backing evidence`,
        severity: 'warning',
      });
    }

    return {
      ok: claims.length > 0 && criticalViolations.length === 0,
      claims,
      evidence: this.evidence,
      violations,
      summary:
        claims.length > 0
          ? `Rendered ${claims.length} claim(s) with evidence backing`
          : 'No claims to render',
    };
  }

  /**
   * renderClaim: render a single claim if evidence supports it
   */
  renderClaim(entry: EvidenceEntry): RenderResult {
    const hasEvidence =
      (entry.backingEvidence.gitDiffs && entry.backingEvidence.gitDiffs.length > 0) ||
      (entry.backingEvidence.reads && entry.backingEvidence.reads.length > 0) ||
      (entry.backingEvidence.checks && entry.backingEvidence.checks.length > 0);

    if (!hasEvidence) {
      return {
        ok: false,
        claims: [],
        evidence: this.evidence,
        violations: [
          {
            type: 'unsubstantiated-claim',
            message: `Claim without evidence: "${entry.claim}"`,
            severity: 'error',
          },
        ],
        summary: 'Claim rejected: no backing evidence',
      };
    }

    return {
      ok: true,
      claims: [entry.claim],
      evidence: this.evidence,
      violations: [],
      summary: `Rendered claim: "${entry.claim}"`,
    };
  }

  /**
   * summary: get evidence summary for analysis
   */
  summary(): {
    hasChanges: boolean;
    hasReads: boolean;
    hasChecks: boolean;
    allChecksPassed: boolean;
    claimCount: number;
  } {
    return {
      hasChanges: hasAnyChanges(this.evidence),
      hasReads: hasAnyReads(this.evidence),
      hasChecks: hasAnyChecks(this.evidence),
      allChecksPassed: allChecksPass(this.evidence),
      claimCount: this.evidence.entries.length,
    };
  }
}
