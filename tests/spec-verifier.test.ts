import { describe, it, expect } from 'vitest';
import {
  verifyObservationsAgainstContract,
  type SpecClarifiedJson,
  type SpecFeature,
  type VerificationResult,
} from '../src/lib/intake/spec-verifier.ts';
import type { ObservationResult } from '../src/protocol.ts';

// -- Helpers --

function makeSpec(features: SpecFeature[], overrides?: Partial<SpecClarifiedJson>): SpecClarifiedJson {
  return {
    features,
    gaps: [],
    confidence: 0.95,
    generated: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeObs(id: string, pass: boolean, evidence: string, value?: string | number | boolean): ObservationResult {
  return { id, pass, evidence, ...(value !== undefined ? { value } : {}) };
}

// -- Tests --

describe('verifyObservationsAgainstContract', () => {
  it('passes when all features have matching passing observations', () => {
    const spec = makeSpec([
      { id: 'btn-visible', selector: 'button.submit', observation: 'visible', evidence: 'submit button' },
      { id: 'input-interactive', selector: 'input.name', observation: 'interactive', evidence: 'name input' },
    ]);
    const obs: ObservationResult[] = [
      makeObs('btn-visible', true, 'button.submit is visible'),
      makeObs('input-interactive', true, 'input.name is interactive'),
    ];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(true);
    expect(result.matched).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.unmatched).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it('fails when an observation reports pass=false', () => {
    const spec = makeSpec([
      { id: 'missing-el', selector: '#gone', observation: 'visible', evidence: 'element must exist' },
    ]);
    const obs = [makeObs('missing-el', false, 'element not found in DOM')];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(false);
    expect(result.matched).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures[0].id).toBe('missing-el');
    expect(result.failures[0].expected).toContain('visible');
    expect(result.failures[0].actual).toBe('element not found in DOM');
  });

  it('records unmatched features with no corresponding observation', () => {
    const spec = makeSpec([
      { id: 'exists', selector: '.a', observation: 'visible', evidence: '' },
      { id: 'orphan', selector: '.b', observation: 'visible', evidence: '' },
    ]);
    const obs = [makeObs('exists', true, 'ok')];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(false);
    expect(result.matched).toBe(1);
    expect(result.unmatched).toEqual(['orphan']);
  });

  it('passes with empty features and empty observations', () => {
    const result = verifyObservationsAgainstContract(makeSpec([]), []);
    expect(result.passed).toBe(true);
    expect(result.matched).toBe(0);
    expect(result.unmatched).toEqual([]);
  });

  // -- Contrast typed checks --

  it('passes contrast check when ratio meets threshold', () => {
    const spec = makeSpec([
      { id: 'contrast', observation: 'contrast', minRatio: 4.5, evidence: 'WCAG AA' },
    ]);
    const obs = [makeObs('contrast', true, 'ratio 7.2:1', 7.2)];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('fails contrast check when ratio below threshold', () => {
    const spec = makeSpec([
      { id: 'low-contrast', observation: 'contrast', minRatio: 4.5, evidence: 'WCAG AA' },
    ]);
    const obs = [makeObs('low-contrast', true, 'ratio 2.1:1', 2.1)];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(false);
    expect(result.failures[0].id).toBe('low-contrast');
    expect(result.failures[0].expected).toContain('4.5');
    expect(result.failures[0].actual).toContain('2.1');
  });

  // -- Count typed checks --

  it('passes count check when value meets threshold', () => {
    const spec = makeSpec([
      { id: 'items', selector: '.list-item', observation: 'count', minCount: 3, evidence: 'at least 3' },
    ]);
    const obs = [makeObs('items', true, '5 items found', 5)];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(true);
  });

  it('fails count check when value below threshold', () => {
    const spec = makeSpec([
      { id: 'items', selector: '.list-item', observation: 'count', minCount: 3, evidence: 'need 3' },
    ]);
    const obs = [makeObs('items', true, '1 item found', 1)];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(false);
    expect(result.failures[0].id).toBe('items');
    expect(result.failures[0].expected).toContain('3');
    expect(result.failures[0].actual).toContain('1');
  });

  // -- Mixed scenarios --

  it('reports multiple failures across different feature types', () => {
    const spec = makeSpec([
      { id: 'visible-ok', selector: '.ok', observation: 'visible', evidence: '' },
      { id: 'visible-fail', selector: '.fail', observation: 'visible', evidence: '' },
      { id: 'contrast-fail', observation: 'contrast', minRatio: 7.0, evidence: '' },
      { id: 'no-obs', selector: '.ghost', observation: 'interactive', evidence: '' },
    ]);
    const obs = [
      makeObs('visible-ok', true, 'visible'),
      makeObs('visible-fail', false, 'not found'),
      makeObs('contrast-fail', true, 'ratio 3.1:1', 3.1),
    ];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(false);
    expect(result.matched).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.unmatched).toEqual(['no-obs']);
    expect(result.failures.map(f => f.id).sort()).toEqual(['contrast-fail', 'visible-fail']);
  });

  it('ignores extra observations not in the spec', () => {
    const spec = makeSpec([
      { id: 'tracked', selector: '.x', observation: 'visible', evidence: '' },
    ]);
    const obs = [
      makeObs('tracked', true, 'visible'),
      makeObs('extra-1', true, 'not in spec'),
      makeObs('extra-2', false, 'also not in spec'),
    ];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(true);
    expect(result.matched).toBe(1);
  });

  // -- Against real spec-clarified.json shape --

  it('validates against spec-clarified.json contract structure', () => {
    const spec: SpecClarifiedJson = {
      features: [
        { id: 'crud-add', selector: 'input[placeholder*=Add]', observation: 'visible', evidence: 'add input' },
        { id: 'crud-toggle', selector: 'input[type=checkbox]', observation: 'interactive', evidence: 'toggle' },
        { id: 'crud-list', selector: '[data-testid=item-list]', observation: 'count', minCount: 1, evidence: 'list' },
        { id: 'text-contrast', selector: 'body', observation: 'contrast', minRatio: 4.5, evidence: 'WCAG' },
        { id: 'auth-form', selector: 'form[data-testid=auth]', observation: 'visible', evidence: 'auth' },
      ],
      gaps: [],
      confidence: 0.95,
      generated: '2026-02-27T05:20:00Z',
    };

    const obs: ObservationResult[] = [
      makeObs('crud-add', true, 'input visible'),
      makeObs('crud-toggle', true, 'checkbox interactive'),
      makeObs('crud-list', true, '3 items', 3),
      makeObs('text-contrast', true, 'ratio 5.8:1', 5.8),
      makeObs('auth-form', true, 'form visible'),
    ];

    const result = verifyObservationsAgainstContract(spec, obs);
    expect(result.passed).toBe(true);
    expect(result.matched).toBe(5);
    expect(result.failures).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it('VerificationResult shape matches expected interface', () => {
    const result: VerificationResult = verifyObservationsAgainstContract(makeSpec([]), []);
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('matched');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('unmatched');
    expect(result).toHaveProperty('failures');
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.matched).toBe('number');
    expect(typeof result.failed).toBe('number');
    expect(Array.isArray(result.unmatched)).toBe(true);
    expect(Array.isArray(result.failures)).toBe(true);
  });
});
