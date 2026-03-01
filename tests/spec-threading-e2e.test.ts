// E2E: spec-threading pipeline
// vague plan → clarity gaps → spec contract → observations → verification → terminal wiring
//
// Tests the full data flow from init gate to terminal gate.
// No CDP — observations are mocked at the ObservationResult boundary.

import { describe, it, expect } from 'vitest';
import { graph, define } from '../src/protocol.ts';
import type { ObservationResult } from '../src/protocol.ts';
import { validatePlanClarity } from '../src/lib/validate-plan-clarity.ts';
import { generateClarifiedSpec } from '../src/lib/intake/spec-generator.ts';
import { verifyObservationsAgainstContract } from '../src/lib/intake/spec-verifier.ts';
import type { SpecClarifiedJson } from '../src/lib/intake/spec-verifier.ts';
import { validateTerminalSpecWiring } from '../src/lib/validate-terminal-gate-spec.ts';

// ── Test DAG: vague plan with gaps ──────────────────────────────────────────

function vagueDAG() {
  return define(graph({
    id: 'vague-app',
    desc: 'App with vague produces',
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
      db: {
        id: 'db',
        desc: 'Build database and auth and API layer',
        produces: ['database'],   // vague — triggers VagueProduces
        consumes: ['package.json'],
        deps: ['init'],
        validate: [],              // empty — triggers NoValidate
        idempotent: true,
      },
      ui: {
        id: 'ui',
        desc: 'Render UI',
        produces: ['src/app.tsx'],
        consumes: ['database'],    // unresolvable — 'database' is vague
        deps: ['db'],
        validate: [{ type: 'artifact-exists', target: 'src/app.tsx' }],
        idempotent: true,
      },
      term: {
        id: 'term',
        desc: 'Verify app ships',
        produces: [],
        consumes: ['spec-clarified.json'],
        deps: ['ui'],
        validate: [{ type: 'artifact-exists', target: 'results.json' }],
        idempotent: true,
      },
    },
  }));
}

function cleanDAG() {
  return define(graph({
    id: 'clean-app',
    desc: 'Well-specified app',
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
        desc: 'Compile TypeScript',
        produces: ['dist/index.js'],
        consumes: ['package.json'],
        deps: ['init'],
        validate: [{ type: 'artifact-exists', target: 'dist/index.js' }],
        idempotent: true,
      },
      clarity: {
        id: 'clarity',
        desc: 'Init gate contract',
        produces: ['spec-clarified.json'],
        consumes: ['package.json'],
        deps: ['init'],
        validate: [{ type: 'artifact-exists', target: 'spec-clarified.json' }],
        idempotent: true,
      },
      term: {
        id: 'term',
        desc: 'Verify',
        produces: [],
        consumes: ['spec-clarified.json', 'dist/index.js'],
        deps: ['build', 'clarity'],
        validate: [{ type: 'artifact-exists', target: 'results.json' }],
        idempotent: true,
      },
    },
  }));
}

// ── E2E: full pipeline ─────────────────────────────────────────────────────

describe('E2E: vague plan → clarified spec → verified output', () => {
  it('full pipeline: vague plan produces gaps, gaps produce spec, spec verifies against observations', async () => {
    const dag = vagueDAG();

    // Step 1: init gate detects clarity problems
    const clarity = await validatePlanClarity(dag, 'db');
    expect(clarity.passed).toBe(false);
    expect(clarity.gaps.length).toBeGreaterThan(0);

    const gapTypes = clarity.gaps.map(g => g.type);
    expect(gapTypes).toContain('VagueProduces');
    expect(gapTypes).toContain('NoValidate');

    // Step 2: generate spec contract from gaps
    const spec = generateClarifiedSpec(dag, clarity.gaps);
    expect(spec.features.length).toBeGreaterThan(0);
    expect(spec.confidence).toBeLessThan(1.0);
    expect(spec.generated).toBeTruthy();

    // Step 3: simulate runtime observations matching the spec features
    const observations: ObservationResult[] = spec.features.map(f => ({
      id: f.id,
      pass: true,
      evidence: `${f.observation}: ${f.selector ?? f.id} — observed`,
      value: f.minRatio ? f.minRatio + 1 : undefined,
    }));

    // Step 4: terminal gate verifies observations against contract
    const verification = verifyObservationsAgainstContract(spec, observations);
    expect(verification.passed).toBe(true);
    expect(verification.matched).toBe(spec.features.length);
    expect(verification.failed).toBe(0);
    expect(verification.unmatched).toEqual([]);
  });

  it('pipeline fails when observations do not match contract', async () => {
    const dag = vagueDAG();

    const clarity = await validatePlanClarity(dag, 'db');
    const spec = generateClarifiedSpec(dag, clarity.gaps);

    // All observations fail
    const observations: ObservationResult[] = spec.features.map(f => ({
      id: f.id,
      pass: false,
      evidence: `${f.selector ?? f.id} not found`,
    }));

    const verification = verifyObservationsAgainstContract(spec, observations);
    expect(verification.passed).toBe(false);
    expect(verification.failed).toBe(spec.features.length);
    expect(verification.failures.length).toBe(spec.features.length);

    // Each failure carries the feature ID
    for (const failure of verification.failures) {
      expect(spec.features.some(f => f.id === failure.id)).toBe(true);
    }
  });

  it('pipeline fails when observations are missing for some features', async () => {
    const dag = vagueDAG();

    const clarity = await validatePlanClarity(dag, 'db');
    const spec = generateClarifiedSpec(dag, clarity.gaps);

    // Only provide observation for the first feature
    const observations: ObservationResult[] = spec.features.length > 0
      ? [{ id: spec.features[0].id, pass: true, evidence: 'present' }]
      : [];

    const verification = verifyObservationsAgainstContract(spec, observations);
    if (spec.features.length > 1) {
      expect(verification.passed).toBe(false);
      expect(verification.unmatched.length).toBe(spec.features.length - 1);
    }
  });

  it('clean plan with no gaps produces empty spec and trivial verification', () => {
    // validatePlanClarity checks ALL nodes — a term with produces:[] triggers VagueProduces.
    // This test verifies the spec→verify path when gaps are empty (no clarity issues).
    const spec = generateClarifiedSpec(cleanDAG(), []);
    expect(spec.features).toEqual([]);
    expect(spec.confidence).toBeGreaterThanOrEqual(0.95);

    const verification = verifyObservationsAgainstContract(spec, []);
    expect(verification.passed).toBe(true);
    expect(verification.matched).toBe(0);
  });

  it('vague plan clarity check finds gaps on nodes with empty or vague produces', async () => {
    const dag = vagueDAG();
    const clarity = await validatePlanClarity(dag, 'db');

    // validatePlanClarity checks all nodes in the DAG
    // term has produces:[] → VagueProduces, db has produces:['database'] → VagueProduces, db has validate:[] → NoValidate
    expect(clarity.passed).toBe(false);
    expect(clarity.gaps.length).toBeGreaterThanOrEqual(2);
    expect(clarity.gaps.some(g => g.type === 'VagueProduces')).toBe(true);
    expect(clarity.gaps.some(g => g.type === 'NoValidate')).toBe(true);
  });
});

// ── Terminal wiring validation ─────────────────────────────────────────────

describe('E2E: terminal gate spec wiring', () => {
  it('clean DAG with spec-clarified.json wiring passes validation', () => {
    const dag = cleanDAG();
    const spec: SpecClarifiedJson = {
      features: [{ id: 'f1', observation: 'visible', evidence: 'test' }],
      gaps: [],
      confidence: 0.95,
      generated: new Date().toISOString(),
    };

    const result = validateTerminalSpecWiring(dag, spec);
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.terminalNodes).toContain('term');
  });

  it('DAG without terminal consuming spec fails wiring check', () => {
    // Build a DAG where term does NOT consume spec-clarified.json
    const dag = define(graph({
      id: 'no-spec',
      desc: 'Missing spec consume',
      init: 'init',
      term: 'term',
      nodes: {
        init: {
          id: 'init', desc: 'Start', produces: ['a.ts'], consumes: [],
          deps: [], validate: [], idempotent: true,
        },
        term: {
          id: 'term', desc: 'End', produces: [], consumes: ['a.ts'],
          deps: ['init'], validate: [], idempotent: true,
        },
      },
    }));

    const result = validateTerminalSpecWiring(dag);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.type === 'terminal-missing-spec-consume')).toBe(true);
  });

  it('DAG without any node producing spec fails wiring check', () => {
    // term consumes spec-clarified.json but nobody produces it
    const dag = define(graph({
      id: 'orphan-consume',
      desc: 'Orphan spec consume',
      init: 'init',
      term: 'term',
      nodes: {
        init: {
          id: 'init', desc: 'Start', produces: [], consumes: [],
          deps: [], validate: [], idempotent: true,
        },
        term: {
          id: 'term', desc: 'End', produces: [],
          consumes: ['spec-clarified.json'],
          deps: ['init'], validate: [], idempotent: true,
        },
      },
    }));

    const result = validateTerminalSpecWiring(dag);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.type === 'spec-not-produced')).toBe(true);
  });

  it('empty spec content fails validation', () => {
    const dag = cleanDAG();
    const emptySpec: SpecClarifiedJson = {
      features: [],
      gaps: [],
      confidence: 0.5,
      generated: new Date().toISOString(),
    };

    const result = validateTerminalSpecWiring(dag, emptySpec);
    expect(result.passed).toBe(false);
    expect(result.errors.some(e => e.type === 'spec-invalid')).toBe(true);
  });
});

// ── Contrast deep check E2E ────────────────────────────────────────────────

describe('E2E: contrast verification through full pipeline', () => {
  it('contrast below WCAG threshold fails through pipeline', async () => {
    const dag = vagueDAG();
    const clarity = await validatePlanClarity(dag, 'db');
    const spec = generateClarifiedSpec(dag, clarity.gaps);

    const contrastFeature = spec.features.find(f => f.observation === 'contrast');
    if (!contrastFeature) return; // skip if no contrast feature generated

    // All pass except contrast — provide value below threshold
    const observations: ObservationResult[] = spec.features.map(f => {
      if (f.id === contrastFeature.id) {
        return { id: f.id, pass: true, evidence: 'ratio 2.1:1', value: 2.1 };
      }
      return {
        id: f.id,
        pass: true,
        evidence: `${f.observation}: ok`,
        value: f.minRatio ? f.minRatio + 1 : undefined,
      };
    });

    const verification = verifyObservationsAgainstContract(spec, observations);
    expect(verification.passed).toBe(false);
    expect(verification.failures.some(f => f.id === contrastFeature.id)).toBe(true);
    expect(verification.failures.find(f => f.id === contrastFeature.id)!.expected).toContain('4.5');
  });

  it('contrast at or above threshold passes', async () => {
    const dag = vagueDAG();
    const clarity = await validatePlanClarity(dag, 'db');
    const spec = generateClarifiedSpec(dag, clarity.gaps);

    // All features pass, contrast at exactly 4.5
    const observations: ObservationResult[] = spec.features.map(f => ({
      id: f.id,
      pass: true,
      evidence: f.observation === 'contrast' ? 'ratio 4.5:1' : `${f.observation}: ok`,
      value: f.observation === 'contrast' ? 4.5 : (f.minRatio ? f.minRatio + 1 : undefined),
    }));

    const verification = verifyObservationsAgainstContract(spec, observations);
    expect(verification.passed).toBe(true);
  });
});

// ── Spec contract roundtrip ────────────────────────────────────────────────

describe('E2E: spec contract JSON roundtrip', () => {
  it('spec survives JSON serialize/deserialize', async () => {
    const dag = vagueDAG();
    const clarity = await validatePlanClarity(dag, 'db');
    const spec = generateClarifiedSpec(dag, clarity.gaps);

    // Simulate write to disk + read back
    const json = JSON.stringify(spec);
    const restored: SpecClarifiedJson = JSON.parse(json);

    expect(restored.features.length).toBe(spec.features.length);
    expect(restored.confidence).toBe(spec.confidence);
    expect(restored.gaps).toEqual(spec.gaps);

    // Verification works identically on restored spec
    const obs: ObservationResult[] = restored.features.map(f => ({
      id: f.id,
      pass: true,
      evidence: 'ok',
      value: f.minRatio ? f.minRatio + 1 : undefined,
    }));

    const v1 = verifyObservationsAgainstContract(spec, obs);
    const v2 = verifyObservationsAgainstContract(restored, obs);
    expect(v1.passed).toBe(v2.passed);
    expect(v1.matched).toBe(v2.matched);
  });

  it('feature IDs are stable across generation calls with same input', async () => {
    const dag = vagueDAG();
    const clarity = await validatePlanClarity(dag, 'db');

    const spec1 = generateClarifiedSpec(dag, clarity.gaps);
    const spec2 = generateClarifiedSpec(dag, clarity.gaps);

    const ids1 = spec1.features.map(f => f.id).sort();
    const ids2 = spec2.features.map(f => f.id).sort();
    expect(ids1).toEqual(ids2);
  });
});
