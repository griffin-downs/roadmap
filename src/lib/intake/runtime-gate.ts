// @module runtime-gate
// @exports requireValidOrigin, checkSpecDrift, runtimeGate, RuntimeGateResult, SpecDriftResult
// @types RuntimeGateResult, SpecDriftResult
// @entry roadmap

// Runtime origin validation for CLI commands that READ from head.json.
// Prevents execution of DAGs not created through the spec pipeline.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type SpecOrigin,
  loadSpecOrigin,
  sha256File,
  SPEC_ORIGIN_PATH,
} from './spec-origin.ts';
import { validateOriginComplete } from './origin-validator.ts';
import { RoadmapError } from '../../errors.ts';

export interface SpecDriftResult {
  drifted: boolean;
  message?: string;
}

export interface RuntimeGateResult {
  valid: boolean;
  origin: SpecOrigin | null;
  specDrifted: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Hard gate — throws RoadmapError if origin missing or invalid.
 * Call before any DAG read operation (orient, advance, complete, show).
 */
export function requireValidOrigin(repoRoot: string): SpecOrigin {
  const origin = loadSpecOrigin(repoRoot);
  if (!origin) {
    throw new RoadmapError('NO_ORIGIN', {
      fix: 'This DAG has no spec origin. Create via: roadmap make <spec.json> --note "..."',
      entry: 'roadmap make',
    });
  }

  const validation = validateOriginComplete(repoRoot);
  if (!validation.valid) {
    throw new RoadmapError('ORIGIN_INVALID', {
      fix: `Origin validation failed: ${validation.errors.join(', ')}. Regenerate: roadmap make <spec.json>`,
      entry: 'roadmap make',
    });
  }

  return origin;
}

/**
 * Soft gate — warns if spec file has changed since DAG creation.
 * Non-blocking: returns drift status without throwing.
 */
export function checkSpecDrift(repoRoot: string): SpecDriftResult {
  const origin = loadSpecOrigin(repoRoot);
  if (!origin || !origin.spec_sha) return { drifted: false };

  // spec_sha is a hash of the spec content at import time.
  // We don't store the spec file path in the origin, so we check for
  // common spec locations. If no spec file is found, we can't check drift.
  const specCandidates = [
    join(repoRoot, '.roadmap', 'spec-source.json'),
    join(repoRoot, '.roadmap', 'spec-compiled.json'),
  ];

  for (const candidate of specCandidates) {
    if (existsSync(candidate)) {
      try {
        const currentHash = sha256File(candidate);
        if (currentHash !== origin.spec_sha) {
          return {
            drifted: true,
            message: `Spec has changed since DAG was created (${candidate}). Run: roadmap make <spec.json> to regenerate.`,
          };
        }
        return { drifted: false };
      } catch {
        // File read error — can't determine drift
        return { drifted: false };
      }
    }
  }

  // No spec file found — can't determine drift, don't warn
  return { drifted: false };
}

/**
 * Combined gate for CLI commands.
 * Returns structured result (does not throw).
 */
export function runtimeGate(repoRoot: string): RuntimeGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check origin exists and is valid
  const origin = loadSpecOrigin(repoRoot);
  if (!origin) {
    return {
      valid: false,
      origin: null,
      specDrifted: false,
      errors: ['No spec origin found. This DAG was not created through the spec pipeline. Run: roadmap make <spec.json> --note "..."'],
      warnings: [],
    };
  }

  const validation = validateOriginComplete(repoRoot);
  if (!validation.valid) {
    return {
      valid: false,
      origin,
      specDrifted: false,
      errors: validation.errors,
      warnings: [],
    };
  }

  // 2. Check spec drift (soft warning)
  const drift = checkSpecDrift(repoRoot);
  if (drift.drifted && drift.message) {
    warnings.push(drift.message);
  }

  return {
    valid: true,
    origin,
    specDrifted: drift.drifted,
    errors,
    warnings,
  };
}
