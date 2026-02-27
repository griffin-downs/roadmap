import { describe, it, expect } from 'vitest';
import { computeRisk, paretoFilter, generateCandidates } from '../src/lib/gallery.ts';
import type { GalleryCandidate, TemplateParams } from '../src/lib/gallery.ts';
import { estimateCost } from '../src/lib/cost-estimator.ts';
import { buildGallery } from '../src/lib/gallery-templates/index.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandidate(id: string, costUSD: number, wallClockMinutes: number, risk: number): GalleryCandidate {
  const params: TemplateParams = {
    emitStrategy: 'single-pass',
    gateOrdering: 'parallel',
    preExpansion: 'none',
    modelAllocation: 'opus-all',
    convergence: 'fixed-passes',
  };
  return {
    id,
    label: id,
    summary: id,
    parameters: params,
    dag: {},
    estimates: { nodes: 6, maxExpansion: 8, wallClockMinutes, costUSD, risk },
    gateProfile: { deterministic: 6, intent: 3, runtime: 1 },
  };
}

// ── computeRisk ───────────────────────────────────────────────────────────────

describe('computeRisk()', () => {
  it('returns 0.0 when both rates are 1.0', () => {
    expect(computeRisk(1, 1)).toBe(0.0);
  });

  it('returns 1.0 on cold start (both rates 0.0)', () => {
    expect(computeRisk(0, 0)).toBe(1.0);
  });

  it('computes 1 - product for mixed rates', () => {
    const result = computeRisk(0.8, 0.9);
    expect(result).toBeCloseTo(1 - 0.8 * 0.9, 10); // 0.28
  });

  it('handles one rate at 0', () => {
    expect(computeRisk(0, 0.9)).toBe(1.0);
    expect(computeRisk(0.9, 0)).toBe(1.0);
  });
});

// ── paretoFilter ──────────────────────────────────────────────────────────────

describe('paretoFilter()', () => {
  it('returns all candidates when none dominate each other (distinct on all axes)', () => {
    // A: low cost, high time, medium risk
    // B: high cost, low time, low risk
    // C: medium cost, medium time, high risk
    // None dominates another because each is worse on at least one axis.
    const a = makeCandidate('a', 1.0, 10.0, 0.5);
    const b = makeCandidate('b', 5.0, 2.0, 0.1);
    const c = makeCandidate('c', 3.0, 6.0, 0.9);
    const result = paretoFilter([a, b, c]);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('removes A when B strictly dominates it (lower cost AND time AND risk)', () => {
    const dominated = makeCandidate('dominated', 5.0, 10.0, 0.8);
    const dominant = makeCandidate('dominant', 2.0, 4.0, 0.3);
    const result = paretoFilter([dominated, dominant]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('dominant');
  });

  it('keeps both when B is cheaper but riskier than A (partial domination)', () => {
    const a = makeCandidate('a', 5.0, 5.0, 0.2); // higher cost, lower risk
    const b = makeCandidate('b', 2.0, 5.0, 0.8); // lower cost, higher risk
    const result = paretoFilter([a, b]);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('single candidate always survives', () => {
    const only = makeCandidate('only', 1.0, 1.0, 0.5);
    const result = paretoFilter([only]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('only');
  });

  it('never returns empty set', () => {
    const candidates = [
      makeCandidate('x', 1.0, 2.0, 0.5),
      makeCandidate('y', 2.0, 1.0, 0.5),
    ];
    const result = paretoFilter(candidates);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns the input slice unchanged when all candidates are identical on all axes', () => {
    // Two identical candidates — neither dominates the other (strictly < on one required)
    const a = makeCandidate('a', 1.0, 1.0, 0.5);
    const b = makeCandidate('b', 1.0, 1.0, 0.5);
    const result = paretoFilter([a, b]);
    // Neither is strictly better, so both survive
    expect(result).toHaveLength(2);
  });
});

// ── generateCandidates ────────────────────────────────────────────────────────

describe('generateCandidates()', () => {
  it('returns a non-empty array', () => {
    const result = generateCandidates('test-spec');
    expect(result.length).toBeGreaterThan(0);
  });

  it('every candidate has required shape fields', () => {
    const result = generateCandidates('test-spec');
    for (const c of result) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.label).toBe('string');
      expect(typeof c.estimates.risk).toBe('number');
      expect(typeof c.estimates.costUSD).toBe('number');
      expect(typeof c.estimates.wallClockMinutes).toBe('number');
    }
  });

  it('all risk values are in [0.0, 1.0]', () => {
    const result = generateCandidates('test-spec');
    for (const c of result) {
      expect(c.estimates.risk).toBeGreaterThanOrEqual(0.0);
      expect(c.estimates.risk).toBeLessThanOrEqual(1.0);
    }
  });

  it('result is a strict subset of the full candidate space (Pareto filtered)', () => {
    // The full 3^5 grid has 243 combinations. Pareto must reduce it.
    const result = generateCandidates('test-spec');
    expect(result.length).toBeLessThan(243);
  });
});

// ── estimateCost (cost-estimator.ts) ──────────────────────────────────────────

describe('estimateCost()', () => {
  it('returns cold-start confidence when no dirs supplied', () => {
    const result = estimateCost({ nodeCount: 6, modelAllocation: 'opus-all' });
    expect(result.confidence).toBe('cold-start');
  });

  it('opus-all costs more than haiku-emit+opus-judge for same nodeCount', () => {
    const opusAll = estimateCost({ nodeCount: 6, modelAllocation: 'opus-all' });
    const haikuJudge = estimateCost({ nodeCount: 6, modelAllocation: 'haiku-emit+opus-judge' });
    expect(opusAll.costUSD).toBeGreaterThan(haikuJudge.costUSD);
  });

  it('wallClockMinutes > 0 for any input', () => {
    for (const alloc of ['opus-all', 'opus-emit+haiku-fix', 'haiku-emit+opus-judge'] as const) {
      const result = estimateCost({ nodeCount: 4, modelAllocation: alloc });
      expect(result.wallClockMinutes).toBeGreaterThan(0);
    }
  });

  it('cost scales with nodeCount', () => {
    const small = estimateCost({ nodeCount: 3, modelAllocation: 'opus-all' });
    const large = estimateCost({ nodeCount: 12, modelAllocation: 'opus-all' });
    expect(large.costUSD).toBeGreaterThan(small.costUSD);
  });

  it('returns non-negative costUSD', () => {
    const result = estimateCost({ nodeCount: 6, modelAllocation: 'haiku-emit+opus-judge' });
    expect(result.costUSD).toBeGreaterThanOrEqual(0);
  });
});

// ── buildGallery (gallery-templates/index.ts) ─────────────────────────────────

describe('buildGallery()', () => {
  it('returns between 1 and 4 candidates', () => {
    const result = buildGallery('test-spec');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('each candidate id is one of the four template names', () => {
    const result = buildGallery('test-spec');
    const validIds = new Set(['aggressive', 'corrective', 'staged', 'budget']);
    for (const c of result) {
      expect(validIds.has(c.id)).toBe(true);
    }
  });

  it('each candidate has estimates.nodes > 0', () => {
    const result = buildGallery('test-spec');
    for (const c of result) {
      expect(c.estimates.nodes).toBeGreaterThan(0);
    }
  });

  it('result never empty', () => {
    const result = buildGallery('test-spec');
    expect(result.length).toBeGreaterThan(0);
  });

  it('all candidates have valid estimates shape', () => {
    const result = buildGallery('test-spec');
    for (const c of result) {
      expect(typeof c.estimates.costUSD).toBe('number');
      expect(typeof c.estimates.wallClockMinutes).toBe('number');
      expect(typeof c.estimates.risk).toBe('number');
      expect(typeof c.estimates.maxExpansion).toBe('number');
    }
  });
});
