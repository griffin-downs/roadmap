// @module origin-validator
// @exports validateOriginComplete, validateOriginIntegrity, OriginValidationResult, validateOriginVersion
// @types OriginValidationResult
// @entry roadmap

// Higher-level origin validation: structural checks, version compatibility,
// and integrity verification for spec-origin-governed DAGs.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type SpecOrigin,
  loadSpecOrigin,
  validateOriginHash,
  sha256,
} from './spec-origin.ts';

export interface OriginValidationResult {
  valid: boolean;
  checks: {
    originExists: boolean;
    originParseable: boolean;
    specHashMatch: boolean | null;  // null if spec file not provided
    versionCompatible: boolean;
    dagHashMatch: boolean | null;   // null if DAG not found
  };
  errors: string[];
}

/** Current schema version this validator supports. */
const SUPPORTED_SCHEMA_VERSION = 1;

/**
 * Full validation of spec origin: existence, parseability, hash integrity, version compat.
 * specFilePath is optional — if provided, validates spec hasn't mutated.
 * dagPath is optional — if provided, validates DAG content matches compile_hash.
 */
export function validateOriginComplete(
  repoRoot: string,
  opts?: { specFilePath?: string; dagPath?: string },
): OriginValidationResult {
  const errors: string[] = [];
  const checks: OriginValidationResult['checks'] = {
    originExists: false,
    originParseable: false,
    specHashMatch: null,
    versionCompatible: false,
    dagHashMatch: null,
  };

  // Check origin exists (in head.json._origin or legacy origin file)
  const origin = loadSpecOrigin(repoRoot);
  checks.originExists = origin !== null;
  if (!checks.originExists) {
    errors.push(`Missing spec origin — DAG has no spec provenance (expected head.json._origin)`);
    return { valid: false, checks, errors };
  }

  // Origin was parseable (loadSpecOrigin returned non-null)
  checks.originParseable = true;

  // origin is non-null here (checks.originExists guard above ensures this)
  const o = origin as SpecOrigin;

  // Check version
  checks.versionCompatible = o.schemaVersion === SUPPORTED_SCHEMA_VERSION;
  if (!checks.versionCompatible) {
    errors.push(`Unsupported schema version ${o.schemaVersion} (expected ${SUPPORTED_SCHEMA_VERSION})`);
  }

  // Check spec hash if spec file provided
  if (opts?.specFilePath) {
    checks.specHashMatch = validateOriginHash(repoRoot, opts.specFilePath);
    if (!checks.specHashMatch) {
      errors.push('Spec file has been modified since DAG creation (spec_sha mismatch)');
    }
  }

  // Check DAG hash if DAG path provided
  if (opts?.dagPath) {
    if (existsSync(opts.dagPath)) {
      const dagContent = readFileSync(opts.dagPath, 'utf-8');
      const currentDagHash = sha256(dagContent);
      checks.dagHashMatch = currentDagHash === o.compile_hash;
      if (!checks.dagHashMatch) {
        errors.push('DAG content has been modified since import (compile_hash mismatch)');
      }
    } else {
      checks.dagHashMatch = false;
      errors.push(`DAG file not found at ${opts.dagPath}`);
    }
  }

  return {
    valid: errors.length === 0,
    checks,
    errors,
  };
}

/**
 * Quick integrity check: origin exists + hashes match.
 * Returns true only if all provided inputs are verified.
 */
export function validateOriginIntegrity(
  repoRoot: string,
  specFilePath?: string,
): boolean {
  const origin = loadSpecOrigin(repoRoot);
  if (!origin) return false;
  if (origin.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return false;
  if (specFilePath) return validateOriginHash(repoRoot, specFilePath);
  return true;
}

/**
 * Check if origin's schema version is compatible with current validator.
 */
export function validateOriginVersion(repoRoot: string): boolean {
  const origin = loadSpecOrigin(repoRoot);
  if (!origin) return false;
  return origin.schemaVersion === SUPPORTED_SCHEMA_VERSION;
}
