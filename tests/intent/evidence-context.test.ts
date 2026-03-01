import { describe, it, expect } from 'vitest';
import { EvidenceContextualizer, type IntentEvidenceBinding } from '../../src/lib/intent/evidence-context.js';
import type { EvidenceBundle } from '../../src/lib/evidence/schema.js';

describe('EvidenceContextualizer', () => {
  const emptyEvidence: EvidenceBundle = {
    schema_version: 1,
    timestamp: Date.now(),
    headSha: 'abc123',
    gitDiffs: [],
    reads: [],
    checks: [],
    entries: [],
  };

  describe('contextualizeIntent', () => {
    it('creates binding for empty evidence', () => {
      const binding = EvidenceContextualizer.contextualizeIntent('intent-001', emptyEvidence);

      expect(binding.intentNodeId).toBe('intent-001');
      expect(binding.evidenceHeadSha).toBe('abc123');
      expect(binding.decision).toBe('rejected');
    });

    it('rejects stub-only changesets', () => {
      const evidence: EvidenceBundle = {
        ...emptyEvidence,
        gitDiffs: [{ file: 'stub.ts', status: 'added', additions: 10, deletions: 0 }],
      };

      const binding = EvidenceContextualizer.contextualizeIntent('intent-001', evidence);

      expect(binding.decision).toBe('rejected');
      expect(binding.reason).toContain('Insufficient evidence');
    });

    it('escalates on failed checks', () => {
      const evidence: EvidenceBundle = {
        ...emptyEvidence,
        gitDiffs: [{ file: 'code.ts', status: 'modified', additions: 50, deletions: 10 }],
        checks: [
          { type: 'test', name: 'tests', passed: false },
        ],
      };

      const binding = EvidenceContextualizer.contextualizeIntent('intent-001', evidence);

      expect(binding.decision).toBe('escalated');
      expect(binding.reason).toContain('Check failures');
    });

    it('approves when evidence is complete', () => {
      const evidence: EvidenceBundle = {
        ...emptyEvidence,
        gitDiffs: [{ file: 'code.ts', status: 'modified', additions: 50, deletions: 10 }],
        reads: [{ path: 'spec.md', timestamp: Date.now() }],
        checks: [{ type: 'test', name: 'tests', passed: true }],
      };

      const binding = EvidenceContextualizer.contextualizeIntent('intent-001', evidence);

      expect(binding.decision).toBe('approved');
      expect(binding.hasReads).toBe(true);
      expect(binding.hasChecks).toBe(true);
      expect(binding.checksAllPassed).toBe(true);
    });

    it('tracks claims from entries', () => {
      const evidence: EvidenceBundle = {
        ...emptyEvidence,
        gitDiffs: [{ file: 'code.ts', status: 'added', additions: 100, deletions: 0 }],
        reads: [{ path: 'spec.md', timestamp: Date.now() }],
        entries: [
          {
            claim: 'Implemented feature X',
            backingEvidence: { gitDiffs: [{ file: 'code.ts', status: 'added', additions: 100, deletions: 0 }] },
          },
          {
            claim: 'Reviewed spec',
            backingEvidence: { reads: [{ path: 'spec.md', timestamp: Date.now() }] },
          },
        ],
      };

      const binding = EvidenceContextualizer.contextualizeIntent('intent-001', evidence);

      expect(binding.claimsSupported).toContain('Implemented feature X');
      expect(binding.claimsSupported).toContain('Reviewed spec');
      expect(binding.claimsSupported.length).toBe(2);
    });

    it('escalates on unsupported claims', () => {
      const evidence: EvidenceBundle = {
        ...emptyEvidence,
        gitDiffs: [{ file: 'code.ts', status: 'added', additions: 100, deletions: 0 }],
        reads: [{ path: 'spec.md', timestamp: Date.now() }],
        entries: [
          {
            claim: 'This claim has no evidence',
            backingEvidence: {},
          },
        ],
      };

      const binding = EvidenceContextualizer.contextualizeIntent('intent-001', evidence);

      expect(binding.decision).toBe('escalated');
    });
  });

  describe('verify', () => {
    it('validates complete binding', () => {
      const binding: IntentEvidenceBinding = {
        intentNodeId: 'intent-001',
        timestamp: Date.now(),
        evidenceHeadSha: 'abc123',
        diffstatCount: 2,
        hasReads: true,
        hasChecks: true,
        checksAllPassed: true,
        claimsSupported: ['Claim 1', 'Claim 2'],
        decision: 'approved',
      };

      const result = EvidenceContextualizer.verify(binding);

      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('reports missing intentNodeId', () => {
      const binding: IntentEvidenceBinding = {
        intentNodeId: '',
        timestamp: Date.now(),
        evidenceHeadSha: 'abc123',
        diffstatCount: 2,
        hasReads: true,
        hasChecks: true,
        checksAllPassed: true,
        claimsSupported: ['Claim 1'],
        decision: 'approved',
      };

      const result = EvidenceContextualizer.verify(binding);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('intentNodeId'))).toBe(true);
    });

    it('reports missing evidenceHeadSha', () => {
      const binding: IntentEvidenceBinding = {
        intentNodeId: 'intent-001',
        timestamp: Date.now(),
        evidenceHeadSha: '',
        diffstatCount: 2,
        hasReads: true,
        hasChecks: true,
        checksAllPassed: true,
        claimsSupported: ['Claim 1'],
        decision: 'approved',
      };

      const result = EvidenceContextualizer.verify(binding);

      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes('evidenceHeadSha'))).toBe(true);
    });
  });
});
