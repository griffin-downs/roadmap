import { describe, it, expect } from 'vitest';
import { define, graph, validateNode } from '../src/protocol.ts';
import type { ValidationRule, IntentJudgment, ValidationCheck } from '../src/protocol.ts';
import { extractObservationFailures, enrichIntentFailuresWithObservations, generateIntentExpansion } from '../src/lib/intent/intent-expansion.ts';

// ── Test Helpers ──────────────────────────────────────────────────────────

function makeGraph() {
  return define(graph({
    id: 'visual-intent-test',
    desc: 'test visual intent evaluation with observations',
    init: 'init',
    term: 'ui',
    nodes: {
      init: {
        id: 'init',
        desc: 'setup',
        produces: ['src/main.tsx'],
        consumes: [],
        deps: [],
        validate: [],
        idempotent: true,
      },
      ui: {
        id: 'ui',
        desc: 'UI with visual + intent validation',
        produces: ['dist/app.js'],
        consumes: ['src/main.tsx'],
        deps: ['init'],
        validate: [
          {
            type: 'runtime-explore',
            script: 'scripts/explore-ui.ts',
            observations: [
              { id: 'todos-visible', description: 'todo items visible in list', type: 'assertion' as const },
              { id: 'theme-toggle', description: 'dark mode toggle functional', type: 'assertion' as const },
              { id: 'contrast-ratio', description: 'contrast ratio meets WCAG AA', type: 'measurement' as const },
            ],
          },
          {
            type: 'intent',
            statement: 'todos visible and interactive',
            confidence: 0.9,
            evaluator: 'self',
            expandOnFail: true,
            context: ['src/components/TodoList.tsx'],
          },
          {
            type: 'intent',
            statement: 'dark mode theme works correctly',
            confidence: 0.85,
            evaluator: 'self',
            expandOnFail: true,
            context: ['src/theme.css'],
          },
        ],
        idempotent: true,
      },
    },
  }));
}

function intentJudgment(statement: string, confidence: number, reasoning: string = 'test evaluation'): IntentJudgment {
  return { statement, confidence, reasoning, evidence: ['src/main.tsx:42'] };
}

// ── extractObservationFailures ────────────────────────────────────────────

describe('extractObservationFailures', () => {
  it('filters out passing observations', () => {
    const observations = [
      { id: 'obs-1', pass: true, evidence: 'observed at line 10' },
      { id: 'obs-2', pass: false, evidence: 'actual value does not match' },
      { id: 'obs-3', pass: true, evidence: 'color correct' },
    ];

    const failures = extractObservationFailures(observations);

    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe('obs-2');
    expect(failures[0].evidence).toBe('actual value does not match');
  });

  it('includes measurement values in evidence', () => {
    const observations = [
      { id: 'contrast', pass: false, value: 2.5, evidence: 'contrast ratio measured' },
    ];

    const failures = extractObservationFailures(observations);

    expect(failures).toHaveLength(1);
    expect(failures[0].evidence).toContain('contrast ratio measured');
  });

  it('returns empty when no failures', () => {
    const observations = [
      { id: 'obs-1', pass: true, evidence: 'passed' },
    ];

    const failures = extractObservationFailures(observations);

    expect(failures).toHaveLength(0);
  });
});

// ── enrichIntentFailuresWithObservations ───────────────────────────────────

describe('enrichIntentFailuresWithObservations', () => {
  it('sets informedBy=runtime-explore when only observations present (no reasoning)', () => {
    const failures = [
      {
        statement: 'ui works',
        threshold: 0.9,
        achieved: 0.6,
        reasoning: '',  // empty reasoning = no judgment
        evidence: [],
        rule: {
          type: 'intent' as const,
          statement: 'ui works',
          confidence: 0.9,
          evaluator: 'self' as const,
          expandOnFail: true,
        },
      },
    ];

    const checks: ValidationCheck[] = [
      {
        rule: {
          type: 'runtime-explore',
          script: 'explore.ts',
          observations: [
            { id: 'app-loads', description: 'app loads successfully', type: 'assertion' },
          ],
        },
        passed: false,
        evidence: '[app-loads] app failed to load',
        observations: [
          { id: 'app-loads', pass: false, evidence: 'timeout after 5s' },
        ],
      },
    ];

    const enriched = enrichIntentFailuresWithObservations(failures, checks);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].informedBy).toBe('runtime-explore');
    expect(enriched[0].observationFailures).toHaveLength(1);
    expect(enriched[0].observationFailures![0].id).toBe('app-loads');
  });

  it('sets informedBy=hybrid when both observations and judgment present', () => {
    const failures = [
      {
        statement: 'dark mode works',
        threshold: 0.85,
        achieved: 0.7,
        reasoning: 'toggle not responsive in tests',
        evidence: ['src/theme.tsx:15'],
        rule: {
          type: 'intent' as const,
          statement: 'dark mode works',
          confidence: 0.85,
          evaluator: 'self' as const,
          expandOnFail: true,
        },
      },
    ];

    const checks: ValidationCheck[] = [
      {
        rule: {
          type: 'runtime-explore',
          script: 'explore.ts',
          observations: [
            { id: 'theme-toggle', description: 'dark mode toggle functional', type: 'assertion' },
          ],
        },
        passed: false,
        evidence: '[theme-toggle] toggle not visible',
        observations: [
          { id: 'theme-toggle', pass: false, evidence: 'button disabled in dark mode' },
        ],
      },
    ];

    const enriched = enrichIntentFailuresWithObservations(failures, checks);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].informedBy).toBe('hybrid');
    expect(enriched[0].observationFailures).toHaveLength(1);
  });

  it('sets informedBy=llm when only judgment, no observations', () => {
    const failures = [
      {
        statement: 'api responds correctly',
        threshold: 0.9,
        achieved: 0.65,
        reasoning: 'endpoint returns 500 in error case',
        evidence: ['api/handlers.ts:23'],
        rule: {
          type: 'intent' as const,
          statement: 'api responds correctly',
          confidence: 0.9,
          evaluator: 'self' as const,
          expandOnFail: true,
        },
      },
    ];

    const enriched = enrichIntentFailuresWithObservations(failures, []);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].informedBy).toBe('llm');
    expect(enriched[0].observationFailures).toBeUndefined();
  });

  it('maps multiple failed observations to single intent failure', () => {
    const failures = [
      {
        statement: 'ui complete',
        threshold: 0.9,
        achieved: 0.5,
        reasoning: 'visual issues',
        evidence: [],
        rule: {
          type: 'intent' as const,
          statement: 'ui complete',
          confidence: 0.9,
          evaluator: 'self' as const,
          expandOnFail: true,
        },
      },
    ];

    const checks: ValidationCheck[] = [
      {
        rule: {
          type: 'runtime-explore',
          script: 'explore.ts',
          observations: [
            { id: 'btn1', description: 'button 1 visible', type: 'assertion' },
            { id: 'btn2', description: 'button 2 visible', type: 'assertion' },
            { id: 'form', description: 'form functional', type: 'assertion' },
          ],
        },
        passed: false,
        evidence: '[btn1] not found',
        observations: [
          { id: 'btn1', pass: false, evidence: 'button not found in DOM' },
          { id: 'btn2', pass: false, evidence: 'button hidden by CSS' },
          { id: 'form', pass: true, evidence: 'form submits correctly' },
        ],
      },
    ];

    const enriched = enrichIntentFailuresWithObservations(failures, checks);

    expect(enriched).toHaveLength(1);
    expect(enriched[0].observationFailures).toHaveLength(2);  // only failed observations
    expect(enriched[0].observationFailures!.map(o => o.id)).toEqual(['btn1', 'btn2']);
    // informedBy should be hybrid since we have both judgment + observations
    expect(enriched[0].informedBy).toBe('hybrid');
  });
});

// ── Intent diagnosis with observations ──────────────────────────────────────

describe('_intentDiagnosis with observations', () => {
  it('includes observationFailures in expanded fix node', () => {
    const failures = [
      {
        statement: 'light mode works',
        threshold: 0.9,
        achieved: 0.6,
        reasoning: 'text contrast insufficient',
        evidence: ['src/theme.css:8'],
        rule: {
          type: 'intent' as const,
          statement: 'light mode works',
          confidence: 0.9,
          evaluator: 'self' as const,
          expandOnFail: true,
        },
        observationFailures: [
          {
            id: 'contrast-light',
            description: 'light mode has WCAG AA contrast',
            evidence: 'ratio: 2.3 (need 4.5)',
          },
        ],
        informedBy: 'hybrid',
      },
    ];

    const expansion = generateIntentExpansion(
      'render-ui',
      ['dist/app.js'],
      ['src/main.tsx'],
      undefined,
      [],
      failures,
      0,
    );

    expect(expansion.fixNodes).toHaveLength(1);
    const fixNode = expansion.fixNodes[0];
    expect(fixNode._intentDiagnosis.observationFailures).toHaveLength(1);
    expect(fixNode._intentDiagnosis.observationFailures![0].id).toBe('contrast-light');
    expect(fixNode._intentDiagnosis.informedBy).toBe('hybrid');
  });

  it('preserves informedBy source through expansion', () => {
    const failures = [
      {
        statement: 'app interactive',
        threshold: 0.95,
        achieved: 0.55,
        reasoning: 'clicks not registering',
        evidence: [],
        rule: {
          type: 'intent' as const,
          statement: 'app interactive',
          confidence: 0.95,
          evaluator: 'self' as const,
          expandOnFail: true,
        },
        observationFailures: [
          {
            id: 'button-click',
            description: 'buttons respond to clicks',
            evidence: 'click event not fired',
          },
        ],
        informedBy: 'runtime-explore',
      },
    ];

    const expansion = generateIntentExpansion(
      'build-ui',
      ['dist/ui.js'],
      [],
      undefined,
      [],
      failures,
      1,
    );

    const fixNode = expansion.fixNodes[0];
    expect(fixNode._intentDiagnosis.informedBy).toBe('runtime-explore');
    expect(fixNode._intentDiagnosis.expansionDepth).toBe(2);
  });

  it('handles absence of observations gracefully', () => {
    const failures = [
      {
        statement: 'api correct',
        threshold: 0.9,
        achieved: 0.7,
        reasoning: 'manual inspection',
        evidence: [],
        rule: {
          type: 'intent' as const,
          statement: 'api correct',
          confidence: 0.9,
          evaluator: 'self' as const,
          expandOnFail: true,
        },
        informedBy: 'llm',
      },
    ];

    const expansion = generateIntentExpansion(
      'api-impl',
      ['src/api.ts'],
      [],
      undefined,
      [],
      failures,
      0,
    );

    const fixNode = expansion.fixNodes[0];
    expect(fixNode._intentDiagnosis.observationFailures).toBeUndefined();
    expect(fixNode._intentDiagnosis.informedBy).toBe('llm');
  });
});

// ── Integration: observations flow through validation ────────────────────────

describe('Visual intent evaluation integration', () => {
  it('captures observations in ValidationCheck from runtime-explore', async () => {
    const g = makeGraph();
    const result = await validateNode(g, 'ui', () => true, {
      intentJudgments: [
        intentJudgment('todos visible and interactive', 0.75),
        intentJudgment('dark mode theme works correctly', 0.80),
      ],
    });

    // Should have intent checks
    const intentChecks = result.checks.filter(c => c.rule.type === 'intent');
    expect(intentChecks).toHaveLength(2);

    // Should have expansion status
    expect(result.expansionStatus).toBe('expanding');
    expect(result.failingIntents).toHaveLength(2);
  });

  it('enriches failures with observation data when available', () => {
    const checks: ValidationCheck[] = [
      {
        rule: {
          type: 'runtime-explore',
          script: 'explore.ts',
          observations: [
            { id: 'page-load', description: 'page loads', type: 'assertion' },
            { id: 'interactive', description: 'page interactive', type: 'assertion' },
          ],
        },
        passed: false,
        evidence: '[page-load] failed',
        observations: [
          { id: 'page-load', pass: false, evidence: 'blank screen' },
          { id: 'interactive', pass: false, evidence: 'no event handlers' },
        ],
      },
      {
        rule: {
          type: 'intent',
          statement: 'page functional',
          confidence: 0.9,
          evaluator: 'self',
          expandOnFail: true,
        },
        passed: false,
        evidence: 'below threshold',
      },
    ];

    const failures = [
      {
        statement: 'page functional',
        threshold: 0.9,
        achieved: 0.3,
        reasoning: 'page does not load',
        evidence: [],
        rule: {
          type: 'intent',
          statement: 'page functional',
          confidence: 0.9,
          evaluator: 'self',
          expandOnFail: true,
        } as any,
      },
    ];

    const enriched = enrichIntentFailuresWithObservations(failures, checks);

    expect(enriched[0].observationFailures).toHaveLength(2);
    // Has both reasoning + observations = hybrid
    expect(enriched[0].informedBy).toBe('hybrid');
  });
});
