import { describe, it, expect } from 'vitest';
import {
  MockPreflightValidator,
  validateStateCoherence,
  validateArtifacts,
  validateSchema,
  validateTypecheck,
} from '../src/lib/roadmap/mocks/mock-preflight-validator.ts';

describe('MockPreflightValidator', () => {
  let mockValidator: MockPreflightValidator;

  beforeEach(() => {
    mockValidator = new MockPreflightValidator('/mock/repo');
  });

  describe('validateStateCoherence', () => {
    it('always returns passed true', () => {
      const result = mockValidator.validateStateCoherence();
      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('returns valid timestamp', () => {
      const result = mockValidator.validateStateCoherence();
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('validateArtifacts', () => {
    it('returns passed true with sample artifacts', () => {
      const result = mockValidator.validateArtifacts();
      expect(result.passed).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('includes sample existing artifacts', () => {
      const result = mockValidator.validateArtifacts();
      expect(result.existing).toContain('.roadmap/head.json');
      expect(result.existing).toContain('.roadmap/git-state.json');
      expect(result.existing.length).toBeGreaterThan(0);
    });

    it('returns empty missing artifacts list', () => {
      const result = mockValidator.validateArtifacts();
      expect(Array.isArray(result.missing)).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('has same interface as real ArtifactCheckResult', () => {
      const result = mockValidator.validateArtifacts();
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.timestamp).toBe('string');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.missing)).toBe(true);
      expect(Array.isArray(result.existing)).toBe(true);
    });
  });

  describe('validateSchema', () => {
    it('always returns valid schema check', () => {
      const result = mockValidator.validateSchema();
      expect(result.passed).toBe(true);
      expect(result.valid).toBe(true);
      expect(result.schemaErrors).toEqual([]);
    });

    it('has correct interface fields', () => {
      const result = mockValidator.validateSchema();
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.valid).toBe('boolean');
      expect(typeof result.timestamp).toBe('string');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.schemaErrors)).toBe(true);
    });
  });

  describe('validateTypecheck', () => {
    it('returns typecheck passed true', () => {
      const result = mockValidator.validateTypecheck();
      expect(result.passed).toBe(true);
      expect(result.typecheckPassed).toBe(true);
    });

    it('reports src unchanged', () => {
      const result = mockValidator.validateTypecheck();
      expect(result.srcChanged).toBe(false);
    });

    it('includes output message', () => {
      const result = mockValidator.validateTypecheck();
      expect(result.output).toBeDefined();
      expect(typeof result.output).toBe('string');
    });

    it('has correct interface fields', () => {
      const result = mockValidator.validateTypecheck();
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.timestamp).toBe('string');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(typeof result.srcChanged).toBe('boolean');
      expect(typeof result.typecheckPassed).toBe('boolean');
      expect(typeof result.output).toBe('string');
    });
  });

  describe('runAll', () => {
    it('aggregates all checks with allPassed true', () => {
      const result = mockValidator.runAll();
      expect(result.allPassed).toBe(true);
      expect(typeof result.timestamp).toBe('string');
      expect(result.summary).toBe('All preflight checks passed');
    });

    it('includes all four check results', () => {
      const result = mockValidator.runAll();
      expect(result.stateCoherence).toBeDefined();
      expect(result.artifacts).toBeDefined();
      expect(result.schema).toBeDefined();
      expect(result.typecheck).toBeDefined();
    });

    it('has all sub-checks passed', () => {
      const result = mockValidator.runAll();
      expect(result.stateCoherence.passed).toBe(true);
      expect(result.artifacts.passed).toBe(true);
      expect(result.schema.passed).toBe(true);
      expect(result.typecheck.passed).toBe(true);
    });
  });

  describe('standalone utilities', () => {
    it('validateStateCoherence works as standalone function', () => {
      const result = validateStateCoherence('/mock/repo');
      expect(result.passed).toBe(true);
      expect(typeof result.timestamp).toBe('string');
    });

    it('validateArtifacts works as standalone function', () => {
      const result = validateArtifacts('/mock/repo');
      expect(result.passed).toBe(true);
      expect(Array.isArray(result.existing)).toBe(true);
      expect(Array.isArray(result.missing)).toBe(true);
    });

    it('validateSchema works as standalone function', () => {
      const result = validateSchema('/mock/repo');
      expect(result.passed).toBe(true);
      expect(result.valid).toBe(true);
    });

    it('validateTypecheck works as standalone function', () => {
      const result = validateTypecheck('/mock/repo');
      expect(result.passed).toBe(true);
      expect(typeof result.srcChanged).toBe('boolean');
      expect(typeof result.typecheckPassed).toBe('boolean');
    });
  });

  describe('API signature alignment', () => {
    it('constructor takes repoRoot string parameter', () => {
      const validator = new MockPreflightValidator('/some/path');
      expect(validator).toBeDefined();
    });

    it('all methods return typed results', () => {
      const validator = new MockPreflightValidator('/mock/repo');

      const stateResult = validator.validateStateCoherence();
      expect('passed' in stateResult && 'timestamp' in stateResult).toBe(true);

      const artifactResult = validator.validateArtifacts();
      expect('existing' in artifactResult && 'missing' in artifactResult).toBe(true);

      const schemaResult = validator.validateSchema();
      expect('valid' in schemaResult && 'schemaErrors' in schemaResult).toBe(true);

      const typecheckResult = validator.validateTypecheck();
      expect('srcChanged' in typecheckResult && 'typecheckPassed' in typecheckResult).toBe(true);
    });
  });
});
