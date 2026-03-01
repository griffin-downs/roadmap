// @module metaloop
// @exports integrateEvidenceCollection, recordIterationEvidence
// @types IterationEvidenceRecord
// @entry roadmap/metaloop

import { collectEvidence } from '../evidence/collect.js';
import { ClaimRenderer } from '../claims/render.js';
import type { EvidenceBundle } from '../evidence/schema.js';

/**
 * IterationEvidenceRecord: evidence collected during a single metaloop iteration
 */
export interface IterationEvidenceRecord {
  iterationId: string;
  timestamp: number;
  beforeSha: string;
  afterSha: string;
  evidence: EvidenceBundle;
  claimsRendered: string[];
  violations: Array<{
    type: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>;
}

/**
 * integrateEvidenceCollection: wire evidence collection into metaloop iteration
 * Called at the end of each iteration to collect and validate work
 */
export function integrateEvidenceCollection(
  repoRoot: string,
  iterationId: string,
  beforeSha: string,
  afterSha: string,
  readPaths: string[] = []
): IterationEvidenceRecord {
  // Collect evidence of changes in this iteration
  const evidence = collectEvidence(repoRoot, beforeSha, afterSha, readPaths);

  // Render claims: only claims with evidence backing are included
  const renderer = new ClaimRenderer(evidence);
  const renderResult = renderer.render();

  return {
    iterationId,
    timestamp: Date.now(),
    beforeSha,
    afterSha,
    evidence,
    claimsRendered: renderResult.claims,
    violations: renderResult.violations,
  };
}

/**
 * recordIterationEvidence: persist iteration evidence for audit trail
 */
export function recordIterationEvidence(
  record: IterationEvidenceRecord,
  outputPath: string
): void {
  // In actual implementation, would write to outputPath
  // For now, this is a contract definition
}

/**
 * getMetaloopEvidencePath: compute the path for metaloop evidence storage
 * Pattern: .roadmap/metaloop/runs/<runId>/iterations/<iterationId>/evidence/EVIDENCE.json
 */
export function getMetaloopEvidencePath(runId: string, iterationId: string): string {
  return `.roadmap/metaloop/runs/${runId}/iterations/${iterationId}/evidence/EVIDENCE.json`;
}

/**
 * getMetaloopClaimsPath: compute the path for metaloop claims storage
 * Pattern: .roadmap/metaloop/runs/<runId>/iterations/<iterationId>/receipts/CLAIM.json
 */
export function getMetaloopClaimsPath(runId: string, iterationId: string): string {
  return `.roadmap/metaloop/runs/${runId}/iterations/${iterationId}/receipts/CLAIM.json`;
}
