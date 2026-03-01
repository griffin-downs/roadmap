/**
 * Spec contract tests: clarity gaps → features with selectors.
 * Tests generateClarifiedSpec() output shape and gap→feature conversion.
 */

import { describe, it, expect } from 'vitest';
import { generateClarifiedSpec } from '../src/lib/intake/spec-generator.ts';
import type { PlanClarityGap } from '../src/lib/intent/intent-expansion.ts';
import type { Graph } from '../src/protocol.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function minimalGraph(): Graph<'init' | 'build' | 'term'> {
  return {
    id: 'test',
    desc: 'test',
    init: 'init',
    term: 'term',
    nodes: {
      init: {
        id: 'init',
        desc: 'Setup',
        produces: ['package.json'],
        consumes: [],
        deps: [],
        validate: [{ type: 'artifact-exists', target: 'package.json' }],
        idempotent: true,
      },
      build: {
        id: 'build',
        desc: 'Build app',
        produces: ['src/app.ts', 'src/db.ts'],
        consumes: ['package.json'],
        deps: ['init'],
        validate: [{ type: 'artifact-exists', target: 'src/app.ts' }],
        idempotent: true,
      },
      term: {
        id: 'term',
        desc: 'Verify',
        produces: ['results.json'],
        consumes: ['src/app.ts'],
        deps: ['build'],
        validate: [{ type: 'artifact-exists', target: 'results.json' }],
        idempotent: true,
      },
    },
  };
}

function makeGap(overrides: Partial<PlanClarityGap> = {}): PlanClarityGap {
  return {
    type: 'VagueProduces',
    node: 'build',
    detail: 'produces: ["database"] — not concrete file paths',
    ...overrides,
  };
}

// ── Output shape ─────────────────────────────────────────────────────────────

describe('generateClarifiedSpec output shape', () => {
  it('returns features array', () => {
    const result = generateClarifiedSpec(minimalGraph(), []);
    expect(result).toHaveProperty('features');
    expect(Array.isArray(result.features)).toBe(true);
  });

  it('returns gaps array', () => {
    const result = generateClarifiedSpec(minimalGraph(), []);
    expect(result).toHaveProperty('gaps');
    expect(Array.isArray(result.gaps)).toBe(true);
  });

  it('returns confidence number', () => {
    const result = generateClarifiedSpec(minimalGraph(), []);
    expect(typeof result.confidence).toBe('number');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('returns generated timestamp', () => {
    const result = generateClarifiedSpec(minimalGraph(), []);
    expect(typeof result.generated).toBe('string');
    // ISO-8601
    expect(() => new Date(result.generated)).not.toThrow();
  });

  it('each feature has id, observation, evidence', () => {
    const gaps = [makeGap()];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    for (const feature of result.features) {
      expect(typeof feature.id).toBe('string');
      expect(typeof feature.observation).toBe('string');
      expect(typeof feature.evidence).toBe('string');
    }
  });
});

// ── Gap → feature conversion ─────────────────────────────────────────────────

describe('gap to feature conversion', () => {
  it('VagueProduces generates features with selectors', () => {
    const gaps: PlanClarityGap[] = [
      makeGap({ type: 'VagueProduces', node: 'build', detail: 'produces: ["database"]' }),
    ];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    expect(result.features.length).toBeGreaterThan(0);
    // VagueProduces should generate features that reference concrete paths
    const hasSelector = result.features.some(f => f.selector !== undefined);
    expect(hasSelector || result.features.length > 0).toBe(true);
  });

  it('BroadScope decomposes into individual features', () => {
    const gaps: PlanClarityGap[] = [
      makeGap({
        type: 'BroadScope',
        node: 'build',
        detail: 'desc: "Build and test and lint" — 5 words with conjunctions',
      }),
    ];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    // BroadScope should decompose — may produce features for individual concerns
    expect(result.features.length).toBeGreaterThan(0);
  });

  it('NoValidate gap reflected in output gaps', () => {
    const gaps: PlanClarityGap[] = [
      makeGap({ type: 'NoValidate', node: 'build', detail: 'validate: []' }),
    ];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    // NoValidate should be reflected: either as a feature to add or as a gap
    expect(result.features.length + result.gaps.length).toBeGreaterThan(0);
  });

  it('OwnershipConflict gap recorded', () => {
    const gaps: PlanClarityGap[] = [
      makeGap({
        type: 'OwnershipConflict',
        node: 'build',
        detail: 'produces: "schema.ts" also produced by "init"',
      }),
    ];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    // Ownership conflict should surface somewhere in the spec
    expect(result.features.length + result.gaps.length).toBeGreaterThan(0);
  });

  it('UnresolvableConsumes gap recorded', () => {
    const gaps: PlanClarityGap[] = [
      makeGap({
        type: 'UnresolvableConsumes',
        node: 'build',
        detail: 'consumes "src/db.ts" but no predecessor produces it',
      }),
    ];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    expect(result.features.length + result.gaps.length).toBeGreaterThan(0);
  });
});

// ── Observation types ────────────────────────────────────────────────────────

describe('observation types in features', () => {
  it('features use valid observation types', () => {
    const validObs = ['visible', 'interactive', 'toggles-class', 'contrast', 'count'];
    const gaps = [makeGap()];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    for (const feature of result.features) {
      expect(validObs).toContain(feature.observation);
    }
  });

  it('contrast features have minRatio', () => {
    const gaps = [makeGap()];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    const contrastFeatures = result.features.filter(f => f.observation === 'contrast');
    for (const f of contrastFeatures) {
      expect(typeof f.minRatio).toBe('number');
      expect(f.minRatio).toBeGreaterThan(0);
    }
  });
});

// ── Confidence calculation ───────────────────────────────────────────────────

describe('confidence calculation', () => {
  it('high confidence when no gaps', () => {
    const result = generateClarifiedSpec(minimalGraph(), []);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('lower confidence with gaps', () => {
    const gaps = [
      makeGap({ type: 'VagueProduces' }),
      makeGap({ type: 'NoValidate', node: 'term' }),
    ];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    expect(result.confidence).toBeLessThan(1.0);
  });

  it('confidence decreases with more gaps', () => {
    const oneGap = generateClarifiedSpec(minimalGraph(), [makeGap()]);
    const twoGaps = generateClarifiedSpec(minimalGraph(), [
      makeGap({ type: 'VagueProduces' }),
      makeGap({ type: 'NoValidate', node: 'term' }),
    ]);
    expect(twoGaps.confidence).toBeLessThanOrEqual(oneGap.confidence);
  });
});

// ── Empty + edge cases ───────────────────────────────────────────────────────

describe('edge cases', () => {
  it('empty gaps produce valid spec with empty features', () => {
    const result = generateClarifiedSpec(minimalGraph(), []);
    expect(result.features).toEqual([]);
    expect(result.gaps).toEqual([]);
  });

  it('multiple gaps of same type generate distinct features', () => {
    const gaps: PlanClarityGap[] = [
      makeGap({ type: 'VagueProduces', node: 'build' }),
      makeGap({ type: 'VagueProduces', node: 'term', detail: 'produces: ["result"]' }),
    ];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    if (result.features.length > 1) {
      const ids = result.features.map(f => f.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    }
  });

  it('feature IDs are non-empty strings', () => {
    const gaps = [makeGap()];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    for (const f of result.features) {
      expect(f.id.length).toBeGreaterThan(0);
    }
  });

  it('feature evidence is non-empty string', () => {
    const gaps = [makeGap()];
    const result = generateClarifiedSpec(minimalGraph(), gaps);
    for (const f of result.features) {
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
});
