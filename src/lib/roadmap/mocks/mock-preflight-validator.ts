// @module preflight-validator
// @exports MockPreflightValidator
// @types PreflightCheckResult, ArtifactCheckResult, SchemaCheckResult, TypecheckResult
// @entry roadmap/mocks

/**
 * PreflightCheckResult — base validation result
 */
export interface PreflightCheckResult {
  passed: boolean;
  timestamp: string;
  errors: string[];
  warnings: string[];
}

/**
 * ArtifactCheckResult — artifact existence validation
 */
export interface ArtifactCheckResult extends PreflightCheckResult {
  missing: string[];
  existing: string[];
}

/**
 * SchemaCheckResult — DAG schema validation
 */
export interface SchemaCheckResult extends PreflightCheckResult {
  valid: boolean;
  schemaErrors: string[];
}

/**
 * TypecheckResult — TypeScript compilation validation
 */
export interface TypecheckResult extends PreflightCheckResult {
  srcChanged: boolean;
  typecheckPassed: boolean;
  output?: string;
}

/**
 * MockPreflightValidator — mock adapter aligned to real API
 * Returns sample data without performing actual git/fs operations
 */
export class MockPreflightValidator {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Mock: validate state coherence between head.json and git-state.json
   * Always returns success with sample data
   */
  validateStateCoherence(): PreflightCheckResult {
    return {
      passed: true,
      timestamp: new Date().toISOString(),
      errors: [],
      warnings: [],
    };
  }

  /**
   * Mock: validate that all expected artifacts exist
   * Returns sample artifact lists (7 existing, 2 missing as typical scenario)
   */
  validateArtifacts(): ArtifactCheckResult {
    return {
      passed: true,
      timestamp: new Date().toISOString(),
      errors: [],
      warnings: [],
      existing: [
        '.roadmap/head.json',
        '.roadmap/git-state.json',
        'src/lib/roadmap/preflight-validator.ts',
        'src/lib/roadmap/artifact-gates.ts',
        'src/lib/roadmap/dag-switcher.ts',
        'src/lib/roadmap/trail-manager.ts',
        'src/lib/roadmap/headsha-recovery.ts',
      ],
      missing: [],
    };
  }

  /**
   * Mock: validate head.json schema
   * Returns valid schema check (no structural errors)
   */
  validateSchema(): SchemaCheckResult {
    return {
      passed: true,
      valid: true,
      timestamp: new Date().toISOString(),
      errors: [],
      warnings: [],
      schemaErrors: [],
    };
  }

  /**
   * Mock: validate TypeScript compilation
   * Returns sample result: src unchanged, typecheck skipped (pass by default)
   */
  validateTypecheck(): TypecheckResult {
    return {
      passed: true,
      timestamp: new Date().toISOString(),
      errors: [],
      warnings: [],
      srcChanged: false,
      typecheckPassed: true,
      output: 'src/ unchanged, skipping typecheck',
    };
  }

  /**
   * Mock: aggregate all preflight checks
   * Returns all-pass scenario (all validators succeed)
   */
  runAll(): {
    allPassed: boolean;
    timestamp: string;
    stateCoherence: PreflightCheckResult;
    artifacts: ArtifactCheckResult;
    schema: SchemaCheckResult;
    typecheck: TypecheckResult;
    summary: string;
  } {
    const timestamp = new Date().toISOString();

    const stateCoherence = this.validateStateCoherence();
    const artifacts = this.validateArtifacts();
    const schema = this.validateSchema();
    const typecheck = this.validateTypecheck();

    const allPassed = stateCoherence.passed && artifacts.passed && schema.passed && typecheck.passed;

    return {
      allPassed,
      timestamp,
      stateCoherence,
      artifacts,
      schema,
      typecheck,
      summary: 'All preflight checks passed',
    };
  }
}

/**
 * Standalone mock: validate state coherence
 */
export function validateStateCoherence(repoRoot: string): PreflightCheckResult {
  return new MockPreflightValidator(repoRoot).validateStateCoherence();
}

/**
 * Standalone mock: validate artifacts
 */
export function validateArtifacts(repoRoot: string): ArtifactCheckResult {
  return new MockPreflightValidator(repoRoot).validateArtifacts();
}

/**
 * Standalone mock: validate schema
 */
export function validateSchema(repoRoot: string): SchemaCheckResult {
  return new MockPreflightValidator(repoRoot).validateSchema();
}

/**
 * Standalone mock: validate typecheck
 */
export function validateTypecheck(repoRoot: string): TypecheckResult {
  return new MockPreflightValidator(repoRoot).validateTypecheck();
}
