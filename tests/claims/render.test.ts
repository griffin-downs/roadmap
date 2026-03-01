import { describe, it, expect } from 'vitest';
import { ClaimRenderer, type RenderResult } from '../../src/lib/claims/render.js';
import {
  detectStubOnlyChangeset,
  detectInsufficientReadProofs,
  detectNoFakePerf,
} from '../../src/lib/claims/detectors.js';
import type { EvidenceBundle } from '../../src/lib/evidence/schema.js';

describe('ClaimRenderer', () => {
  const emptyEvidence: EvidenceBundle = {
    schema_version: 1,
    timestamp: Date.now(),
    headSha: 'abc123',
    gitDiffs: [],
    reads: [],
    checks: [],
    entries: [],
  };

  const evidenceWithDiffs: EvidenceBundle = {
    schema_version: 1,
    timestamp: Date.now(),
    headSha: 'abc123',
    gitDiffs: [
      {
        file: 'src/test.ts',
        status: 'added',
        additions: 50,
        deletions: 0,
      },
    ],
    reads: [],
    checks: [],
    entries: [],
  };

  describe('render', () => {
    it('rejects empty evidence', () => {
      const renderer = new ClaimRenderer(emptyEvidence);
      const result = renderer.render();

      expect(result.ok).toBe(false);
      expect(result.claims.length).toBe(0);
      expect(result.violations.some((v) => v.type === 'insufficient-evidence')).toBe(true);
    });

    it('renders claims with evidence backing', () => {
      const evidence: EvidenceBundle = {
        ...evidenceWithDiffs,
        entries: [
          {
            claim: 'Added new TypeScript file',
            backingEvidence: {
              gitDiffs: [evidenceWithDiffs.gitDiffs[0]],
            },
          },
        ],
      };

      const renderer = new ClaimRenderer(evidence);
      const result = renderer.render();

      expect(result.ok).toBe(true);
      expect(result.claims).toContain('Added new TypeScript file');
    });

    it('warns on unsubstantiated claims', () => {
      const evidence: EvidenceBundle = {
        ...emptyEvidence,
        gitDiffs: [{ file: 'test.ts', status: 'added', additions: 10, deletions: 0 }],
        entries: [
          {
            claim: 'Did some work',
            backingEvidence: {},
          },
        ],
      };

      const renderer = new ClaimRenderer(evidence);
      const result = renderer.render();

      expect(result.violations.some((v) => v.type === 'unsubstantiated-claims')).toBe(true);
    });
  });

  describe('renderClaim', () => {
    it('renders single claim with evidence', () => {
      const entry = {
        claim: 'Test claim',
        backingEvidence: {
          gitDiffs: [{ file: 'test.ts', status: 'added', additions: 50, deletions: 0 }],
        },
      };

      const renderer = new ClaimRenderer(emptyEvidence);
      const result = renderer.renderClaim(entry);

      expect(result.ok).toBe(true);
      expect(result.claims).toContain('Test claim');
    });

    it('rejects claim without evidence', () => {
      const entry = {
        claim: 'Test claim',
        backingEvidence: {},
      };

      const renderer = new ClaimRenderer(emptyEvidence);
      const result = renderer.renderClaim(entry);

      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.type === 'unsubstantiated-claim')).toBe(true);
    });
  });

  describe('summary', () => {
    it('reports evidence presence', () => {
      const evidence: EvidenceBundle = {
        ...emptyEvidence,
        gitDiffs: [{ file: 'test.ts', status: 'added', additions: 10, deletions: 0 }],
        reads: [{ path: 'spec.md', timestamp: Date.now() }],
        checks: [{ type: 'test', name: 'tests', passed: true }],
      };

      const renderer = new ClaimRenderer(evidence);
      const summary = renderer.summary();

      expect(summary.hasChanges).toBe(true);
      expect(summary.hasReads).toBe(true);
      expect(summary.hasChecks).toBe(true);
      expect(summary.allChecksPassed).toBe(true);
    });
  });
});

describe('Detectors', () => {
  describe('detectStubOnlyChangeset', () => {
    it('detects empty evidence', () => {
      const evidence: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [],
        entries: [],
      };

      const violations = detectStubOnlyChangeset(evidence);
      expect(violations.some((v) => v.type === 'stub-only-changeset')).toBe(true);
    });

    it('warns on small added files without reads/tests', () => {
      const evidence: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [
          {
            file: 'stub.ts',
            status: 'added',
            additions: 10,
            deletions: 0,
          },
        ],
        reads: [],
        checks: [],
        entries: [],
      };

      const violations = detectStubOnlyChangeset(evidence);
      expect(violations.some((v) => v.type === 'stub-only-changeset')).toBe(true);
    });

    it('accepts large added files', () => {
      const evidence: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [
          {
            file: 'large.ts',
            status: 'added',
            additions: 500,
            deletions: 0,
          },
        ],
        reads: [],
        checks: [],
        entries: [],
      };

      const violations = detectStubOnlyChangeset(evidence);
      expect(violations.length).toBe(0);
    });
  });

  describe('detectInsufficientReadProofs', () => {
    it('detects review claims without reads', () => {
      const evidence: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [],
        checks: [],
        entries: [
          {
            claim: 'Reviewed the code',
            backingEvidence: {},
          },
        ],
      };

      const violations = detectInsufficientReadProofs(evidence);
      expect(violations.some((v) => v.type === 'insufficient-read-proofs')).toBe(true);
    });

    it('accepts review claims with reads', () => {
      const evidence: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [],
        reads: [{ path: 'code.ts', timestamp: Date.now() }],
        checks: [],
        entries: [
          {
            claim: 'Reviewed the code',
            backingEvidence: {
              reads: [{ path: 'code.ts', timestamp: Date.now() }],
            },
          },
        ],
      };

      const violations = detectInsufficientReadProofs(evidence);
      expect(violations.filter((v) => v.type === 'insufficient-read-proofs').length).toBe(0);
    });
  });

  describe('detectNoFakePerf', () => {
    it('detects performance claims without checks', () => {
      const evidence: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [{ file: 'opt.ts', status: 'modified', additions: 10, deletions: 5 }],
        reads: [],
        checks: [],
        entries: [
          {
            claim: 'Optimized performance by 50%',
            backingEvidence: {},
          },
        ],
      };

      const violations = detectNoFakePerf(evidence);
      expect(violations.some((v) => v.type === 'no-fake-perf')).toBe(true);
    });

    it('accepts performance claims with passing tests', () => {
      const evidence: EvidenceBundle = {
        schema_version: 1,
        timestamp: Date.now(),
        headSha: 'abc123',
        gitDiffs: [{ file: 'opt.ts', status: 'modified', additions: 10, deletions: 5 }],
        reads: [],
        checks: [{ type: 'test', name: 'perf-test', passed: true }],
        entries: [
          {
            claim: 'Optimized performance',
            backingEvidence: {
              checks: [{ type: 'test', name: 'perf-test', passed: true }],
            },
          },
        ],
      };

      const violations = detectNoFakePerf(evidence);
      expect(violations.filter((v) => v.type === 'no-fake-perf').length).toBe(0);
    });
  });
});
