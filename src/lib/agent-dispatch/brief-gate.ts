// @module agent-dispatch
// @exports BriefGate, validateBrief, validateBriefContract, isSealedBrief, formatBriefValidationReport
// @types BriefValidationResult, BriefValidationError
// @entry roadmap/agent-dispatch

import type { Brief, FinalHandoff, InterimHandoff } from '../brief.ts';

/**
 * BriefValidationError - contract violation in a brief
 */
export interface BriefValidationError {
  field: string;
  code: string;
  message: string;
  value?: unknown;
}

/**
 * BriefValidationResult - outcome of brief gate validation
 */
export interface BriefValidationResult {
  passed: boolean;
  errors: BriefValidationError[];
  warnings: BriefValidationError[];
  timestamp: string;
}

/**
 * BriefGate - validates sealed brief contracts before agent dispatch
 * Ensures:
 * 1. All required fields present (position, mode, produces, consumes, description, pattern, handoffJournal, remaining)
 * 2. Consumes/produces reference real artifacts (not DAG node IDs)
 * 3. No DAG introspection data leaked (position is opaque, no deps/nodes/graph)
 * 4. Handoff contracts intact (if present)
 */
export class BriefGate {
  /**
   * Validate a brief for dispatch integrity
   */
  validate(brief: Brief): BriefValidationResult {
    const errors: BriefValidationError[] = [];
    const warnings: BriefValidationError[] = [];

    // Required fields
    this.checkRequiredFields(brief, errors);

    // Field format validation
    this.checkFieldFormats(brief, errors, warnings);

    // Consumes/produces integrity
    this.checkArtifactIntegrity(brief, errors);

    // No DAG leakage
    this.checkNoDAGLeakage(brief, errors);

    // Handoff integrity
    if (brief.handoff) {
      this.checkHandoffIntegrity(brief.handoff, errors);
    }

    // Handoff journal integrity
    if (brief.handoffJournal && brief.handoffJournal.length > 0) {
      this.checkHandoffJournal(brief.handoffJournal, errors);
    }

    return {
      passed: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check that all required fields are present
   */
  private checkRequiredFields(brief: Brief, errors: BriefValidationError[]): void {
    const required: (keyof Brief)[] = [
      'position',
      'mode',
      'produces',
      'consumes',
      'description',
      'pattern',
      'handoffJournal',
      'remaining',
    ];

    for (const field of required) {
      if (!(field in brief)) {
        errors.push({
          field,
          code: 'MISSING_REQUIRED_FIELD',
          message: `Required field "${field}" is missing`,
        });
      }
    }
  }

  /**
   * Check field formats and constraints
   */
  private checkFieldFormats(brief: Brief, errors: BriefValidationError[], warnings: BriefValidationError[]): void {
    // position must be string, non-empty
    if (typeof brief.position !== 'string' || brief.position.trim() === '') {
      errors.push({
        field: 'position',
        code: 'INVALID_POSITION',
        message: 'position must be non-empty string',
        value: brief.position,
      });
    }

    // mode must be 'execute' or 'plan'
    if (brief.mode !== 'execute' && brief.mode !== 'plan') {
      errors.push({
        field: 'mode',
        code: 'INVALID_MODE',
        message: "mode must be 'execute' or 'plan'",
        value: brief.mode,
      });
    }

    // produces and consumes must be arrays
    if (!Array.isArray(brief.produces)) {
      errors.push({
        field: 'produces',
        code: 'INVALID_TYPE',
        message: 'produces must be an array',
        value: typeof brief.produces,
      });
    }

    if (!Array.isArray(brief.consumes)) {
      errors.push({
        field: 'consumes',
        code: 'INVALID_TYPE',
        message: 'consumes must be an array',
        value: typeof brief.consumes,
      });
    }

    // Size limits (≤5)
    if (brief.produces && brief.produces.length > 5) {
      warnings.push({
        field: 'produces',
        code: 'EXCEEDS_RECOMMENDED_SIZE',
        message: 'produces exceeds recommended limit of 5 items',
        value: brief.produces.length,
      });
    }

    if (brief.consumes && brief.consumes.length > 5) {
      warnings.push({
        field: 'consumes',
        code: 'EXCEEDS_RECOMMENDED_SIZE',
        message: 'consumes exceeds recommended limit of 5 items',
        value: brief.consumes.length,
      });
    }

    // description and pattern constraints (≤150 chars)
    if (typeof brief.description !== 'string' || brief.description.length === 0) {
      errors.push({
        field: 'description',
        code: 'INVALID_DESCRIPTION',
        message: 'description must be non-empty string',
      });
    } else if (brief.description.length > 150) {
      warnings.push({
        field: 'description',
        code: 'EXCEEDS_SIZE_LIMIT',
        message: 'description exceeds recommended limit of 150 characters',
        value: brief.description.length,
      });
    }

    if (typeof brief.pattern !== 'string' || brief.pattern.length === 0) {
      errors.push({
        field: 'pattern',
        code: 'INVALID_PATTERN',
        message: 'pattern must be non-empty string',
      });
    } else if (brief.pattern.length > 150) {
      warnings.push({
        field: 'pattern',
        code: 'EXCEEDS_SIZE_LIMIT',
        message: 'pattern exceeds recommended limit of 150 characters',
        value: brief.pattern.length,
      });
    }

    // remaining must be non-negative integer
    if (typeof brief.remaining !== 'number' || brief.remaining < 0 || !Number.isInteger(brief.remaining)) {
      errors.push({
        field: 'remaining',
        code: 'INVALID_REMAINING',
        message: 'remaining must be non-negative integer',
        value: brief.remaining,
      });
    }

    // handoffJournal must be array
    if (!Array.isArray(brief.handoffJournal)) {
      errors.push({
        field: 'handoffJournal',
        code: 'INVALID_TYPE',
        message: 'handoffJournal must be an array',
        value: typeof brief.handoffJournal,
      });
    }
  }

  /**
   * Check that produces and consumes reference artifacts, not DAG nodes
   * Artifacts start with /, ., or lowercase letters and contain file structure
   * DAG node IDs are typically hyphenated or camelCase
   */
  private checkArtifactIntegrity(brief: Brief, errors: BriefValidationError[]): void {
    if (!Array.isArray(brief.produces)) return;
    if (!Array.isArray(brief.consumes)) return;

    for (const item of brief.produces) {
      if (!this.isValidArtifactPath(item)) {
        errors.push({
          field: 'produces',
          code: 'INVALID_ARTIFACT_REFERENCE',
          message: `produces contains non-artifact reference: "${item}"`,
          value: item,
        });
      }
    }

    for (const item of brief.consumes) {
      if (!this.isValidArtifactPath(item)) {
        errors.push({
          field: 'consumes',
          code: 'INVALID_ARTIFACT_REFERENCE',
          message: `consumes contains non-artifact reference: "${item}"`,
          value: item,
        });
      }
    }
  }

  /**
   * Heuristic: valid artifact paths start with /, ., or lowercase letters
   * and contain file extensions or directory separators.
   * This prevents node IDs like "brief-gate-impl" from leaking into briefs.
   */
  private isValidArtifactPath(item: unknown): boolean {
    if (typeof item !== 'string' || item.length === 0) {
      return false;
    }

    // Must start with / (absolute), . (relative), or src/lib/etc
    const startsCorrectly = item.startsWith('/') || item.startsWith('.') || /^[a-z]/.test(item);
    if (!startsCorrectly) {
      return false;
    }

    // Should contain / (directory separator) or . (extension)
    const hasStructure = item.includes('/') || item.includes('.');
    if (!hasStructure) {
      return false;
    }

    return true;
  }

  /**
   * Check for DAG leakage: briefs should not contain DAG internals
   * - no 'nodes' field
   * - no 'deps' field
   * - no 'id' field (except position)
   * - no 'graph' field
   */
  private checkNoDAGLeakage(brief: Brief, errors: BriefValidationError[]): void {
    const briefObj = brief as unknown as Record<string, unknown>;

    // Check for forbidden DAG fields
    if ('nodes' in briefObj) {
      errors.push({
        field: 'brief',
        code: 'DAG_LEAKAGE_NODES',
        message: 'Brief contains DAG nodes — seal was broken',
      });
    }

    if ('deps' in briefObj) {
      errors.push({
        field: 'brief',
        code: 'DAG_LEAKAGE_DEPS',
        message: 'Brief contains DAG deps — seal was broken',
      });
    }

    if (typeof briefObj.graph !== 'undefined') {
      errors.push({
        field: 'brief',
        code: 'DAG_LEAKAGE_GRAPH',
        message: 'Brief contains full DAG graph — seal was broken',
      });
    }
  }

  /**
   * Validate handoff contract if present
   */
  private checkHandoffIntegrity(handoff: FinalHandoff, errors: BriefValidationError[]): void {
    // Required handoff fields
    const required: (keyof FinalHandoff)[] = [
      'timestamp',
      'progress',
      'discovered',
      'blockers',
      'currentFile',
      'summary',
      'keyDecisions',
      'gotchas',
      'nextNodeEntry',
    ];

    for (const field of required) {
      if (!(field in handoff)) {
        errors.push({
          field: `handoff.${field}`,
          code: 'MISSING_HANDOFF_FIELD',
          message: `Handoff missing required field "${field}"`,
        });
      }
    }

    // Validate handoff.summary (≤100 chars)
    if (typeof handoff.summary === 'string' && handoff.summary.length > 100) {
      errors.push({
        field: 'handoff.summary',
        code: 'SUMMARY_TOO_LONG',
        message: 'Handoff summary exceeds 100 character limit',
        value: handoff.summary.length,
      });
    }

    // Validate handoff.progress (0.0–1.0)
    if (typeof handoff.progress !== 'number' || handoff.progress < 0 || handoff.progress > 1) {
      errors.push({
        field: 'handoff.progress',
        code: 'INVALID_PROGRESS',
        message: 'Handoff progress must be between 0.0 and 1.0',
        value: handoff.progress,
      });
    }

    // Validate nextNodeEntry
    if (handoff.nextNodeEntry) {
      if (!Array.isArray(handoff.nextNodeEntry.consumes)) {
        errors.push({
          field: 'handoff.nextNodeEntry.consumes',
          code: 'INVALID_TYPE',
          message: 'nextNodeEntry.consumes must be an array',
        });
      }

      if (typeof handoff.nextNodeEntry.ready !== 'boolean') {
        errors.push({
          field: 'handoff.nextNodeEntry.ready',
          code: 'INVALID_TYPE',
          message: 'nextNodeEntry.ready must be boolean',
        });
      }
    }
  }

  /**
   * Validate handoff journal entries
   */
  private checkHandoffJournal(
    journal: Array<InterimHandoff | FinalHandoff>,
    errors: BriefValidationError[],
  ): void {
    for (let i = 0; i < journal.length; i++) {
      const entry = journal[i];

      // All entries must have timestamp and progress
      if (typeof entry.timestamp !== 'string' || entry.timestamp.length === 0) {
        errors.push({
          field: `handoffJournal[${i}].timestamp`,
          code: 'INVALID_TIMESTAMP',
          message: 'Journal entry missing valid timestamp',
        });
      }

      if (typeof entry.progress !== 'number' || entry.progress < 0 || entry.progress > 1) {
        errors.push({
          field: `handoffJournal[${i}].progress`,
          code: 'INVALID_PROGRESS',
          message: 'Journal entry progress must be between 0.0 and 1.0',
          value: entry.progress,
        });
      }

      // Final entries have extra fields
      const isFinal = 'summary' in entry;
      if (isFinal) {
        const final = entry as FinalHandoff;
        if (typeof final.summary !== 'string' || final.summary.length === 0) {
          errors.push({
            field: `handoffJournal[${i}].summary`,
            code: 'INVALID_SUMMARY',
            message: 'Final handoff entry missing summary',
          });
        }
      }
    }
  }
}

/**
 * Convenience function for brief validation
 */
export function validateBrief(brief: Brief): BriefValidationResult {
  const gate = new BriefGate();
  return gate.validate(brief);
}

/**
 * Alias for validateBrief with extended contract checking
 */
export function validateBriefContract(brief: unknown): BriefValidationResult {
  if (typeof brief !== 'object' || brief === null) {
    return {
      passed: false,
      errors: [
        {
          field: 'brief',
          code: 'INVALID_TYPE',
          message: 'Brief must be an object',
          value: typeof brief,
        },
      ],
      warnings: [],
      timestamp: new Date().toISOString(),
    };
  }

  const gate = new BriefGate();
  return gate.validate(brief as Brief);
}

/**
 * Type guard: is this a valid sealed brief?
 */
export function isSealedBrief(value: unknown): value is Brief {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return (
    typeof obj.position === 'string' &&
    (obj.mode === 'execute' || obj.mode === 'plan') &&
    Array.isArray(obj.produces) &&
    Array.isArray(obj.consumes) &&
    typeof obj.description === 'string' &&
    typeof obj.pattern === 'string' &&
    Array.isArray(obj.handoffJournal) &&
    typeof obj.remaining === 'number'
  );
}

/**
 * Validation report generator
 */
export function formatBriefValidationReport(result: BriefValidationResult): string {
  if (result.passed && result.warnings.length === 0) {
    return `✓ Brief validation passed at ${result.timestamp}`;
  }

  const lines: string[] = [];

  if (!result.passed) {
    lines.push(`✗ Brief validation failed at ${result.timestamp}`);
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  [${error.code}] ${error.field}: ${error.message}`);
      if (error.value !== undefined) {
        lines.push(`    Value: ${JSON.stringify(error.value)}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    if (!result.passed) {
      lines.push('');
    }
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  [${warning.code}] ${warning.field}: ${warning.message}`);
      if (warning.value !== undefined) {
        lines.push(`    Value: ${JSON.stringify(warning.value)}`);
      }
    }
  }

  return lines.join('\n');
}
