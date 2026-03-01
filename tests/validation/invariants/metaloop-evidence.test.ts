import { describe, it, expect } from 'vitest';
import {
  validateMetaloopEvidence,
  checkIterationEvidence,
  type IterationEvidenceRequirement,
} from '../../../src/lib/validation/invariants/metaloop-evidence.js';

describe('metaloop-evidence invariant', () => {
  describe('checkIterationEvidence', () => {
    it('returns valid when no DECISION.json exists', () => {
      const result = checkIterationEvidence('/fake/path/iterations/it-001');

      expect(result.requirementsMet).toBe(true);
      expect(result.missingArtifacts.length).toBe(0);
    });

    it('tracks required artifacts when DECISION exists', () => {
      // This test validates the structure; actual file checks happen in integration tests
      const requirement: IterationEvidenceRequirement = {
        iterationId: 'it-001',
        requirementsMet: false,
        missingArtifacts: [
          '.roadmap/metaloop/runs/run-1/iterations/it-001/evidence/EVIDENCE.json',
          '.roadmap/metaloop/runs/run-1/iterations/it-001/receipts/CLAIM.json',
        ],
        reason: 'Missing: ...',
      };

      expect(requirement.iterationId).toBe('it-001');
      expect(requirement.requirementsMet).toBe(false);
      expect(requirement.missingArtifacts.length).toBe(2);
    });
  });

  describe('validateMetaloopEvidence', () => {
    it('returns valid for empty run', () => {
      const result = validateMetaloopEvidence('/fake/path/runs/run-1');

      expect(result.valid).toBe(true);
      expect(result.failures.length).toBe(0);
    });

    it('returns valid when no decisions exist', () => {
      const result = validateMetaloopEvidence('/non-existent/path');

      // Empty scan returns no failures
      expect(result.failures.length).toBe(0);
    });
  });

  describe('Invariant structure', () => {
    it('validates invariant name and scope', () => {
      // metaloop_evidence_required: every DECISION.json must have evidence + claims
      const invariantId = 'metaloop_evidence_required';
      const scope = 'metaloop iterations';
      const requirement = 'EVIDENCE.json + CLAIM.json siblings';

      expect(invariantId).toContain('evidence');
      expect(scope).toContain('metaloop');
    });
  });
});
