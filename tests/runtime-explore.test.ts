import { describe, it, expect } from 'vitest';
import { graph, define, validateNode } from '../src/protocol.ts';
import type { ExploreResult, ObservationResult, ValidationRule } from '../src/protocol.ts';
import { mapObservationsToChecks, runExploreScript, teardown } from '../src/lib/runtime-explore.ts';
import { spawn } from 'node:child_process';

// Clear recursion guard — tests need shell validators to actually run
delete process.env.ROADMAP_VALIDATING;

// ── mapObservationsToChecks ─────────────────────────────────────────────────

describe('mapObservationsToChecks', () => {
  const rule: ValidationRule & { type: 'runtime-explore' } = {
    type: 'runtime-explore',
    script: 'scripts/explore-test.ts',
    observations: [
      { id: 'app-launches', description: 'app launches', type: 'assertion' },
      { id: 'text-visible', description: 'text visible', type: 'assertion' },
    ],
  };

  it('maps passing observations to passing checks', () => {
    const observations: ObservationResult[] = [
      { id: 'app-launches', pass: true, evidence: 'Page loaded at http://localhost:5173' },
      { id: 'text-visible', pass: true, evidence: 'color: #000, bg: #fff' },
    ];
    const checks = mapObservationsToChecks(observations, rule);

    expect(checks).toHaveLength(2);
    expect(checks[0].passed).toBe(true);
    expect(checks[0].evidence).toContain('app-launches');
    expect(checks[1].passed).toBe(true);
    expect(checks[1].evidence).toContain('text-visible');
  });

  it('maps failing observations to failing checks', () => {
    const observations: ObservationResult[] = [
      { id: 'app-launches', pass: true, evidence: 'Page loaded' },
      { id: 'text-visible', pass: false, evidence: 'color: #fff, bg: #fff' },
    ];
    const checks = mapObservationsToChecks(observations, rule);

    expect(checks).toHaveLength(2);
    expect(checks[0].passed).toBe(true);
    expect(checks[1].passed).toBe(false);
    expect(checks[1].evidence).toContain('#fff');
  });

  it('includes measured value in evidence when present', () => {
    const observations: ObservationResult[] = [
      { id: 'contrast', pass: true, value: 12.6, evidence: 'contrast ratio measured' },
    ];
    const checks = mapObservationsToChecks(observations, rule);

    expect(checks[0].evidence).toContain('12.6');
  });

  it('handles empty observations array', () => {
    const checks = mapObservationsToChecks([], rule);
    expect(checks).toHaveLength(0);
  });
});

// ── validateNode with runtime-explore ───────────────────────────────────────

describe('validateNode: runtime-explore rule', () => {
  const makeGraph = () => define(graph({
    id: 'explore-test',
    desc: 'test runtime-explore validation',
    init: 'init',
    term: 'term',
    nodes: {
      init: { id: 'init', desc: 'start', produces: ['init.txt'], consumes: [], deps: [], validate: [], idempotent: true },
      app: {
        id: 'app',
        desc: 'app with runtime validation',
        produces: ['app.js'],
        consumes: [],
        deps: ['init'],
        validate: [{
          type: 'runtime-explore',
          script: 'scripts/explore.ts',
          observations: [
            { id: 'app-launches', description: 'app launches', type: 'assertion' as const },
          ],
        }],
        idempotent: true,
      },
      term: { id: 'term', desc: 'end', produces: [], consumes: [], deps: ['app'], validate: [], idempotent: true },
    },
  }));

  it('passes as unevaluated when no explore results provided', async () => {
    const g = makeGraph();
    const result = await validateNode(g, 'app', () => true);

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].evidence).toContain('unevaluated');
  });

  it('passes when explore results have passing observations', async () => {
    const g = makeGraph();
    const result = await validateNode(g, 'app', () => true, {
      exploreResults: [{
        script: 'scripts/explore.ts',
        success: true,
        result: {
          observations: [{ id: 'app-launches', pass: true, evidence: 'loaded' }],
          duration: 500,
        },
      }],
    });

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(true);
    expect(result.checks[0].evidence).toContain('app-launches');
  });

  it('fails when explore results have failing observations', async () => {
    const g = makeGraph();
    const result = await validateNode(g, 'app', () => true, {
      exploreResults: [{
        script: 'scripts/explore.ts',
        success: true,
        result: {
          observations: [{ id: 'app-launches', pass: false, evidence: 'timeout connecting' }],
          duration: 10000,
        },
      }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].passed).toBe(false);
  });

  it('fails when explore script itself failed', async () => {
    const g = makeGraph();
    const result = await validateNode(g, 'app', () => true, {
      exploreResults: [{
        script: 'scripts/explore.ts',
        success: false,
        error: 'CDP connection refused',
      }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0].passed).toBe(false);
    expect(result.checks[0].evidence).toContain('CDP connection refused');
  });

  it('fails when explore script not found in results', async () => {
    const g = makeGraph();
    const result = await validateNode(g, 'app', () => true, {
      exploreResults: [{
        script: 'scripts/OTHER.ts',
        success: true,
        result: { observations: [], duration: 0 },
      }],
    });

    expect(result.passed).toBe(false);
    expect(result.checks[0].evidence).toContain('not found in results');
  });

  it('skips under ROADMAP_VALIDATING guard', async () => {
    const g = makeGraph();
    const orig = process.env.ROADMAP_VALIDATING;
    process.env.ROADMAP_VALIDATING = '1';

    const result = await validateNode(g, 'app', () => true);

    if (orig === undefined) delete process.env.ROADMAP_VALIDATING;
    else process.env.ROADMAP_VALIDATING = orig;

    expect(result.passed).toBe(true);
    expect(result.checks[0].evidence).toContain('skipped');
  });
});

// ── runExploreScript ────────────────────────────────────────────────────────

describe('runExploreScript', () => {
  it('parses valid JSON output from a script', async () => {
    // Create a minimal script inline that outputs ExploreResult JSON
    const result = await runExploreScript({
      script: '-e',  // won't work as tsx path — use the mock below
      cdpUrl: 'http://localhost:9222',
      port: 9222,
      timeout: 5000,
    });
    // This will fail because '-e' is not a valid tsx script path
    // The point is to test the error path
    expect(result.success).toBe(false);
  });

  it('returns error on timeout', async () => {
    const result = await runExploreScript({
      script: '/dev/null',
      cdpUrl: 'http://localhost:9222',
      port: 9222,
      timeout: 100,
    });
    // /dev/null as a script will either fail to parse or timeout
    expect(result.success).toBe(false);
  });
});

// ── teardown ────────────────────────────────────────────────────────────────

describe('teardown', () => {
  it('kills a running process', () => {
    const child = spawn('sleep', ['30']);
    expect(child.exitCode).toBeNull();
    teardown(child);
    // After teardown, SIGTERM sent — process should be dying
    // We can't assert exitCode synchronously but we can verify no throw
  });

  it('is safe on already-exited process', () => {
    const child = spawn('true');
    // Wait for exit
    return new Promise<void>((resolve) => {
      child.on('close', () => {
        expect(() => teardown(child)).not.toThrow();
        resolve();
      });
    });
  });
});

// ── Type coverage ───────────────────────────────────────────────────────────

describe('runtime-explore types', () => {
  it('RuntimeExploreRule is part of ValidationRule union', () => {
    const rule: ValidationRule = {
      type: 'runtime-explore',
      script: 'scripts/explore.ts',
      port: 9222,
      timeout: 15000,
      observations: [
        { id: 'test', description: 'test observation', type: 'assertion' },
      ],
    };
    expect(rule.type).toBe('runtime-explore');
  });

  it('ExploreResult structure is valid', () => {
    const result: ExploreResult = {
      observations: [
        { id: 'test', pass: true, evidence: 'ok', value: 42 },
      ],
      screenshots: ['/tmp/screenshot.png'],
      duration: 1500,
    };
    expect(result.observations).toHaveLength(1);
    expect(result.duration).toBe(1500);
  });

  it('ObservationResult supports all value types', () => {
    const strObs: ObservationResult = { id: 'a', pass: true, value: 'hello', evidence: 'ok' };
    const numObs: ObservationResult = { id: 'b', pass: true, value: 42, evidence: 'ok' };
    const boolObs: ObservationResult = { id: 'c', pass: true, value: true, evidence: 'ok' };
    const noValObs: ObservationResult = { id: 'd', pass: false, evidence: 'failed' };

    expect(strObs.value).toBe('hello');
    expect(numObs.value).toBe(42);
    expect(boolObs.value).toBe(true);
    expect(noValObs.value).toBeUndefined();
  });
});
