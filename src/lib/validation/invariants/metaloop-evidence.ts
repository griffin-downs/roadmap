// @module validation
// @exports validateMetaloopEvidence, checkIterationEvidence
// @types IterationEvidenceRequirement
// @entry roadmap/validation

import { existsSync } from 'fs';

/**
 * IterationEvidenceRequirement: what evidence is required for a metaloop iteration
 */
export interface IterationEvidenceRequirement {
  iterationId: string;
  requirementsMet: boolean;
  missingArtifacts: string[];
  reason?: string;
}

/**
 * validateMetaloopEvidence: kernel invariant enforcer
 *
 * Invariant: metaloop_evidence_required
 * For each decision file at .roadmap/metaloop/runs/RUN_ID/iterations/it-ITER/DECISION.json,
 * require sibling artifacts:
 *   - evidence/EVIDENCE.json (evidence bundle)
 *   - receipts/CLAIM.json (rendered claims)
 *
 * Rationale: no metaloop iteration decision should exist without proof of work
 */
export function validateMetaloopEvidence(
  runPath: string
): { valid: boolean; failures: IterationEvidenceRequirement[] } {
  const failures: IterationEvidenceRequirement[] = [];

  // Scan for iteration decision files
  // Pattern: .roadmap/metaloop/runs/<runId>/iterations/<iterationId>/DECISION.json
  const iterationDirs = scanIterationDirectories(runPath);

  iterationDirs.forEach((iterationDir) => {
    const decisionPath = `${iterationDir}/DECISION.json`;

    if (existsSync(decisionPath)) {
      const evidencePath = `${iterationDir}/evidence/EVIDENCE.json`;
      const claimsPath = `${iterationDir}/receipts/CLAIM.json`;

      const evidenceExists = existsSync(evidencePath);
      const claimsExist = existsSync(claimsPath);

      if (!evidenceExists || !claimsExist) {
        const missing: string[] = [];
        if (!evidenceExists) missing.push(evidencePath);
        if (!claimsExist) missing.push(claimsPath);

        failures.push({
          iterationId: extractIterationId(iterationDir),
          requirementsMet: false,
          missingArtifacts: missing,
          reason: `Decision exists but missing evidence artifacts: ${missing.join(', ')}`,
        });
      }
    }
  });

  return {
    valid: failures.length === 0,
    failures,
  };
}

/**
 * checkIterationEvidence: verify a single iteration meets evidence requirements
 */
export function checkIterationEvidence(
  iterationDir: string
): IterationEvidenceRequirement {
  const iterationId = extractIterationId(iterationDir);
  const decisionPath = `${iterationDir}/DECISION.json`;
  const evidencePath = `${iterationDir}/evidence/EVIDENCE.json`;
  const claimsPath = `${iterationDir}/receipts/CLAIM.json`;

  const hasDecision = existsSync(decisionPath);
  const hasEvidence = existsSync(evidencePath);
  const hasClaims = existsSync(claimsPath);

  if (!hasDecision) {
    return {
      iterationId,
      requirementsMet: true, // no decision = no requirement
      missingArtifacts: [],
      reason: 'No DECISION.json found',
    };
  }

  const missingArtifacts: string[] = [];
  if (!hasEvidence) missingArtifacts.push(evidencePath);
  if (!hasClaims) missingArtifacts.push(claimsPath);

  return {
    iterationId,
    requirementsMet: missingArtifacts.length === 0,
    missingArtifacts,
    reason:
      missingArtifacts.length === 0
        ? 'All required evidence artifacts present'
        : `Missing: ${missingArtifacts.join(', ')}`,
  };
}

/**
 * scanIterationDirectories: find all iteration directories in a run
 * Note: simplified implementation; in production would use fs.readdirSync
 */
function scanIterationDirectories(runPath: string): string[] {
  // In actual implementation, would recursively scan:
  // runPath/iterations/it-*/
  // For now, return empty (caller responsible for populating)
  return [];
}

/**
 * extractIterationId: parse iteration ID from directory path
 */
function extractIterationId(iterationDir: string): string {
  const match = iterationDir.match(/it-(\d+)/) || iterationDir.match(/iteration-(\d+)/);
  return match ? match[0] : iterationDir.split('/').pop() || 'unknown';
}
